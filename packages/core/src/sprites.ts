// 立绘「左/中/右 三列」模型（纯逻辑，渲染进程可安全导入）。
// 表格里用户只填「角色 编号」，位置由所在列 + 每角色位置约定自动推导。
// 未配置角色默认输出 Ren'Py 内置位置 left / mid / right；需要自定义 transform 时逐角色覆盖。

export type Slot = 'left' | 'mid' | 'right'
export const SLOTS: Slot[] = ['left', 'mid', 'right']

export interface SpritePos {
  left?: string
  mid?: string
  right?: string
}
export type SpritePositions = Record<string, SpritePos> // 角色 → 三个位置 token

export interface SpriteSlots {
  left: string // 形如 "kyon 0012"，多个用 ; 连接
  mid: string
  right: string
  other: string // 无法归入三列的原始段（保留，避免丢失）
}

const empty = (): SpriteSlots => ({ left: '', mid: '', right: '', other: '' })

export function defaultPosToken(_char: string, slot: Slot): string {
  return slot
}

export function posToken(char: string, slot: Slot, cfg?: SpritePositions): string {
  return cfg?.[char]?.[slot] ?? defaultPosToken(char, slot)
}

// 从位置 token 反推所属列
export function slotOf(char: string, pos: string, cfg?: SpritePositions): Slot | null {
  const p = pos.toLowerCase()
  if (p === 'left') return 'left'
  if (p === 'right') return 'right'
  if (p === 'mid' || p === 'center' || p === 'truecenter') return 'mid'
  const c = cfg?.[char]
  if (c) {
    if (c.left && pos === c.left) return 'left'
    if (c.mid && pos === c.mid) return 'mid'
    if (c.right && pos === c.right) return 'right'
  }
  if (pos === `${char}_left`) return 'left'
  if (pos === `${char}_mid` || pos === `${char}_center`) return 'mid'
  if (pos === `${char}_right`) return 'right'
  if (p.endsWith('_left')) return 'left'
  if (p.endsWith('_right')) return 'right'
  if (p.endsWith('_mid') || p.endsWith('_center')) return 'mid'
  return null
}

// 解析旧立绘列（col19 字符串）→ 三列 + other
export function parseSprites(col19: string, cfg?: SpritePositions): SpriteSlots {
  const out = empty()
  for (const raw of col19.split(';').map((s) => s.trim()).filter(Boolean)) {
    const toks = raw.split(/\s+/).filter(Boolean)
    if (toks.length < 2) {
      out.other = out.other ? `${out.other};${raw}` : raw
      continue
    }
    const char = toks[0] ?? ''
    const pos = toks[toks.length - 1] ?? ''
    const nameNum = toks.slice(0, -1).join(' ') // "kyon 0012"
    const slot = slotOf(char, pos, cfg)
    if (slot) out[slot] = out[slot] ? `${out[slot]};${nameNum}` : nameNum
    else out.other = out.other ? `${out.other};${raw}` : raw
  }
  return out
}

// 三列 + other → 旧立绘列字符串（顺序 左→中→右→other）
export function serializeSprites(slots: SpriteSlots, cfg?: SpritePositions): string {
  const parts: string[] = []
  const emit = (val: string, slot: Slot) => {
    for (const nameNum of val.split(';').map((s) => s.trim()).filter(Boolean)) {
      const char = nameNum.split(/\s+/)[0] ?? ''
      parts.push(`${nameNum} ${posToken(char, slot, cfg)}`)
    }
  }
  emit(slots.left, 'left')
  emit(slots.mid, 'mid')
  emit(slots.right, 'right')
  for (const seg of slots.other.split(';').map((s) => s.trim()).filter(Boolean)) parts.push(seg)
  return parts.join(';')
}
