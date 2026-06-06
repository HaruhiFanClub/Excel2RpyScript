// 表格检查（移植自 handler/proofreader.py 并增强）。
// 产出结构化 error / warn / info 三级问题。检查是增强功能，不要求与旧 log.txt 逐字对齐：
// 已修正旧版若干噪音/误报（tts/adv 大小写、立绘每行误报转场、自定义立绘位置不再硬报错）。
import { ElementColNumMapping, PositionMapping, TransitionMapping } from '../settings/converterSetting'
import { asStr, truthy, isNumeric, type CellValue } from '../parse/cellValue'
import type { ParsedSheet } from '../convert/converter'

export type Severity = 'error' | 'warn' | 'info'

export interface CheckIssue {
  severity: Severity
  code: string
  sheet: string
  row: number // Excel 行号（解析行序号 + 8）
  message: string
}

export interface CheckOptions {
  faceGap?: number // 连续多少行未换立绘 → warn
  bgGap?: number // 连续多少行未换背景 → warn
  musicGap?: number // 连续多少行未换音乐 → warn
  maxTextLen?: number // 单行台词字数上限
}

const DEFAULTS: Required<CheckOptions> = {
  faceGap: 10,
  bgGap: 80,
  musicGap: 80,
  maxTextLen: 60,
}

const BUILTIN_POS = new Set(Object.keys(PositionMapping)) // left/right/mid/truecenter
const ROW_OFFSET = 8

function cell(row: CellValue[], key: keyof typeof ElementColNumMapping): CellValue {
  return row[ElementColNumMapping[key]] ?? { kind: 'empty' }
}

export function checkSheets(sheets: ParsedSheet[], options?: CheckOptions): CheckIssue[] {
  const opt = { ...DEFAULTS, ...options }
  const sheetNames = new Set(sheets.map((s) => s.name))
  const issues: CheckIssue[] = []

  for (const sheet of sheets) {
    let faceGap = 0
    let bgGap = 0
    let musicGap = 0

    sheet.rows.forEach((row, idx) => {
      const rowNo = idx + ROW_OFFSET
      const add = (severity: Severity, code: string, message: string) =>
        issues.push({ severity, code, sheet: sheet.name, row: rowNo, message })

      const text = asStr(cell(row, 'text'))
      const voice = asStr(cell(row, 'voice')).trim().toLowerCase()
      const isTts = voice === 'tts'
      const voiceText = cell(row, 'voice_text')
      const voiceCmd = cell(row, 'voice_cmd')
      const character = cell(row, 'character')
      const background = cell(row, 'background')
      const transition = cell(row, 'transition')
      const music = cell(row, 'music')
      const sound = cell(row, 'sound')
      const mode = asStr(cell(row, 'mode')).trim().toLowerCase()
      const changePage = cell(row, 'change_page')
      const menu = cell(row, 'menu')
      const roleNameRaw = asStr(cell(row, 'role_name'))

      // --- 台词 ---
      if (text.length >= opt.maxTextLen) {
        add('warn', 'long-text', `台词字数 ${text.length} ≥ ${opt.maxTextLen}`)
      }

      // --- 角色名首尾空白（旧表里 "X" 与 "X\t" 会被当成两个角色）---
      if (roleNameRaw && roleNameRaw !== roleNameRaw.trim()) {
        add('warn', 'role-name-whitespace', `角色名含首尾空白："${roleNameRaw}"`)
      }

      // --- 立绘 ---
      if (truthy(character)) {
        faceGap = 0
        const transOk = truthy(transition)
        for (const rawSeg of asStr(character).split(';')) {
          const seg = rawSeg.trim()
          if (!seg) continue
          const tokens = seg.split(/\s+/).filter(Boolean)
          if (tokens.length === 1) {
            if (tokens[0] !== 'hide') {
              add('warn', 'sprite-format', `立绘"${seg}"建议按"角色 编号 位置"填写`)
            }
          } else {
            const pos = tokens[tokens.length - 1] ?? ''
            if (!BUILTIN_POS.has(pos)) {
              add('info', 'sprite-custom-pos', `自定义立绘位置"${pos}"，关联 Ren'Py 工程后校验`)
            }
          }
        }
        void transOk // 立绘每行变化时不再强制要求转场（旧版此处过于噪音）
      } else {
        faceGap += 1
        if (faceGap === opt.faceGap) {
          add('warn', 'face-stale', `连续 ${opt.faceGap} 行未更换立绘`)
        }
      }

      // --- 背景 ---
      if (truthy(background)) {
        bgGap = 0
        if (!truthy(transition)) {
          add('warn', 'bg-no-transition', '背景变化但转场为空')
        }
      } else {
        bgGap += 1
        if (bgGap === opt.bgGap) {
          add('warn', 'bg-stale', `连续 ${opt.bgGap} 行未更换背景`)
        }
      }

      // --- 转场合法性 ---
      if (truthy(transition) && !(asStr(transition) in TransitionMapping)) {
        add('error', 'bad-transition', `不合法的转场类型"${asStr(transition)}"`)
      }

      // --- 音乐（太久未换）---
      if (truthy(music)) {
        musicGap = 0
      } else {
        musicGap += 1
        if (musicGap === opt.musicGap) {
          add('warn', 'music-stale', `连续 ${opt.musicGap} 行未更换音乐`)
        }
      }

      // --- TTS / 语音指令 ---
      if (isTts && !truthy(voiceCmd)) {
        add('error', 'tts-no-cmd', '使用了 TTS，但未填写语音指令')
      }
      if (truthy(voiceCmd) && !isTts) {
        add('warn', 'voicecmd-no-tts', '填写了语音指令，但语音列不是 tts')
      }
      if (truthy(voiceText) && !isTts) {
        add('warn', 'voicetext-no-tts', '填写了语音文本，但语音列不是 tts')
      }

      // --- 模式 / 换页 ---
      if (mode && mode !== 'nvl' && mode !== 'adv') {
        add('error', 'bad-mode', `不合法的模式"${asStr(cell(row, 'mode'))}"，应为 nvl 或 adv`)
      }
      if (mode === 'nvl' && asStr(changePage).trim() !== '换页') {
        add('warn', 'nvl-no-changepage', '切换到 nvl 模式时未进行换页')
      }

      // --- 音效不得为纯数字 ---
      if (truthy(sound) && isNumeric(sound)) {
        add('error', 'numeric-sound', '音效名不得为纯数字')
      }

      // --- 分支跳转目标 ---
      if (truthy(menu) && !sheetNames.has(asStr(menu))) {
        add('error', 'menu-target-missing', `分支跳转目标 sheet "${asStr(menu)}" 不存在`)
      }
    })
  }

  return issues
}

export function summarize(issues: CheckIssue[]): { error: number; warn: number; info: number } {
  return {
    error: issues.filter((i) => i.severity === 'error').length,
    warn: issues.filter((i) => i.severity === 'warn').length,
    info: issues.filter((i) => i.severity === 'info').length,
  }
}
