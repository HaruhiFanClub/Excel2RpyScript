// 写出 .rpy（移植自 handler/writer.py）。逐字节对齐，见 docs/01-legacy-system-contract.md §5。
import type { Role, Voice, Menu } from '../model/element'
import type { SheetConvertResult } from '../convert/converter'

const menuTemplate = (label: string, target: string): string =>
  `    "${label}":\n        jump ${target}\n`
const sideCharacterTemplate = (roleName: string, path: string): string =>
  `image side ${roleName} = "${path}"\n`

export function renderFile(
  res: SheetConvertResult,
  roleNameMapping: Map<string, Role>,
  sideCharacters: Map<string, string>,
): string {
  let out = ''
  // 角色定义（跨 sheet 累积的全部角色，每个文件都完整写出）
  for (const role of roleNameMapping.values()) {
    out += role.render() + '\n'
  }
  out += 'define narrator_nvl = Character(None, kind=nvl)\n'
  out += 'define narrator_adv = Character(None, kind=adv)\n'
  out += 'define config.voice_filename_format = "audio/{filename}"\n'
  for (const [pronoun, path] of sideCharacters) {
    out += sideCharacterTemplate(pronoun, path)
  }
  out += `\nlabel ${res.label}:\n`

  let lastVoice: Voice | null = null
  let currentMenus: Menu[] = []

  for (const el of res.data) {
    if (el.menu) {
      currentMenus.push(el.menu)
      continue
    }
    if (currentMenus.length) {
      // 注意旧行为：刷新 menu 块后 continue，会跳过该行其它元素（既有怪癖，勿"修复"）。
      out += 'menu:\n' + currentMenus.map((m) => menuTemplate(m.label, m.target)).join('\n')
      currentMenus = []
      continue
    }
    if (el.music) out += el.music.render() + '\n'
    if (el.background) out += el.background.render() + '\n'
    // 空数组在旧 Python 中为假值会被跳过；这里显式判断 length。
    if (el.character && el.character.length) {
      for (const ch of el.character) out += ch.render() + '\n'
    }
    if (el.sound) out += el.sound.render() + '\n'
    if (el.transition) out += el.transition.render() + '\n'
    if (el.voice) out += el.voice.render() + '\n'
    if (el.text) {
      if (lastVoice && lastVoice.sustain) out += 'voice sustain\n'
      out += el.text.render() + '\n'
    }
    if (el.changePage) out += el.changePage.render() + '\n'
    lastVoice = el.voice
  }

  if (currentMenus.length) {
    // 修复：menu 在最后一行时也要刷新
    out += 'menu:\n' + currentMenus.map((m) => menuTemplate(m.label, m.target)).join('\n')
  }

  return out
}
