// 读取工作簿为「可编辑表格模型」：每行携带真实 Excel 行号，便于回写时定位。
import ExcelJS from 'exceljs'
import { EXCEL_PARSE_START_ROW, EXCEL_PARSE_START_COL } from '../settings/parserSetting'
import { ElementColNumMapping } from '../settings/converterSetting'
import { asStr, truthy, EMPTY, type CellValue } from '../parse/cellValue'
import { readExcelCell } from './readWorkbook'
import { TABLE_COLUMNS, type TableData, type TableRow, type TableSheet } from '../tableColumns'

export { TABLE_COLUMNS }
export type { TableData, TableRow, TableSheet }

export async function readTable(filePath: string): Promise<TableData> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheets: TableSheet[] = []

  for (const ws of wb.worksheets) {
    const rows: TableRow[] = []
    for (let r = EXCEL_PARSE_START_ROW + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const full: CellValue[] = []
      for (let c = 1; c <= EXCEL_PARSE_START_COL; c++) full.push(readExcelCell(row.getCell(c)))
      if (!full.some(truthy)) continue
      const cells: Record<string, string> = {}
      for (const col of TABLE_COLUMNS) {
        cells[col.key] = asStr(full[ElementColNumMapping[col.key]] ?? EMPTY)
      }
      rows.push({ excelRow: r, cells })
    }
    sheets.push({ name: ws.name, rows })
  }

  return { sheets }
}
