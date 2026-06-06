import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { convertWorkbook, previewWorkbook } from './convert'
import type { ConvertArgs, ConvertResult, PreviewArgs, PreviewResult } from '../shared/ipc'

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
      additionalArguments: process.env['E2R_DEMO']
        ? [`--e2r-demo=${process.env['E2R_DEMO']}`]
        : [],
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
}

void app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
