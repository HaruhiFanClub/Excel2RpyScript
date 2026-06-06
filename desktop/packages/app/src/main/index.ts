import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  readTable,
  saveTableEdits,
  readWorkbook,
  checkSheets,
  summarize,
  scanRenpyAssets,
  resolveGamePath,
  diffWorkbooks,
  type CellEdit,
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
} from '../shared/ipc'

// asset:// 协议：把关联工程 game/ 下的文件喂给渲染进程（图片/音频预览）
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

let linkedGamePath: string | null = null

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
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 22 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      additionalArguments: [
        ...(process.env['E2R_DEMO'] ? [`--e2r-demo=${process.env['E2R_DEMO']}`] : []),
        ...(process.env['E2R_PAGE'] ? [`--e2r-page=${process.env['E2R_PAGE']}`] : []),
        ...(process.env['E2R_PROJECT'] ? [`--e2r-project=${process.env['E2R_PROJECT']}`] : []),
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

  ipcMain.handle('preview', (_e, args: PreviewArgs): Promise<PreviewResult> =>
    previewWorkbook(args),
  )
  ipcMain.handle('convert', (_e, args: ConvertArgs): Promise<ConvertResult> =>
    convertWorkbook(args),
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
      const issues = checkSheets(sheets)
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
      return { ok: true, ...index }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

void app.whenReady().then(() => {
  protocol.handle('asset', (request) => {
    if (!linkedGamePath) return new Response('no project', { status: 404 })
    try {
      const url = new URL(request.url)
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const root = normalize(linkedGamePath)
      const abs = normalize(join(root, rel))
      if (abs !== root && !abs.startsWith(root + (root.endsWith('/') ? '' : '/'))) {
        return new Response('forbidden', { status: 403 })
      }
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
