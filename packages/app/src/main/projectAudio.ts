import { app } from 'electron'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import {
  COLOR_WORDS,
  ImageCmdMapping,
  audioRefName,
  resolveAudio,
  resolveImage,
  rpyAudioFilename,
  spriteImageName,
  readTable,
} from '@e2r/core'
import { planJobs } from './tts'
import type {
  AssetIndex,
  AudioNormalizeArgs,
  AudioNormalizeEntry,
  AudioNormalizePlan,
  AudioNormalizeProgress,
  ProjectAuditReport,
  ProjectMissingRef,
  ProjectUnusedAsset,
} from '../shared/ipc'

const DEFAULTS = {
  targetLufs: -18,
  truePeakDb: -1.5,
  lra: 11,
  targetPeakDb: -1,
  targetRmsDb: -20,
  limitDb: -1,
  minGainDb: 0.1,
  maxGainDb: 24,
}

const SCOPE_LABEL: Record<AudioNormalizeArgs['scope'], string> = {
  'table-voice': '表格中的所有语音',
  'table-music': '表格中的所有音乐',
  'table-music-voice': '表格中的音乐及语音',
}

function n(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback
}

function posixRel(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

function runCommand(cmd: string, args: string[], timeoutMs = 120000): Promise<CommandResult> {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolveRun({ code: -1, stdout, stderr: err.message || stderr })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveRun({ code: code ?? -1, stdout, stderr })
    })
  })
}

function bundledToolPath(name: 'ffmpeg'): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  return join(process.resourcesPath || '', 'ffmpeg', exe)
}

async function resolveFfmpeg(): Promise<string | null> {
  const candidates = [
    process.env['E2R_FFMPEG'] ?? '',
    app.isPackaged ? bundledToolPath('ffmpeg') : '',
    'ffmpeg',
  ].filter(Boolean)
  for (const candidate of candidates) {
    const result = await runCommand(candidate, ['-version'], 8000)
    if (result.code === 0) return candidate
  }
  return null
}

function parseDb(output: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = output.match(new RegExp(`${escaped}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*dB`))
  return match ? Number(match[1]) : null
}

function parseLoudnormJson(output: string): Record<string, string> | null {
  const start = output.lastIndexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(output.slice(start, end + 1)) as Record<string, string>
  } catch {
    return null
  }
}

