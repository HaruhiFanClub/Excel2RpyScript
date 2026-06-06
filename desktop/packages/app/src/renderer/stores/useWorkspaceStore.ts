import { create } from 'zustand'
import type { ConversionMode } from '@e2r/core'
import type { AssetIndex } from '../../shared/ipc'

interface WorkspaceState {
  workbookPath: string
  outputDir: string
  mode: ConversionMode
  assets: AssetIndex | null // 关联的 Ren'Py 工程资源索引
  ttsConfigPath: string // TTS 预设 config.json 路径
  currentProjectPath: string | null // 当前 .e2rproj 工程文件
  setWorkbookPath: (p: string) => void
  setOutputDir: (p: string) => void
  setMode: (m: ConversionMode) => void
  setTtsConfigPath: (p: string) => void
  linkProject: (dir: string) => Promise<{ ok: boolean; error?: string }>
  clearProject: () => void
  openProjectFile: () => Promise<void>
  saveProjectFile: (saveAs?: boolean) => Promise<boolean>
}

// 转换页 / 表格页 / 检查页共享当前工作簿与关联工程
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workbookPath: '',
  outputDir: '',
  mode: 'default',
  assets: null,
  ttsConfigPath: '',
  currentProjectPath: null,
  setWorkbookPath: (workbookPath) => set({ workbookPath }),
  setOutputDir: (outputDir) => set({ outputDir }),
  setMode: (mode) => set({ mode }),
  setTtsConfigPath: (ttsConfigPath) => set({ ttsConfigPath }),
  linkProject: async (dir) => {
    const r = await window.e2r.linkProject(dir)
    if (r.ok) {
      set({
        assets: {
          gamePath: r.gamePath,
          images: r.images,
          audio: r.audio,
          transforms: r.transforms,
        },
      })
      return { ok: true }
    }
    return { ok: false, error: r.error }
  },
  clearProject: () => set({ assets: null }),
  openProjectFile: async () => {
    const path = await window.e2r.openProjectDialog()
    if (!path) return
    const r = await window.e2r.readProject(path)
    if (!r.ok) return
    const m = r.manifest
    set({
      workbookPath: m.workbook,
      mode: m.mode,
      ttsConfigPath: m.ttsConfig ?? '',
      currentProjectPath: path,
      assets: null,
    })
    if (m.renpyProject) await get().linkProject(m.renpyProject)
  },
  saveProjectFile: async (saveAs) => {
    const s = get()
    let path = s.currentProjectPath
    if (saveAs || !path) {
      const p = await window.e2r.saveProjectDialog('project.e2rproj')
      if (!p) return false
      path = p
    }
    const manifest = {
      version: 1 as const,
      workbook: s.workbookPath,
      ...(s.assets ? { renpyProject: s.assets.gamePath } : {}),
      ...(s.ttsConfigPath ? { ttsConfig: s.ttsConfigPath } : {}),
      mode: s.mode,
    }
    const r = await window.e2r.writeProject(path, manifest)
    if (r.ok) set({ currentProjectPath: path })
    return r.ok
  },
}))
