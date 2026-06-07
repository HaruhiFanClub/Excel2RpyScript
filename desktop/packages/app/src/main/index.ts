import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron'
import { join, dirname, basename, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile, mkdir, copyFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { ttsHealth, planJobs, synthOne, enrichedJobs, applyVoices } from './tts'
import { loadCharacters, saveCharacters } from './characters'
import { importWorkbook, pendingDirFor, workspaceSub, type WsType } from './workspace'
import { engineStart, engineStop, engineStatus } from './ttsServer'
import { validateFormat } from './format'
import {
  readTable,
  saveTableEdits,
  readWorkbook,
  checkSheets,
  summarize,
  scanRenpyAssets,
  resolveGamePath,
  IMAGE_EXTS,
  AUDIO_EXTS,
  diffWorkbooks,
  resolveAssetTarget,
  runPipeline,
  writeRpyFiles,
  type CellEdit,
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
  AssetImportResult,
  DiffResult,
  TtsHealth,
  TtsJobsArgs,
  TtsJobsResult,
  TtsApplyArgs,
  TtsApplyResult,
  TtsSynthArgs,
  TtsSynthSummary,
  DeployArgs,
  DeployResult,
  EngineStartResult,
  EngineStatus,
  FormatResult,
  ProjectManifest,
  ProjectReadResult,
  RpyFile,
  RpyFileWriteResult,
  WorkspaceImportResult,
} from '../shared/ipc'
import { readFile } from 'node:fs/promises'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// asset:// 协议：把关联工程 game/ 下的文件喂给渲染进程（图片/音频预览）
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

let linkedGamePath: string | null = null
let linkedTransforms: string[] = []
let currentPendingDir: string | null = null // 当前表的临时语音目录（已生成、可试听）
let currentVoiceDir: string | null = null // 当前表的已应用语音目录（workspace/<表>/voice）

const runtimeIconPath = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png')

function uniqueAssetFilename(dir: string, original: string): string {
  const ext = extname(original)
  const stem = basename(original, ext)
  let candidate = original
  let i = 2
  while (existsSync(join(dir, candidate))) {
    candidate = `${stem}-${i}${ext}`
    i += 1
  }
  return candidate
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
      return { ok: true, dir: info.dir, copyPath: info.copyPath }
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

  ipcMain.handle('dialog:openProject', async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel2Rpy 工程', extensions: ['e2rproj'] }],
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('dialog:saveProject', async (_e, defaultName?: string): Promise<string | null> => {
    const r = await dialog.showSaveDialog({
      defaultPath: defaultName ?? 'project.e2rproj',
      filters: [{ name: 'Excel2Rpy 工程', extensions: ['e2rproj'] }],
    })
    return r.canceled ? null : (r.filePath ?? null)
  })
  ipcMain.handle('project:read', async (_e, path: string): Promise<ProjectReadResult> => {
    try {
      const manifest = JSON.parse(await readFile(path, 'utf-8')) as ProjectManifest
      return { ok: true, manifest }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })
  ipcMain.handle(
    'project:write',
    async (_e, path: string, manifest: ProjectManifest): Promise<SaveResult> => {
      try {
        await writeFile(path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errMsg(e) }
      }
    },
  )

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
  ipcMain.handle('rpy:apply', async (_e, file: RpyFile): Promise<RpyFileWriteResult> => {
    try {
      if (!linkedGamePath) return { ok: false, error: '未关联 Ren’Py 工程' }
      const target = join(linkedGamePath, rpyFileName(file.label))
      await writeRpyFile(target, file)
      return { ok: true, path: target }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })
  ipcMain.handle('format:validate', (_e, xlsxPath: string): Promise<FormatResult> =>
    validateFormat(xlsxPath),
  )
  ipcMain.handle('table:read', async (_e, xlsxPath: string): Promise<TableResult> => {
    try {
      const data = await readTable(xlsxPath)
      return { ok: true, ...data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle(
    'table:save',
    async (_e, xlsxPath: string, edits: CellEdit[]): Promise<SaveResult> => {
      try {
        await saveTableEdits(xlsxPath, edits)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )
  ipcMain.handle(
    'table:saveAs',
    async (_e, xlsxPath: string, edits: CellEdit[]): Promise<SaveAsResult> => {
      try {
        const r = await dialog.showSaveDialog({
          defaultPath: xlsxFileName(xlsxPath),
          filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
        })
        if (r.canceled || !r.filePath) return { ok: false, error: '' }
        const target = ensureXlsxPath(r.filePath)
        await saveTableEdits(xlsxPath, edits)
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

  // 从表格导入/替换资源：必须有关联工程，直接复制到 game/images|audio。
  // 单元格值来自导入文件名；重名文件自动追加 -2/-3，避免覆盖已有素材。
  ipcMain.handle(
    'asset:import',
    async (_e, kind: WsType, _currentValue: string, _xlsxPath: string): Promise<AssetImportResult> => {
      try {
        if (!linkedGamePath) return { ok: false, error: '未关联 Ren’Py 工程' }
        const isAudio = kind === 'music' || kind === 'sound'
        const filters = isAudio
          ? [{ name: '音频', extensions: AUDIO_EXTS }]
          : [{ name: '图片', extensions: IMAGE_EXTS }]
        const r = await dialog.showOpenDialog({ properties: ['openFile'], filters })
        const src = r.canceled ? null : r.filePaths[0]
        if (!src) return { ok: false, error: '' } // 取消
        const sub = isAudio ? 'audio' : 'images'
        const targetDir = join(linkedGamePath, sub)
        await mkdir(targetDir, { recursive: true })
        const fileName = uniqueAssetFilename(targetDir, basename(src))
        await copyFile(src, join(targetDir, fileName))
        const index = await scanRenpyAssets(linkedGamePath)
        linkedTransforms = index.transforms
        return {
          ok: true,
          value: importCellValue(kind, fileName),
          rel: `${sub}/${fileName}`,
          index,
        }
      } catch (e) {
        return { ok: false, error: errMsg(e) }
      }
    },
  )

  // ---- 部署到 Ren'Py ----
  ipcMain.handle('project:deploy', async (_e, args: DeployArgs): Promise<DeployResult> => {
    try {
      if (!linkedGamePath) return { ok: false, error: '未关联 Ren’Py 工程' }
      const { sheets } = await readWorkbook(args.xlsxPath)
      const written: string[] = []
      if (args.scripts) {
        const { files } = runPipeline(sheets, {
          mode: 'default',
          normalizeMode: true,
          trimRoleNames: true,
        })
        await writeRpyFiles(linkedGamePath, files)
        written.push(...files.map((f) => `${f.label}.rpy`))
      }
      if (args.enableVoice) {
        await writeFile(
          join(linkedGamePath, 'e2r_config.rpy'),
          '# 由 Excel2Rpy 生成：启用语音\ndefine config.has_voice = True\n',
        )
        written.push('e2r_config.rpy')
      }
      return { ok: true, gamePath: linkedGamePath, written }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })

  // ---- TTS ----
  // 当前表的语音目录：pending（临时/已生成，放系统临时区）+ voice（已应用，workspace/<表>/voice）。
  // workspaceDir = 工作簿副本所在目录（dirname）。
  const ttsDirsFor = (xlsxPath: string): { pending: string; voice: string } => {
    const ws = dirname(xlsxPath)
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
      const jobs = await enrichedJobs(args.xlsxPath, cfg, args.textLang, pending, voice)
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
        // 语音/音频试听：依次在 pending(已生成) → voice(已应用) → 关联工程 game/audio 中查找
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
      } else {
        abs = resolveAssetTarget(rel, linkedGamePath, null)
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
