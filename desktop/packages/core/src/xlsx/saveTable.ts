// 把表格编辑回写到 xlsx：load → 改对应单元格 → write。
// 用 ExcelJS 改写既有工作簿对象，保留原有样式/合并单元格/列宽。
import ExcelJS from 'exceljs'
import { ElementColNumMapping, type ColKey } from '../settings/converterSetting'

export interface CellEdit {
  sheet: string
  excelRow: number // 真实 Excel 行号（1 基）
  col: ColKey
  value: string
}

export async function saveTableEdits(filePath: string, edits: CellEdit[]): Promise<void> {
  if (edits.length === 0) return
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  for (const e of edits) {
    const ws = wb.getWorksheet(e.sheet)
    if (!ws) continue
    const cell = ws.getCell(e.excelRow, ElementColNumMapping[e.col] + 1)
    cell.value = e.value === '' ? null : e.value
  }
  await wb.xlsx.writeFile(filePath)
}
