// 行→元素转换（移植自 handler/converter.py）。逐字符对齐旧行为，见 docs/01-legacy-system-contract.md §3。
import {
  ElementColNumMapping,
  PositionMapping,
  ImageCmdMapping,
  TransitionMapping,
  ReplaceCharacterMapping,
  type ColKey,
} from '../settings/converterSetting'
import { asStr, truthy, rawEq, EMPTY, type CellValue } from '../parse/cellValue'
import { Role, Text, Image, Transition, Audio, Voice, Menu, Command } from '../model/element'

export interface ParsedSheet {
  name: string
  rows: CellValue[][]
}

export interface RowConvertResult {
  role: Role
  modeRaw: string // 旧 RowConvertResult.mode，下游未使用
  text: Text | null
  music: Audio | null
  character: Image[] | null
  changePage: Command | null
  background: Image | null
  remark: null
  sound: Audio | null
  transition: Transition | null
  voice: Voice | null
  menu: Menu | null
  sideCharacter: null
}

export interface SheetConvertResult {
  label: string
  data: RowConvertResult[]
}

export type ConversionMode = 'legacy-compat' | 'default'

export interface PipelineOptions {
  mode: ConversionMode
  // default 模式下的修正项（legacy-compat 下应为 false 以保持与黄金样本逐字符一致）
  normalizeMode?: boolean // 修正 bug：模式大小写（ADV→adv）
  trimRoleNames?: boolean // 修正 bug：角色名首尾空白（朝比奈实玖瑠\t）
}

export interface ConvertWarning {
  code: string
  message: string
  sheetIndex: number
  rowIndex: number // 0 基解析行序号；Excel 行号 = rowIndex + 8
}

function col(row: CellValue[], key: ColKey): CellValue {
  return row[ElementColNumMapping[key]] ?? EMPTY
}

// 单次逐字符转义（不可链式 replace，否则二次转义）。
function escapeText(s: string): string {
  let out = ''
  for (const ch of s) out += ReplaceCharacterMapping[ch] ?? ch
  return out
}

export class Converter {
  roleNameMapping = new Map<string, Role>() // 角色名 → Role，按首次出现顺序（跨 sheet 累积）
  currentMode = 'nvl'
  currentRole: Role = new Role('narrator_nvl', 'None')
  characters: Image[] = [] // 当前在场立绘缓存
  sideCharacters = new Map<string, string>() // pronoun → 头像路径
  warnings: ConvertWarning[] = []

  constructor(
    public sheets: ParsedSheet[],
    public opts: PipelineOptions,
  ) {}

  addRole(name: string): Role {
    let role = this.roleNameMapping.get(name)
    if (!role) {
      role = new Role(`role${this.roleNameMapping.size + 1}`, name)
      this.roleNameMapping.set(name, role)
    }
    return role
  }

  warn(code: string, message: string, sheetIndex: number, rowIndex: number): void {
    this.warnings.push({ code, message, sheetIndex, rowIndex })
  }

  generate(): SheetConvertResult[] {
    const result: SheetConvertResult[] = []
    this.sheets.forEach((sheet, idx) => {
      const label = idx === 0 ? 'start' : sheet.name
      result.push({ label, data: this.parseSheet(sheet.rows, idx) })
    })
    return result
  }

  private parseSheet(rows: CellValue[][], sheetIndex: number): RowConvertResult[] {
    const out: RowConvertResult[] = []
    // 角色名前向填充：仅用于 TTS 语音文件名（_converter_role 读原始单元格，不读这个值）。
    let currentRoleName: string | null = null
    rows.forEach((row, rowIndex) => {
      const roleCell = col(row, 'role_name')
      let roleName: string | null
      if (asStr(roleCell).trim()) {
        roleName = asStr(roleCell)
        currentRoleName = roleName
      } else {
        roleName = currentRoleName
      }
      out.push(new RowConverter(this, row, roleName, sheetIndex, rowIndex).convert())
    })
    return out
  }
}

class RowConverter {
  constructor(
    private conv: Converter,
    private row: CellValue[],
    private roleName: string | null, // 前向填充值，仅 voice tts 用
    private sheetIndex: number,
    private rowIndex: number,
  ) {}

  private cell(key: ColKey): CellValue {
    return col(this.row, key)
  }

  // 字段求值顺序必须与旧 namedtuple 构造顺序一致（含副作用：mode→role→...）。
  convert(): RowConvertResult {
    const modeRaw = this.convMode()
    const role = this.convRole()
    const text = this.convText()
    const music = this.convMusic()
    const character = this.convCharacter()
    const changePage = this.convChangePage()
    const background = this.convBackground()
    const remark = null
    const sound = this.convSound()
    const transition = this.convTransition()
    const voice = this.convVoice()
    const menu = this.convMenu()
    const sideCharacter = this.convSideCharacter()
    return {
      role,
      modeRaw,
      text,
      music,
      character,
      changePage,
      background,
      remark,
      sound,
      transition,
      voice,
      menu,
      sideCharacter,
    }
  }

