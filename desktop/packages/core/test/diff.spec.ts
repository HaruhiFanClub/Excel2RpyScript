import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffWorkbooks } from '../src/diff'
import { readTable } from '../src/xlsx/readTable'
import type { TableData, TableRow } from '../src/tableColumns'

const row = (excelRow: number, cells: Record<string, string>): TableRow => ({ excelRow, cells })
const wb = (rows: TableRow[]): TableData => ({ sheets: [{ name: 'Sheet1', rows }] })
const EXCEL_COL: Record<string, number> = {
  role_name: 1,
  text: 2,
  voice_text: 19,
  character: 20,
  background: 21,
  transition: 22,
  music: 23,
  voice: 24,
  voice_cmd: 25,
  mode: 26,
  change_page: 27,
  sound: 28,
  side_character: 29,
  menu: 30,
  remark: 31,
}

async function writeXlsx(path: string, rows: Array<Record<string, string>>): Promise<void> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('start')
  for (const [i, data] of rows.entries()) {
    const excelRow = sheet.getRow(8 + i)
    for (const [key, value] of Object.entries(data)) excelRow.getCell(EXCEL_COL[key]!).value = value
  }
  await book.xlsx.writeFile(path)
}

describe('diffWorkbooks', () => {
  it('识别 changed / added / removed', () => {
    const oldWb = wb([
      row(7, { role_name: '旁白', text: 'anchor' }),
      row(8, { role_name: 'A', text: 'hello', music: 'm1' }),
      row(9, { role_name: 'B', text: 'bye' }),
      row(10, { role_name: '旁白', text: 'tail' }),
    ])
    const newWb = wb([
      row(7, { role_name: '旁白', text: 'anchor' }),
      row(8, { role_name: 'A', text: 'hello', music: 'm2' }), // music 改
      row(9, { role_name: 'C', text: 'new' }), // 新增
      row(10, { role_name: 'D', text: 'another new' }), // 新增
      row(11, { role_name: '旁白', text: 'tail' }),
    ])
    const r = diffWorkbooks(oldWb, newWb)
    expect(r.summary).toEqual({ added: 2, removed: 1, changed: 1 })
    const s = r.sheets[0]!
    expect(s.changed[0]!.fields[0]).toMatchObject({ col: 'music', old: 'm1', new: 'm2' })
    expect(s.removed[0]!.text).toBe('bye')
    expect(s.added[0]!.text).toBe('new')
    expect(s.ops.map((op) => op.type)).toEqual(['changed', 'removed', 'added', 'added'])
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

  it('局部台词修改和插入不扩大 diff 范围', () => {
    const oldWb = wb([
      row(8, { role_name: '阿虚', text: '今天的社团活动照常开始。' }),
      row(9, { role_name: '春日', text: '所有人都要准时到齐！', voice: 'tts', voice_cmd: 'haruhi_01' }),
      row(10, { role_name: '长门', text: '我会在那里。' }),
      row(11, { role_name: '阿虚', text: '事情大概就是这样。' }),
    ])
    const newWb = wb([
      row(8, { role_name: '阿虚', text: '今天的社团活动照常开始。' }),
      row(9, { role_name: '春日', text: '所有人今天都要准时到齐！', voice: 'tts', voice_cmd: 'haruhi_02' }),
      row(10, { role_name: '古泉', text: '我也会参加。' }),
      row(11, { role_name: '长门', text: '我会在那里。' }),
      row(12, { role_name: '阿虚', text: '事情大概就是这样。' }),
    ])

    const r = diffWorkbooks(oldWb, newWb)
    expect(r.summary).toEqual({ added: 1, removed: 0, changed: 1 })

    const s = r.sheets[0]!
    expect(s.unchanged).toBe(3)
    expect(s.ops.map((op) => op.type)).toEqual(['changed', 'added'])
    expect(s.changed[0]!.fields.map((f) => f.col)).toEqual(['text', 'voice_cmd'])
    expect(s.changed[0]!.oldText).toBe('所有人都要准时到齐！')
    expect(s.changed[0]!.newText).toBe('所有人今天都要准时到齐！')
    expect(s.added[0]!.text).toBe('我也会参加。')
  })

  it('读取两份真实 xlsx 后生成局部、可读的操作序列', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'e2r-diff-'))
    try {
      const oldPath = join(dir, 'old.xlsx')
      const newPath = join(dir, 'new.xlsx')
      await writeXlsx(oldPath, [
        { role_name: '旁白', text: 'anchor' },
        { role_name: '阿虚', text: '今天的社团活动照常开始。', background: 'clubroom_day', music: 'daily_theme' },
        { role_name: '春日', text: '所有人都要准时到齐！', voice: 'tts', voice_cmd: 'haruhi_01' },
        { role_name: '朝比奈', text: '我、我会准备茶点。' },
        { role_name: '长门', text: '我会在那里。', character: '长门 1 mid' },
        { role_name: '阿虚', text: '事情大概就是这样。', remark: '结尾旁白' },
      ])
      await writeXlsx(newPath, [
        { role_name: '旁白', text: 'anchor' },
        { role_name: '阿虚', text: '今天的社团活动照常开始。', background: 'clubroom_evening', music: 'daily_theme' },
        { role_name: '春日', text: '所有人今天都要准时到齐！', voice: 'tts', voice_cmd: 'haruhi_02' },
        { role_name: '古泉', text: '我也会参加。' },
        { role_name: '谷口', text: '等等，我是不是走错地方了？' },
        { role_name: '长门', text: '我会在那里。', character: '长门 1 mid' },
        { role_name: '阿虚', text: '事情大概就是这样。', remark: '结尾旁白' },
      ])

      const report = diffWorkbooks(await readTable(oldPath), await readTable(newPath))
      expect(report.summary).toEqual({ added: 2, removed: 1, changed: 2 })
      expect(report.sheets[0]!.ops.map((op) => op.type)).toEqual([
        'changed',
        'changed',
        'removed',
        'added',
        'added',
      ])
      expect(report.sheets[0]!.changed.map((change) => change.fields.map((f) => f.col))).toEqual([
        ['background'],
        ['text', 'voice_cmd'],
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('大表局部修改不会走整表二次方矩阵', () => {
    const oldRows: TableRow[] = []
    const newRows: TableRow[] = []
    for (let i = 0; i < 2500; i++) {
      oldRows.push(row(8 + i, { role_name: '角色', text: `第 ${i} 行台词`, voice_cmd: `cmd_${i % 3}` }))
      newRows.push(row(8 + i, { role_name: '角色', text: `第 ${i} 行台词`, voice_cmd: `cmd_${i % 3}` }))
    }
    newRows[1200] = row(1208, { role_name: '角色', text: '第 1200 行台词被局部修改', voice_cmd: 'cmd_1' })
    newRows.splice(1600, 0, row(1608, { role_name: '新角色', text: '插入的一句新台词' }))

    const report = diffWorkbooks({ sheets: [{ name: 'start', rows: oldRows }] }, { sheets: [{ name: 'start', rows: newRows }] })

    expect(report.summary).toEqual({ added: 1, removed: 0, changed: 1 })
    expect(report.sheets[0]!.ops.map((op) => op.type)).toEqual(['changed', 'added'])
  })
})
