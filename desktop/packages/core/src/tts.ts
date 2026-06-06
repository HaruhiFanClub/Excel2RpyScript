// TTS 规划与配置（核心逻辑）。移植自 handler/tts.py，并修正 sheet 序号错位：
// 输出 wav 文件名用「绝对 sheet 索引」，与转换器生成的 voice "..." 引用一致。
import { ElementColNumMapping } from './settings/converterSetting'
import { asStr, EMPTY, type CellValue } from './parse/cellValue'
import type { ParsedSheet } from './convert/converter'

function col(row: CellValue[], key: keyof typeof ElementColNumMapping): CellValue {
  return row[ElementColNumMapping[key]] ?? EMPTY
}

export interface TtsJob {
  sheetIndex: number // 绝对 sheet 索引（0 基）
  sheetName: string
  rowIndex: number // 解析行序号（0 基）；Excel 行号 = rowIndex + 8
  roleName: string // 前向填充后的角色名
  text: string // 待合成文本（按 useVoiceText 取 col1 或 col18）
  voiceCmd: string // 语音指令（col24）
  outputName: string // {role}_sheet{sheetIndex+1}_row{rowIndex+8}_synthesized.wav
}

export interface PlanTtsOptions {
  useVoiceText: boolean // true → 用「选填语音文本」(col18)，否则用台词(col1)
}

// 带 UI 状态的任务：tone=语气，status=未生成/已生成/已生成但输入已改
export interface EnrichedJob extends TtsJob {
  tone: string
  status: 'missing' | 'generated' | 'stale'
}

// 仅对 语音列(col23)=tts（不分大小写）的行规划合成任务，角色名前向填充。
export function planTtsJobs(sheets: ParsedSheet[], opts: PlanTtsOptions): TtsJob[] {
  const jobs: TtsJob[] = []
  sheets.forEach((sheet, sheetIndex) => {
    let current: string | null = null
    sheet.rows.forEach((row, rowIndex) => {
      const roleStr = asStr(col(row, 'role_name'))
      if (roleStr.trim()) current = roleStr
      const role = current === null ? 'None' : current
      if (asStr(col(row, 'voice')).trim().toLowerCase() !== 'tts') return
      const text = opts.useVoiceText ? asStr(col(row, 'voice_text')) : asStr(col(row, 'text'))
      jobs.push({
        sheetIndex,
        sheetName: sheet.name,
        rowIndex,
        roleName: role,
        text,
        voiceCmd: asStr(col(row, 'voice_cmd')),
        outputName: `${role}_sheet${sheetIndex + 1}_row${rowIndex + 8}_synthesized.wav`,
      })
    })
  })
  return jobs
}

// ---- 配置（config.json 预设） ----
// 两种服务模式：
//  remote   远端服务：API 调用服务器，按角色切自定义模型（role_model_mapping）。凉宫春日内置预设属此。
//  embedded 内嵌服务：本地引擎 zero-shot 推理，角色只是给参考音频分组（不切模型）。
export type ServiceMode = 'remote' | 'embedded'

export interface RoleModel {
  gpt: string
  sovits: string
  aliases?: string[] // 该模型额外绑定的第一列角色名（一个模型绑定多个角色名）
}
export interface VoiceCmd {
  refAudioPath: string
  promptText: string
  tone?: string // 语气（显示用，把语音指令编号映射为可读语气）
  role?: string // 归属角色（embedded 模式下用于把参考音频分组到角色）
}
export interface TtsConfig {
  serviceMode: ServiceMode
  apiBaseUrl: string
  roleModelMapping: Record<string, RoleModel>
  voiceCmdMapping: Record<string, VoiceCmd>
  defaultPromptAudio: string
  defaultPromptText: string
  deepLApiKey?: string
}

