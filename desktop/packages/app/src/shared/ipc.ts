// IPC 契约类型（main / preload / renderer 共享）
import type { ConversionMode, ConvertWarning, TableData, CellEdit } from '@e2r/core'

export type { CellEdit }
export type TableResult = ({ ok: true } & TableData) | { ok: false; error: string }
export type SaveResult = { ok: true } | { ok: false; error: string }

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
  preview(args: PreviewArgs): Promise<PreviewResult>
  convert(args: ConvertArgs): Promise<ConvertResult>
  readTable(xlsxPath: string): Promise<TableResult>
  saveTable(xlsxPath: string, edits: CellEdit[]): Promise<SaveResult>
  pathForFile(file: File): string
  /** 开发用：通过 E2R_DEMO 自动载入一个表格（自动化截图/验证） */
  demoFile: string | null
  /** 开发用：通过 E2R_PAGE 指定初始页面 */
  demoPage: string | null
}
