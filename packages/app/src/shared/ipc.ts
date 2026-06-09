// IPC 契约类型（main / preload / renderer 共享）
import type {
  ConvertWarning,
  TableData,
  CellEdit,
  TableChange,
  TableRowOperation,
  CheckIssue,
  AssetIndex,
  AssetMaps,
  DiffReport,
  TtsConfig,
  TtsJob,
  EnrichedJob,
  FormatResult,
} from '@e2r/core'

export type {
  AssetMaps,
  CellEdit,
  TableChange,
  TableRowOperation,
  CheckIssue,
  AssetIndex,
  DiffReport,
  TtsConfig,
  TtsJob,
  EnrichedJob,
  FormatResult,
}

export interface TtsHealth {
  ok: boolean
  device?: string
  version?: string
  error?: string
}
export interface UpdateCheckResult {
  ok: boolean
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  releaseNotes: string | null
  downloadUrl: string | null
  publishedAt: string | null
  source: string | null
  error: string | null
}
export interface TtsJobsArgs {
  xlsxPath: string
  textLang: string
}
export type TtsJobsResult =
  | { ok: true; jobs: EnrichedJob[]; audioDir: string }
  | { ok: false; error: string }
export interface TtsApplyArgs {
  xlsxPath: string
  outputNames: string[] // 要应用（打对号）的语音 outputName 列表
}
export type TtsApplyResult = { ok: true; applied: number } | { ok: false; error: string }
export interface TtsRevertArgs {
  xlsxPath: string
  outputNames: string[] // 要撤销的 pending 语音 outputName 列表
}
export type TtsRevertResult = { ok: true; reverted: number } | { ok: false; error: string }
export interface TtsSynthArgs {
  xlsxPath: string
  textLang: string
  promptLang: string
  only?: string[] // 限定要合成的 outputName；缺省=全部
  baseUrl?: string // 覆盖端点（内嵌引擎）
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

// workspace：导入表格后返回的副本位置
export type WorkspaceImportResult =
  | { ok: true; dir: string; copyPath: string }
  | { ok: false; error: string }
export type ProjectResult = ({ ok: true } & AssetIndex) | { ok: false; error: string }
export type WorkspaceAssetsResult =
  | { ok: true; assets: AssetMaps }
  | { ok: false; error: string }
// 表格资源导入：始终复制进 workspace；若已关联工程，同时复制到 game/images|audio。
export type WsAssetType = 'background' | 'sprite' | 'music' | 'sound'
export type AssetImportResult =
  | { ok: true; value: string; rel: string; workspace: AssetMaps; project: AssetIndex | null }
  | { ok: false; error: string }
export type DiffResult = { ok: true; report: DiffReport } | { ok: false; error: string }
export type TableResult = ({ ok: true } & TableData) | { ok: false; error: string }
export type SaveResult = { ok: true } | { ok: false; error: string }
export type SaveAsResult = { ok: true; path: string } | { ok: false; error: string }

export type AudioNormalizeStandard = 'lufs' | 'peak' | 'rms'
export type AudioNormalizeScope =
  | 'table-voice'
  | 'table-music'
  | 'table-music-voice'

export interface AudioNormalizeArgs {
  xlsxPath?: string
  scope: AudioNormalizeScope
  standard: AudioNormalizeStandard
  targetLufs?: number
  truePeakDb?: number
  lra?: number
  targetPeakDb?: number
  targetRmsDb?: number
  limitDb?: number
  minGainDb?: number
  maxGainDb?: number
  backup?: boolean
}

export interface AudioNormalizeEntry {
  filePath: string
  rel: string
  size: number
  ext: string
  loudnorm?: {
    inputI: number
    inputTp: number
    inputLra: number
    inputThresh: number
    targetOffset: number
  }
  measuredLufs: number | null
  measuredPeakDb: number | null
  measuredRmsDb: number | null
  gainDb: number | null
  status: 'ready' | 'skipped' | 'error'
  reason?: string
}

export interface AudioNormalizeSummary {
  total: number
  ready: number
  skipped: number
  error: number
  avgGainDb: number | null
  maxGainDb: number | null
}

export interface AudioNormalizePlan {
  scopeLabel: string
  ffmpegPath: string | null
  entries: AudioNormalizeEntry[]
  summary: AudioNormalizeSummary
}

export type AudioNormalizePlanResult =
  | ({ ok: true } & AudioNormalizePlan)
  | { ok: false; error: string; ffmpegPath?: string | null }
export type AudioNormalizeApplyResult =
  | ({ ok: true; processed: number; failed: number; entries: AudioNormalizeEntry[] })
  | { ok: false; error: string }

export interface AudioNormalizeProgress {
  phase: 'analyze' | 'apply'
  index: number
  total: number
  rel: string
  status: 'running' | 'done' | 'error' | 'skipped'
  error?: string
}

export interface ProjectMissingRef {
  kind: 'image' | 'audio'
  name: string
  source: string
  sheet: string
  row: number
}

export interface ProjectUnusedAsset {
  kind: 'image' | 'audio'
  rel: string
}

export interface ProjectAuditReport {
  referenced: { images: number; audio: number }
  missing: ProjectMissingRef[]
  unused: ProjectUnusedAsset[]
}

export type ProjectAuditResult =
  | ({ ok: true } & ProjectAuditReport)
  | { ok: false; error: string }

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
}
export interface ConvertArgs extends PreviewArgs {}

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
  | ({ ok: true } & PreviewData)
  | { ok: false; error: string }
