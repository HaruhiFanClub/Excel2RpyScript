// 针对每个"对齐陷阱"的定点单测（见 docs/01-legacy-system-contract.md）。
import { describe, it, expect } from 'vitest'
import { pyStrOfNumber, numberCell, textCell, EMPTY, type CellValue } from '../src/parse/cellValue'
import { Audio } from '../src/model/element'
import { parseSheetRows } from '../src/parse/parser'
import { runPipeline, type ParsedSheet } from '../src/index'
import { ElementColNumMapping, type ColKey } from '../src/settings/converterSetting'

function row(obj: Partial<Record<ColKey, string>>): CellValue[] {
  const r: CellValue[] = Array.from({ length: 31 }, () => EMPTY as CellValue)
  for (const [k, v] of Object.entries(obj)) {
    r[ElementColNumMapping[k as ColKey]] = textCell(v as string)
  }
  return r
}
function sheet(name: string, rows: CellValue[][]): ParsedSheet {
  return { name, rows }
}
function convert(rows: CellValue[][], name = 'Sheet1'): string {
  return runPipeline([sheet(name, rows)], { mode: 'legacy-compat' }).files[0]!.content
}

describe('pyStrOfNumber 对齐 Python str(float)', () => {
  it('整数浮点 → N.0', () => {
    expect(pyStrOfNumber(12)).toBe('12.0')
    expect(pyStrOfNumber(0)).toBe('0.0')
    expect(pyStrOfNumber(-5)).toBe('-5.0')
  })
  it('非整数原样', () => {
    expect(pyStrOfNumber(12.5)).toBe('12.5')
  })
})

describe('Audio 名称强制（float→int、补 .mp3、加 audio/ 前缀）', () => {
  it('数字单元格 → str(int())，不是 str(float)', () => {
    expect(new Audio(numberCell(12), 'play').render()).toBe('play music "audio/12.mp3"')
    expect(new Audio(numberCell(12.0), 'play').render()).toBe('play music "audio/12.mp3"')
  })
  it('文本名补 .mp3', () => {
    expect(new Audio(textCell('bgm'), 'play').render()).toBe('play music "audio/bgm.mp3"')
  })
  it('已有 .mp3 不重复', () => {
    expect(new Audio(textCell('x.mp3'), 'play').render()).toBe('play music "audio/x.mp3"')
  })
  it('stop 忽略名字', () => {
    expect(new Audio(textCell('whatever'), 'stop').render()).toBe('stop music')
  })
  it('sound / loop', () => {
    expect(new Audio(textCell('se'), 'sound').render()).toBe('play sound "audio/se.mp3"')
    expect(new Audio(textCell('se'), 'loop').render()).toBe('play sound "audio/se.mp3" loop')
  })
})

describe('文本转义：单次逐字符，不二次转义', () => {
  it('% " \' { [ 各自转义，且 { 不会被二次处理', () => {
    const out = convert([row({ role_name: 'A', text: `100% {sure} "ok" 'x' [a]` })])
    expect(out).toContain(`role1 "100\\% {{sure} \\"ok\\" \\'x\\' [[a]"`)
  })
  it('换行 \\n 保留为字面反斜杠 n', () => {
    const out = convert([row({ role_name: 'A', text: 'a\nb' })])
    expect(out).toContain('role1 "a\\nb"')
  })
})

describe('立绘：先 hide 旧立绘再 show 新立绘；自定义位置原样', () => {
  it('单个立绘 → show ... at 自定义位置', () => {
    const out = convert([row({ role_name: 'A', character: 'kyon 0012 kyon_left', text: 'hi' })])
    expect(out).toContain('show kyon 0012 at kyon_left\n')
  })
  it('多立绘按书写顺序', () => {
    const out = convert([row({ role_name: 'A', character: 'a 1 left;b 2 right', text: 'hi' })])
    const i = out.indexOf('show a 1 at left')
    const j = out.indexOf('show b 2 at right')
    expect(i).toBeGreaterThan(-1)
    expect(j).toBeGreaterThan(i)
  })
  it('跨行回收：第二行先 hide 第一行立绘', () => {
    const out = convert([
      row({ role_name: 'A', character: 'a 1 left', text: 'l1' }),
      row({ role_name: 'A', character: 'b 2 right', text: 'l2' }),
    ])
    expect(out).toContain('hide a 1\nshow b 2 at right\n')
  })
})

