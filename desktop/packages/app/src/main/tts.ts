// TTS 客户端（主进程）：对接配置的 GPT-SoVITS HTTP 端点，复刻 handler/tts.py 的合成流程。
import { writeFile, mkdir, readFile, readdir, copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readWorkbook,
  planTtsJobs,
  ttsJobSignature,
  toneFor,
  modelForRole,
  isRemoteRole,
  type TtsConfig,
  type TtsJob,
  type EnrichedJob,
} from '@e2r/core'

const MANIFEST = '.e2r-tts.json' // pending 目录：记录每个已生成 wav 的合成输入签名
const APPLIED = '.e2r-applied.json' // voice 目录：记录每个已应用 wav 的签名（落实时刻的输入）

async function readManifest(dir: string, file = MANIFEST): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(join(dir, file), 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

// 列出任务并标注状态。两段式：
//  pending 目录里有且签名匹配 → generated（临时，可试听）
//  voice  目录里有且签名匹配 → applied（已落实到 workspace）
//  仅存在但签名不匹配 → stale（输入已改）；都没有 → missing
export async function enrichedJobs(
  xlsxPath: string,
  cfg: TtsConfig,
  textLang: string,
  pendingDir: string,
  voiceDir: string,
): Promise<EnrichedJob[]> {
  const jobs = await planJobs(xlsxPath)
  const [pendWavs, voiceWavs, genMan, appMan] = await Promise.all([
    listSynthesized(pendingDir),
    listSynthesized(voiceDir),
    readManifest(pendingDir, MANIFEST),
    readManifest(voiceDir, APPLIED),
  ])
  const inPending = new Set(pendWavs)
  const inVoice = new Set(voiceWavs)
  return jobs.map((j) => {
    const tone = toneFor(cfg, j.voiceCmd)
    const sig = ttsJobSignature(j, cfg, textLang)
    const name = j.outputName
    let status: EnrichedJob['status']
    if (inVoice.has(name) && appMan[name] === sig) status = 'applied'
    else if (inPending.has(name) && genMan[name] === sig) status = 'generated'
    else if (inVoice.has(name) || inPending.has(name)) status = 'stale'
    else status = 'missing'
    return { ...j, tone, status }
  })
}

// 应用（打对号）：把 pending 里已生成的语音复制到 workspace/<表>/voice（必有副本），
// 若关联工程则同时复制到 game/audio。返回成功应用的数量。
export async function applyVoices(
  outputNames: string[],
  pendingDir: string,
  voiceDir: string,
  gameAudioDir: string | null,
): Promise<{ applied: number }> {
  const genMan = await readManifest(pendingDir, MANIFEST)
  const appMan = await readManifest(voiceDir, APPLIED)
  await mkdir(voiceDir, { recursive: true })
  if (gameAudioDir) await mkdir(gameAudioDir, { recursive: true })
  let applied = 0
  for (const name of outputNames) {
    const src = join(pendingDir, name)
    try {
      await access(src)
    } catch {
      continue // 还没生成，无法应用
    }
    await copyFile(src, join(voiceDir, name))
    if (gameAudioDir) await copyFile(src, join(gameAudioDir, name))
    appMan[name] = genMan[name] ?? ''
    applied++
  }
  await writeFile(join(voiceDir, APPLIED), JSON.stringify(appMan, null, 2))
  return { applied }
}

export async function ttsHealth(
  baseUrl: string,
): Promise<{ ok: boolean; device?: string; version?: string; error?: string }> {
  try {
    const r = await fetch(`${baseUrl}health`)
    if (r.ok) {
      const j = (await r.json().catch(() => ({}))) as { device?: string; version?: string }
      return { ok: true, device: j.device, version: j.version }
    }
    // 网关错误（502/503/504）= 上游不可达 → 离线；其余有应答（如 404 无 /health）→ 视为可达
    if (r.status >= 502 && r.status <= 504) return { ok: false, error: `HTTP ${r.status}` }
    return { ok: true }
  } catch (e) {
    // 仅网络层失败（DNS/拒绝连接/超时）才算离线
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function listSynthesized(audioDir: string): Promise<string[]> {
  try {
    return (await readdir(audioDir)).filter((f) => f.toLowerCase().endsWith('.wav'))
  } catch {
    return []
  }
}

export async function planJobs(xlsxPath: string): Promise<TtsJob[]> {
  const { sheets } = await readWorkbook(xlsxPath)
  return planTtsJobs(sheets)
}

export interface SynthOptions {
  cfg: TtsConfig
  audioDir: string
  textLang: string
  promptLang: string
  baseUrl?: string // 覆盖端点（用内置引擎时）
  skipSwitch?: boolean // 与上一句同角色时跳过切权重（批量提速）
}

// 合成单个任务（按角色判定：远端切权重 / 内嵌 zero-shot → POST /tts → 落盘）
export async function synthOne(job: TtsJob, opts: SynthOptions): Promise<void> {
  const model = modelForRole(opts.cfg, job.roleName)
  const remote = isRemoteRole(model)
  // 远端角色：走其自定义端点并按角色切自定义模型；内嵌角色：走本地引擎、不切权重、仅靠参考音频克隆。
  const base = remote ? model.apiBaseUrl || opts.cfg.apiBaseUrl : opts.baseUrl ?? opts.cfg.apiBaseUrl
  if (remote && !opts.skipSwitch) {
    if (model.gpt) await fetch(`${base}set_gpt_weights?weights_path=${encodeURIComponent(model.gpt)}`)
    if (model.sovits)
      await fetch(`${base}set_sovits_weights?weights_path=${encodeURIComponent(model.sovits)}`)
  }
  const cmd = opts.cfg.voiceCmdMapping[job.voiceCmd]
  const refAudio = cmd?.refAudioPath || opts.cfg.defaultPromptAudio
  const promptText = cmd?.promptText || opts.cfg.defaultPromptText
  const r = await fetch(`${base}tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: job.text,
      text_lang: opts.textLang,
      ref_audio_path: refAudio,
      prompt_text: promptText,
      prompt_lang: opts.promptLang,
      text_split_method: 'cut1',
      batch_size: 1,
    }),
  })
  if (!r.ok) {
    let detail = `HTTP ${r.status}`
    try {
      detail = JSON.stringify(await r.json())
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const buf = Buffer.from(await r.arrayBuffer())
  await mkdir(opts.audioDir, { recursive: true })
  await writeFile(join(opts.audioDir, job.outputName), buf)
  // 更新签名清单
  const manifest = await readManifest(opts.audioDir)
  manifest[job.outputName] = ttsJobSignature(job, opts.cfg, opts.textLang)
  await writeFile(join(opts.audioDir, MANIFEST), JSON.stringify(manifest, null, 2))
}
