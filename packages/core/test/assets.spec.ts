import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  spriteImageName,
  resolveImage,
  resolveAudio,
  audioRefName,
  rpyAudioFilename,
  type AssetMaps,
} from '../src/assets'
import { scanRenpyAssets, resolveGamePath } from '../src/renpy/scanAssets'

describe('资源引用解析（纯）', () => {
  it('spriteImageName 去掉末尾位置 token', () => {
    expect(spriteImageName('kyon 0012 kyon_left')).toBe('kyon 0012')
    expect(spriteImageName('haruhi 0903 haruhi_mid')).toBe('haruhi 0903')
    expect(spriteImageName('hide')).toBe('hide')
  })
  it('audioRefName 处理 循环/none/stop', () => {
    expect(audioRefName('循环se')).toBe('se')
    expect(audioRefName('none')).toBeNull()
    expect(audioRefName('stop')).toBeNull()
    expect(audioRefName('bgm')).toBe('bgm')
    expect(audioRefName('')).toBeNull()
  })
  it('rpyAudioFilename 缺省补 .mp3，已有音频扩展名则保留', () => {
    expect(rpyAudioFilename('bgm')).toBe('bgm.mp3')
    expect(rpyAudioFilename('start.mp3')).toBe('start.mp3')
    expect(rpyAudioFilename('se.MP3')).toBe('se.MP3')
    expect(rpyAudioFilename('se.ogg')).toBe('se.ogg')
  })
  it('resolveImage / resolveAudio 大小写不敏感', () => {
    const maps: AssetMaps = {
      images: { 'kyon 0012': 'images/kyon 0012.png' },
      audio: { start: 'audio/start.mp3', 'loop.ogg': 'audio/loop.ogg' },
    }
    expect(resolveImage(maps, 'KYON 0012')).toBe('images/kyon 0012.png')
    expect(resolveImage(maps, 'KYON 0012.png')).toBe('images/kyon 0012.png')
    expect(resolveImage(maps, 'missing')).toBeNull()
    expect(resolveAudio(maps, 'Start')).toBe('audio/start.mp3')
    expect(resolveAudio(maps, 'Start.mp3')).toBe('audio/start.mp3')
    expect(resolveAudio(maps, 'loop.ogg')).toBe('audio/loop.ogg')
  })
})

describe('scanRenpyAssets', () => {
  it('按 basename 建索引，relpath 为 posix', async () => {
    const game = mkdtempSync(join(tmpdir(), 'game-'))
    mkdirSync(join(game, 'images'), { recursive: true })
    mkdirSync(join(game, 'audio'), { recursive: true })
    writeFileSync(join(game, 'images', 'kyon 0030.png'), 'x')
    writeFileSync(join(game, 'images', 'bg xy005.jpg'), 'x')
    writeFileSync(join(game, 'audio', 'start.mp3'), 'x')
    writeFileSync(
      join(game, 'script.rpy'),
      'transform kyon_left:\n    xalign 0.2\ndefine haruhi_mid = Position(xalign=0.5)\n',
    )

    const idx = await scanRenpyAssets(game)
    expect(idx.images['kyon 0030']).toBe('images/kyon 0030.png')
    expect(idx.images['kyon 0030.png']).toBe('images/kyon 0030.png')
    expect(idx.images['bg xy005']).toBe('images/bg xy005.jpg')
    expect(idx.audio['start']).toBe('audio/start.mp3')
    expect(idx.audio['start.mp3']).toBe('audio/start.mp3')
    expect(Object.keys(idx.images)).toHaveLength(4)
    expect(idx.transforms).toContain('kyon_left')
    expect(idx.transforms).toContain('haruhi_mid')
  })

  it('resolveGamePath 推断 game 目录', () => {
    const root = mkdtempSync(join(tmpdir(), 'proj-'))
    mkdirSync(join(root, 'game'))
    expect(resolveGamePath(root)).toBe(join(root, 'game'))
    expect(resolveGamePath(join(root, 'game'))).toBe(join(root, 'game'))
  })
})
