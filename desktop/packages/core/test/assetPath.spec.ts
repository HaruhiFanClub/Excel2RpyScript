import { describe, it, expect } from 'vitest'
import { resolveAssetTarget } from '../src/assetPath'

describe('resolveAssetTarget', () => {
  it('关联工程：一切相对 game 目录解析', () => {
    expect(resolveAssetTarget('images/kyon.png', '/proj/game', null)).toBe('/proj/game/images/kyon.png')
    expect(resolveAssetTarget('audio/foo.wav', '/proj/game', '/else/audio')).toBe('/proj/game/audio/foo.wav')
  })

  it('未关联：仅 audio/* 从 TTS 音频目录解析（试听）', () => {
    expect(resolveAssetTarget('audio/阿虚_x.wav', null, '/tmp/proj/audio')).toBe('/tmp/proj/audio/阿虚_x.wav')
    // 未关联且非音频 → 无根可解析
    expect(resolveAssetTarget('images/kyon.png', null, '/tmp/proj/audio')).toBeNull()
    // 未关联且无音频目录 → null
    expect(resolveAssetTarget('audio/foo.wav', null, null)).toBeNull()
  })

  it('路径越界 → 拒绝', () => {
    expect(resolveAssetTarget('../secret.txt', '/proj/game', null)).toBeNull()
    expect(resolveAssetTarget('audio/../../secret.wav', null, '/tmp/audio')).toBeNull()
  })
})
