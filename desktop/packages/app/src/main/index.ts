import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron'
import { join, dirname } from 'node:path'
import { writeFile, mkdir, copyFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveTtsConfig, ttsHealth, planJobs, synthOne, enrichedJobs } from './tts'
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
  parseLegacyTtsConfig,
  serializeTtsConfig,
  BUILTIN_PRESETS,
  resolveAssetTarget,
  runPipeline,
  writeRpyFiles,
  type CellEdit,
  type PipelineOptions,
  type TtsConfig,
} from '@e2r/core'
import { convertWorkbook, previewWorkbook } from './convert'
import type {
  ConvertArgs,
  ConvertResult,
  PreviewArgs,
  PreviewResult,
  TableResult,
  SaveResult,
  CheckResult,
  ProjectResult,
  DiffResult,
  TtsConfigResult,
  TtsHealth,
  TtsJobsArgs,
  TtsJobsResult,
  TtsSynthArgs,
  TtsSynthSummary,
  DeployArgs,
  DeployResult,
  EngineStartResult,
  EngineStatus,
  FormatResult,
  ProjectManifest,
  ProjectReadResult,
} from '../shared/ipc'
import { readFile } from 'node:fs/promises'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// asset:// 协议：把关联工程 game/ 下的文件喂给渲染进程（图片/音频预览）
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

let linkedGamePath: string | null = null
let linkedTransforms: string[] = []
let currentAudioDir: string | null = null // 当前 TTS 音频目录（关联=game/audio，未关联=表旁 audio）

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    title: 'Excel2Rpy',
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
        ...(process.env['E2R_TTSCONFIG'] ? [`--e2r-ttsconfig=${process.env['E2R_TTSCONFIG']}`] : []),
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

  ipcMain.handle('shell:openExternal', (_e, url: string): void => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('dialog:openJson', async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  ipcMain.handle('dialog:saveJson', async (_e, defaultName?: string): Promise<string | null> => {
    const r = await dialog.showSaveDialog({
      defaultPath: defaultName ?? 'config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    return r.canceled ? null : (r.filePath ?? null)
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

  ipcMain.handle(
    'tts:saveConfig',
    async (_e, path: string, config: TtsConfig): Promise<SaveResult> => {
      try {
        await writeFile(path, JSON.stringify(serializeTtsConfig(config), null, 2) + '\n', 'utf-8')
        return { ok: true }
      } catch (e) {
        return { ok: false, error: errMsg(e) }
      }
    },
  )

  ipcMain.handle('preview', (_e, args: PreviewArgs): Promise<PreviewResult> =>
    previewWorkbook(args),
  )
  ipcMain.handle('convert', (_e, args: ConvertArgs): Promise<ConvertResult> =>
    convertWorkbook(args),
  )
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

  // 从表格导入资源到关联工程（立绘/背景→images，音乐/音效→audio）
  ipcMain.handle(
    'asset:import',
    async (_e, category: 'image' | 'audio', name: string): Promise<ProjectResult> => {
      try {
        if (!linkedGamePath) return { ok: false, error: '未关联 Ren’Py 工程' }
        const filters =
          category === 'image'
            ? [{ name: '图片', extensions: IMAGE_EXTS }]
            : [{ name: '音频', extensions: AUDIO_EXTS }]
        const r = await dialog.showOpenDialog({ properties: ['openFile'], filters })
        const src = r.canceled ? null : r.filePaths[0]
        if (!src) return { ok: false, error: '' } // 取消
        const sub = category === 'image' ? 'images' : 'audio'
        const dest = join(linkedGamePath, sub, `${name}${extname(src)}`)
        await mkdir(join(linkedGamePath, sub), { recursive: true })
        await copyFile(src, dest)
        const index = await scanRenpyAssets(linkedGamePath)
        linkedTransforms = index.transforms
        return { ok: true, ...index }
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
      const opts: PipelineOptions =
        args.mode === 'default'
          ? { mode: 'default', normalizeMode: true, trimRoleNames: true }
          : { mode: 'legacy-compat' }
      const written: string[] = []
      if (args.scripts) {
        const { files } = runPipeline(sheets, opts)
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
  const audioDirFor = (xlsxPath: string): string => {
    const dir = linkedGamePath ? join(linkedGamePath, 'audio') : join(dirname(xlsxPath), 'audio')
    currentAudioDir = dir // 记录给 asset:// 试听（含未关联工程）
    return dir
  }

  ipcMain.handle('tts:loadConfig', async (_e, path: string): Promise<TtsConfigResult> => {
    try {
      return { ok: true, config: await resolveTtsConfig(path) }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })
  ipcMain.handle('tts:builtins', (): { id: string; name: string }[] =>
    BUILTIN_PRESETS.map((p) => ({ id: p.id, name: p.name })),
  )
  ipcMain.handle('tts:health', (_e, baseUrl: string): Promise<TtsHealth> => ttsHealth(baseUrl))
  ipcMain.handle('tts:engineStart', (e): Promise<EngineStartResult> =>
    engineStart((line) => e.sender.send('tts:engineLog', line)),
  )
  ipcMain.handle('tts:engineStop', (): void => engineStop())
  ipcMain.handle('tts:engineStatus', (): EngineStatus => engineStatus())
  ipcMain.handle('tts:jobs', async (_e, args: TtsJobsArgs): Promise<TtsJobsResult> => {
    try {
      const cfg = args.configPath ? await resolveTtsConfig(args.configPath) : parseLegacyTtsConfig({})
      const audioDir = audioDirFor(args.xlsxPath)
      const jobs = await enrichedJobs(args.xlsxPath, args.useVoiceText, cfg, args.textLang, audioDir)
      return { ok: true, jobs, audioDir }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })
  ipcMain.handle('tts:synthesize', async (e, args: TtsSynthArgs): Promise<TtsSynthSummary> => {
    try {
      const cfg = await resolveTtsConfig(args.configPath)
      let jobs = await planJobs(args.xlsxPath, args.useVoiceText)
      if (args.only) {
        const set = new Set(args.only)
        jobs = jobs.filter((j) => set.has(j.outputName))
      }
      // 远端模式：按角色排序，连续同角色跳过切权重（大幅提速）。内嵌不切权重，无需排序。
      if (cfg.serviceMode === 'remote') {
        jobs = [...jobs].sort((a, b) => a.roleName.localeCompare(b.roleName))
      }
      const audioDir = audioDirFor(args.xlsxPath)
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
      const abs = resolveAssetTarget(rel, linkedGamePath, currentAudioDir)
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
