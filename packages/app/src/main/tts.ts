// TTS 客户端（主进程）：对接配置的 GPT-SoVITS HTTP 端点，复刻 handler/tts.py 的合成流程。
import { writeFile, mkdir, readFile, readdir, copyFile, access, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  planTtsJobs,
  ttsJobSignature,
  toneFor,
  modelForRole,
  isRemoteRole,
  type TtsConfig,
  type TtsJob,
  type TtsAudioRenamePlan,
  type EnrichedJob,
  readRawWorkbook,
  parseSheetRows,
  truthy,
  EXCEL_PARSE_START_ROW,
} from '@e2r/core'
import { pendingDirFor, workspaceSub } from './workspace'

const MANIFEST = '.e2r-tts.json' // pending 目录：记录每个已生成 wav 的合成输入签名
const APPLIED = '.e2r-applied.json' // voice 目录：记录每个已应用 wav 的签名（落实时刻的输入）
const PROJECT_RENAMES = '.e2r-audio-renames.json' // workspace：待应用到 game/audio 的改名计划

export type AudioRenamePlan = TtsAudioRenamePlan

async function readManifest(dir: string, file = MANIFEST): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(join(dir, file), 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function safeAudioName(name: string): boolean {
  return basename(name) === name && name.toLowerCase().endsWith('.wav') && !name.startsWith('.')
}

function flattenRenamePlan(plan: AudioRenamePlan): Record<string, string> {
  const map: Record<string, string> = {}
  for (const sheetMap of Object.values(plan)) {
    for (const [oldName, newName] of Object.entries(sheetMap)) {
      if (oldName !== newName && safeAudioName(oldName) && safeAudioName(newName)) map[oldName] = newName
    }
  }
  return map
}

function isEmptyPlan(plan: AudioRenamePlan): boolean {
  return Object.values(plan).every((sheet) => Object.keys(sheet).length === 0)
}

async function readProjectRenamePlan(workspaceDir: string): Promise<AudioRenamePlan> {
  try {
    const raw = JSON.parse(await readFile(join(workspaceDir, PROJECT_RENAMES), 'utf-8')) as {
      sheets?: AudioRenamePlan
    }
    return raw.sheets ?? {}
  } catch {
    return {}
  }
}

async function writeProjectRenamePlan(workspaceDir: string, plan: AudioRenamePlan): Promise<void> {
  const file = join(workspaceDir, PROJECT_RENAMES)
  if (isEmptyPlan(plan)) {
    await rm(file, { force: true })
    return
  }
  await writeFile(file, JSON.stringify({ sheets: plan }, null, 2))
}

function mergeSheetRenamePlan(base: Record<string, string>, incoming: Record<string, string>): Record<string, string> {
  const next = { ...base }
  for (const [oldName, newName] of Object.entries(incoming)) {
    if (oldName === newName) continue
    let composed = false
    for (const [source, currentTarget] of Object.entries(next)) {
      if (currentTarget === oldName) {
        next[source] = newName
        composed = true
      }
    }
    if (!composed) next[oldName] = newName
  }
  for (const [oldName, newName] of Object.entries(next)) {
    if (oldName === newName) delete next[oldName]
  }
  return next
}

async function rememberProjectAudioRenames(xlsxPath: string, plan: AudioRenamePlan): Promise<void> {
  if (isEmptyPlan(plan)) return
  const workspaceDir = dirname(xlsxPath)
  const current = await readProjectRenamePlan(workspaceDir)
  const next: AudioRenamePlan = { ...current }
  for (const [sheet, sheetMap] of Object.entries(plan)) {
    const merged = mergeSheetRenamePlan(next[sheet] ?? {}, sheetMap)
    if (Object.keys(merged).length > 0) next[sheet] = merged
    else delete next[sheet]
  }
  await writeProjectRenamePlan(workspaceDir, next)
}

async function renameFilesInDir(dir: string, map: Record<string, string>): Promise<{
  renamed: number
  applied: Record<string, string>
}> {
  if (!(await pathExists(dir))) return { renamed: 0, applied: {} }
  const moves: { oldName: string; newName: string; temp: string }[] = []
  let i = 0
  for (const [oldName, newName] of Object.entries(map)) {
    const oldPath = join(dir, oldName)
    if (!(await pathExists(oldPath))) continue
    const temp = join(dir, `.e2r-renaming-${randomUUID()}-${i++}.tmp`)
    await rename(oldPath, temp)
    moves.push({ oldName, newName, temp })
  }

  let renamed = 0
  const applied: Record<string, string> = {}
  for (const move of moves) {
    const target = join(dir, move.newName)
    if (await pathExists(target)) {
      await rm(move.temp, { force: true })
      continue
    }
    await rename(move.temp, target)
    applied[move.oldName] = move.newName
    renamed++
  }
  return { renamed, applied }
}

function renameManifestKeys(manifest: Record<string, string>, map: Record<string, string>): Record<string, string> | null {
  const next = { ...manifest }
  const moved: [string, string][] = []
  let changed = false
  for (const [oldName, newName] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(next, oldName)) continue
    moved.push([newName, next[oldName] ?? ''])
    delete next[oldName]
    changed = true
  }
  for (const [newName, sig] of moved) {
    next[newName] = sig
  }
  return changed ? next : null
}

