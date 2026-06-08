import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron'
import { join, dirname, basename, extname, relative, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  ttsHealth,
  planJobs,
  synthOne,
  enrichedJobs,
  applyVoices,
  applyWorkspaceAudioRenames,
  queueAudioRenamesForProject,
  applyProjectAudioRenamesForSheet,
} from './tts'
import { loadCharacters, saveCharacters } from './characters'
import { importWorkbook, pendingDirFor, workspaceSub, type WsType } from './workspace'
import { engineStart, engineStop, engineStatus } from './ttsServer'
import { validateFormat } from './format'
import { checkForUpdates } from './update'
import {
  readTable,
  saveTableChanges,
  readWorkbook,
  checkSheets,
  summarize,
  scanRenpyAssets,
  resolveGamePath,
  IMAGE_EXTS,
  AUDIO_EXTS,
  diffWorkbooks,
  resolveAssetTarget,
  planTtsAudioRenames,
  type AssetMaps,
  type TableChange,
  type TtsConfig,
} from '@e2r/core'
import { convertWorkbook, previewWorkbook } from './convert'
import type {
  ConvertArgs,
  ConvertResult,
  PreviewArgs,
  PreviewResult,
  TableResult,
  SaveAsResult,
  SaveResult,
  CheckResult,
  ProjectResult,
  WorkspaceAssetsResult,
  AssetImportResult,
  DiffResult,
  TtsHealth,
  TtsJobsArgs,
  TtsJobsResult,
  TtsApplyArgs,
  TtsApplyResult,
  TtsSynthArgs,
  TtsSynthSummary,
  EngineStartResult,
  EngineStatus,
  FormatResult,
  RpyFile,
  RpyFileWriteResult,
  WorkspaceImportResult,
} from '../shared/ipc'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// asset:// 协议：把关联工程 game/ 下的文件喂给渲染进程（图片/音频预览）
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

let linkedGamePath: string | null = null
let linkedTransforms: string[] = []
let currentWorkspaceDir: string | null = null
let currentPendingDir: string | null = null // 当前表的临时语音目录（已生成、可试听）
let currentVoiceDir: string | null = null // 当前表的已应用语音目录（workspace/<表>/voice）

const runtimeIconPath = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png')

function rememberWorkspaceForWorkbook(xlsxPath: string): string {
  currentWorkspaceDir = dirname(xlsxPath)
  return currentWorkspaceDir
}

function uniqueAssetFilenameAcross(dirs: string[], original: string): string {
  const ext = extname(original)
  const stem = basename(original, ext)
  let candidate = original
  let i = 2
  while (dirs.some((dir) => existsSync(join(dir, candidate)))) {
    candidate = `${stem}-${i}${ext}`
    i += 1
  }
  return candidate
}

const IMG_EXT = new Set(IMAGE_EXTS.map((e) => `.${e}`))
const AUD_EXT = new Set(AUDIO_EXTS.map((e) => `.${e}`))

function indexAsset(out: Record<string, string>, root: string, fullPath: string): void {
  const file = basename(fullPath)
  const ext = extname(file)
  const stemKey = basename(file, ext).toLowerCase()
  const fileKey = file.toLowerCase()
  const rel = relative(root, fullPath).split(sep).join('/')
  if (!(stemKey in out)) out[stemKey] = rel
  if (!(fileKey in out)) out[fileKey] = rel
}

async function walkWorkspaceAssets(
  root: string,
  subdir: string,
  exts: Set<string>,
  out: Record<string, string>,
): Promise<void> {
  const dir = join(root, subdir)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      await walkWorkspaceAssets(root, relative(root, full), exts, out)
    } else if (exts.has(extname(entry.name).toLowerCase())) {
      indexAsset(out, root, full)
    }
  }
}

