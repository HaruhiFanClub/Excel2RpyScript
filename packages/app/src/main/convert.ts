import {
  readWorkbook,
  runPipeline,
  spritePositionsFromConfig,
  type PipelineOptions,
} from '@e2r/core'
import type { ConvertArgs, ConvertResult, PreviewArgs, PreviewResult, RpyFile } from '../shared/ipc'
import { loadCharacters } from './characters'

const DEFAULT_OPTS: PipelineOptions = { mode: 'default', normalizeMode: true, trimRoleNames: true }

// 读 + 转换（不落盘），供预览与导出共用。
async function build(xlsxPath: string) {
  const cfg = await loadCharacters()
  const { sheets, warnings: readWarnings } = await readWorkbook(xlsxPath, {
    spritePositions: spritePositionsFromConfig(cfg),
  })
  const { files, warnings } = runPipeline(sheets, DEFAULT_OPTS)
  const rpy: RpyFile[] = files.map((f) => ({
    label: f.label,
    content: f.content,
    bytes: Buffer.byteLength(f.content, 'utf-8'),
  }))
  return { sheetNames: sheets.map((s) => s.name), files, rpy, warnings, readWarningCount: readWarnings.length }
}

export async function previewWorkbook(args: PreviewArgs): Promise<PreviewResult> {
  try {
    const b = await build(args.xlsxPath)
    return { ok: true, sheetNames: b.sheetNames, files: b.rpy, warnings: b.warnings, readWarningCount: b.readWarningCount }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function convertWorkbook(args: ConvertArgs): Promise<ConvertResult> {
  try {
    const b = await build(args.xlsxPath)
    return {
      ok: true,
      sheetNames: b.sheetNames,
      files: b.rpy,
      warnings: b.warnings,
      readWarningCount: b.readWarningCount,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
