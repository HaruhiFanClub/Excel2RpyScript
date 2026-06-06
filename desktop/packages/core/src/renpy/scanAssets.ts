// 扫描 Ren'Py game/ 目录，建立资源索引（图片/音频 文件名 → 相对路径）。
// Ren'Py 以文件名（去扩展名）作为图像/音频标识，并在整个 game/ 树中查找，故按 basename 建索引。
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, extname, basename, sep } from 'node:path'
import { IMAGE_EXTS, AUDIO_EXTS, type AssetIndex } from '../assets'

// 从 .rpy 文本提取 transform / Position 定义名（立绘位置）
const TRANSFORM_RE = /^\s*transform\s+([A-Za-z_]\w*)/gm
const POSITION_RE = /^\s*define\s+([A-Za-z_]\w*)\s*=\s*Position\b/gm
function extractTransforms(text: string, out: Set<string>): void {
  for (const m of text.matchAll(TRANSFORM_RE)) out.add(m[1]!)
  for (const m of text.matchAll(POSITION_RE)) out.add(m[1]!)
}

const IMG = new Set(IMAGE_EXTS.map((e) => '.' + e))
const AUD = new Set(AUDIO_EXTS.map((e) => '.' + e))

export async function scanRenpyAssets(gamePath: string): Promise<AssetIndex> {
  const images: Record<string, string> = {}
  const audio: Record<string, string> = {}
  const rpyFiles: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'cache' || e.name === 'saves' || e.name.startsWith('.')) continue
        await walk(full)
      } else {
        const ext = extname(e.name).toLowerCase()
        const key = basename(e.name, extname(e.name)).toLowerCase()
        const rel = relative(gamePath, full).split(sep).join('/')
        if (IMG.has(ext)) {
          if (!(key in images)) images[key] = rel
        } else if (AUD.has(ext)) {
          if (!(key in audio)) audio[key] = rel
        } else if (ext === '.rpy') {
          rpyFiles.push(full)
        }
      }
    }
  }

  await walk(gamePath)

  const tset = new Set<string>()
  for (const f of rpyFiles) {
    try {
      extractTransforms(await readFile(f, 'utf-8'), tset)
    } catch {
      /* 跳过读不了的 */
    }
  }

  return { gamePath, images, audio, transforms: [...tset].sort() }
}

// 由用户选择的目录推断 game/ 目录：本身是 game、或含 game 子目录、或直接当作 game。
import { existsSync } from 'node:fs'
export function resolveGamePath(dir: string): string {
  if (basename(dir) === 'game') return dir
  if (existsSync(join(dir, 'game'))) return join(dir, 'game')
  return dir
}
