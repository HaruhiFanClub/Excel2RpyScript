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

// ---- 配置（统一的角色配置） ----
// 不再有全局「服务模式」：每个角色自带类型，按角色判定——
//  远端角色：带模型权重(gpt/sovits)+ API 端点，合成时切自定义模型（凉宫春日系列内置角色属此，锁定不可编辑）。
//  内嵌角色：用户在界面里新建，无模型权重，靠本地引擎 zero-shot + 参考音频克隆音色。
export type ServiceMode = 'remote' | 'embedded'

export interface RoleModel {
  gpt: string
  sovits: string
  aliases?: string[] // 该角色额外绑定的第一列角色名（名称/别名对应上即自动绑定）
  enabled?: boolean // 是否在软件中启用（启用才进表格角色下拉、语音指令过滤）；缺省视为启用
  builtin?: boolean // 内置远端角色（凉宫春日系列）：锁定，不可展开/编辑/删除，只能勾选
  apiBaseUrl?: string // 远端角色专属端点（不在 UI 展示）；为空表示内嵌角色
}
export interface VoiceCmd {
  refAudioPath: string
  promptText: string
  tone?: string // 语气描述（显示用，把语音指令编号映射为可读语气）
  role?: string // 归属角色（把参考音频/语气分组到某个角色）
}
export interface TtsConfig {
  serviceMode: ServiceMode // 兼容旧字段，已不参与合成判定（按角色判定）
  apiBaseUrl: string
  roleModelMapping: Record<string, RoleModel>
  voiceCmdMapping: Record<string, VoiceCmd>
  defaultPromptAudio: string
  defaultPromptText: string
  deepLApiKey?: string
}

// 角色是否启用（缺省视为启用，仅显式 false 才停用）
export function isRoleEnabled(m: RoleModel): boolean {
  return m.enabled !== false
}

// 角色是否为远端角色：带模型权重即按远端处理（切权重 + 走自定义端点）
export function isRemoteRole(m: RoleModel | undefined): m is RoleModel {
  return !!(m && (m.gpt || m.sovits))
}

// 角色名 → 模型条目（支持别名：一个角色绑定多个第一列角色名）
export function modelForRole(cfg: TtsConfig, roleName: string): RoleModel | undefined {
  const direct = cfg.roleModelMapping[roleName]
  if (direct) return direct
  for (const m of Object.values(cfg.roleModelMapping)) {
    if (m.aliases?.includes(roleName)) return m
  }
  return undefined
}

// 第一列角色名 → 角色 key（直配或别名命中）。未命中则原样返回。
export function resolveRoleKey(cfg: TtsConfig, name: string): string {
  if (cfg.roleModelMapping[name]) return name
  for (const [k, v] of Object.entries(cfg.roleModelMapping)) {
    if (v.aliases?.includes(name)) return k
  }
  return name
}

// 已启用角色名列表（用于表格角色列下拉）
export function enabledRoleNames(cfg: TtsConfig): string[] {
  return Object.entries(cfg.roleModelMapping)
    .filter(([, m]) => isRoleEnabled(m))
    .map(([name]) => name)
}

// 某角色名下的语音指令（语气）列表：按 voiceCmd.role 归一到该角色。
// 未配置任何归属时回退「全部指令」（兼容尚未分组的配置）。
export function tonesForRole(cfg: TtsConfig, name: string): string[] {
  const roleKey = resolveRoleKey(cfg, name)
  const all = Object.keys(cfg.voiceCmdMapping)
  const anyGrouped = all.some((k) => cfg.voiceCmdMapping[k]?.role)
  if (!anyGrouped) return all
  return all.filter((k) => {
    const r = cfg.voiceCmdMapping[k]?.role
    return r ? resolveRoleKey(cfg, r) === roleKey : false
  })
}

// 解析旧 config.json（snake_case / API_BASE_URL.base）为 TtsConfig
export function parseLegacyTtsConfig(json: unknown): TtsConfig {
  const j = (json ?? {}) as Record<string, unknown>
  const roleSrc = (j['role_model_mapping'] ?? {}) as Record<
    string,
    {
      gpt?: string
      sovits?: string
      aliases?: string[]
      enabled?: boolean
      builtin?: boolean
      api_base_url?: string
    }
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
      ...(typeof v.enabled === 'boolean' ? { enabled: v.enabled } : {}),
      ...(v.builtin ? { builtin: true } : {}),
      ...(v.api_base_url ? { apiBaseUrl: v.api_base_url } : {}),
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
  const role: Record<
    string,
    {
      gpt: string
      sovits: string
      aliases?: string[]
      enabled?: boolean
      builtin?: boolean
      api_base_url?: string
    }
  > = {}
  for (const [k, v] of Object.entries(cfg.roleModelMapping))
    role[k] = {
      gpt: v.gpt,
      sovits: v.sovits,
      ...(v.aliases?.length ? { aliases: v.aliases } : {}),
      ...(typeof v.enabled === 'boolean' ? { enabled: v.enabled } : {}),
      ...(v.builtin ? { builtin: true } : {}),
      ...(v.apiBaseUrl ? { api_base_url: v.apiBaseUrl } : {}),
    }
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
  const model = modelForRole(cfg, job.roleName)
  const remote = isRemoteRole(model)
  const cmd = cfg.voiceCmdMapping[job.voiceCmd]
  return [
    job.roleName,
    job.text,
    job.voiceCmd,
    textLang,
    remote ? 'remote' : 'embedded',
    remote ? model.apiBaseUrl || cfg.apiBaseUrl : '',
    remote ? model.gpt : '',
    remote ? model.sovits : '',
    cmd?.refAudioPath ?? cfg.defaultPromptAudio,
    cmd?.promptText ?? cfg.defaultPromptText,
  ].join('')
}