function validDb(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

function summary(entries: AudioNormalizeEntry[]): AudioNormalizePlan['summary'] {
  const ready = entries.filter((entry) => entry.status === 'ready')
  const gains = ready.map((entry) => entry.gainDb).filter(validDb)
  return {
    total: entries.length,
    ready: ready.length,
    skipped: entries.filter((entry) => entry.status === 'skipped').length,
    error: entries.filter((entry) => entry.status === 'error').length,
    avgGainDb: gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null,
    maxGainDb: gains.length ? Math.max(...gains.map((gain) => Math.abs(gain))) : null,
  }
}

async function analyzeFile(
  ffmpegPath: string,
  filePath: string,
  rel: string,
  args: AudioNormalizeArgs,
): Promise<AudioNormalizeEntry> {
  const st = await stat(filePath)
  const base = {
    filePath,
    rel,
    size: st.size,
    ext: extname(filePath).toLowerCase(),
  }
  const minGainDb = n(args.minGainDb, DEFAULTS.minGainDb)
  const maxGainDb = n(args.maxGainDb, DEFAULTS.maxGainDb)

  try {
    if (args.standard === 'lufs') {
      const targetLufs = n(args.targetLufs, DEFAULTS.targetLufs)
      const truePeakDb = n(args.truePeakDb, DEFAULTS.truePeakDb)
      const lra = n(args.lra, DEFAULTS.lra)
      const result = await runCommand(ffmpegPath, [
        '-hide_banner',
        '-nostdin',
        '-nostats',
        '-i',
        filePath,
        '-af',
        `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}:print_format=json`,
        '-f',
        'null',
        '-',
      ])
      if (result.code !== 0) {
        return { ...base, measuredLufs: null, measuredPeakDb: null, measuredRmsDb: null, gainDb: null, status: 'error', reason: result.stderr.trim() || 'FFmpeg 分析失败' }
      }
      const data = parseLoudnormJson(result.stderr)
      const measuredLufs = data ? Number(data['input_i']) : NaN
      const measuredPeakDb = data ? Number(data['input_tp']) : NaN
      const measuredLra = data ? Number(data['input_lra']) : NaN
      const measuredThresh = data ? Number(data['input_thresh']) : NaN
      const targetOffset = data ? Number(data['target_offset']) : NaN
      const loudnorm = [measuredLufs, measuredPeakDb, measuredLra, measuredThresh, targetOffset].every(Number.isFinite)
        ? {
            inputI: measuredLufs,
            inputTp: measuredPeakDb,
            inputLra: measuredLra,
            inputThresh: measuredThresh,
            targetOffset,
          }
        : undefined
      const gainDb = Number.isFinite(measuredLufs) ? targetLufs - measuredLufs : null
      if (!validDb(gainDb)) {
        return { ...base, measuredLufs: null, measuredPeakDb: null, measuredRmsDb: null, gainDb: null, status: 'skipped', reason: '静音或无法读取 LUFS' }
      }
      if (Math.abs(gainDb) < minGainDb) {
        return { ...base, loudnorm, measuredLufs, measuredPeakDb: Number.isFinite(measuredPeakDb) ? measuredPeakDb : null, measuredRmsDb: null, gainDb, status: 'skipped', reason: `增益小于 ${minGainDb} dB` }
      }
      if (Math.abs(gainDb) > maxGainDb) {
        return { ...base, loudnorm, measuredLufs, measuredPeakDb: Number.isFinite(measuredPeakDb) ? measuredPeakDb : null, measuredRmsDb: null, gainDb, status: 'skipped', reason: `预计增益超过 ${maxGainDb} dB` }
      }
      return { ...base, loudnorm, measuredLufs, measuredPeakDb: Number.isFinite(measuredPeakDb) ? measuredPeakDb : null, measuredRmsDb: null, gainDb, status: 'ready' }
    }

    const result = await runCommand(ffmpegPath, [
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-i',
      filePath,
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ])
    if (result.code !== 0) {
      return { ...base, measuredLufs: null, measuredPeakDb: null, measuredRmsDb: null, gainDb: null, status: 'error', reason: result.stderr.trim() || 'FFmpeg 分析失败' }
    }
    const measuredRmsDb = parseDb(result.stderr, 'mean_volume')
    const measuredPeakDb = parseDb(result.stderr, 'max_volume')
    const measured = args.standard === 'peak' ? measuredPeakDb : measuredRmsDb
    const target = args.standard === 'peak'
      ? n(args.targetPeakDb, DEFAULTS.targetPeakDb)
      : n(args.targetRmsDb, DEFAULTS.targetRmsDb)
    const gainDb = validDb(measured) ? target - measured : null
    if (!validDb(gainDb)) {
      return { ...base, measuredLufs: null, measuredPeakDb, measuredRmsDb, gainDb: null, status: 'skipped', reason: '静音或无法读取音量' }
    }
    if (Math.abs(gainDb) < minGainDb) {
      return { ...base, measuredLufs: null, measuredPeakDb, measuredRmsDb, gainDb, status: 'skipped', reason: `增益小于 ${minGainDb} dB` }
    }
    if (Math.abs(gainDb) > maxGainDb) {
      return { ...base, measuredLufs: null, measuredPeakDb, measuredRmsDb, gainDb, status: 'skipped', reason: `预计增益超过 ${maxGainDb} dB` }
    }
    return { ...base, measuredLufs: null, measuredPeakDb, measuredRmsDb, gainDb, status: 'ready' }
  } catch (err) {
    return { ...base, measuredLufs: null, measuredPeakDb: null, measuredRmsDb: null, gainDb: null, status: 'error', reason: err instanceof Error ? err.message : String(err) }
  }
}

function loudnormFilter(args: AudioNormalizeArgs, entry: AudioNormalizeEntry): string {
  const targetLufs = n(args.targetLufs, DEFAULTS.targetLufs)
  const truePeakDb = n(args.truePeakDb, DEFAULTS.truePeakDb)
  const lra = n(args.lra, DEFAULTS.lra)
  const measured = entry.loudnorm
  if (!measured) return `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}:print_format=summary`
  return [
    `loudnorm=I=${targetLufs}`,
    `TP=${truePeakDb}`,
    `LRA=${lra}`,
    `measured_I=${measured.inputI}`,
    `measured_TP=${measured.inputTp}`,
    `measured_LRA=${measured.inputLra}`,
    `measured_thresh=${measured.inputThresh}`,
    `offset=${measured.targetOffset}`,
    'linear=true',
    'print_format=summary',
  ].join(':')
}

function gainFilter(gainDb: number, args: AudioNormalizeArgs): string {
  if (args.standard === 'peak') return `volume=${gainDb.toFixed(3)}dB`
  const limitDb = n(args.limitDb, DEFAULTS.limitDb)
  const limit = Math.max(0.01, Math.min(1, 10 ** (limitDb / 20)))
  return `volume=${gainDb.toFixed(3)}dB,alimiter=limit=${limit.toFixed(6)}`
}

async function writeNormalized(ffmpegPath: string, entry: AudioNormalizeEntry, args: AudioNormalizeArgs, backupRoot: string | null): Promise<AudioNormalizeEntry> {
  if (entry.status !== 'ready') return entry
  const ext = extname(entry.filePath)
  const temp = join(dirname(entry.filePath), `${basename(entry.filePath, ext)}.e2r-normalizing${ext}`)
  const filter = args.standard === 'lufs'
    ? loudnormFilter(args, entry)
    : gainFilter(entry.gainDb ?? 0, args)
  const result = await runCommand(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-nostdin',
    '-nostats',
    '-i',
    entry.filePath,
    '-vn',
    '-map_metadata',
    '0',
    '-af',
    filter,
    temp,
  ], 600000)
  if (result.code !== 0) {
    await rm(temp, { force: true })
    return { ...entry, status: 'error', reason: result.stderr.trim() || 'FFmpeg 写入失败' }
  }

  if (backupRoot) {
    const backupPath = join(backupRoot, entry.rel)
    await mkdir(dirname(backupPath), { recursive: true })
    await copyFile(entry.filePath, backupPath)
  }
  await copyFile(temp, entry.filePath)
  await rm(temp, { force: true })
  return entry
}

