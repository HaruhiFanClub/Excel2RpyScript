import { describe, it, expect } from 'vitest'
import { checkSheets, summarize, type CheckIssue } from '../src/check/checker'
import { EMPTY, textCell, numberCell, type CellValue } from '../src/parse/cellValue'
import { ElementColNumMapping, type ColKey } from '../src/settings/converterSetting'
import type { ParsedSheet } from '../src/convert/converter'

function row(obj: Partial<Record<ColKey, CellValue | string>>): CellValue[] {
  const r: CellValue[] = Array.from({ length: 31 }, () => EMPTY as CellValue)
  for (const [k, v] of Object.entries(obj)) {
    r[ElementColNumMapping[k as ColKey]] = typeof v === 'string' ? textCell(v) : (v as CellValue)
  }
  return r
}
const sheet = (name: string, rows: CellValue[][]): ParsedSheet => ({ name, rows })
const codes = (issues: CheckIssue[]) => issues.map((i) => i.code)

describe('checker 基本规则', () => {
  it('TTS 无语音指令 → error', () => {
    const i = checkSheets([sheet('Sheet1', [row({ role_name: 'A', text: 'x', voice: 'tts' })])])
    expect(codes(i)).toContain('tts-no-cmd')
    expect(i.find((x) => x.code === 'tts-no-cmd')?.severity).toBe('error')
  })

  it('TTS 大小写不敏感（TTS 也算）', () => {
    const i = checkSheets([
      sheet('Sheet1', [row({ role_name: 'A', text: 'x', voice: 'TTS', voice_cmd: 'a_1' })]),
    ])
    expect(codes(i)).not.toContain('tts-no-cmd')
    expect(codes(i)).not.toContain('voicecmd-no-tts')
  })

  it('非法转场 → error', () => {
    const i = checkSheets([sheet('Sheet1', [row({ role_name: 'A', text: 'x', transition: '裂开' })])])
    expect(codes(i)).toContain('bad-transition')
  })

  it('分支目标缺失 → error；存在则不报', () => {
    const miss = checkSheets([sheet('S1', [row({ role_name: 'A', text: 'x', menu: 'NoSuch' })])])
    expect(codes(miss)).toContain('menu-target-missing')
    const ok = checkSheets([
      sheet('S1', [row({ role_name: 'A', text: 'x', menu: 'S2' })]),
      sheet('S2', []),
    ])
    expect(codes(ok)).not.toContain('menu-target-missing')
  })

  it('纯数字音效 → error', () => {
    const i = checkSheets([sheet('Sheet1', [row({ role_name: 'A', text: 'x', sound: numberCell(12) })])])
    expect(codes(i)).toContain('numeric-sound')
  })

  it('非法模式 → error；nvl 未换页 → warn', () => {
    const bad = checkSheets([sheet('Sheet1', [row({ role_name: 'A', text: 'x', mode: 'NVL2' })])])
    expect(codes(bad)).toContain('bad-mode')
    const nvl = checkSheets([sheet('Sheet1', [row({ role_name: 'A', text: 'x', mode: 'nvl' })])])
    expect(codes(nvl)).toContain('nvl-no-changepage')
  })

  it('台词过长 → warn', () => {
    const long = 'あ'.repeat(60)
    const i = checkSheets([sheet('Sheet1', [row({ role_name: 'A', text: long })])])
    expect(codes(i)).toContain('long-text')
  })

  it('角色名首尾空白 → warn', () => {
    const i = checkSheets([sheet('Sheet1', [row({ role_name: 'A\t', text: 'x' })])])
    expect(codes(i)).toContain('role-name-whitespace')
  })

  it('自定义立绘位置 → info（未关联工程）', () => {
    const i = checkSheets([
      sheet('Sheet1', [row({ role_name: 'A', text: 'x', character: 'kyon 0012 kyon_left' })]),
    ])
    expect(i.find((x) => x.code === 'sprite-custom-pos')?.severity).toBe('info')
    expect(codes(i)).not.toContain('bad-transition')
  })

  it('关联工程后校验立绘位置：未定义 → error，已定义 → 通过', () => {
    const rows = [row({ role_name: 'A', text: 'x', character: 'kyon 0012 kyon_left' })]
    const bad = checkSheets([sheet('Sheet1', rows)], { knownPositions: ['haruhi_mid'] })
    expect(codes(bad)).toContain('sprite-pos-undefined')
    const ok = checkSheets([sheet('Sheet1', rows)], { knownPositions: ['kyon_left'] })
    expect(codes(ok)).not.toContain('sprite-pos-undefined')
  })

  it('连续未换音乐/立绘/背景 → warn（按阈值）', () => {
    const rows = Array.from({ length: 12 }, () => row({ role_name: 'A', text: 'x' }))
    const i = checkSheets([sheet('Sheet1', rows)], { faceGap: 10, bgGap: 11, musicGap: 11 })
    expect(codes(i)).toContain('face-stale')
    expect(codes(i)).toContain('bg-stale')
    expect(codes(i)).toContain('music-stale')
  })

  it('summarize 统计三级数量', () => {
    const i = checkSheets([
      sheet('Sheet1', [
        row({ role_name: 'A', text: 'x', voice: 'tts' }), // error
        row({ role_name: 'A\t', text: 'y' }), // warn
      ]),
    ])
    const s = summarize(i)
    expect(s.error).toBeGreaterThanOrEqual(1)
    expect(s.warn).toBeGreaterThanOrEqual(1)
  })
})