  private convMode(): string {
    const m = this.cell('mode')
    if (truthy(m)) {
      let v = asStr(m)
      if (this.conv.opts.normalizeMode) {
        const lower = v.toLowerCase()
        if ((lower === 'nvl' || lower === 'adv') && lower !== v) {
          this.conv.warn(
            'mode-case',
            `模式 "${v}" 已归一化为 "${lower}"`,
            this.sheetIndex,
            this.rowIndex,
          )
          v = lower
        }
      }
      this.conv.currentMode = v
    }
    return asStr(m)
  }

  private convRole(): Role {
    const raw = this.cell('role_name')
    const rawStr = asStr(raw)
    if (truthy(raw) && rawStr !== '旁白') {
      let name = rawStr
      if (this.conv.opts.trimRoleNames) {
        const t = name.trim()
        if (t !== name) {
          this.conv.warn(
            'role-name-whitespace',
            `角色名含首尾空白，已修剪为 "${t}"`,
            this.sheetIndex,
            this.rowIndex,
          )
          name = t
        }
      }
      this.conv.currentRole = this.conv.addRole(name)
    } else if (rawStr === '') {
      // 空角色名：保持 currentRole 不变
    } else {
      this.conv.currentRole = new Role(`narrator_${this.conv.currentMode}`, 'None')
    }
    return this.conv.currentRole
  }

  private convText(): Text | null {
    const t0 = asStr(this.cell('text')).replace(/\n/g, '\\n')
    if (!t0) return null
    return new Text(escapeText(t0), this.conv.currentRole)
  }

  private convMusic(): Audio | null {
    const m = this.cell('music')
    if (!truthy(m)) return null
    const cmd = rawEq(m, 'none') ? 'stop' : 'play'
    return new Audio(m, cmd)
  }

  private convBackground(): Image | null {
    const b = this.cell('background')
    if (!truthy(b)) return null
    return new Image(asStr(b), 'scene')
  }

  private convCharacter(): Image[] {
    const cStr = asStr(this.cell('character')).trim()
    // 1. 统一回收旧立绘
    const hides = this.conv.characters.map((ch) => new Image(ch.name, 'hide'))
    // 2. 本行无立绘：清空缓存，仅回收
    if (!cStr) {
      this.conv.characters = []
      return hides
    }
    // 3. 解析新立绘（按原始书写顺序）
    const news = cStr
      .split(';')
      .filter((seg) => seg.trim())
      .map((seg) => RowConverter.generateCharacter(seg))
    this.conv.characters = news
    return [...hides, ...news]
  }

  static generateCharacter(imgStr: string): Image {
    const tokens = imgStr.split(' ')
    const lastWord = tokens[tokens.length - 1] ?? ''
    const position = PositionMapping[lastWord] ?? lastWord
    // 旧代码用 Python str.replace（替换全部出现），故用 replaceAll。
    const name = imgStr.replaceAll(lastWord, '').trim()
    if (position) {
      return new Image(name, 'show', position)
    }
    return new Image(name, ImageCmdMapping[lastWord] ?? 'hide')
  }

  private convSound(): Audio | null {
    const s = this.cell('sound')
    if (!truthy(s)) return null
    const str = asStr(s)
    if (str.startsWith('循环')) {
      return new Audio(str.replaceAll('循环', ''), 'loop')
    }
    const cmd = rawEq(s, 'stop') ? 'stop' : 'sound'
    return new Audio(s, cmd)
  }

  private convTransition(): Transition | null {
    const t = this.cell('transition')
    if (!truthy(t)) return null
    const style = TransitionMapping[asStr(t)] ?? ''
    return new Transition(style)
  }

  private convChangePage(): Command | null {
    const c = this.cell('change_page')
    if (!truthy(c)) return null
    return new Command('nvl clear')
  }

  private convVoice(): Voice | null {
    const vStr = asStr(this.cell('voice')).trim()
    if (!vStr) return null
    if (vStr.toLowerCase() === 'tts') {
      const rn = this.roleName === null ? 'None' : this.roleName
      return new Voice(`${rn}_sheet${this.sheetIndex + 1}_row${this.rowIndex + 8}_synthesized.wav`)
    }
    const tokens = vStr.split(' ')
    if (tokens[tokens.length - 1] === 'sustain') {
      return new Voice(tokens[0] ?? '', true)
    }
    return new Voice(vStr)
  }

  private convMenu(): Menu | null {
    const m = this.cell('menu')
    if (!truthy(m)) return null
    const t0 = asStr(this.cell('text')).replace(/\n/g, '\\n')
    if (!t0) return null
    return new Menu(escapeText(t0), asStr(m))
  }

  private convSideCharacter(): null {
    const s = asStr(this.cell('side_character')).trim()
    if (!s) return null
    this.conv.sideCharacters.set(this.conv.currentRole.pronoun, s)
    return null
  }
}
