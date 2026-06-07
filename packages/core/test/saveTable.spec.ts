import { describe, it, expect } from 'vitest'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTable } from '../src/xlsx/readTable'
import { saveTableChanges, saveTableEdits } from '../src/xlsx/saveTable'
import { sourceXlsx } from './helpers'

describe('saveTableEdits 回写往返', () => {
  it('编辑→保存→重读 命中', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-save-'))
    const f = join(dir, 'wb.xlsx')
    copyFileSync(sourceXlsx('sample'), f)

    const before = await readTable(f)
    const s0 = before.sheets[0]!
    const firstRow = s0.rows[0]!
    expect(firstRow.cells['text']).toBeTruthy()

    await saveTableEdits(f, [
      { sheet: s0.name, excelRow: firstRow.excelRow, col: 'text', value: '改写后的台词' },
      { sheet: s0.name, excelRow: firstRow.excelRow, col: 'background', value: 'bg_new' },
    ])

    const after = await readTable(f)
    const r = after.sheets[0]!.rows.find((x) => x.excelRow === firstRow.excelRow)!
    expect(r.cells['text']).toBe('改写后的台词')
    expect(r.cells['background']).toBe('bg_new')
    // 其它列未受影响
    expect(r.cells['role_name']).toBe(firstRow.cells['role_name'])
  })

  it('空字符串清空单元格', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-save2-'))
    const f = join(dir, 'wb.xlsx')
    copyFileSync(sourceXlsx('sample'), f)
    const before = await readTable(f)
    const s0 = before.sheets[0]!
    const row = s0.rows[0]!
    await saveTableEdits(f, [{ sheet: s0.name, excelRow: row.excelRow, col: 'voice', value: '' }])
    const after = await readTable(f)
    const r = after.sheets[0]!.rows.find((x) => x.excelRow === row.excelRow)!
    expect(r.cells['voice']).toBe('')
  })

  it('插入行后后续行号整体顺延', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-save-insert-'))
    const f = join(dir, 'wb.xlsx')
    copyFileSync(sourceXlsx('sample'), f)
    const before = await readTable(f)
    const s0 = before.sheets[0]!
    const firstRow = s0.rows[0]!
    const secondRow = s0.rows[1]!

    await saveTableChanges(f, [
      {
        type: 'insert-row',
        sheet: s0.name,
        excelRow: secondRow.excelRow,
        values: { role_name: '新角色', text: '插入的新台词', voice_cmd: '默认' },
      },
    ])

    const after = await readTable(f)
    const inserted = after.sheets[0]!.rows.find((x) => x.excelRow === secondRow.excelRow)!
    const shifted = after.sheets[0]!.rows.find((x) => x.excelRow === secondRow.excelRow + 1)!
    expect(inserted.cells['role_name']).toBe('新角色')
    expect(inserted.cells['text']).toBe('插入的新台词')
    expect(shifted.cells['text']).toBe(secondRow.cells['text'])
    expect(after.sheets[0]!.rows.find((x) => x.excelRow === firstRow.excelRow)!.cells['text']).toBe(
      firstRow.cells['text'],
    )
  })

  it('删除行后后续行号整体前移', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-save-delete-'))
    const f = join(dir, 'wb.xlsx')
    copyFileSync(sourceXlsx('sample'), f)
    const before = await readTable(f)
    const s0 = before.sheets[0]!
    const firstRow = s0.rows[0]!
    const secondRow = s0.rows[1]!

    await saveTableChanges(f, [{ type: 'delete-row', sheet: s0.name, excelRow: firstRow.excelRow }])

    const after = await readTable(f)
    const moved = after.sheets[0]!.rows.find((x) => x.excelRow === firstRow.excelRow)!
    expect(moved.cells['text']).toBe(secondRow.cells['text'])
  })
})