interface ScopeFiles {
  label: string
  baseDir: string
  files: string[]
}

function uniqueFiles(files: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const file of files) {
    const key = resolve(file)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

function scopeIncludesVoice(scope: AudioNormalizeArgs['scope']): boolean {
  return scope === 'table-voice' || scope === 'table-music-voice'
}

function scopeIncludesMusic(scope: AudioNormalizeArgs['scope']): boolean {
  return scope === 'table-music' || scope === 'table-music-voice'
}

function explicitVoiceName(value: string): string {
  const voice = value.trim()
  if (!voice || voice.toLowerCase() === 'tts') return ''
  const tokens = voice.split(/\s+/).filter(Boolean)
  return tokens[tokens.length - 1] === 'sustain' ? (tokens[0] ?? '') : voice
}

async function collectTableAudio(
  gamePath: string,
  project: AssetIndex,
  xlsxPath: string,
  scope: AudioNormalizeArgs['scope'],
): Promise<string[]> {
  const data = await readTable(xlsxPath)
  const files: string[] = []
  const add = (name: string) => {
    const clean = name.trim()
    if (!clean) return
    const rel = resolveAudio(project, clean) ?? resolveAudio(project, rpyAudioFilename(clean))
    if (rel) files.push(join(gamePath, rel))
  }
  for (const sheet of data.sheets) {
    for (const row of sheet.rows) {
      if (scopeIncludesMusic(scope)) {
        const name = audioRefName(row.cells['music'] ?? '')
        if (name) add(name)
      }
      if (scopeIncludesVoice(scope)) {
        add(explicitVoiceName(row.cells['voice'] ?? ''))
      }
    }
  }
  if (scopeIncludesVoice(scope)) {
    for (const job of await planJobs(xlsxPath)) add(job.outputName)
  }
  return uniqueFiles(files)
}

async function collectScopeFiles(args: AudioNormalizeArgs, gamePath: string, project: AssetIndex | null): Promise<ScopeFiles> {
  const xlsxPath = args.xlsxPath ?? ''
  if (!xlsxPath) throw new Error('当前范围需要先选择工作簿')
  if (!project) throw new Error('工程索引不可用')
  return {
    label: SCOPE_LABEL[args.scope],
    baseDir: gamePath,
    files: await collectTableAudio(gamePath, project, xlsxPath, args.scope),
  }
}

export async function buildAudioNormalizePlan(
  args: AudioNormalizeArgs,
  gamePath: string | null,
  project: AssetIndex | null,
  onProgress?: (p: AudioNormalizeProgress) => void,
): Promise<AudioNormalizePlan> {
  if (!gamePath) throw new Error('未关联 Ren’Py 工程')
  const ffmpegPath = await resolveFfmpeg()
  if (!ffmpegPath) throw new Error('未找到 FFmpeg。请安装 FFmpeg，或设置 E2R_FFMPEG 指向 ffmpeg 可执行文件。')
  const scope = await collectScopeFiles(args, gamePath, project)
  const entries: AudioNormalizeEntry[] = []
  for (let i = 0; i < scope.files.length; i++) {
    const file = scope.files[i]!
    const rel = posixRel(scope.baseDir, file)
    onProgress?.({ phase: 'analyze', index: i, total: scope.files.length, rel, status: 'running' })
    const entry = await analyzeFile(ffmpegPath, file, rel, args)
    entries.push(entry)
    onProgress?.({ phase: 'analyze', index: i, total: scope.files.length, rel, status: entry.status === 'ready' ? 'done' : entry.status, error: entry.reason })
  }
  return {
    scopeLabel: scope.label,
    ffmpegPath,
    entries,
    summary: summary(entries),
  }
}

export async function applyAudioNormalization(
  args: AudioNormalizeArgs,
  gamePath: string | null,
  project: AssetIndex | null,
  onProgress?: (p: AudioNormalizeProgress) => void,
): Promise<{ processed: number; failed: number; entries: AudioNormalizeEntry[] }> {
  const plan = await buildAudioNormalizePlan(args, gamePath, project, onProgress)
  if (!plan.ffmpegPath) throw new Error('未找到 FFmpeg')
  const scope = await collectScopeFiles(args, gamePath!, project)
  const backupRoot = args.backup === false
    ? null
    : join(scope.baseDir, '.e2r-normalize-backup', new Date().toISOString().replace(/[:.]/g, '-'))
  const entries: AudioNormalizeEntry[] = []
  let processed = 0
  let failed = 0
  const ready = plan.entries.filter((entry) => entry.status === 'ready')
  for (let i = 0; i < ready.length; i++) {
    const entry = ready[i]!
    onProgress?.({ phase: 'apply', index: i, total: ready.length, rel: entry.rel, status: 'running' })
    const next = await writeNormalized(plan.ffmpegPath, entry, args, backupRoot)
    entries.push(next)
    if (next.status === 'error') failed++
    else processed++
    onProgress?.({ phase: 'apply', index: i, total: ready.length, rel: entry.rel, status: next.status === 'error' ? 'error' : 'done', error: next.reason })
  }
  return { processed, failed, entries }
}

interface Ref {
  kind: 'image' | 'audio'
  name: string
  source: string
  sheet: string
  row: number
}

function refKey(ref: Pick<Ref, 'kind' | 'name'>): string {
  return `${ref.kind}\u0000${ref.name.trim().toLowerCase()}`
}

function referencedSpriteImageName(seg: string): string {
  const tokens = seg.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 1 && ImageCmdMapping[tokens[0] ?? '']) return ''
  return spriteImageName(seg)
}

