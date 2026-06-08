import { describe, it, expect } from 'vitest'
import {
  planTtsJobs,
  planTtsAudioRenames,
  parseLegacyTtsConfig,
  ttsJobSignature,
  serializeTtsConfig,
  deriveTone,
  resolveRoleKey,
  enabledRoleNames,
  tonesForRole,
  spritePositionsFromConfig,
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
    const jobs = planTtsJobs(sheets)
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
    const jobs = planTtsJobs(sheets)
    const { files } = runPipeline(sheets, { mode: 'legacy-compat' })
    const sheet2 = files.find((f) => f.label === 'Sheet2')!
    expect(sheet2.content).toContain(`voice "${jobs[0]!.outputName}"`)
  })

  it('有选填语音文本(col18)则用之，否则用台词(col1)', () => {
    const withVt = [
      sheet('S', [row({ role_name: 'A', text: '中文', voice_text: '日文', voice: 'tts', voice_cmd: 'c' })]),
    ]
    const onlyText = [
      sheet('S', [row({ role_name: 'A', text: '中文', voice: 'tts', voice_cmd: 'c' })]),
    ]
    expect(planTtsJobs(withVt)[0]!.text).toBe('日文')
    expect(planTtsJobs(withVt)[0]).toMatchObject({ dialogueText: '中文', voiceText: '日文' })
    expect(planTtsJobs(onlyText)[0]!.text).toBe('中文')
    expect(planTtsJobs(onlyText)[0]).toMatchObject({ dialogueText: '中文', voiceText: '' })
  })
})

describe('planTtsAudioRenames', () => {
  it('插入行导致行号后移时生成连续改名计划', () => {
    const before = planTtsJobs([
      sheet('S', [
        row({ role_name: 'A', text: '第一句', voice: 'tts', voice_cmd: 'c' }),
        row({ text: '第二句', voice: 'tts', voice_cmd: 'c' }),
      ]),
    ])
    const after = planTtsJobs([
      sheet('S', [
        row({ role_name: 'A', text: '新增非语音行' }),
        row({ text: '第一句', voice: 'tts', voice_cmd: 'c' }),
        row({ text: '第二句', voice: 'tts', voice_cmd: 'c' }),
      ]),
    ])

    expect(planTtsAudioRenames(before, after)).toEqual({
      S: {
        'A_sheet1_row8_synthesized.wav': 'A_sheet1_row9_synthesized.wav',
        'A_sheet1_row9_synthesized.wav': 'A_sheet1_row10_synthesized.wav',
      },
    })
  })

  it('删除行导致后续行号前移时只改仍存在的语音', () => {
    const before = planTtsJobs([
      sheet('S', [
        row({ role_name: 'A', text: '删除这一句', voice: 'tts', voice_cmd: 'c' }),
        row({ text: '保留这一句', voice: 'tts', voice_cmd: 'c' }),
      ]),
    ])
    const after = planTtsJobs([
      sheet('S', [row({ role_name: 'A', text: '保留这一句', voice: 'tts', voice_cmd: 'c' })]),
    ])

    expect(planTtsAudioRenames(before, after)).toEqual({
      S: {
        'A_sheet1_row9_synthesized.wav': 'A_sheet1_row8_synthesized.wav',
      },
    })
  })

  it('角色或语气变化时不复用旧音频', () => {
    const before = planTtsJobs([
      sheet('S', [row({ role_name: 'A', text: '同一句', voice: 'tts', voice_cmd: 'c1' })]),
    ])
    const after = planTtsJobs([
      sheet('S', [row({ role_name: 'B', text: '同一句', voice: 'tts', voice_cmd: 'c1' })]),
    ])
    expect(planTtsAudioRenames(before, after)).toEqual({})
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
    const j1 = planTtsJobs(sheets)[0]!
    const j2 = { ...j1, voiceCmd: 'c2' }
    expect(ttsJobSignature(j1, cfg, 'auto')).not.toBe(ttsJobSignature(j2, cfg, 'auto'))
  })

  it('角色有模型→远端、无模型→内嵌；远端换端点/权重 → 签名变化', () => {
    const sheets = [sheet('S', [row({ role_name: 'A', text: 't', voice: 'tts', voice_cmd: 'c1' })])]
    const j = planTtsJobs(sheets)[0]!
    const embedded = parseLegacyTtsConfig({
      role_model_mapping: { A: { gpt: '', sovits: '' } },
      API_BASE_URL: { base: 'http://a/' },
    })
    const remote = parseLegacyTtsConfig({
      role_model_mapping: { A: { gpt: 'g', sovits: 's', api_base_url: 'http://a/' } },
    })
    const remoteEndpoint = parseLegacyTtsConfig({
      role_model_mapping: { A: { gpt: 'g', sovits: 's', api_base_url: 'http://b/' } },
    })
    const remoteWeights = parseLegacyTtsConfig({
      role_model_mapping: { A: { gpt: 'g2', sovits: 's', api_base_url: 'http://a/' } },
    })
    // 内嵌 vs 远端
    expect(ttsJobSignature(j, embedded, 'auto')).not.toBe(ttsJobSignature(j, remote, 'auto'))
    // 远端换端点 / 换权重
    expect(ttsJobSignature(j, remote, 'auto')).not.toBe(ttsJobSignature(j, remoteEndpoint, 'auto'))
    expect(ttsJobSignature(j, remote, 'auto')).not.toBe(ttsJobSignature(j, remoteWeights, 'auto'))
    // 内嵌换全局端点不影响（走本地引擎）
    const embedded2 = parseLegacyTtsConfig({
      role_model_mapping: { A: { gpt: '', sovits: '' } },
      API_BASE_URL: { base: 'http://b/' },
    })
    expect(ttsJobSignature(j, embedded, 'auto')).toBe(ttsJobSignature(j, embedded2, 'auto'))
  })
})

