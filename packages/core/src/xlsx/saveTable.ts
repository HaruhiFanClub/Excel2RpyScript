// 把表格编辑回写到 xlsx：load → 改对应单元格 → write。
// 用 ExcelJS 改写既有工作簿对象，保留原有样式/合并单元格/列宽。
import ExcelJS from 'exceljs'
import { ElementColNumMapping, type ColKey } from '../settings/converterSetting'
import { EXCEL_PARSE_START_COL, EXCEL_PARSE_START_ROW } from '../settings/parserSetting'

export interface CellEdit {
  sheet: string
  excelRow: number // 真实 Excel 行号（1 基）
  col: ColKey
  value: string
}

export interface TableRowInsert {
  type: 'insert-row'
  sheet: string
  excelRow: number // 插入到该 Excel 行号之前；追加时传最后一行后一位
  values?: Partial<Record<ColKey, string>>
}

export interface TableRowDelete {
  type: 'delete-row'
  sheet: string
  excelRow: number
}

export type TableRowOperation = TableRowInsert | TableRowDelete
export type TableChange = CellEdit | TableRowOperation

function isRowOperation(change: TableChange): change is TableRowOperation {
  return 'type' in change
}

function cloneStyle(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as unknown
}

function copyRowShape(ws: ExcelJS.Worksheet, targetRowNumber: number): void {
  const target = ws.getRow(targetRowNumber)
  const next = targetRowNumber + 1 <= ws.rowCount ? ws.getRow(targetRowNumber + 1) : null
  const previous = targetRowNumber > 1 ? ws.getRow(targetRowNumber - 1) : null
  const template = next && next.cellCount > 0 ? next : previous
  if (!template) return

  target.height = template.height
  for (let c = 1; c <= EXCEL_PARSE_START_COL; c++) {
    const src = template.getCell(c)
    const dst = target.getCell(c)
    dst.style = cloneStyle(src.style) as Partial<ExcelJS.Style>
  }
}

function writeCell(ws: ExcelJS.Worksheet, excelRow: number, col: ColKey, value: string): void {
  const cell = ws.getCell(excelRow, ElementColNumMapping[col] + 1)
  cell.value = value === '' ? null : value
}

function clampDataRow(ws: ExcelJS.Worksheet, excelRow: number): number {
  const firstDataRow = EXCEL_PARSE_START_ROW + 1
  return Math.max(firstDataRow, Math.min(excelRow, Math.max(ws.rowCount + 1, firstDataRow)))
}

export async function saveTableEdits(filePath: string, edits: CellEdit[]): Promise<void> {
  await saveTableChanges(filePath, edits)
}

export async function saveTableChanges(filePath: string, changes: TableChange[]): Promise<void> {
  if (changes.length === 0) return
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  for (const change of changes) {
    const ws = wb.getWorksheet(change.sheet)
    if (!ws) continue
    if (isRowOperation(change)) {
      const excelRow = clampDataRow(ws, change.excelRow)
      if (change.type === 'insert-row') {
        ws.spliceRows(excelRow, 0, [])
        copyRowShape(ws, excelRow)
        if (change.values) {
          for (const [col, value] of Object.entries(change.values)) {
            writeCell(ws, excelRow, col as ColKey, value ?? '')
          }
        }
      } else if (excelRow <= ws.rowCount) {
        ws.spliceRows(excelRow, 1)
      }
      continue
    }
    writeCell(ws, change.excelRow, change.col, change.value)
  }

  await wb.xlsx.writeFile(filePath)
}
