import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  CellEdit,
  CheckResult,
  DiffResult,
  ConvertArgs,
  ConvertResult,
  E2rApi,
  PreviewArgs,
  PreviewResult,
  ProjectResult,
  SaveResult,
  TableResult,
} from '../shared/ipc'

const demoArg = process.argv.find((a) => a.startsWith('--e2r-demo='))
const pageArg = process.argv.find((a) => a.startsWith('--e2r-page='))
const projArg = process.argv.find((a) => a.startsWith('--e2r-project='))

const api: E2rApi = {
  openXlsx: () => ipcRenderer.invoke('dialog:openXlsx'),
  selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
  preview: (args: PreviewArgs): Promise<PreviewResult> => ipcRenderer.invoke('preview', args),
  convert: (args: ConvertArgs): Promise<ConvertResult> => ipcRenderer.invoke('convert', args),
  readTable: (xlsxPath: string): Promise<TableResult> => ipcRenderer.invoke('table:read', xlsxPath),
  saveTable: (xlsxPath: string, edits: CellEdit[]): Promise<SaveResult> =>
    ipcRenderer.invoke('table:save', xlsxPath, edits),
  check: (xlsxPath: string): Promise<CheckResult> => ipcRenderer.invoke('check', xlsxPath),
  diff: (oldPath: string, newPath: string): Promise<DiffResult> =>
    ipcRenderer.invoke('diff', oldPath, newPath),
  linkProject: (dir: string): Promise<ProjectResult> => ipcRenderer.invoke('project:link', dir),
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  demoFile: demoArg ? demoArg.slice('--e2r-demo='.length) : null,
  demoPage: pageArg ? pageArg.slice('--e2r-page='.length) : null,
  demoProject: projArg ? projArg.slice('--e2r-project='.length) : null,
}

contextBridge.exposeInMainWorld('e2r', api)
