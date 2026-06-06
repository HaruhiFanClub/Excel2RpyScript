import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ConvertArgs, ConvertResult, E2rApi, PreviewArgs, PreviewResult } from '../shared/ipc'

const demoArg = process.argv.find((a) => a.startsWith('--e2r-demo='))

const api: E2rApi = {
  openXlsx: () => ipcRenderer.invoke('dialog:openXlsx'),
  selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
  preview: (args: PreviewArgs): Promise<PreviewResult> => ipcRenderer.invoke('preview', args),
  convert: (args: ConvertArgs): Promise<ConvertResult> => ipcRenderer.invoke('convert', args),
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  demoFile: demoArg ? demoArg.slice('--e2r-demo='.length) : null,
}

contextBridge.exposeInMainWorld('e2r', api)