export type RpyFileWriteResult =
  | { ok: true; path: string }
  | { ok: false; error: string }

export interface E2rApi {
  openXlsx(): Promise<string | null>
  selectDir(): Promise<string | null>
  pickAudio(): Promise<string | null>
  workspaceImport(originalPath: string): Promise<WorkspaceImportResult>
  workspaceAssets(xlsxPath: string): Promise<WorkspaceAssetsResult>
  openExternal(url: string): void
  checkUpdates(): Promise<UpdateCheckResult>
  preview(args: PreviewArgs): Promise<PreviewResult>
  convert(args: ConvertArgs): Promise<ConvertResult>
  exportRpyFile(file: RpyFile): Promise<RpyFileWriteResult>
  applyRpyFile(file: RpyFile, xlsxPath?: string, sheetName?: string): Promise<RpyFileWriteResult>
  validateFormat(xlsxPath: string): Promise<FormatResult>
  readTable(xlsxPath: string): Promise<TableResult>
  saveTable(xlsxPath: string, changes: TableChange[]): Promise<SaveResult>
  saveTableAs(xlsxPath: string, changes: TableChange[]): Promise<SaveAsResult>
  check(xlsxPath: string): Promise<CheckResult>
  diff(oldPath: string, newPath: string): Promise<DiffResult>
  linkProject(dir: string): Promise<ProjectResult>
  clearProject(): Promise<void>
  projectAudioNormalizePlan(args: AudioNormalizeArgs): Promise<AudioNormalizePlanResult>
  projectAudioNormalizeApply(args: AudioNormalizeArgs): Promise<AudioNormalizeApplyResult>
  onAudioNormalizeProgress(cb: (p: AudioNormalizeProgress) => void): () => void
  projectAudit(xlsxPath: string): Promise<ProjectAuditResult>
  importAsset(kind: WsAssetType, name: string, xlsxPath: string): Promise<AssetImportResult>
  ttsCharacters(): Promise<TtsConfig>
  ttsSaveCharacters(config: TtsConfig): Promise<SaveResult>
  ttsHealth(baseUrl: string): Promise<TtsHealth>
  ttsJobs(args: TtsJobsArgs): Promise<TtsJobsResult>
  ttsApply(args: TtsApplyArgs): Promise<TtsApplyResult>
  ttsRevert(args: TtsRevertArgs): Promise<TtsRevertResult>
  ttsSynthesize(args: TtsSynthArgs): Promise<TtsSynthSummary>
  onTtsProgress(cb: (p: TtsProgress) => void): () => void
  ttsEngineStart(): Promise<EngineStartResult>
  ttsEngineStop(): Promise<void>
  ttsEngineStatus(): Promise<EngineStatus>
  onEngineLog(cb: (line: string) => void): () => void
  pathForFile(file: File): string
  /** 开发用：通过 E2R_DEMO 自动载入一个表格（自动化截图/验证） */
  demoFile: string | null
  /** 开发用：通过 E2R_PAGE 指定初始页面 */
  demoPage: string | null
  /** 开发用：通过 E2R_PROJECT 自动关联工程 */
  demoProject: string | null
  /** 开发用：通过 E2R_UNLINK 强制不关联工程（跳过持久化重连） */
  demoUnlink: boolean
}