async function scanWorkspaceAssets(workspaceDir: string): Promise<AssetMaps> {
  const images: Record<string, string> = {}
  const audio: Record<string, string> = {}
  await walkWorkspaceAssets(workspaceDir, 'background', IMG_EXT, images)
  await walkWorkspaceAssets(workspaceDir, 'sprite', IMG_EXT, images)
  await walkWorkspaceAssets(workspaceDir, 'music', AUD_EXT, audio)
  await walkWorkspaceAssets(workspaceDir, 'sound', AUD_EXT, audio)
  await walkWorkspaceAssets(workspaceDir, 'voice', AUD_EXT, audio)
  return { images, audio }
}

function importCellValue(kind: WsType, fileName: string): string {
  const ext = extname(fileName)
  const stem = basename(fileName, ext)
  if (kind === 'music' || kind === 'sound') return ext.toLowerCase() === '.mp3' ? stem : fileName
  return stem
}

function rpyFileName(label: string): string {
  const stem = label.replace(/[\\/:*?"<>|]/g, '_').trim() || 'script'
  return stem.toLowerCase().endsWith('.rpy') ? stem : `${stem}.rpy`
}

async function writeRpyFile(path: string, file: RpyFile): Promise<void> {
  await writeFile(path, Buffer.from(file.content, 'utf-8'))
}

async function saveTableWithAudioRenames(xlsxPath: string, changes: TableChange[]): Promise<void> {
  if (changes.length === 0) return
  const before = await planJobs(xlsxPath)
  await saveTableChanges(xlsxPath, changes)
  const after = await planJobs(xlsxPath)
  const plan = planTtsAudioRenames(before, after)
  await applyWorkspaceAudioRenames(xlsxPath, plan)
  await queueAudioRenamesForProject(xlsxPath, plan)
}

function ensureRpyPath(path: string): string {
  return extname(path).toLowerCase() === '.rpy' ? path : `${path}.rpy`
}

function xlsxFileName(path: string): string {
  const stem = basename(path, extname(path)).replace(/[\\/:*?"<>|]/g, '_').trim() || 'table'
  return `${stem}.xlsx`
}

function ensureXlsxPath(path: string): string {
  return extname(path).toLowerCase() === '.xlsx' ? path : `${path}.xlsx`
}

function createWindow(): void {
  const iconPath = runtimeIconPath()
  const hasIcon = existsSync(iconPath)
  if (process.platform === 'darwin' && hasIcon) app.dock.setIcon(iconPath)

  const win = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    title: 'Excel2Rpy',
    icon: hasIcon ? iconPath : undefined,
    backgroundColor: '#f4f6fb',
    show: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      additionalArguments: [
        ...(process.env['E2R_DEMO'] ? [`--e2r-demo=${process.env['E2R_DEMO']}`] : []),
        ...(process.env['E2R_PAGE'] ? [`--e2r-page=${process.env['E2R_PAGE']}`] : []),
        ...(process.env['E2R_PROJECT'] ? [`--e2r-project=${process.env['E2R_PROJECT']}`] : []),
        ...(process.env['E2R_UNLINK'] ? ['--e2r-unlink'] : []),
      ],
    },
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:openXlsx', async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Excel', extensions: ['xlsx', 'xls'] },
        { name: 'All', extensions: ['*'] },
      ],
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  ipcMain.handle('dialog:selectDir', async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  // 导入表格：在 workspace 建同名文件夹 + 复制副本，返回副本路径（后续读写都用副本）
  ipcMain.handle('workspace:import', async (_e, originalPath: string): Promise<WorkspaceImportResult> => {
    try {
      const info = await importWorkbook(originalPath)
      currentWorkspaceDir = info.dir
      return { ok: true, dir: info.dir, copyPath: info.copyPath }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })

  ipcMain.handle('workspace:assets', async (_e, xlsxPath: string): Promise<WorkspaceAssetsResult> => {
    try {
      const workspaceDir = rememberWorkspaceForWorkbook(xlsxPath)
      return { ok: true, assets: await scanWorkspaceAssets(workspaceDir) }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })

  // 角色配置「绑定语音」：选参考音频文件
  ipcMain.handle('dialog:openAudio', async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '音频', extensions: AUDIO_EXTS }],
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  ipcMain.handle('shell:openExternal', (_e, url: string): void => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('update:check', (): ReturnType<typeof checkForUpdates> => checkForUpdates())

  // 全局角色配置（单一来源；内置远端角色由主进程叠加并锁定）
  ipcMain.handle('tts:characters', (): Promise<TtsConfig> => loadCharacters())
  ipcMain.handle('tts:saveCharacters', async (_e, config: TtsConfig): Promise<SaveResult> => {
    try {
      await saveCharacters(config)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })

  ipcMain.handle('preview', (_e, args: PreviewArgs): Promise<PreviewResult> =>
    previewWorkbook(args),
  )
  ipcMain.handle('convert', (_e, args: ConvertArgs): Promise<ConvertResult> =>
    convertWorkbook(args),
  )
  ipcMain.handle('rpy:export', async (_e, file: RpyFile): Promise<RpyFileWriteResult> => {
    try {
      const r = await dialog.showSaveDialog({
        defaultPath: rpyFileName(file.label),
        filters: [{ name: 'Ren’Py 脚本', extensions: ['rpy'] }],
      })
      if (r.canceled || !r.filePath) return { ok: false, error: '' }
      const target = ensureRpyPath(r.filePath)
      await writeRpyFile(target, file)
      return { ok: true, path: target }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })
  ipcMain.handle(
    'rpy:apply',
    async (_e, file: RpyFile, xlsxPath?: string, sheetName?: string): Promise<RpyFileWriteResult> => {
      try {
        if (!linkedGamePath) return { ok: false, error: '未关联 Ren’Py 工程' }
        const target = join(linkedGamePath, rpyFileName(file.label))
        await writeRpyFile(target, file)
        if (xlsxPath && sheetName) {
          await applyProjectAudioRenamesForSheet(xlsxPath, sheetName, gameAudioDir())
        }
        return { ok: true, path: target }
      } catch (e) {
        return { ok: false, error: errMsg(e) }
      }
    },
  )
  ipcMain.handle('format:validate', (_e, xlsxPath: string): Promise<FormatResult> =>
    validateFormat(xlsxPath),
  )
  ipcMain.handle('table:read', async (_e, xlsxPath: string): Promise<TableResult> => {
    try {
      rememberWorkspaceForWorkbook(xlsxPath)
      const data = await readTable(xlsxPath)
      return { ok: true, ...data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle(
    'table:save',
    async (_e, xlsxPath: string, changes: TableChange[]): Promise<SaveResult> => {
      try {
        await saveTableWithAudioRenames(xlsxPath, changes)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )
  ipcMain.handle(
    'table:saveAs',
    async (_e, xlsxPath: string, changes: TableChange[]): Promise<SaveAsResult> => {
      try {
        const r = await dialog.showSaveDialog({
          defaultPath: xlsxFileName(xlsxPath),
          filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
        })
        if (r.canceled || !r.filePath) return { ok: false, error: '' }
        const target = ensureXlsxPath(r.filePath)
        await saveTableWithAudioRenames(xlsxPath, changes)
        if (target !== xlsxPath) await copyFile(xlsxPath, target)
        return { ok: true, path: target }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )
  ipcMain.handle('check', async (_e, xlsxPath: string): Promise<CheckResult> => {
    try {
      const { sheets } = await readWorkbook(xlsxPath)
      const issues = checkSheets(
        sheets,
        linkedTransforms.length ? { knownPositions: linkedTransforms } : {},
      )
      return { ok: true, issues, summary: summarize(issues) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('diff', async (_e, oldPath: string, newPath: string): Promise<DiffResult> => {
    try {
      const [o, n] = await Promise.all([readTable(oldPath), readTable(newPath)])
      return { ok: true, report: diffWorkbooks(o, n) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('project:link', async (_e, dir: string): Promise<ProjectResult> => {
    try {
      const gamePath = resolveGamePath(dir)
      const index = await scanRenpyAssets(gamePath)
      linkedGamePath = gamePath
      linkedTransforms = index.transforms
      return { ok: true, ...index }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('project:clear', (): void => {
    linkedGamePath = null
    linkedTransforms = []
  })

  // 从表格导入/替换资源：始终复制到当前工作簿 workspace；
  // 若已关联工程，再同步复制到 game/images|audio。单元格值来自导入文件名，重名自动追加 -2/-3。
  ipcMain.handle(
    'asset:import',
    async (_e, kind: WsType, _currentValue: string, xlsxPath: string): Promise<AssetImportResult> => {
      try {
        if (!xlsxPath) return { ok: false, error: '未选择工作簿' }
        const isAudio = kind === 'music' || kind === 'sound'
        const filters = isAudio
          ? [{ name: '音频', extensions: AUDIO_EXTS }]
          : [{ name: '图片', extensions: IMAGE_EXTS }]
        const r = await dialog.showOpenDialog({ properties: ['openFile'], filters })
        const src = r.canceled ? null : r.filePaths[0]
        if (!src) return { ok: false, error: '' } // 取消
        const workspaceDir = rememberWorkspaceForWorkbook(xlsxPath)
        const workspaceTargetDir = workspaceSub(workspaceDir, kind)
        const projectSub = isAudio ? 'audio' : 'images'
        const projectTargetDir = linkedGamePath ? join(linkedGamePath, projectSub) : null
        await mkdir(workspaceTargetDir, { recursive: true })
        if (projectTargetDir) await mkdir(projectTargetDir, { recursive: true })
        const fileName = uniqueAssetFilenameAcross(
          [workspaceTargetDir, ...(projectTargetDir ? [projectTargetDir] : [])],
          basename(src),
        )
        await copyFile(src, join(workspaceTargetDir, fileName))
        let project: Awaited<ReturnType<typeof scanRenpyAssets>> | null = null
        if (projectTargetDir && linkedGamePath) {
          await copyFile(src, join(projectTargetDir, fileName))
          project = await scanRenpyAssets(linkedGamePath)
          linkedTransforms = project.transforms
        }
        const workspace = await scanWorkspaceAssets(workspaceDir)
        return {
          ok: true,
          value: importCellValue(kind, fileName),
          rel: `${kind}/${fileName}`,
          workspace,
          project,
        }
      } catch (e) {
        return { ok: false, error: errMsg(e) }
      }
    },
  )

  // ---- TTS ----
  // 当前表的语音目录：pending（临时/已生成，放系统临时区）+ voice（已应用，workspace/<表>/voice）。
  // workspaceDir = 工作簿副本所在目录（dirname）。
  const ttsDirsFor = (xlsxPath: string): { pending: string; voice: string } => {
    const ws = rememberWorkspaceForWorkbook(xlsxPath)
    const pending = pendingDirFor(ws)
    const voice = workspaceSub(ws, 'voice')
    currentPendingDir = pending
    currentVoiceDir = voice
    return { pending, voice }
  }
  const gameAudioDir = (): string | null => (linkedGamePath ? join(linkedGamePath, 'audio') : null)

  ipcMain.handle('tts:health', (_e, baseUrl: string): Promise<TtsHealth> => ttsHealth(baseUrl))
  ipcMain.handle('tts:engineStart', (e): Promise<EngineStartResult> =>
    engineStart((line) => e.sender.send('tts:engineLog', line)),
  )
  ipcMain.handle('tts:engineStop', (): void => engineStop())
  ipcMain.handle('tts:engineStatus', (): EngineStatus => engineStatus())
  ipcMain.handle('tts:jobs', async (_e, args: TtsJobsArgs): Promise<TtsJobsResult> => {
    try {
      const cfg = await loadCharacters()
      const { pending, voice } = ttsDirsFor(args.xlsxPath)
      const jobs = await enrichedJobs(args.xlsxPath, cfg, args.textLang, pending, voice, gameAudioDir())
      return { ok: true, jobs, audioDir: pending }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })
  // 应用（打对号）：把已生成语音落实到 workspace/<表>/voice（+ 关联工程 game/audio）
  ipcMain.handle('tts:apply', async (_e, args: TtsApplyArgs): Promise<TtsApplyResult> => {
    try {
      const { pending, voice } = ttsDirsFor(args.xlsxPath)
      const { applied } = await applyVoices(args.outputNames, pending, voice, gameAudioDir())
      return { ok: true, applied }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })
  ipcMain.handle('tts:synthesize', async (e, args: TtsSynthArgs): Promise<TtsSynthSummary> => {
    try {
      const cfg = await loadCharacters()
      let jobs = await planJobs(args.xlsxPath)
      if (args.only) {
        const set = new Set(args.only)
        jobs = jobs.filter((j) => set.has(j.outputName))
      }
      // 按角色排序：连续同角色跳过切权重（远端大幅提速；内嵌不切权重，排序无副作用）。
      jobs = [...jobs].sort((a, b) => a.roleName.localeCompare(b.roleName))
      // 合成只写入 pending（临时、可试听）；落实到 workspace/工程需用户「打对号」应用
      const audioDir = ttsDirsFor(args.xlsxPath).pending
      let done = 0
      let failed = 0
      let lastRole: string | null = null
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]!
        e.sender.send('tts:progress', {
          outputName: job.outputName,
          index: i,
          total: jobs.length,
          status: 'running',
        })
        try {
          await synthOne(job, {
            cfg,
            audioDir,
            textLang: args.textLang,
            promptLang: args.promptLang,
            skipSwitch: job.roleName === lastRole,
            ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
          })
          lastRole = job.roleName
          done++
          e.sender.send('tts:progress', {
            outputName: job.outputName,
            index: i,
            total: jobs.length,
            status: 'done',
          })
        } catch (err) {
          failed++
          e.sender.send('tts:progress', {
            outputName: job.outputName,
            index: i,
            total: jobs.length,
            status: 'error',
            error: errMsg(err),
          })
        }
      }
      return { ok: failed === 0, done, failed }
    } catch (e2) {
      return { ok: false, done: 0, failed: 0, error: errMsg(e2) }
    }
  })
}

void app.whenReady().then(() => {
  protocol.handle('asset', (request) => {
    try {
      const url = new URL(request.url)
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      let abs: string | null = null
      if (rel.startsWith('audio/')) {
        // 语音/音频试听：依次在 pending(已生成) → voice(已应用) → 关联工程 → workspace 中查找
        const name = rel.slice('audio/'.length)
        const candidates = [
          currentPendingDir,
          currentVoiceDir,
          linkedGamePath ? join(linkedGamePath, 'audio') : null,
        ]
        for (const d of candidates) {
          if (!d) continue
          const p = resolveAssetTarget(`audio/${name}`, null, d)
          if (p && existsSync(p)) {
            abs = p
            break
          }
        }
        if (!abs && linkedGamePath) abs = resolveAssetTarget(rel, linkedGamePath, null)
        if (!abs && currentWorkspaceDir) abs = resolveAssetTarget(rel, currentWorkspaceDir, null)
      } else {
        if (linkedGamePath) abs = resolveAssetTarget(rel, linkedGamePath, null)
        if (!abs && currentWorkspaceDir) abs = resolveAssetTarget(rel, currentWorkspaceDir, null)
      }
      if (!abs) return new Response('not found', { status: 404 })
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('error', { status: 500 })
    }
  })
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => engineStop())
app.on('window-all-closed', () => {
  engineStop()
  if (process.platform !== 'darwin') app.quit()
})
