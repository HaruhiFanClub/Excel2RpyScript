// 读取工作簿为「可编辑表格模型」：每行携带真实 Excel 行号，便于回写时定位。
import ExcelJS from 'exceljs'
import { EXCEL_PARSE_START_ROW, EXCEL_PARSE_START_COL } from '../settings/parserSetting'
import { ElementColNumMapping } from '../settings/converterSetting'
import { asStr, truthy, EMPTY, type CellValue } from '../parse/cellValue'
import { readExcelCell } from './readWorkbook'
import { TABLE_COLUMNS, type TableData, type TableRow, type TableSheet } from '../tableColumns'
import {
  detectWorkbookSchema,
  LEGACY_SCHEMA,
  normalizePhysicalRow,
  type WorkbookSchema,
} from '../tableSchema'
import type { SpritePositions } from '../sprites'

export { TABLE_COLUMNS }
export type { TableData, TableRow, TableSheet }

export interface ReadTableOptions {
  spritePositions?: SpritePositions
}

export async function readTable(filePath: string, options: ReadTableOptions = {}): Promise<TableData> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheets: TableSheet[] = []

  for (const ws of wb.worksheets) {
    const rows: TableRow[] = []
    const readHeader = (r: number): string[] => {
      const row = ws.getRow(r)
      const out: string[] = []
      for (let c = 1; c <= EXCEL_PARSE_START_COL; c++) out.push(row.getCell(c).text ?? '')
      return out
    }
    const schema: WorkbookSchema = detectWorkbookSchema(readHeader(7), readHeader(6)) ?? LEGACY_SCHEMA
    for (let r = EXCEL_PARSE_START_ROW + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const physical: CellValue[] = []
      for (let c = 1; c <= schema.physicalColumnCount; c++) physical.push(readExcelCell(row.getCell(c)))
      const full = normalizePhysicalRow(physical, schema, options.spritePositions)
      if (!full.some(truthy)) continue
      const cells: Record<string, string> = {}
      for (const col of TABLE_COLUMNS) {
        cells[col.key] = asStr(full[ElementColNumMapping[col.key]] ?? EMPTY)
      }
      rows.push({ excelRow: r, cells })
    }
    sheets.push({ name: ws.name, rows, schema })
  }

  return { sheets }
}