describe('角色配置 helpers', () => {
  it('内置远端角色：锁定 + 端点 + 语音指令归属角色', () => {
    const cfg = builtinPreset('haruhi-remote')!
    expect(cfg.roleModelMapping['凉宫春日']?.builtin).toBe(true)
    expect(cfg.roleModelMapping['凉宫春日']?.apiBaseUrl).toBeTruthy()
    expect(cfg.roleModelMapping['凉宫春日']?.aliases).toContain('haruhi')
    expect(cfg.roleModelMapping['凉宫春日']?.spritePos).toEqual({
      left: 'haruhi_left',
      mid: 'haruhi_mid',
      right: 'haruhi_right',
    })
    expect(cfg.voiceCmdMapping['haruhi_1']?.role).toBe('凉宫春日')
    expect(tonesForRole(cfg, '凉宫春日')).toContain('haruhi_1')
    expect(tonesForRole(cfg, '凉宫春日')).not.toContain('kyon_1')
    expect(spritePositionsFromConfig(cfg)['haruhi']).toEqual({
      left: 'haruhi_left',
      mid: 'haruhi_mid',
      right: 'haruhi_right',
    })
  })

  it('resolveRoleKey 命中别名，未命中原样返回', () => {
    const cfg = parseLegacyTtsConfig({
      role_model_mapping: { 阿虚: { gpt: 'g', sovits: 's', aliases: ['Kyon'] } },
    })
    expect(resolveRoleKey(cfg, 'Kyon')).toBe('阿虚')
    expect(resolveRoleKey(cfg, '未知')).toBe('未知')
  })

  it('sprite_pos 往返 + spritePositionsFromConfig 按角色名与别名建图', () => {
    const src = {
      role_model_mapping: {
        阿虚: { gpt: 'g', sovits: 's', aliases: ['kyon'], sprite_pos: { left: 'kyon_l', mid: 'kyon_m' } },
      },
    }
    const cfg = parseLegacyTtsConfig(src)
    expect(cfg.roleModelMapping['阿虚']?.spritePos).toEqual({ left: 'kyon_l', mid: 'kyon_m' })
    const map = spritePositionsFromConfig(cfg)
    expect(map['阿虚']).toEqual({ left: 'kyon_l', mid: 'kyon_m' })
    expect(map['kyon']).toEqual({ left: 'kyon_l', mid: 'kyon_m' }) // 别名也命中
    const round = serializeTtsConfig(cfg) as {
      role_model_mapping: Record<string, { sprite_pos?: unknown }>
    }
    expect(round.role_model_mapping['阿虚']?.sprite_pos).toEqual({ left: 'kyon_l', mid: 'kyon_m' })
  })

  it('enabledRoleNames 仅含启用角色（缺省视为启用）', () => {
    const cfg = parseLegacyTtsConfig({
      role_model_mapping: {
        A: { gpt: '', sovits: '', enabled: true },
        B: { gpt: '', sovits: '', enabled: false },
        C: { gpt: '', sovits: '' },
      },
    })
    const names = enabledRoleNames(cfg)
    expect(names).toContain('A')
    expect(names).toContain('C')
    expect(names).not.toContain('B')
  })
})
