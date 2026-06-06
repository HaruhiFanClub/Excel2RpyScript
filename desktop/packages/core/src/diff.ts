// 新旧表格对比（纯逻辑）。按「角色+台词」作为行身份做 LCS 对齐：
// 对齐的行比较其它列 → changed（带字段级差异）；未对齐 → added / removed。
// 台词本身改动会表现为 removed+added（台词即身份），其它列改动表现为 changed。
import { TABLE_COLUMNS, type TableData, type TableRow } from './tableColumns'

export interface FieldChange {
  col: string
  header: string
  old: string
  new: string
}
export interface RowChange {
  excelRowOld: number
  excelRowNew: number
  role: string
  text: string
  fields: FieldChange[]
}
export interface RowMark {
  excelRow: number
  role: string
  text: string
}
export interface SheetDiff {
  name: string
  status: 'common' | 'added' | 'removed'
  added: RowMark[]
  removed: RowMark[]
  changed: RowChange[]
  unchanged: number
}
export interface DiffReport {
  sheets: SheetDiff[]
  summary: { added: number; removed: number; changed: number }
}

const ident = (r: TableRow) => `${r.cells['role_name'] ?? ''}${r.cells['text'] ?? ''}`
const mark = (r: TableRow): RowMark => ({
  excelRow: r.excelRow,
  role: r.cells['role_name'] ?? '',
  text: r.cells['text'] ?? '',
})

// LCS 对齐，返回配对序列 [oldIndex|null, newIndex|null]
function align(a: TableRow[], b: TableRow[]): Array<[number | null, number | null]> {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] =
        ident(a[i]!) === ident(b[j]!)
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: Array<[number | null, number | null]> = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (ident(a[i]!) === ident(b[j]!)) {
      out.push([i, j])
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push([i, null])
      i++
    } else {
      out.push([null, j])
      j++
    }
  }
  while (i < m) out.push([i++, null])
  while (j < n) out.push([null, j++])
  return out
}

function diffSheet(name: string, oldRows: TableRow[], newRows: TableRow[]): SheetDiff {
  const added: RowMark[] = []
  const removed: RowMark[] = []
  const changed: RowChange[] = []
  let unchanged = 0
  for (const [oi, nj] of align(oldRows, newRows)) {
    if (oi !== null && nj !== null) {
      const o = oldRows[oi]!
      const nrow = newRows[nj]!
      const fields: FieldChange[] = []
      for (const c of TABLE_COLUMNS) {
        if (c.key === 'role_name' || c.key === 'text') continue // 身份键，相等
        const ov = o.cells[c.key] ?? ''
        const nv = nrow.cells[c.key] ?? ''
        if (ov !== nv) fields.push({ col: c.key, header: c.header, old: ov, new: nv })
      }
      if (fields.length) {
        changed.push({ excelRowOld: o.excelRow, excelRowNew: nrow.excelRow, role: nrow.cells['role_name'] ?? '', text: nrow.cells['text'] ?? '', fields })
      } else unchanged++
    } else if (oi !== null) {
      removed.push(mark(oldRows[oi]!))
    } else if (nj !== null) {
      added.push(mark(newRows[nj]!))
    }
  }
  return { name, status: 'common', added, removed, changed, unchanged }
}

export function diffWorkbooks(oldWb: TableData, newWb: TableData): DiffReport {
  const oldByName = new Map(oldWb.sheets.map((s) => [s.name, s]))
  const newByName = new Map(newWb.sheets.map((s) => [s.name, s]))
  const names: string[] = []
  for (const s of newWb.sheets) names.push(s.name)
  for (const s of oldWb.sheets) if (!newByName.has(s.name)) names.push(s.name)

  const sheets: SheetDiff[] = []
  for (const name of names) {
    const o = oldByName.get(name)
    const n = newByName.get(name)
    if (o && n) sheets.push(diffSheet(name, o.rows, n.rows))
    else if (n)
      sheets.push({ name, status: 'added', added: n.rows.map(mark), removed: [], changed: [], unchanged: 0 })
    else if (o)
      sheets.push({ name, status: 'removed', added: [], removed: o.rows.map(mark), changed: [], unchanged: 0 })
  }

  const summary = sheets.reduce(
    (acc, s) => ({
      added: acc.added + s.added.length,
      removed: acc.removed + s.removed.length,
      changed: acc.changed + s.changed.length,
    }),
    { added: 0, removed: 0, changed: 0 },
  )
  return { sheets, summary }
}