async function renameAudioDir(
  dir: string,
  map: Record<string, string>,
  manifestFile: string | null,
): Promise<number> {
  if (Object.keys(map).length === 0 || !(await pathExists(dir))) return 0
  const { renamed, applied } = await renameFilesInDir(dir, map)
  if (manifestFile) {
    const manifest = await readManifest(dir, manifestFile)
    const next = renameManifestKeys(manifest, applied)
    if (next) await writeFile(join(dir, manifestFile), JSON.stringify(next, null, 2))
  }
  return renamed
}

export async function applyWorkspaceAudioRenames(xlsxPath: string, plan: AudioRenamePlan): Promise<void> {
  const map = flattenRenamePlan(plan)
  if (Object.keys(map).length === 0) return
  const workspaceDir = dirname(xlsxPath)
  await Promise.all([
    renameAudioDir(pendingDirFor(workspaceDir), map, MANIFEST),
    renameAudioDir(workspaceSub(workspaceDir, 'voice'), map, APPLIED),
  ])
}

export async function queueAudioRenamesForProject(xlsxPath: string, plan: AudioRenamePlan): Promise<void> {
  await rememberProjectAudioRenames(xlsxPath, plan)
}

export async function applyProjectAudioRenamesForSheet(
  xlsxPath: string,
  sheetName: string,
  gameAudioDir: string | null,
): Promise<number> {
  if (!gameAudioDir) return 0
  const workspaceDir = dirname(xlsxPath)
  const plan = await readProjectRenamePlan(workspaceDir)
  const sheetMap = plan[sheetName]
  if (!sheetMap || Object.keys(sheetMap).length === 0) return 0
  const renamed = await renameAudioDir(gameAudioDir, sheetMap, null)
  delete plan[sheetName]
  await writeProjectRenamePlan(workspaceDir, plan)
  return renamed
}

function hasManifestEntry(manifest: Record<string, string>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(manifest, name)
}

function stemOfAudioName(name: string): string {
  return name.toLowerCase().replace(/\.wav$/, '')
}

// 列出任务并标注状态。优先使用带签名的 workspace/pending 清单做精确判断：
//  pending 目录里有且签名匹配 → generated（临时，可试听）
//  voice  目录里有且签名匹配 → applied（已落实到 workspace）
//  带签名但不匹配 → stale（输入已改）
//  关联工程资源索引或 game/audio 中已有同名 wav → applied（历史文件通常无签名，按已存在处理）
//  都没有 → missing
export async function enrichedJobs(
  xlsxPath: string,
  cfg: TtsConfig,
  textLang: string,
  pendingDir: string,
  voiceDir: string,
  gameAudioDir?: string | null,
  projectAudioNames: string[] = [],
): Promise<EnrichedJob[]> {
  const jobs = await planJobs(xlsxPath)
  const [pendWavs, voiceWavs, projectWavs, genMan, appMan] = await Promise.all([
    listSynthesized(pendingDir),
    listSynthesized(voiceDir),
    gameAudioDir ? listSynthesized(gameAudioDir) : Promise.resolve([]),
    readManifest(pendingDir, MANIFEST),
    readManifest(voiceDir, APPLIED),
  ])
  const inPending = new Set(pendWavs.map((name) => name.toLowerCase()))
  const inVoice = new Set(voiceWavs.map((name) => name.toLowerCase()))
  const inProject = new Set(projectWavs.map((name) => name.toLowerCase()))
  const projectIndex = new Set(projectAudioNames.map((name) => name.toLowerCase()))
  return jobs.map((j) => {
    const tone = toneFor(cfg, j.voiceCmd)
    const sig = ttsJobSignature(j, cfg, textLang)
    const name = j.outputName
    const key = name.toLowerCase()
    const stem = stemOfAudioName(name)
    const projectHasAudio = inProject.has(key) || projectIndex.has(key) || projectIndex.has(stem)
    let status: EnrichedJob['status']
    if (inVoice.has(key) && appMan[name] === sig) status = 'applied'
    else if (inPending.has(key) && genMan[name] === sig) status = 'generated'
    else if (
      (inVoice.has(key) && hasManifestEntry(appMan, name)) ||
      (inPending.has(key) && hasManifestEntry(genMan, name))
    )
      status = 'stale'
    else if (projectHasAudio || inVoice.has(key)) status = 'applied'
    else if (inPending.has(key)) status = 'generated'
    else status = 'missing'
    return { ...j, tone, status }
  })
}

