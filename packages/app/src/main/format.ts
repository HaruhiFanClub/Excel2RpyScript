import ExcelJS from 'exceljs'
import { validateHeaders, type FormatResult } from '@e2r/core'

// 读取首个 sheet 的第 6/7 行表头，校验是否符合模板
export async function validateFormat(filePath: string): Promise<FormatResult> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(filePath)
    const ws = wb.worksheets[0]
    if (!ws) return { valid: false, problems: ['工作簿没有任何 sheet'] }
    const readRow = (r: number): string[] => {
      const row = ws.getRow(r)
      const out: string[] = []
      for (let c = 1; c <= 31; c++) out.push(row.getCell(c).text ?? '')
      return out
    }
    return validateHeaders(readRow(7), readRow(6))
  } catch (e) {
    return { valid: false, problems: [`无法读取：${e instanceof Error ? e.message : String(e)}`] }
  }
}
