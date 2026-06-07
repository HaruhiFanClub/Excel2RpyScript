// 全局角色配置存储（主进程）：单一来源，存放在 userData/characters.json。
// 不再有「按工程的 config.json / 预设导入」——用户直接在「角色配置」页里新建/编辑角色。
// 内置远端角色（凉宫春日系列）始终以预设为准并锁定，文件里只持久化它们的「是否启用」。
import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  parseLegacyTtsConfig,
  serializeTtsConfig,
  isRoleEnabled,
  HARUHI_REMOTE_BUILTIN,
  builtinRoleNames,
  type TtsConfig,
} from '@e2r/core'

const FILE = 'characters.json'

function charactersPath(): string {
  return join(app.getPath('userData'), FILE)
}

// 把内置远端角色（凉宫春日系列）叠加到用户配置上：
// - 内置角色定义（模型/端点/语气）始终以预设为准、锁定；仅「是否启用」沿用用户保存值。
// - 内置语音指令始终以预设为准。
// - 用户自建角色与语音指令原样保留。
function mergeBuiltin(saved: TtsConfig): TtsConfig {
  const builtinSet = new Set(builtinRoleNames())
  const roleModelMapping: TtsConfig['roleModelMapping'] = {}
  // 1) 内置角色（以预设为准，沿用保存的 enabled）
  for (const [name, m] of Object.entries(HARUHI_REMOTE_BUILTIN.roleModelMapping)) {
    const savedRole = saved.roleModelMapping[name]
    roleModelMapping[name] = {
      ...m,
      enabled: savedRole ? isRoleEnabled(savedRole) : isRoleEnabled(m),
    }
  }
  // 2) 用户自建角色（名字不与内置冲突）
  for (const [name, m] of Object.entries(saved.roleModelMapping)) {
    if (!builtinSet.has(name)) roleModelMapping[name] = m
  }
  // 3) 语音指令：内置以预设为准 + 用户自建
  const voiceCmdMapping: TtsConfig['voiceCmdMapping'] = { ...HARUHI_REMOTE_BUILTIN.voiceCmdMapping }
  const builtinCmds = new Set(Object.keys(HARUHI_REMOTE_BUILTIN.voiceCmdMapping))
  for (const [k, v] of Object.entries(saved.voiceCmdMapping)) {
    if (!builtinCmds.has(k)) voiceCmdMapping[k] = v
  }
  return {
    serviceMode: 'remote',
    apiBaseUrl: HARUHI_REMOTE_BUILTIN.apiBaseUrl,
    roleModelMapping,
    voiceCmdMapping,
    defaultPromptAudio: saved.defaultPromptAudio || HARUHI_REMOTE_BUILTIN.defaultPromptAudio,
    defaultPromptText: saved.defaultPromptText || HARUHI_REMOTE_BUILTIN.defaultPromptText,
    ...(saved.deepLApiKey ? { deepLApiKey: saved.deepLApiKey } : {}),
  }
}

// 保存前瘦身：内置角色只留 builtin 标记 + enabled，内置语音指令不落盘（加载时由预设重建）。
function leanForSave(cfg: TtsConfig): TtsConfig {
  const builtinSet = new Set(builtinRoleNames())
  const builtinCmds = new Set(Object.keys(HARUHI_REMOTE_BUILTIN.voiceCmdMapping))
  const roleModelMapping: TtsConfig['roleModelMapping'] = {}
  for (const [name, m] of Object.entries(cfg.roleModelMapping)) {
    roleModelMapping[name] = builtinSet.has(name)
      ? { gpt: '', sovits: '', builtin: true, enabled: isRoleEnabled(m) }
      : m
  }
  const voiceCmdMapping: TtsConfig['voiceCmdMapping'] = {}
  for (const [k, v] of Object.entries(cfg.voiceCmdMapping)) {
    if (!builtinCmds.has(k)) voiceCmdMapping[k] = v
  }
  return { ...cfg, roleModelMapping, voiceCmdMapping }
}

// 读取合并后的角色配置（文件缺失/损坏时回退到纯内置）
export async function loadCharacters(): Promise<TtsConfig> {
  try {
    const raw = await readFile(charactersPath(), 'utf-8')
    return mergeBuiltin(parseLegacyTtsConfig(JSON.parse(raw)))
  } catch {
    return mergeBuiltin(parseLegacyTtsConfig({}))
  }
}

export async function saveCharacters(cfg: TtsConfig): Promise<void> {
  const path = charactersPath()
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(path, JSON.stringify(serializeTtsConfig(leanForSave(cfg)), null, 2) + '\n', 'utf-8')
}