export async function auditProjectResources(xlsxPath: string, project: AssetIndex | null): Promise<ProjectAuditReport> {
  if (!project) throw new Error('未关联 Ren’Py 工程')
  if (!xlsxPath) throw new Error('未选择工作簿')
  const data = await readTable(xlsxPath)
  const refs: Ref[] = []
  const add = (ref: Ref) => {
    if (!ref.name.trim()) return
    refs.push(ref)
  }
  for (const sheet of data.sheets) {
    for (const row of sheet.rows) {
      const cells = row.cells
      const background = (cells['background'] ?? '').trim()
      if (background && !COLOR_WORDS[background.toLowerCase()]) {
        add({ kind: 'image', name: background, source: '背景', sheet: sheet.name, row: row.excelRow })
      }
      const side = (cells['side_character'] ?? '').trim()
      if (side) add({ kind: 'image', name: side, source: '头像', sheet: sheet.name, row: row.excelRow })
      for (const seg of (cells['character'] ?? '').split(';')) {
        const image = referencedSpriteImageName(seg)
        if (image) add({ kind: 'image', name: image, source: '立绘', sheet: sheet.name, row: row.excelRow })
      }
      for (const key of ['music', 'sound'] as const) {
        const name = audioRefName(cells[key] ?? '')
        if (name) add({ kind: 'audio', name, source: key === 'music' ? '音乐' : '音效', sheet: sheet.name, row: row.excelRow })
      }
      const voice = (cells['voice'] ?? '').trim()
      if (voice && voice.toLowerCase() !== 'tts') {
        const tokens = voice.split(/\s+/).filter(Boolean)
        const name = tokens[tokens.length - 1] === 'sustain' ? (tokens[0] ?? '') : voice
        add({ kind: 'audio', name, source: '语音', sheet: sheet.name, row: row.excelRow })
      }
    }
  }
  for (const job of await planJobs(xlsxPath)) {
    add({ kind: 'audio', name: job.outputName, source: 'TTS 语音', sheet: job.sheetName, row: job.excelRow })
  }

  const uniq = new Map<string, Ref>()
  for (const ref of refs) if (!uniq.has(refKey(ref))) uniq.set(refKey(ref), ref)

  const usedImages = new Set<string>()
  const usedAudio = new Set<string>()
  const missing: ProjectMissingRef[] = []
  for (const ref of uniq.values()) {
    if (ref.kind === 'image') {
      const rel = resolveImage(project, ref.name)
      if (rel) usedImages.add(rel)
      else missing.push(ref)
    } else {
      const rel = resolveAudio(project, ref.name) ?? resolveAudio(project, rpyAudioFilename(ref.name))
      if (rel) usedAudio.add(rel)
      else missing.push(ref)
    }
  }

  const allImages = new Set(Object.values(project.images))
  const allAudio = new Set(Object.values(project.audio))
  const unused: ProjectUnusedAsset[] = [
    ...[...allImages].filter((rel) => !usedImages.has(rel)).map((rel) => ({ kind: 'image' as const, rel })),
    ...[...allAudio].filter((rel) => !usedAudio.has(rel)).map((rel) => ({ kind: 'audio' as const, rel })),
  ].sort((a, b) => a.rel.localeCompare(b.rel))

  return {
    referenced: {
      images: [...uniq.values()].filter((ref) => ref.kind === 'image').length,
      audio: [...uniq.values()].filter((ref) => ref.kind === 'audio').length,
    },
    missing,
    unused,
  }
}