// 解析旧 config.json（snake_case / API_BASE_URL.base）为 TtsConfig
export function parseLegacyTtsConfig(json: unknown): TtsConfig {
  const j = (json ?? {}) as Record<string, unknown>
  const roleSrc = (j['role_model_mapping'] ?? {}) as Record<
    string,
    { gpt?: string; sovits?: string; aliases?: string[] }
  >
  const cmdSrc = (j['voice_cmd_mapping'] ?? {}) as Record<
    string,
    { ref_audio_path?: string; prompt_text?: string; tone?: string; role?: string }
  >
  const roleModelMapping: Record<string, RoleModel> = {}
  for (const [k, v] of Object.entries(roleSrc))
    roleModelMapping[k] = {
      gpt: v.gpt ?? '',
      sovits: v.sovits ?? '',
      ...(Array.isArray(v.aliases) ? { aliases: v.aliases } : {}),
    }
  const voiceCmdMapping: Record<string, VoiceCmd> = {}
  for (const [k, v] of Object.entries(cmdSrc))
    voiceCmdMapping[k] = {
      refAudioPath: v.ref_audio_path ?? '',
      promptText: v.prompt_text ?? '',
      ...(v.tone ? { tone: v.tone } : {}),
      ...(v.role ? { role: v.role } : {}),
    }
  const api = (j['API_BASE_URL'] ?? {}) as { base?: string }
  const sm = j['service_mode']
  return {
    serviceMode: sm === 'embedded' ? 'embedded' : 'remote',
    apiBaseUrl: api.base ?? 'http://127.0.0.1:9880/',
    roleModelMapping,
    voiceCmdMapping,
    defaultPromptAudio: (j['default_prompt_audio'] as string) ?? '',
    defaultPromptText: (j['default_prompt_text'] as string) ?? '',
    deepLApiKey: (j['deepL_api_key'] as string) ?? '',
  }
}

// 从参考音频文件名推导可读语气：形如 NN_角色_语气[_语气2].wav → "语气 语气2"
export function deriveTone(refAudioPath: string): string {
  if (!refAudioPath) return ''
  const file = refAudioPath.split(/[\\/]/).pop() ?? ''
  const stem = file.replace(/\.[^.]+$/, '')
  let parts = stem.split('_').filter(Boolean)
  if (parts.length && /^\d+$/.test(parts[0]!)) parts = parts.slice(1) // 去前导编号
  if (parts.length > 1) parts = parts.slice(1) // 去角色段
  return parts.join(' ')
}

// 取语音指令的显示语气：显式 tone > 文件名推导 > 指令名
export function toneFor(cfg: TtsConfig, voiceCmd: string): string {
  const c = cfg.voiceCmdMapping[voiceCmd]
  if (!c) return voiceCmd
  return c.tone || deriveTone(c.refAudioPath) || voiceCmd
}

// 序列化为旧 config.json 结构（与旧工具/预设兼容）
export function serializeTtsConfig(cfg: TtsConfig): unknown {
  const role: Record<string, { gpt: string; sovits: string; aliases?: string[] }> = {}
  for (const [k, v] of Object.entries(cfg.roleModelMapping))
    role[k] = { gpt: v.gpt, sovits: v.sovits, ...(v.aliases?.length ? { aliases: v.aliases } : {}) }
  const cmd: Record<
    string,
    { ref_audio_path: string; prompt_text: string; tone?: string; role?: string }
  > = {}
  for (const [k, v] of Object.entries(cfg.voiceCmdMapping))
    cmd[k] = {
      ref_audio_path: v.refAudioPath,
      prompt_text: v.promptText,
      ...(v.tone ? { tone: v.tone } : {}),
      ...(v.role ? { role: v.role } : {}),
    }
  return {
    service_mode: cfg.serviceMode,
    role_model_mapping: role,
    voice_cmd_mapping: cmd,
    default_prompt_audio: cfg.defaultPromptAudio,
    default_prompt_text: cfg.defaultPromptText,
    API_BASE_URL: { base: cfg.apiBaseUrl },
    deepL_api_key: cfg.deepLApiKey ?? '',
  }
}

// 合成输入签名：用于「改过但未重新生成」检测
export function ttsJobSignature(job: TtsJob, cfg: TtsConfig, textLang: string): string {
  const remote = cfg.serviceMode === 'remote'
  const model = remote ? cfg.roleModelMapping[job.roleName] : undefined
  const cmd = cfg.voiceCmdMapping[job.voiceCmd]
  return [
    job.roleName,
    job.text,
    job.voiceCmd,
    textLang,
    cfg.serviceMode,
    remote ? cfg.apiBaseUrl : '',
    model?.gpt ?? '',
    model?.sovits ?? '',
    cmd?.refAudioPath ?? cfg.defaultPromptAudio,
    cmd?.promptText ?? cfg.defaultPromptText,
  ].join('')
}
