import { create } from 'zustand'
import type { ConversionMode } from '@e2r/core'

interface WorkspaceState {
  workbookPath: string
  outputDir: string
  mode: ConversionMode
  setWorkbookPath: (p: string) => void
  setOutputDir: (p: string) => void
  setMode: (m: ConversionMode) => void
}

// 转换页与表格页共享当前工作簿
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workbookPath: '',
  outputDir: '',
  mode: 'default',
  setWorkbookPath: (workbookPath) => set({ workbookPath }),
  setOutputDir: (outputDir) => set({ outputDir }),
  setMode: (mode) => set({ mode }),
}))
