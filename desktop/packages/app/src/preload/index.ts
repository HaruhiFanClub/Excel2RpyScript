import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  CellEdit,
  ConvertArgs,
  ConvertResult,
  E2rApi,
  PreviewArgs,
  PreviewResult,
  SaveResult,
  TableResult,
} from '../shared/ipc'

const demoArg = process.argv.find((a) => a.startsWith('--e2r-demo='))
const pageArg = process.argv.find((a) => a.startsWith('--e2r-page='))

const api: E2rApi = {
  openXlsx: () => ipcRenderer.invoke('dialog:openXlsx'),
  selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
  preview: (args: PreviewArgs): Promise<PreviewResult> => ipcRenderer.invoke('preview', args),
  convert: (args: ConvertArgs): Promise<ConvertResult> => ipcRenderer.invoke('convert', args),
  readTable: (xlsxPath: string): Promise<TableResult> => ipcRenderer.invoke('table:read', xlsxPath),
  saveTable: (xlsxPath: string, edits: CellEdit[]): Promise<SaveResult> =>
    ipcRenderer.invoke('table:save', xlsxPath, edits),
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  demoFile: demoArg ? demoArg.slice('--e2r-demo='.length) : null,
  demoPage: pageArg ? pageArg.slice('--e2r-page='.length) : null,
}

contextBridge.exposeInMainWorld('e2r', api)
