// ExcelJS 读取，归一为 CellValue[][]，对齐 xlrd 语义（见 docs/01-legacy-system-contract.md §B）。
// 关键点：合并区只有左上角（master）有值，其余单元格视为空 —— 与 xlrd 一致。
import ExcelJS from 'exceljs'
import { EXCEL_PARSE_START_ROW, EXCEL_PARSE_START_COL } from '../settings/parserSetting'
import { EMPTY, textCell, numberCell, type CellValue } from '../parse/cellValue'
import { parseSheets, type RawSheet } from '../parse/parser'
import type { ParsedSheet } from '../convert/converter'

export interface ReadWorkbookWarning {
  sheet: string
  row: number
  col: number
  message: string
}

function valueToCell(value: ExcelJS.CellValue, warns: () => void): CellValue {
  if (value === null || value === undefined) return EMPTY
  if (typeof value === 'string') {
    return value.length === 0 ? EMPTY : textCell(value)
  }
  if (typeof value === 'number') {
    return numberCell(value)
  }
  if (typeof value === 'boolean') {
    // xlrd 布尔为整数；真实数据未出现。按文本处理并告警。
    warns()
    return textCell(value ? 'True' : 'False')
  }
  if (value instanceof Date) {
    // xlrd 日期为浮点序列号；真实数据未出现。按 ISO 文本处理并告警。
    warns()
    return textCell(value.toISOString())
  }
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>
    if ('richText' in v && Array.isArray(v.richText)) {
      const s = (v.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('')
      return s.length === 0 ? EMPTY : textCell(s)
    }
    if ('formula' in v || 'sharedFormula' in v) {
      const result = v.result
      if (result === null || result === undefined) return EMPTY
      if (typeof result === 'number') return numberCell(result)
      if (typeof result === 'string') return result.length === 0 ? EMPTY : textCell(result)
      return valueToCell(result as ExcelJS.CellValue, warns)
    }
    if ('text' in v && typeof v.text === 'string') {
      // hyperlink
      return v.text.length === 0 ? EMPTY : textCell(v.text)
    }
    if ('error' in v) {
      warns()
      return textCell(String(v.error))
    }
  }
  warns()
  return EMPTY
}

export async function readRawWorkbook(
  filePath: string,
): Promise<{ sheets: RawSheet[]; warnings: ReadWorkbookWarning[] }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const warnings: ReadWorkbookWarning[] = []
  const sheets: RawSheet[] = []

  for (const ws of wb.worksheets) {
    const rows: CellValue[][] = []
    const startRow = EXCEL_PARSE_START_ROW + 1 // ExcelJS 1 基
    const lastRow = ws.rowCount
    for (let r = startRow; r <= lastRow; r++) {
      const row = ws.getRow(r)
      const cells: CellValue[] = []
      for (let c = 1; c <= EXCEL_PARSE_START_COL; c++) {
        const cell = row.getCell(c)
        // 合并区非左上角 → 视为空（对齐 xlrd）
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
          cells.push(EMPTY)
          continue
        }
        const rr = r
        const cc = c
        cells.push(
          valueToCell(cell.value, () =>
            warnings.push({
              sheet: ws.name,
              row: rr,
              col: cc,
              message: `非常规单元格类型，已按近似规则处理`,
            }),
          ),
        )
      }
      rows.push(cells)
    }
    sheets.push({ name: ws.name, rows })
  }

  return { sheets, warnings }
}

// 读取 + 解析（空行跳过/补齐），得到可直接喂给转换器的 ParsedSheet[]。
export async function readWorkbook(
  filePath: string,
): Promise<{ sheets: ParsedSheet[]; warnings: ReadWorkbookWarning[] }> {
  const { sheets, warnings } = await readRawWorkbook(filePath)
  return { sheets: parseSheets(sheets), warnings }
}
