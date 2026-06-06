// TTS 客户端（主进程）：对接配置的 GPT-SoVITS HTTP 端点，复刻 handler/tts.py 的合成流程。
import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readWorkbook,
  planTtsJobs,
  parseLegacyTtsConfig,
  ttsJobSignature,
  type TtsConfig,
  type TtsJob,
  type EnrichedJob,
} from '@e2r/core'

const MANIFEST = '.e2r-tts.json' // 记录每个 wav 的合成输入签名，用于「未重新生成」检测

export async function loadTtsConfig(path: string): Promise<TtsConfig> {
  return parseLegacyTtsConfig(JSON.parse(await readFile(path, 'utf-8')))
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
    const tone = cfg.voiceCmdMapping[j.voiceCmd]?.tone ?? j.voiceCmd
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
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
    const j = (await r.json()) as { device?: string; version?: string }
    return { ok: true, device: j.device, version: j.version }
  } catch (e) {
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
}

// 合成单个任务（切权重 → POST /tts → 落盘）
export async function synthOne(job: TtsJob, opts: SynthOptions): Promise<void> {
  const base = opts.cfg.apiBaseUrl
  const model = opts.cfg.roleModelMapping[job.roleName]
  if (model) {
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
