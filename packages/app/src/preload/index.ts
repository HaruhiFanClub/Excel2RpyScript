import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  TableChange,
  CheckResult,
  DiffResult,
  EngineStartResult,
  EngineStatus,
  FormatResult,
  ConvertArgs,
  ConvertResult,
  E2rApi,
  PreviewArgs,
  PreviewResult,
  RpyFile,
  RpyFileWriteResult,
  ProjectResult,
  AssetImportResult,
  WsAssetType,
  SaveAsResult,
  SaveResult,
  TableResult,
  TtsConfig,
  TtsHealth,
  UpdateCheckResult,
  TtsJobsArgs,
  TtsJobsResult,
  TtsApplyArgs,
  TtsApplyResult,
  TtsProgress,
  TtsSynthArgs,
  TtsSynthSummary,
} from '../shared/ipc'

const demoArg = process.argv.find((a) => a.startsWith('--e2r-demo='))
const pageArg = process.argv.find((a) => a.startsWith('--e2r-page='))
const projArg = process.argv.find((a) => a.startsWith('--e2r-project='))

const api: E2rApi = {
  openXlsx: () => ipcRenderer.invoke('dialog:openXlsx'),
  selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
  pickAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  workspaceImport: (originalPath: string) => ipcRenderer.invoke('workspace:import', originalPath),
  workspaceAssets: (xlsxPath: string) => ipcRenderer.invoke('workspace:assets', xlsxPath),
  openExternal: (url: string): void => {
    void ipcRenderer.invoke('shell:openExternal', url)
  },
  checkUpdates: (): Promise<UpdateCheckResult> => ipcRenderer.invoke('update:check'),
  preview: (args: PreviewArgs): Promise<PreviewResult> => ipcRenderer.invoke('preview', args),
  convert: (args: ConvertArgs): Promise<ConvertResult> => ipcRenderer.invoke('convert', args),
  exportRpyFile: (file: RpyFile): Promise<RpyFileWriteResult> => ipcRenderer.invoke('rpy:export', file),
  applyRpyFile: (file: RpyFile, xlsxPath?: string, sheetName?: string): Promise<RpyFileWriteResult> =>
    ipcRenderer.invoke('rpy:apply', file, xlsxPath, sheetName),
  validateFormat: (xlsxPath: string): Promise<FormatResult> =>
    ipcRenderer.invoke('format:validate', xlsxPath),
  readTable: (xlsxPath: string): Promise<TableResult> => ipcRenderer.invoke('table:read', xlsxPath),
  saveTable: (xlsxPath: string, changes: TableChange[]): Promise<SaveResult> =>
    ipcRenderer.invoke('table:save', xlsxPath, changes),
  saveTableAs: (xlsxPath: string, changes: TableChange[]): Promise<SaveAsResult> =>
    ipcRenderer.invoke('table:saveAs', xlsxPath, changes),
  check: (xlsxPath: string): Promise<CheckResult> => ipcRenderer.invoke('check', xlsxPath),
  diff: (oldPath: string, newPath: string): Promise<DiffResult> =>
    ipcRenderer.invoke('diff', oldPath, newPath),
  linkProject: (dir: string): Promise<ProjectResult> => ipcRenderer.invoke('project:link', dir),
  clearProject: (): Promise<void> => ipcRenderer.invoke('project:clear'),
  importAsset: (kind: WsAssetType, name: string, xlsxPath: string): Promise<AssetImportResult> =>
    ipcRenderer.invoke('asset:import', kind, name, xlsxPath),
  ttsCharacters: (): Promise<TtsConfig> => ipcRenderer.invoke('tts:characters'),
  ttsSaveCharacters: (config: TtsConfig): Promise<SaveResult> =>
    ipcRenderer.invoke('tts:saveCharacters', config),
  ttsHealth: (baseUrl: string): Promise<TtsHealth> => ipcRenderer.invoke('tts:health', baseUrl),
  ttsJobs: (args: TtsJobsArgs): Promise<TtsJobsResult> => ipcRenderer.invoke('tts:jobs', args),
  ttsApply: (args: TtsApplyArgs): Promise<TtsApplyResult> => ipcRenderer.invoke('tts:apply', args),
  ttsSynthesize: (args: TtsSynthArgs): Promise<TtsSynthSummary> =>
    ipcRenderer.invoke('tts:synthesize', args),
  onTtsProgress: (cb: (p: TtsProgress) => void): (() => void) => {
    const handler = (_e: unknown, p: TtsProgress) => cb(p)
    ipcRenderer.on('tts:progress', handler)
    return () => ipcRenderer.removeListener('tts:progress', handler)
  },
  ttsEngineStart: (): Promise<EngineStartResult> => ipcRenderer.invoke('tts:engineStart'),
  ttsEngineStop: (): Promise<void> => ipcRenderer.invoke('tts:engineStop'),
  ttsEngineStatus: (): Promise<EngineStatus> => ipcRenderer.invoke('tts:engineStatus'),
  onEngineLog: (cb: (line: string) => void): (() => void) => {
    const handler = (_e: unknown, line: string) => cb(line)
    ipcRenderer.on('tts:engineLog', handler)
    return () => ipcRenderer.removeListener('tts:engineLog', handler)
  },
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
  demoUnlink: process.argv.includes('--e2r-unlink'),
}

contextBridge.exposeInMainWorld('e2r', api)