// 应用（打对号）：把 pending 里已生成的语音复制到 workspace/<表>/voice（必有副本），
// 若关联工程则同时复制到 game/audio。返回成功应用的数量。
export async function applyVoices(
  outputNames: string[],
  pendingDir: string,
  voiceDir: string,
  gameAudioDir: string | null,
): Promise<{ applied: number }> {
  const genMan = await readManifest(pendingDir, MANIFEST)
  const appMan = await readManifest(voiceDir, APPLIED)
  await mkdir(voiceDir, { recursive: true })
  if (gameAudioDir) await mkdir(gameAudioDir, { recursive: true })
  let applied = 0
  for (const name of outputNames) {
    const src = join(pendingDir, name)
    try {
      await access(src)
    } catch {
      continue // 还没生成，无法应用
    }
    await copyFile(src, join(voiceDir, name))
    if (gameAudioDir) await copyFile(src, join(gameAudioDir, name))
    appMan[name] = genMan[name] ?? ''
    applied++
  }
  await writeFile(join(voiceDir, APPLIED), JSON.stringify(appMan, null, 2))
  return { applied }
}

export async function ttsHealth(
  baseUrl: string,
): Promise<{ ok: boolean; device?: string; version?: string; error?: string }> {
  try {
    const r = await fetch(baseUrl)
    if (r.ok) return { ok: true }
    // GSV 远端通常没有 /health；状态检测只验证服务基址可连接。
    // 网关错误（502/503/504）= 上游不可达 → 离线；其余有应答（如 404/405）→ 视为可达。
    if (r.status >= 502 && r.status <= 504) return { ok: false, error: `HTTP ${r.status}` }
    return { ok: true }
  } catch (e) {
    // 仅网络层失败（DNS/拒绝连接/超时）才算离线
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function listSynthesized(audioDir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name.toLowerCase().endsWith('.wav')) out.push(entry.name)
    }
  }
  await walk(audioDir)
  return out
}

export async function resolveSynthesizedFile(audioDir: string, name: string): Promise<string | null> {
  const target = name.toLowerCase()
  async function walk(dir: string): Promise<string | null> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = await walk(path)
        if (found) return found
      } else if (entry.name.toLowerCase() === target) {
        return path
      }
    }
    return null
  }
  return walk(audioDir)
}

export async function planJobs(xlsxPath: string): Promise<TtsJob[]> {
  const { sheets: rawSheets } = await readRawWorkbook(xlsxPath)
  const excelRows = rawSheets.map((sheet) => {
    const rows: number[] = []
    sheet.rows.forEach((row, rawIndex) => {
      if (row.some(truthy)) rows.push(EXCEL_PARSE_START_ROW + 1 + rawIndex)
    })
    return rows
  })
  const sheets = rawSheets.map((sheet) => ({ name: sheet.name, rows: parseSheetRows(sheet.rows) }))
  return planTtsJobs(sheets, excelRows)
}

export interface SynthOptions {
  cfg: TtsConfig
  audioDir: string
  textLang: string
  promptLang: string
  baseUrl?: string // 覆盖端点（用内置引擎时）
  skipSwitch?: boolean // 与上一句同角色时跳过切权重（批量提速）
}

// 合成单个任务（按角色判定：远端切权重 / 内嵌 zero-shot → POST /tts → 落盘）
export async function synthOne(job: TtsJob, opts: SynthOptions): Promise<void> {
  const model = modelForRole(opts.cfg, job.roleName)
  const remote = isRemoteRole(model)
  // 远端角色：走其自定义端点并按角色切自定义模型；内嵌角色：走本地引擎、不切权重、仅靠参考音频克隆。
  const base = remote ? model.apiBaseUrl || opts.cfg.apiBaseUrl : opts.baseUrl ?? opts.cfg.apiBaseUrl
  if (remote && !opts.skipSwitch) {
    if (model.gpt) await fetch(`${base}set_gpt_weights?weights_path=${encodeURIComponent(model.gpt)}`)
    if (model.sovits)
      await fetch(`${base}set_sovits_weights?weights_path=${encodeURIComponent(model.sovits)}`)
  }
  const cmd = opts.cfg.voiceCmdMapping[job.voiceCmd]
  const refAudio = cmd?.refAudioPath || opts.cfg.defaultPromptAudio
  const promptText = cmd?.promptText || opts.cfg.defaultPromptText
  const r = await fetch(`${base}tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: job.text,
      text_lang: opts.textLang,
      ref_audio_path: refAudio,
      prompt_text: promptText,
      prompt_lang: opts.promptLang,
      text_split_method: 'cut1',
      batch_size: 1,
    }),
  })
  if (!r.ok) {
    let detail = `HTTP ${r.status}`
    try {
      detail = JSON.stringify(await r.json())
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const buf = Buffer.from(await r.arrayBuffer())
  await mkdir(opts.audioDir, { recursive: true })
  await writeFile(join(opts.audioDir, job.outputName), buf)
  // 更新签名清单
  const manifest = await readManifest(opts.audioDir)
  manifest[job.outputName] = ttsJobSignature(job, opts.cfg, opts.textLang)
  await writeFile(join(opts.audioDir, MANIFEST), JSON.stringify(manifest, null, 2))
}
