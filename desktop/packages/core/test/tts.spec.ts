import { describe, it, expect } from 'vitest'
import {
  planTtsJobs,
  parseLegacyTtsConfig,
  ttsJobSignature,
  serializeTtsConfig,
  deriveTone,
} from '../src/tts'
import { builtinPreset, BUILTIN_PRESETS } from '../src/presets'
import { runPipeline, type ParsedSheet } from '../src/index'
import { EMPTY, textCell, type CellValue } from '../src/parse/cellValue'
import { ElementColNumMapping, type ColKey } from '../src/settings/converterSetting'

function row(obj: Partial<Record<ColKey, string>>): CellValue[] {
  const r: CellValue[] = Array.from({ length: 31 }, () => EMPTY as CellValue)
  for (const [k, v] of Object.entries(obj)) r[ElementColNumMapping[k as ColKey]] = textCell(v as string)
  return r
}
const sheet = (name: string, rows: CellValue[][]): ParsedSheet => ({ name, rows })

describe('planTtsJobs', () => {
  it('仅取 tts 行，角色前向填充，用绝对 sheet 索引', () => {
    const sheets = [
      sheet('Sheet1', [row({ role_name: 'A', text: '无语音' })]), // 无 tts 行
      sheet('Sheet2', [
        row({ role_name: '阿虚', text: '台词1', voice: 'tts', voice_cmd: 'kyon_1' }),
        row({ text: '台词2（继承角色）', voice: 'TTS', voice_cmd: 'kyon_2' }),
      ]),
    ]
    const jobs = planTtsJobs(sheets, { useVoiceText: false })
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({ sheetIndex: 1, rowIndex: 0, roleName: '阿虚', voiceCmd: 'kyon_1' })
    expect(jobs[0]!.outputName).toBe('阿虚_sheet2_row8_synthesized.wav')
    // 第二行继承角色
    expect(jobs[1]!.roleName).toBe('阿虚')
    expect(jobs[1]!.outputName).toBe('阿虚_sheet2_row9_synthesized.wav')
  })

  it('输出文件名与转换器生成的 voice "..." 引用一致（修正 sheet 序号 bug）', () => {
    const sheets = [
      sheet('Sheet1', [row({ role_name: 'A', text: '无语音' })]),
      sheet('Sheet2', [row({ role_name: '阿虚', text: '台词1', voice: 'tts', voice_cmd: 'c' })]),
    ]
    const jobs = planTtsJobs(sheets, { useVoiceText: false })
    const { files } = runPipeline(sheets, { mode: 'legacy-compat' })
    const sheet2 = files.find((f) => f.label === 'Sheet2')!
    expect(sheet2.content).toContain(`voice "${jobs[0]!.outputName}"`)
  })

  it('useVoiceText 用 col18', () => {
    const sheets = [
      sheet('S', [row({ role_name: 'A', text: '中文', voice_text: '日文', voice: 'tts', voice_cmd: 'c' })]),
    ]
    expect(planTtsJobs(sheets, { useVoiceText: true })[0]!.text).toBe('日文')
    expect(planTtsJobs(sheets, { useVoiceText: false })[0]!.text).toBe('中文')
  })
})

describe('parseLegacyTtsConfig / 签名', () => {
  it('解析旧 config.json 结构', () => {
    const cfg = parseLegacyTtsConfig({
      role_model_mapping: { 阿虚: { gpt: 'g.ckpt', sovits: 's.pth' } },
      voice_cmd_mapping: { kyon_1: { ref_audio_path: 'r.wav', prompt_text: 'p' } },
      default_prompt_audio: 'd.wav',
      default_prompt_text: 'dp',
      API_BASE_URL: { base: 'http://x:9880/' },
      deepL_api_key: 'k',
    })
    expect(cfg.apiBaseUrl).toBe('http://x:9880/')
    expect(cfg.roleModelMapping['阿虚']).toEqual({ gpt: 'g.ckpt', sovits: 's.pth' })
    expect(cfg.voiceCmdMapping['kyon_1']).toMatchObject({ refAudioPath: 'r.wav', promptText: 'p' })
  })

  it('deriveTone 从参考音频文件名推导语气', () => {
    expect(deriveTone('./predef_ref/正常有希/01_有希_平静.wav')).toBe('平静')
    expect(deriveTone('./predef_ref/凉宫春日/01_凉宫春日_不甘心_遗憾.wav')).toBe('不甘心 遗憾')
    expect(deriveTone('02_有希_平静_温柔.wav')).toBe('平静 温柔')
    expect(deriveTone('')).toBe('')
  })

  it('parse ↔ serialize 往返（含 aliases / tone）', () => {
    const src = {
      service_mode: 'remote',
      role_model_mapping: { 阿虚: { gpt: 'g', sovits: 's', aliases: ['kyon', 'Kyon'] } },
      voice_cmd_mapping: { kyon_1: { ref_audio_path: 'r', prompt_text: 'p', tone: '平静' } },
      default_prompt_audio: 'd',
      default_prompt_text: 'dp',
      API_BASE_URL: { base: 'http://x/' },
      deepL_api_key: 'k',
    }
    const round = serializeTtsConfig(parseLegacyTtsConfig(src))
    expect(round).toEqual(src)
  })

  it('内嵌模式：service_mode + 语音指令归属角色 往返', () => {
    const src = {
      service_mode: 'embedded',
      role_model_mapping: { 阿虚: { gpt: '', sovits: '' } },
      voice_cmd_mapping: { kyon_calm: { ref_audio_path: 'r', prompt_text: 'p', role: '阿虚' } },
      default_prompt_audio: 'd',
      default_prompt_text: 'dp',
      API_BASE_URL: { base: 'http://x/' },
      deepL_api_key: '',
    }
    const cfg = parseLegacyTtsConfig(src)
    expect(cfg.serviceMode).toBe('embedded')
    expect(cfg.voiceCmdMapping['kyon_calm']?.role).toBe('阿虚')
    expect(serializeTtsConfig(cfg)).toEqual(src)
  })

  it('内置预设：凉宫春日（远端）', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThan(0)
    const cfg = builtinPreset('haruhi-remote')!
    expect(cfg.serviceMode).toBe('remote')
    expect(Object.keys(cfg.roleModelMapping).length).toBe(11)
    expect(Object.keys(cfg.voiceCmdMapping).length).toBe(150)
    expect(cfg.roleModelMapping['长门有希']?.gpt).toContain('.ckpt')
  })

  it('改语音指令 → 签名变化（未重新生成检测）', () => {
    const sheets = [sheet('S', [row({ role_name: 'A', text: 't', voice: 'tts', voice_cmd: 'c1' })])]
    const cfg = parseLegacyTtsConfig({})
    const j1 = planTtsJobs(sheets, { useVoiceText: false })[0]!
    const j2 = { ...j1, voiceCmd: 'c2' }
    expect(ttsJobSignature(j1, cfg, 'auto')).not.toBe(ttsJobSignature(j2, cfg, 'auto'))
  })
})
