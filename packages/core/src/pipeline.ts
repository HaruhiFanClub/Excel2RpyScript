// 编排：parsed sheets → 转换 → 写出。
import {
  Converter,
  type ParsedSheet,
  type PipelineOptions,
  type SheetConvertResult,
  type ConvertWarning,
} from './convert/converter'
import { renderFile } from './write/writer'

export interface ConvertedFile {
  label: string
  content: string
}

export interface PipelineResult {
  files: ConvertedFile[]
  warnings: ConvertWarning[]
  results: SheetConvertResult[]
  converter: Converter
}

export function runPipeline(sheets: ParsedSheet[], opts: PipelineOptions): PipelineResult {
  const conv = new Converter(sheets, opts)
  const results = conv.generate()
  const files = results.map((res) => ({
    label: res.label,
    content: renderFile(res, conv.roleNameMapping, conv.sideCharacters),
  }))
  return { files, warnings: conv.warnings, results, converter: conv }
}
