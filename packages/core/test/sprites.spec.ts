import { describe, it, expect } from 'vitest'
import {
  parseSprites,
  serializeSprites,
  slotOf,
  type SpritePos,
  type SpritePositions,
} from '../src/sprites'

const prefixed = (char: string): SpritePos => ({
  left: `${char}_left`,
  mid: `${char}_mid`,
  right: `${char}_right`,
})

const PREFIXED_CFG: SpritePositions = {
  kyon: prefixed('kyon'),
  haruhi: prefixed('haruhi'),
  itsuki: prefixed('itsuki'),
  sanmisen: prefixed('sanmisen'),
}

describe('立绘三列：解析/序列化', () => {
  it('真实数据形式（<角色>_left/_mid/_right）有配置时往返一致', () => {
    for (const s of [
      'kyon 0012 kyon_left',
      'haruhi 0903 haruhi_mid',
      'itsuki 0238 itsuki_right',
      'kyon 0011 kyon_left;sanmisen 0001 sanmisen_right',
      'haruhi 0043 haruhi_mid;itsuki 0238 itsuki_right',
    ]) {
      expect(serializeSprites(parseSprites(s, PREFIXED_CFG), PREFIXED_CFG)).toBe(s)
    }
  })

  it('按列归位正确', () => {
    const s = parseSprites('kyon 0012 kyon_left;haruhi 0903 haruhi_mid;itsuki 0238 itsuki_right')
    expect(s.left).toBe('kyon 0012')
    expect(s.mid).toBe('haruhi 0903')
    expect(s.right).toBe('itsuki 0238')
  })

  it('slotOf 识别内置与约定位置', () => {
    expect(slotOf('kyon', 'left')).toBe('left')
    expect(slotOf('kyon', 'center')).toBe('mid')
    expect(slotOf('kyon', 'truecenter')).toBe('mid')
    expect(slotOf('kyon', 'kyon_left')).toBe('left')
    expect(slotOf('kyon', 'kyon_mid')).toBe('mid')
    expect(slotOf('kyon', 'kyon_right')).toBe('right')
  })

  it('未配置角色使用内置位置 token', () => {
    // 'right' 内置 → 序列化仍保持 right
    const s = parseSprites('sanmisen 0001 right')
    expect(s.right).toBe('sanmisen 0001')
    expect(serializeSprites(s)).toBe('sanmisen 0001 right')
  })

  it('未知位置进入 other 且不丢失', () => {
    const s = parseSprites('kyon 0012 weirdpos')
    expect(s.other).toBe('kyon 0012 weirdpos')
    expect(serializeSprites(s)).toBe('kyon 0012 weirdpos')
  })

  it('编辑模型：填左列 → 生成带位置的段', () => {
    const out = serializeSprites({ left: 'kyon 0030', mid: '', right: '', other: '' })
    expect(out).toBe('kyon 0030 left')
  })

  it('每角色位置覆盖（cfg）生效', () => {
    const cfg = { kyon: { left: 'kyon_far_left' } }
    expect(serializeSprites({ left: 'kyon 0030', mid: '', right: '', other: '' }, cfg)).toBe(
      'kyon 0030 kyon_far_left',
    )
    expect(slotOf('kyon', 'kyon_far_left', cfg)).toBe('left')
  })
})
