// 新旧表格对比（纯逻辑）。先用唯一且完全相同的行做 patience-style 上下文锚点，
// 再在锚点之间的局部差异块内按相似度配对。这样局部台词/角色/资源修改会收敛为
// changed，插入/删除也能被限制在相邻块内，避免把后续大量行带偏。
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
  role: string // 兼容旧 UI：优先使用新角色
  text: string // 兼容旧 UI：优先使用新台词
  oldRole: string
  newRole: string
  oldText: string
  newText: string
  fields: FieldChange[]
}
export interface RowMark {
  excelRow: number
  role: string
  text: string
}
export type DiffOp =
  | { type: 'changed'; change: RowChange }
  | { type: 'added'; row: RowMark }
  | { type: 'removed'; row: RowMark }
export interface SheetDiff {
  name: string
  status: 'common' | 'added' | 'removed'
  added: RowMark[]
  removed: RowMark[]
  changed: RowChange[]
  ops: DiffOp[]
  unchanged: number
}
export interface DiffReport {
  sheets: SheetDiff[]
  summary: { added: number; removed: number; changed: number }
}

const cell = (r: TableRow, key: string): string => r.cells[key] ?? ''
const fullIdent = (r: TableRow): string => TABLE_COLUMNS.map((c) => cell(r, c.key)).join('\u0001')
const mark = (r: TableRow): RowMark => ({
  excelRow: r.excelRow,
  role: r.cells['role_name'] ?? '',
  text: r.cells['text'] ?? '',
})

function uniqueIndex(rows: TableRow[]): Map<string, number | null> {
  const out = new Map<string, number | null>()
  rows.forEach((row, index) => {
    const key = fullIdent(row)
    out.set(key, out.has(key) ? null : index)
  })
  return out
}

function longestIncreasingPairs(pairs: Array<[number, number]>): Array<[number, number]> {
  if (pairs.length <= 1) return pairs
  const tails: number[] = []
  const prev = new Array<number>(pairs.length).fill(-1)
  const tailAt = new Array<number>(pairs.length).fill(0)

  for (let i = 0; i < pairs.length; i++) {
    const value = pairs[i]![1]
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pairs[tails[mid]!]![1] < value) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]!
    tails[lo] = i
    tailAt[lo] = i
  }

  const out: Array<[number, number]> = []
  let k = tailAt[tails.length - 1]!
  while (k >= 0) {
    out.push(pairs[k]!)
    k = prev[k]!
  }
  return out.reverse()
}

// 返回唯一且完全相同的上下文锚点。避免 O(n*m) LCS 矩阵在大表上打爆进程。
function exactAnchors(a: TableRow[], b: TableRow[]): Array<[number, number]> {
  const oldUnique = uniqueIndex(a)
  const newUnique = uniqueIndex(b)
  const pairs: Array<[number, number]> = []
  for (const [key, oldIndex] of oldUnique) {
    if (oldIndex === null) continue
    const newIndex = newUnique.get(key)
    if (newIndex !== undefined && newIndex !== null) pairs.push([oldIndex, newIndex])
  }
  pairs.sort((x, y) => x[0] - y[0])
  return longestIncreasingPairs(pairs)
}

