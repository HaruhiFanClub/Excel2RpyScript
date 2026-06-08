import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateHeaders } from '../src/format'
import { readWorkbook } from '../src/xlsx/readWorkbook'
import { readTable } from '../src/xlsx/readTable'
import { saveTableChanges } from '../src/xlsx/saveTable'
import { runPipeline } from '../src/pipeline'
import { modernSpritesToCharacter } from '../src/tableSchema'
import type { SpritePositions } from '../src/sprites'

const PREFIXED_SPRITES: SpritePositions = {
  kyon: { left: 'kyon_left', mid: 'kyon_mid', right: 'kyon_right' },
  kyon_s: { left: 'kyon_s_left', mid: 'kyon_s_mid', right: 'kyon_s_right' },
  yuki: { left: 'yuki_left', mid: 'yuki_mid', right: 'yuki_right' },
  haruhi: { left: 'haruhi_left', mid: 'haruhi_mid', right: 'haruhi_right' },
}

function rowTexts(ws: ExcelJS.Worksheet, rowNumber: number, count = 31): string[] {
  const row = ws.getRow(rowNumber)
  return Array.from({ length: count }, (_, i) => row.getCell(i + 1).text ?? '')
}

async function writeLegacyFixture(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.mergeCells('B7:R7')
  ws.mergeCells('B8:R8')
  ws.getCell('A7').value = '角色'
  ws.getCell('B7').value = '台词'
  ws.getCell('S6').value = '选填语音文本'
  ws.getCell('T6').value = '立绘'
  ws.getCell('U6').value = '背景'
  ws.getCell('V6').value = '转场'
  ws.getCell('W6').value = '音乐'
  ws.getCell('X6').value = '语音'
  ws.getCell('Y6').value = '语音指令'
  ws.getCell('Z6').value = '模式'
  ws.getCell('AA6').value = '换页'
  ws.getCell('AB6').value = '音效'
  ws.getCell('AC6').value = '角色头像'
  ws.getCell('AD6').value = '分支'
  ws.getCell('AE6').value = '备注'
  ws.getCell('A8').value = '阿虚'
  ws.getCell('B8').value = '旧表台词'
  ws.getCell('S8').value = '旧表语音文本'
  ws.getCell('T8').value = 'kyon 001 left;yuki 002 right'
  ws.getCell('U8').value = 'bg_old'
  ws.getCell('X8').value = 'tts'
  ws.getCell('Y8').value = 'kyon_1'
  await wb.xlsx.writeFile(filePath)
}

async function writeModernFixture(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  const headers = [
    '角色',
    '台词',
    '选填语音文本',
    '立绘（左）',
    '立绘（中）',
    '立绘（右）',
    '背景',
    '转场',
    '音乐',
    '语音',
    '语音指令',
    '模式',
    '换页',
    '音效',
    '角色头像',
    '分支',
    '备注',
  ]
  ws.getRow(7).values = [, ...headers]
  ws.getCell('A8').value = '阿虚'
  ws.getCell('B8').value = '新表台词'
  ws.getCell('C8').value = '新表语音文本'
  ws.getCell('D8').value = 'kyon 001'
  ws.getCell('F8').value = 'yuki 002'
  ws.getCell('G8').value = 'bg_new'
  ws.getCell('J8').value = 'tts'
  ws.getCell('K8').value = 'kyon_1'
  await wb.xlsx.writeFile(filePath)
}

