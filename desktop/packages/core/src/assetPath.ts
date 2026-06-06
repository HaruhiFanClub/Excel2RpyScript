import { normalize, join } from 'node:path'

// 解析 asset:// 请求到磁盘绝对路径（含越界防护）。
//  - 关联工程：一切相对工程 game 目录解析（图片/音频/转场等）。
//  - 未关联：仅 audio/* 可从当前 TTS 音频目录（表旁 audio）解析 → 未关联也能试听。
// 返回 null 表示拒绝（越界）或无可用根（未关联且非音频）。
export function resolveAssetTarget(
  rel: string,
  gameRoot: string | null,
  audioDir: string | null,
): string | null {
  const within = (root: string, r: string): string | null => {
    const base = normalize(root)
    const abs = normalize(join(base, r))
    return abs === base || abs.startsWith(base + (base.endsWith('/') ? '' : '/')) ? abs : null
  }
  if (gameRoot) return within(gameRoot, rel)
  if (rel.startsWith('audio/') && audioDir) return within(audioDir, rel.slice('audio/'.length))
  return null
}
