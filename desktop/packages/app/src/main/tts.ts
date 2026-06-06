// TTS 客户端（主进程）：对接配置的 GPT-SoVITS HTTP 端点，复刻 handler/tts.py 的合成流程。
import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readWorkbook,
  planTtsJobs,
  parseLegacyTtsConfig,
  ttsJobSignature,
  toneFor,
  builtinPreset,
  type TtsConfig,
  type TtsJob,
  type EnrichedJob,
} from '@e2r/core'

const MANIFEST = '.e2r-tts.json' // 记录每个 wav 的合成输入签名，用于「未重新生成」检测
const BUILTIN_PREFIX = 'builtin:'

export async function loadTtsConfig(path: string): Promise<TtsConfig> {
  return parseLegacyTtsConfig(JSON.parse(await readFile(path, 'utf-8')))
}

// 统一解析：builtin:<id> 走内置预设，否则读文件
export async function resolveTtsConfig(path: string): Promise<TtsConfig> {
  if (path.startsWith(BUILTIN_PREFIX)) {
    const cfg = builtinPreset(path.slice(BUILTIN_PREFIX.length))
    if (!cfg) throw new Error(`未知内置预设：${path}`)
    return cfg
  }
  return loadTtsConfig(path)
}

async function readManifest(audioDir: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(join(audioDir, MANIFEST), 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

// 列出任务并标注状态：未生成 / 已生成 / 已生成但输入已改（stale）
export async function enrichedJobs(
  xlsxPath: string,
  useVoiceText: boolean,
  cfg: TtsConfig,
  textLang: string,
  audioDir: string,
): Promise<EnrichedJob[]> {
  const jobs = await planJobs(xlsxPath, useVoiceText)
  const existing = new Set(await listSynthesized(audioDir))
  const manifest = await readManifest(audioDir)
  return jobs.map((j) => {
    const tone = toneFor(cfg, j.voiceCmd)
    const sig = ttsJobSignature(j, cfg, textLang)
    const status: EnrichedJob['status'] = !existing.has(j.outputName)
      ? 'missing'
      : manifest[j.outputName] === sig
        ? 'generated'
        : 'stale'
    return { ...j, tone, status }
  })
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

export async function planJobs(xlsxPath: string, useVoiceText: boolean): Promise<TtsJob[]> {
  const { sheets } = await readWorkbook(xlsxPath)
  return planTtsJobs(sheets, { useVoiceText })
}

export interface SynthOptions {
  cfg: TtsConfig
  audioDir: string
  textLang: string
  promptLang: string
  baseUrl?: string // 覆盖端点（用内置引擎时）
  skipSwitch?: boolean // 与上一句同角色时跳过切权重（批量提速）
}

// 角色名 → 模型条目（支持「一个模型绑定多个第一列角色名」：aliases）
export function modelForRole(cfg: TtsConfig, roleName: string) {
  const direct = cfg.roleModelMapping[roleName]
  if (direct) return direct
  for (const m of Object.values(cfg.roleModelMapping)) {
    if (m.aliases?.includes(roleName)) return m
  }
  return undefined
}

// 合成单个任务（切权重 → POST /tts → 落盘）
export async function synthOne(job: TtsJob, opts: SynthOptions): Promise<void> {
  const base = opts.baseUrl ?? opts.cfg.apiBaseUrl
  // 仅远端模式按角色切自定义模型；内嵌 zero-shot 用引擎已加载的基础模型，只靠参考音频克隆
  const model = opts.cfg.serviceMode === 'remote' ? modelForRole(opts.cfg, job.roleName) : undefined
  if (model && !opts.skipSwitch) {
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