describe('表格 schema 兼容', () => {
  it('识别旧表和新表表头', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-schema-'))
    const legacy = join(dir, 'legacy.xlsx')
    const modern = join(dir, 'modern.xlsx')
    await writeLegacyFixture(legacy)
    await writeModernFixture(modern)

    const legacyWb = new ExcelJS.Workbook()
    await legacyWb.xlsx.readFile(legacy)
    const modernWb = new ExcelJS.Workbook()
    await modernWb.xlsx.readFile(modern)

    expect(validateHeaders(rowTexts(legacyWb.getWorksheet('Sheet1')!, 7), rowTexts(legacyWb.getWorksheet('Sheet1')!, 6))).toMatchObject({
      valid: true,
      mode: 'legacy',
    })
    expect(validateHeaders(rowTexts(modernWb.getWorksheet('Sheet1')!, 7), rowTexts(modernWb.getWorksheet('Sheet1')!, 6))).toMatchObject({
      valid: true,
      mode: 'modern',
    })
  })

  it('读取新表时标准化为现有转换/TTS字段', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-modern-read-'))
    const file = join(dir, 'modern.xlsx')
    await writeModernFixture(file)

    const table = await readTable(file)
    expect(table.sheets[0]!.schema?.mode).toBe('modern')
    const row = table.sheets[0]!.rows[0]!
    expect(row.cells['text']).toBe('新表台词')
    expect(row.cells['voice_text']).toBe('新表语音文本')
    expect(row.cells['background']).toBe('bg_new')
    expect(row.cells['voice']).toBe('tts')
    expect(row.cells['voice_cmd']).toBe('kyon_1')
    expect(row.cells['character']).toBe('kyon 001 left;yuki 002 right')

    const { sheets } = await readWorkbook(file)
    const { files } = runPipeline(sheets, { mode: 'default', normalizeMode: true, trimRoleNames: true })
    expect(files[0]!.content).toContain('show kyon 001 at left')
    expect(files[0]!.content).toContain('show yuki 002 at right')
    expect(files[0]!.content).toContain('voice "阿虚_sheet1_row8_synthesized.wav"')
  })

  it('读取旧表合并表头时不会触发 ExcelJS merged-cell 异常', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-legacy-merged-header-'))
    const file = join(dir, 'legacy.xlsx')
    await writeLegacyFixture(file)

    const table = await readTable(file)
    const { sheets } = await readWorkbook(file)
    expect(table.sheets[0]!.schema?.mode).toBe('legacy')
    expect(table.sheets[0]!.rows[0]!.cells['character']).toBe('kyon 001 left;yuki 002 right')
    expect(sheets[0]!.schema?.mode).toBe('legacy')
  })

  it('读取新表时按角色配置补齐立绘位置参数', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-modern-read-cfg-'))
    const file = join(dir, 'modern.xlsx')
    await writeModernFixture(file)

    const table = await readTable(file, { spritePositions: PREFIXED_SPRITES })
    expect(table.sheets[0]!.rows[0]!.cells['character']).toBe(
      'kyon 001 kyon_left;yuki 002 yuki_right',
    )

    const { sheets } = await readWorkbook(file, { spritePositions: PREFIXED_SPRITES })
    const { files } = runPipeline(sheets, { mode: 'default', normalizeMode: true, trimRoleNames: true })
    expect(files[0]!.content).toContain('show kyon 001 at kyon_left')
    expect(files[0]!.content).toContain('show yuki 002 at yuki_right')
  })

  it('新表立绘列为空位置语义时按所在列补齐位置', () => {
    expect(modernSpritesToCharacter('kyon_001', '', 'yuki 002;yuki hide')).toBe(
      'kyon_001 left;yuki 002 right;yuki hide',
    )
    expect(modernSpritesToCharacter('kyon 001', '', 'yuki 002', PREFIXED_SPRITES)).toBe(
      'kyon 001 kyon_left;yuki 002 yuki_right',
    )
    expect(modernSpritesToCharacter('kyon_001', '', 'kyon_s_002', PREFIXED_SPRITES)).toBe(
      'kyon_001 kyon_left;kyon_s_002 kyon_s_right',
    )
    expect(modernSpritesToCharacter('kyon 001 kyon_right', 'haruhi 003 mid', '')).toBe(
      'kyon 001 kyon_right;haruhi 003 mid',
    )
  })

  it('保存新表时写回连续物理列并拆回立绘三列', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-modern-save-'))
    const file = join(dir, 'modern.xlsx')
    await writeModernFixture(file)

    await saveTableChanges(file, [
      { sheet: 'Sheet1', excelRow: 8, col: 'text', value: '保存后的台词' },
      { sheet: 'Sheet1', excelRow: 8, col: 'background', value: 'bg_after' },
      { sheet: 'Sheet1', excelRow: 8, col: 'character', value: 'kyon 003 left;yuki 004 mid;haruhi 005 right' },
    ])

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.getWorksheet('Sheet1')!
    expect(ws.getCell('B8').value).toBe('保存后的台词')
    expect(ws.getCell('G8').value).toBe('bg_after')
    expect(ws.getCell('D8').value).toBe('kyon 003')
    expect(ws.getCell('E8').value).toBe('yuki 004')
    expect(ws.getCell('F8').value).toBe('haruhi 005')
    expect(ws.getCell('U8').value).toBeNull()

    const table = await readTable(file)
    expect(table.sheets[0]!.rows[0]!.cells['character']).toBe('kyon 003 left;yuki 004 mid;haruhi 005 right')
  })

  it('保存新表时按角色配置识别自定义位置属于哪一列', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-modern-save-cfg-'))
    const file = join(dir, 'modern.xlsx')
    await writeModernFixture(file)

    await saveTableChanges(
      file,
      [{ sheet: 'Sheet1', excelRow: 8, col: 'character', value: 'kyon 003 kyon_far_right' }],
      { spritePositions: { kyon: { right: 'kyon_far_right' } } },
    )

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.getWorksheet('Sheet1')!
    expect(ws.getCell('D8').value).toBeNull()
    expect(ws.getCell('E8').value).toBeNull()
    expect(ws.getCell('F8').value).toBe('kyon 003')
  })

  it('新表插入行时保持 17 列布局', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-modern-insert-'))
    const file = join(dir, 'modern.xlsx')
    await writeModernFixture(file)

    await saveTableChanges(file, [
      {
        type: 'insert-row',
        sheet: 'Sheet1',
        excelRow: 8,
        values: { text: '插入的新表行', voice_text: '插入语音文本', character: 'kyon 009 left', background: 'bg_insert' },
      },
    ])

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.getWorksheet('Sheet1')!
    expect(ws.columnCount).toBeLessThanOrEqual(17)
    expect(ws.getCell('B8').value).toBe('插入的新表行')
    expect(ws.getCell('C8').value).toBe('插入语音文本')
    expect(ws.getCell('D8').value).toBe('kyon 009')
    expect(ws.getCell('G8').value).toBe('bg_insert')
    expect(ws.getCell('T8').value).toBeNull()
  })

  it('旧表仍按旧物理列保存', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2r-legacy-save-'))
    const file = join(dir, 'legacy.xlsx')
    await writeLegacyFixture(file)

    await saveTableChanges(file, [
      { sheet: 'Sheet1', excelRow: 8, col: 'background', value: 'bg_after' },
      { sheet: 'Sheet1', excelRow: 8, col: 'character', value: 'kyon 003 left' },
    ])

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.getWorksheet('Sheet1')!
    expect(ws.getCell('T8').value).toBe('kyon 003 left')
    expect(ws.getCell('U8').value).toBe('bg_after')
    expect(ws.getCell('S8').value).toBe('旧表语音文本')
  })
})
