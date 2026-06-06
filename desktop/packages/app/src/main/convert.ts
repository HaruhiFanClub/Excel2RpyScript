import { dirname } from 'node:path'
import {
  readWorkbook,
  runPipeline,
  writeRpyFiles,
  type PipelineOptions,
  type ConversionMode,
} from '@e2r/core'
import type { ConvertArgs, ConvertResult, PreviewArgs, PreviewResult, RpyFile } from '../shared/ipc'

function optsFor(mode: ConversionMode): PipelineOptions {
  return mode === 'default'
    ? { mode: 'default', normalizeMode: true, trimRoleNames: true }
    : { mode: 'legacy-compat' }
}

// 读 + 转换（不落盘），供预览与导出共用。
async function build(xlsxPath: string, mode: ConversionMode) {
  const { sheets, warnings: readWarnings } = await readWorkbook(xlsxPath)
  const { files, warnings } = runPipeline(sheets, optsFor(mode))
  const rpy: RpyFile[] = files.map((f) => ({
    label: f.label,
    content: f.content,
    bytes: Buffer.byteLength(f.content, 'utf-8'),
  }))
  return { sheetNames: sheets.map((s) => s.name), files, rpy, warnings, readWarningCount: readWarnings.length }
}

export async function previewWorkbook(args: PreviewArgs): Promise<PreviewResult> {
  try {
    const b = await build(args.xlsxPath, args.mode)
    return { ok: true, sheetNames: b.sheetNames, files: b.rpy, warnings: b.warnings, readWarningCount: b.readWarningCount }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function convertWorkbook(args: ConvertArgs): Promise<ConvertResult> {
  try {
    const b = await build(args.xlsxPath, args.mode)
    const target = args.outDir ?? dirname(args.xlsxPath)
    const paths = await writeRpyFiles(target, b.files)
    const rpy: RpyFile[] = b.rpy.map((f, i) => ({ ...f, path: paths[i] ?? '' }))
    return {
      ok: true,
      outDir: target,
      sheetNames: b.sheetNames,
      files: rpy,
      warnings: b.warnings,
      readWarningCount: b.readWarningCount,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
