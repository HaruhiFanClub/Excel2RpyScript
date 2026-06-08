// 校验导入的 Excel 是否符合预期模板（表头结构）。非法则给出可读原因。
// 模板：Excel 第 7 行(1 基) A=角色 B=台词；第 6 行 S=选填语音文本 T=立绘 …（0 索引：row[col]）
export interface FormatResult {
  valid: boolean
  problems: string[]
}

// row7 / row6：对应 Excel 第 7 / 第 6 行的单元格文本数组（0 索引，col A = [0]）
export function validateHeaders(row7: string[], row6: string[]): FormatResult {
  const problems: string[] = []
  const at = (arr: string[], i: number) => (arr[i] ?? '').trim()

  if (!at(row7, 0).includes('角色')) problems.push('第 7 行 A 列应为「角色」')
  if (!at(row7, 1).includes('台词')) problems.push('第 7 行 B 列应为「台词」')

  const hasSprite = at(row6, 19).includes('立绘')
  const hasVoiceText = at(row6, 18).includes('语音文本')
  if (!hasSprite && !hasVoiceText) {
    problems.push('第 6 行缺少「立绘 / 选填语音文本」等右侧表头（S–AE）')
  }

  return { valid: problems.length === 0, problems }
}
