import { ElementColNumMapping, ImageCmdMapping, type ColKey } from './settings/converterSetting'
import { EMPTY, asStr, textCell, type CellValue } from './parse/cellValue'
import { parseSprites, posToken, slotOf, type Slot, type SpritePositions } from './sprites'

export type TableMode = 'legacy' | 'modern'
export type SpriteField = 'sprite_left' | 'sprite_mid' | 'sprite_right'

export interface WorkbookSchema {
  mode: TableMode
  physicalColumnCount: number
  styleColumnCount: number
}

export const LEGACY_SCHEMA: WorkbookSchema = {
  mode: 'legacy',
  physicalColumnCount: 31,
  styleColumnCount: 31,
}

export const MODERN_SCHEMA: WorkbookSchema = {
  mode: 'modern',
  physicalColumnCount: 17,
  styleColumnCount: 17,
}

export const MODERN_SPRITE_FIELDS: Record<SpriteField, Slot> = {
  sprite_left: 'left',
  sprite_mid: 'mid',
  sprite_right: 'right',
}

const MODERN_COLS: Record<Exclude<ColKey, 'character'>, number> = {
  role_name: 0,
  text: 1,
  voice_text: 2,
  background: 6,
  transition: 7,
  music: 8,
  voice: 9,
  voice_cmd: 10,
  mode: 11,
  change_page: 12,
  sound: 13,
  side_character: 14,
  menu: 15,
  remark: 16,
}

const MODERN_SPRITE_COLS: Record<Slot, number> = {
  left: 3,
  mid: 4,
  right: 5,
}

function headerAt(row: string[], index: number): string {
  return (row[index] ?? '').trim()
}

export function detectWorkbookSchema(row7: string[], row6: string[] = []): WorkbookSchema | null {
  const isModern =
    headerAt(row7, 0).includes('角色') &&
    headerAt(row7, 1).includes('台词') &&
    headerAt(row7, 2).includes('语音文本') &&
    headerAt(row7, 3).includes('立绘') &&
    headerAt(row7, 4).includes('立绘') &&
    headerAt(row7, 5).includes('立绘') &&
    headerAt(row7, 16).includes('备注')
  if (isModern) return MODERN_SCHEMA

  const isLegacy =
    headerAt(row7, 0).includes('角色') &&
    headerAt(row7, 1).includes('台词') &&
    (headerAt(row6, 18).includes('语音文本') || headerAt(row6, 19).includes('立绘'))
  if (isLegacy) return LEGACY_SCHEMA
  return null
}

export function physicalColFor(schema: WorkbookSchema, key: ColKey): number | null {
  if (schema.mode === 'legacy') return ElementColNumMapping[key]
  if (key === 'character') return null
  return MODERN_COLS[key]
}

export function physicalSpriteColFor(schema: WorkbookSchema, field: SpriteField): number | null {
  if (schema.mode !== 'modern') return null
  return MODERN_SPRITE_COLS[MODERN_SPRITE_FIELDS[field]]
}

function cellFromString(value: string): CellValue {
  return value.trim() ? textCell(value) : EMPTY
}

function inferSpriteKey(token: string, cfg?: SpritePositions): string {
  if (!cfg || cfg[token]) return token
  const matched = Object.keys(cfg)
    .filter((key) => token.startsWith(`${key}_`) || token.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0]
  return matched ?? token
}

function normalizeSpriteSegment(raw: string, slot: Slot, cfg?: SpritePositions): string {
  const seg = raw.trim()
  if (!seg) return ''
  const tokens = seg.split(/\s+/).filter(Boolean)
  const char = inferSpriteKey(tokens[0] ?? '', cfg)
  const last = tokens[tokens.length - 1] ?? ''
  if (!last || ImageCmdMapping[last] || slotOf(char, last, cfg)) return seg
  if (tokens.length >= 3) return seg
  return `${seg} ${posToken(char, slot, cfg)}`
}

export function modernSpritesToCharacter(
  left: string,
  mid: string,
  right: string,
  cfg?: SpritePositions,
): string {
  const parts: string[] = []
  const emit = (value: string, slot: Slot) => {
    for (const seg of value.split(';').map((s) => s.trim()).filter(Boolean)) {
      const normalized = normalizeSpriteSegment(seg, slot, cfg)
      if (normalized) parts.push(normalized)
    }
  }
  emit(left, 'left')
  emit(mid, 'mid')
  emit(right, 'right')
  return parts.join(';')
}

export function characterToModernSprites(
  character: string,
  cfg?: SpritePositions,
): Record<Slot, string> {
  const slots = parseSprites(character, cfg)
  return {
    left: slots.other ? [slots.left, slots.other].filter(Boolean).join(';') : slots.left,
    mid: slots.mid,
    right: slots.right,
  }
}

export function normalizePhysicalRow(
  cells: CellValue[],
  schema: WorkbookSchema,
  cfg?: SpritePositions,
): CellValue[] {
  if (schema.mode === 'legacy') {
    const out = cells.slice(0, LEGACY_SCHEMA.physicalColumnCount)
    while (out.length < LEGACY_SCHEMA.physicalColumnCount) out.push(EMPTY)
    return out
  }

  const out: CellValue[] = Array.from({ length: LEGACY_SCHEMA.physicalColumnCount }, () => EMPTY)
  for (const key of Object.keys(ElementColNumMapping) as ColKey[]) {
    if (key === 'character') continue
    const physical = physicalColFor(schema, key)
    if (physical !== null) out[ElementColNumMapping[key]] = cells[physical] ?? EMPTY
  }
  out[ElementColNumMapping.character] = cellFromString(
    modernSpritesToCharacter(
      asStr(cells[MODERN_SPRITE_COLS.left] ?? EMPTY),
      asStr(cells[MODERN_SPRITE_COLS.mid] ?? EMPTY),
      asStr(cells[MODERN_SPRITE_COLS.right] ?? EMPTY),
      cfg,
    ),
  )
  return out
}
