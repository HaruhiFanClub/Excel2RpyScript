import { describe, it, expect } from 'vitest'
import { diffWorkbooks } from '../src/diff'
import type { TableData, TableRow } from '../src/tableColumns'

const row = (excelRow: number, cells: Record<string, string>): TableRow => ({ excelRow, cells })
const wb = (rows: TableRow[]): TableData => ({ sheets: [{ name: 'Sheet1', rows }] })

describe('diffWorkbooks', () => {
  it('识别 changed / added / removed', () => {
    const oldWb = wb([
      row(8, { role_name: 'A', text: 'hello', music: 'm1' }),
      row(9, { role_name: 'B', text: 'bye' }),
    ])
    const newWb = wb([
      row(8, { role_name: 'A', text: 'hello', music: 'm2' }), // music 改
      row(9, { role_name: 'C', text: 'new' }), // 新增
    ])
    const r = diffWorkbooks(oldWb, newWb)
    expect(r.summary).toEqual({ added: 1, removed: 1, changed: 1 })
    const s = r.sheets[0]!
    expect(s.changed[0]!.fields[0]).toMatchObject({ col: 'music', old: 'm1', new: 'm2' })
    expect(s.removed[0]!.text).toBe('bye')
    expect(s.added[0]!.text).toBe('new')
  })

  it('完全相同 → 无差异', () => {
    const a = wb([row(8, { role_name: 'A', text: 'x', background: 'bg1' })])
    const r = diffWorkbooks(a, wb([row(8, { role_name: 'A', text: 'x', background: 'bg1' })]))
    expect(r.summary).toEqual({ added: 0, removed: 0, changed: 0 })
    expect(r.sheets[0]!.unchanged).toBe(1)
  })

  it('整个 sheet 新增/删除', () => {
    const oldWb: TableData = { sheets: [{ name: 'S1', rows: [row(8, { role_name: 'A', text: 'x' })] }] }
    const newWb: TableData = {
      sheets: [
        { name: 'S1', rows: [row(8, { role_name: 'A', text: 'x' })] },
        { name: 'S2', rows: [row(8, { role_name: 'B', text: 'y' })] },
      ],
    }
    const r = diffWorkbooks(oldWb, newWb)
    const s2 = r.sheets.find((s) => s.name === 'S2')!
    expect(s2.status).toBe('added')
    expect(s2.added).toHaveLength(1)
  })
})
