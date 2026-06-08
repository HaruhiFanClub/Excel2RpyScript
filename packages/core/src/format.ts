// 校验导入的 Excel 是否符合预期模板（表头结构）。非法则给出可读原因。
// 支持两种模式：
// - 旧表：第 7 行 A=角色 B:R=台词；第 6 行 S=选填语音文本 T=立绘 …
// - 新表：第 7 行 A=角色 B=台词 C=选填语音文本 D/E/F=立绘（左/中/右）…
import { detectWorkbookSchema, type TableMode } from './tableSchema'

export interface FormatResult {
  valid: boolean
  problems: string[]
  mode?: TableMode
}

// row7 / row6：对应 Excel 第 7 / 第 6 行的单元格文本数组（0 索引，col A = [0]）
export function validateHeaders(row7: string[], row6: string[]): FormatResult {
  const problems: string[] = []
  const at = (arr: string[], i: number) => (arr[i] ?? '').trim()

  if (!at(row7, 0).includes('角色')) problems.push('第 7 行 A 列应为「角色」')
  if (!at(row7, 1).includes('台词')) problems.push('第 7 行 B 列应为「台词」')

  const schema = detectWorkbookSchema(row7, row6)
  if (!schema) {
    const hasLegacyRightHeaders = at(row6, 18).includes('语音文本') || at(row6, 19).includes('立绘')
    const hasModernHeaders =
      at(row7, 2).includes('语音文本') &&
      at(row7, 3).includes('立绘') &&
      at(row7, 4).includes('立绘') &&
      at(row7, 5).includes('立绘')
    if (!hasLegacyRightHeaders && !hasModernHeaders) {
      problems.push('无法识别表格模式：旧表应在第 6 行 S–AE 放置右侧表头，新表应在第 7 行 C–Q 连续放置字段表头')
    }
  }

  return { valid: problems.length === 0 && !!schema, problems, ...(schema ? { mode: schema.mode } : {}) }
}
