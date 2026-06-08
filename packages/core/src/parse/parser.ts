// 解析（移植自 handler/parser.py）：空行跳过 + 补齐到 31 列。
import { EXCEL_PARSE_START_COL } from '../settings/parserSetting'
import { truthy, EMPTY, type CellValue } from './cellValue'
import type { ParsedSheet } from '../convert/converter'
import type { WorkbookSchema } from '../tableSchema'

// reader 产出的原始 sheet（从 Excel 第 8 行起，含空行；每行已是 31 列宽）
export interface RawSheet {
  name: string
  rows: CellValue[][]
  schema?: WorkbookSchema
}

export function parseSheets(raw: RawSheet[]): ParsedSheet[] {
  return raw.map((s) => ({ name: s.name, rows: parseSheetRows(s.rows), schema: s.schema }))
}

export function parseSheetRows(rows: CellValue[][]): CellValue[][] {
  const out: CellValue[][] = []
  for (const row of rows) {
    // any(data)：整行全空则跳过
    if (!row.some(truthy)) continue
    const r = row.slice(0, EXCEL_PARSE_START_COL)
    while (r.length < EXCEL_PARSE_START_COL) r.push(EMPTY)
    out.push(r)
  }
  return out
}
