import { create } from 'zustand'
import type { ConversionMode } from '@e2r/core'
import type { AssetIndex } from '../../shared/ipc'

interface WorkspaceState {
  workbookPath: string
  outputDir: string
  mode: ConversionMode
  assets: AssetIndex | null // 关联的 Ren'Py 工程资源索引
  ttsConfigPath: string // TTS 预设 config.json 路径
  setWorkbookPath: (p: string) => void
  setOutputDir: (p: string) => void
  setMode: (m: ConversionMode) => void
  setTtsConfigPath: (p: string) => void
  linkProject: (dir: string) => Promise<{ ok: boolean; error?: string }>
  clearProject: () => void
}

// 转换页 / 表格页 / 检查页共享当前工作簿与关联工程
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workbookPath: '',
  outputDir: '',
  mode: 'default',
  assets: null,
  ttsConfigPath: '',
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
}))
