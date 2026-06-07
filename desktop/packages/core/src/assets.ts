// 纯资源解析助手（无 Node 依赖），渲染进程可安全导入。
// 把表格里的资源引用映射到资源索引里的相对路径。

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']
export const AUDIO_EXTS = ['mp3', 'ogg', 'opus', 'wav', 'flac', 'm4a']

export interface AssetMaps {
  images: Record<string, string> // key（小写、无扩展名或带扩展名的文件名）→ 相对 game/ 的 posix 路径
  audio: Record<string, string>
}

export interface AssetIndex extends AssetMaps {
  gamePath: string
  transforms: string[] // 工程中定义的 transform / Position 名（立绘位置校验用）
}

function stripKnownExt(name: string, exts: string[]): string {
  const lower = name.trim().toLowerCase()
  const ext = lower.split('.').pop() ?? ''
  return ext && exts.includes(ext) ? lower.slice(0, -ext.length - 1) : lower
}

// 立绘段 "kyon 0012 kyon_left" → 图像名 "kyon 0012"（去掉末尾位置 token；单 token 原样）
export function spriteImageName(seg: string): string {
  const t = seg.trim().split(/\s+/).filter(Boolean)
  return t.length >= 2 ? t.slice(0, -1).join(' ') : (t[0] ?? '')
}

// 背景 / 立绘 图像名 → 命中的相对路径
export function resolveImage(maps: AssetMaps, name: string): string | null {
  const key = name.trim().toLowerCase()
  if (!key) return null
  return maps.images[key] ?? maps.images[stripKnownExt(key, IMAGE_EXTS)] ?? null
}

export function resolveAudio(maps: AssetMaps, name: string): string | null {
  const key = name.trim().toLowerCase()
  if (!key) return null
  return maps.audio[key] ?? maps.audio[stripKnownExt(key, AUDIO_EXTS)] ?? null
}

// 音乐/音效单元格清洗：去 "循环" 前缀；none/stop 视为无音频
export function audioRefName(raw: string): string | null {
  const v = raw.trim()
  if (!v || v === 'none' || v === 'stop') return null
  return v.startsWith('循环') ? v.slice('循环'.length).trim() : v
}

// rpy 代码里音频引用的实际文件名：与 model/element.ts 的 Audio 一致。
// 没有音频扩展名时按旧规则补 .mp3；已有 mp3/ogg/wav 等扩展名则保留。
export function rpyAudioFilename(name: string): string {
  const parts = name.split('.')
  return AUDIO_EXTS.includes((parts[parts.length - 1] ?? '').toLowerCase()) ? name : name + '.mp3'
}

// 常见纯色背景词（无文件，用色块预览）
export const COLOR_WORDS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#e23b3b',
  green: '#3bbf6b',
  blue: '#3b6be2',
  gray: '#8a8f99',
  grey: '#8a8f99',
}