describe('解析：any(data) 空行跳过（含数字 0 为假）', () => {
  it('整行仅含数字 0 → 跳过', () => {
    const r = Array.from({ length: 31 }, () => EMPTY as CellValue)
    r[5] = numberCell(0)
    expect(parseSheetRows([r])).toHaveLength(0)
  })
  it('含真值则保留并补齐到 31', () => {
    const r = [textCell('x')]
    const parsed = parseSheetRows([r])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toHaveLength(31)
  })
})

describe('menu 刷新会跳过该行其它元素（既有怪癖）', () => {
  it('menu 块后的刷新行 text 被吞掉', () => {
    const out = convert([
      row({ role_name: 'A', text: 'choice1', menu: 'target1' }),
      row({ role_name: 'A', text: 'choice2', menu: 'target2' }),
      row({ role_name: 'A', text: 'after' }),
    ])
    expect(out).toContain('menu:\n    "choice1":\n        jump target1\n\n    "choice2":\n        jump target2\n')
    expect(out).not.toContain('"after"')
  })
})

describe('voice sustain 跨行带到下一条有 text 的行', () => {
  it('sustain 行后续行 text 前插入 voice sustain', () => {
    const out = convert([
      row({ role_name: 'A', voice: 'v1 sustain', text: 'line1' }),
      row({ role_name: 'A', text: 'line2' }),
    ])
    expect(out).toContain('voice "v1"\nrole1 "line1"\n')
    expect(out).toContain('voice sustain\nrole1 "line2"\n')
    // line1 之前不应有 voice sustain
    expect(out.indexOf('voice sustain')).toBeGreaterThan(out.indexOf('line1'))
  })
})

describe('角色定义跨 sheet 累积，且每个文件完整写出', () => {
  it('两个 sheet 各一个角色，两个文件都含两条 define', () => {
    const { files } = runPipeline(
      [
        sheet('Sheet1', [row({ role_name: 'A', text: 'x' })]),
        sheet('Sheet2', [row({ role_name: 'B', text: 'y' })]),
      ],
      { mode: 'legacy-compat' },
    )
    for (const f of files) {
      expect(f.content).toContain(`define role1 = Character('A', color="#c8c8ff", image="role1")`)
      expect(f.content).toContain(`define role2 = Character('B', color="#c8c8ff", image="role2")`)
    }
  })
})

describe('legacy-compat 保留脏数据：尾随 TAB 角色名算两个角色', () => {
  it('"X" 与 "X\\t" → role1 / role2', () => {
    const { converter } = runPipeline(
      [sheet('Sheet1', [row({ role_name: 'X', text: 'a' }), row({ role_name: 'X\t', text: 'b' })])],
      { mode: 'legacy-compat' },
    )
    expect(converter.roleNameMapping.size).toBe(2)
  })
})

describe('default 模式：修正 + 告警', () => {
  it('trimRoleNames 合并首尾空白角色并告警', () => {
    const { converter, warnings } = runPipeline(
      [sheet('Sheet1', [row({ role_name: 'X', text: 'a' }), row({ role_name: 'X\t', text: 'b' })])],
      { mode: 'default', trimRoleNames: true },
    )
    expect(converter.roleNameMapping.size).toBe(1)
    expect(warnings.some((w) => w.code === 'role-name-whitespace')).toBe(true)
  })
  it('normalizeMode 把 ADV 归一化为 adv 并告警', () => {
    const { warnings } = runPipeline(
      [sheet('Sheet1', [row({ role_name: '旁白', mode: 'ADV', text: 'a' })])],
      { mode: 'default', normalizeMode: true },
    )
    expect(warnings.some((w) => w.code === 'mode-case')).toBe(true)
  })
})