function ngrams(s: string): Set<string> {
  if (s.length <= 1) return new Set(s ? [s] : [])
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

function textSimilarity(a: string, b: string): number {
  if (a === b) return a ? 1 : 0
  if (!a || !b) return 0
  const aa = ngrams(a)
  const bb = ngrams(b)
  if (aa.size === 0 || bb.size === 0) return 0
  let hit = 0
  for (const x of aa) if (bb.has(x)) hit++
  return (2 * hit) / (aa.size + bb.size)
}

function rowScore(a: TableRow, b: TableRow): number {
  let score = 0
  if (cell(a, 'role_name') && cell(a, 'role_name') === cell(b, 'role_name')) score += 5
  const textScore = textSimilarity(cell(a, 'text'), cell(b, 'text'))
  if (textScore >= 0.35) score += textScore * 6

  for (const c of TABLE_COLUMNS) {
    if (c.key === 'role_name' || c.key === 'text') continue
    const av = cell(a, c.key)
    const bv = cell(b, c.key)
    if (!av || av !== bv) continue
    score += c.key === 'voice_cmd' || c.key === 'voice' ? 2 : 1.35
  }
  return score
}

const PAIR_THRESHOLD = 4.5
const GAP_PENALTY = -4
const MAX_DP_CELLS = 90000
const GREEDY_LOOKAHEAD = 48

function alignGap(a: TableRow[], b: TableRow[]): Array<[number | null, number | null]> {
  const m = a.length
  const n = b.length
  if (m === 0) return b.map((_, j): [number | null, number | null] => [null, j])
  if (n === 0) return a.map((_, i): [number | null, number | null] => [i, null])

  // 同长度局部块通常来自行内编辑，按顺序配对最不容易扩大 diff 范围。
  if (m === n) return a.map((_, i): [number | null, number | null] => [i, i])
  if (m * n > MAX_DP_CELLS) return alignGapGreedy(a, b)

  const pairScores = Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) => rowScore(a[i]!, b[j]!)),
  )
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) dp[i]![n] = dp[i + 1]![n]! + GAP_PENALTY
  for (let j = n - 1; j >= 0; j--) dp[m]![j] = dp[m]![j + 1]! + GAP_PENALTY
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const pair = pairScores[i]![j]! >= PAIR_THRESHOLD
        ? dp[i + 1]![j + 1]! + pairScores[i]![j]!
        : Number.NEGATIVE_INFINITY
      dp[i]![j] = Math.max(pair, dp[i + 1]![j]! + GAP_PENALTY, dp[i]![j + 1]! + GAP_PENALTY)
    }
  }

  const out: Array<[number | null, number | null]> = []
  let i = 0
  let j = 0
  const eq = (x: number, y: number): boolean => Math.abs(x - y) < 1e-6
  while (i < m && j < n) {
    const score = pairScores[i]![j]!
    const pair = score >= PAIR_THRESHOLD ? dp[i + 1]![j + 1]! + score : Number.NEGATIVE_INFINITY
    if (score >= PAIR_THRESHOLD && eq(dp[i]![j]!, pair)) {
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

function alignGapGreedy(a: TableRow[], b: TableRow[]): Array<[number | null, number | null]> {
  const out: Array<[number | null, number | null]> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const score = rowScore(a[i]!, b[j]!)
    if (fullIdent(a[i]!) === fullIdent(b[j]!) || score >= PAIR_THRESHOLD) {
      out.push([i++, j++])
      continue
    }

    let oldMatch = -1
    let oldMatchScore = Number.NEGATIVE_INFINITY
    let newMatch = -1
    let newMatchScore = Number.NEGATIVE_INFINITY
    const oldLimit = Math.min(a.length, i + GREEDY_LOOKAHEAD + 1)
    const newLimit = Math.min(b.length, j + GREEDY_LOOKAHEAD + 1)

    for (let oi = i + 1; oi < oldLimit; oi++) {
      const s = rowScore(a[oi]!, b[j]!)
      if (fullIdent(a[oi]!) === fullIdent(b[j]!) || s >= PAIR_THRESHOLD) {
        oldMatch = oi
        oldMatchScore = s
        break
      }
    }
    for (let nj = j + 1; nj < newLimit; nj++) {
      const s = rowScore(a[i]!, b[nj]!)
      if (fullIdent(a[i]!) === fullIdent(b[nj]!) || s >= PAIR_THRESHOLD) {
        newMatch = nj
        newMatchScore = s
        break
      }
    }

    if (oldMatch >= 0 || newMatch >= 0) {
      const oldSkip = oldMatch >= 0 ? oldMatch - i : Number.POSITIVE_INFINITY
      const newSkip = newMatch >= 0 ? newMatch - j : Number.POSITIVE_INFINITY
      const preferNew =
        newSkip < oldSkip ||
        (newSkip === oldSkip && newMatchScore >= oldMatchScore)
      if (preferNew) {
        while (j < newMatch) out.push([null, j++])
      } else {
        while (i < oldMatch) out.push([i++, null])
      }
      continue
    }

    if (a.length - i > b.length - j) out.push([i++, null])
    else out.push([null, j++])
  }
  while (i < a.length) out.push([i++, null])
  while (j < b.length) out.push([null, j++])
  return out
}

function makeChange(oldRow: TableRow, newRow: TableRow): RowChange | null {
  const fields: FieldChange[] = []
  for (const c of TABLE_COLUMNS) {
    const ov = cell(oldRow, c.key)
    const nv = cell(newRow, c.key)
    if (ov !== nv) fields.push({ col: c.key, header: c.header, old: ov, new: nv })
  }
  if (fields.length === 0) return null
  const oldRole = cell(oldRow, 'role_name')
  const newRole = cell(newRow, 'role_name')
  const oldText = cell(oldRow, 'text')
  const newText = cell(newRow, 'text')
  return {
    excelRowOld: oldRow.excelRow,
    excelRowNew: newRow.excelRow,
    role: newRole || oldRole,
    text: newText || oldText,
    oldRole,
    newRole,
    oldText,
    newText,
    fields,
  }
}

function diffSheet(name: string, oldRows: TableRow[], newRows: TableRow[]): SheetDiff {
  const added: RowMark[] = []
  const removed: RowMark[] = []
  const changed: RowChange[] = []
  const ops: DiffOp[] = []
  let unchanged = 0

  const pushGap = (oldStart: number, oldEnd: number, newStart: number, newEnd: number): void => {
    const oldPart = oldRows.slice(oldStart, oldEnd)
    const newPart = newRows.slice(newStart, newEnd)
    for (const [oi, nj] of alignGap(oldPart, newPart)) {
      if (oi !== null && nj !== null) {
        const change = makeChange(oldPart[oi]!, newPart[nj]!)
        if (change) {
          changed.push(change)
          ops.push({ type: 'changed', change })
        } else {
          unchanged++
        }
      } else if (oi !== null) {
        const row = mark(oldPart[oi]!)
        removed.push(row)
        ops.push({ type: 'removed', row })
      } else if (nj !== null) {
        const row = mark(newPart[nj]!)
        added.push(row)
        ops.push({ type: 'added', row })
      }
    }
  }

  let oldCursor = 0
  let newCursor = 0
  for (const [oi, nj] of exactAnchors(oldRows, newRows)) {
    pushGap(oldCursor, oi, newCursor, nj)
    unchanged++
    oldCursor = oi + 1
    newCursor = nj + 1
  }
  pushGap(oldCursor, oldRows.length, newCursor, newRows.length)

  return { name, status: 'common', added, removed, changed, ops, unchanged }
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
      sheets.push({
        name,
        status: 'added',
        added: n.rows.map(mark),
        removed: [],
        changed: [],
        ops: n.rows.map((row) => ({ type: 'added', row: mark(row) })),
        unchanged: 0,
      })
    else if (o)
      sheets.push({
        name,
        status: 'removed',
        added: [],
        removed: o.rows.map(mark),
        changed: [],
        ops: o.rows.map((row) => ({ type: 'removed', row: mark(row) })),
        unchanged: 0,
      })
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
