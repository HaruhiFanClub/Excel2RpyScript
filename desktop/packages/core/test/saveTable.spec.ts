import { describe, it, expect } from 'vitest'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTable } from '../src/xlsx/readTable'
import { saveTableEdits } from '../src/xlsx/saveTable'
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
})
