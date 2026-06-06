// IPC 契约类型（main / preload / renderer 共享）
import type {
  ConversionMode,
  ConvertWarning,
  TableData,
  CellEdit,
  CheckIssue,
  AssetIndex,
  DiffReport,
  TtsConfig,
  TtsJob,
  EnrichedJob,
} from '@e2r/core'

export type { CellEdit, CheckIssue, AssetIndex, DiffReport, TtsConfig, TtsJob, EnrichedJob }

export type TtsConfigResult = { ok: true; config: TtsConfig } | { ok: false; error: string }
export interface TtsHealth {
  ok: boolean
  device?: string
  version?: string
  error?: string
}
export interface TtsJobsArgs {
  xlsxPath: string
  useVoiceText: boolean
  configPath?: string
  textLang: string
}
export type TtsJobsResult =
  | { ok: true; jobs: EnrichedJob[]; audioDir: string }
  | { ok: false; error: string }
export interface TtsSynthArgs {
  xlsxPath: string
  configPath: string
  useVoiceText: boolean
  textLang: string
  promptLang: string
  only?: string[] // 限定要合成的 outputName；缺省=全部
  baseUrl?: string // 覆盖端点（内置引擎）
}
export interface EngineStatus {
  running: boolean
  baseUrl: string | null
  starting: boolean
}
export type EngineStartResult = { ok: true; baseUrl: string } | { ok: false; error: string }
export interface TtsProgress {
  outputName: string
  index: number
  total: number
  status: 'running' | 'done' | 'error'
  error?: string
}
export interface TtsSynthSummary {
  ok: boolean
  done: number
  failed: number
  error?: string
}

export interface DeployArgs {
  xlsxPath: string
  mode: ConversionMode
  scripts: boolean // 写 .rpy 到 game/
  enableVoice: boolean // 写 e2r_config.rpy 启用 config.has_voice
}
export type DeployResult =
  | { ok: true; gamePath: string; written: string[] }
  | { ok: false; error: string }
export type ProjectResult = ({ ok: true } & AssetIndex) | { ok: false; error: string }
export type DiffResult = { ok: true; report: DiffReport } | { ok: false; error: string }
export type TableResult = ({ ok: true } & TableData) | { ok: false; error: string }
export type SaveResult = { ok: true } | { ok: false; error: string }

export interface CheckSummary {
  error: number
  warn: number
  info: number
}
export type CheckResult =
  | { ok: true; issues: CheckIssue[]; summary: CheckSummary }
  | { ok: false; error: string }

export interface PreviewArgs {
  xlsxPath: string
  mode: ConversionMode
}
export interface ConvertArgs extends PreviewArgs {
  outDir: string | null // null → 用 xlsx 所在目录
}

export interface RpyFile {
  label: string // 文件名（不含 .rpy）
  content: string // 完整 rpy 内容
  bytes: number
  path?: string // 落盘后的绝对路径（仅 convert）
}

export interface PreviewData {
  sheetNames: string[]
  files: RpyFile[]
  warnings: ConvertWarning[]
  readWarningCount: number
}

export type PreviewResult = ({ ok: true } & PreviewData) | { ok: false; error: string }
export type ConvertResult =
  | ({ ok: true; outDir: string } & PreviewData)
  | { ok: false; error: string }

export interface E2rApi {
  openXlsx(): Promise<string | null>
  selectDir(): Promise<string | null>
  openJson(): Promise<string | null>
  preview(args: PreviewArgs): Promise<PreviewResult>
  convert(args: ConvertArgs): Promise<ConvertResult>
  readTable(xlsxPath: string): Promise<TableResult>
  saveTable(xlsxPath: string, edits: CellEdit[]): Promise<SaveResult>
  check(xlsxPath: string): Promise<CheckResult>
  diff(oldPath: string, newPath: string): Promise<DiffResult>
  linkProject(dir: string): Promise<ProjectResult>
  ttsLoadConfig(path: string): Promise<TtsConfigResult>
  ttsHealth(baseUrl: string): Promise<TtsHealth>
  ttsJobs(args: TtsJobsArgs): Promise<TtsJobsResult>
  ttsSynthesize(args: TtsSynthArgs): Promise<TtsSynthSummary>
  onTtsProgress(cb: (p: TtsProgress) => void): () => void
  ttsEngineStart(): Promise<EngineStartResult>
  ttsEngineStop(): Promise<void>
  ttsEngineStatus(): Promise<EngineStatus>
  onEngineLog(cb: (line: string) => void): () => void
  deploy(args: DeployArgs): Promise<DeployResult>
  pathForFile(file: File): string
  /** 开发用：通过 E2R_DEMO 自动载入一个表格（自动化截图/验证） */
  demoFile: string | null
  /** 开发用：通过 E2R_PAGE 指定初始页面 */
  demoPage: string | null
  /** 开发用：通过 E2R_PROJECT 自动关联工程 */
  demoProject: string | null
}
