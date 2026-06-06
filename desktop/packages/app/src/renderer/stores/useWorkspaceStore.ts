import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConversionMode } from '@e2r/core'
import type { AssetIndex, SpritePositions } from '../../shared/ipc'

interface WorkspaceState {
  workbookPath: string
  outputDir: string
  mode: ConversionMode
  assets: AssetIndex | null // 关联的 Ren'Py 工程资源索引（不持久化，启动时按 renpyDir 重扫）
  renpyDir: string // 关联工程时用户选择的目录（持久化，用于重开时重新关联）
  ttsConfigPath: string // TTS 预设 config.json 路径
  currentProjectPath: string | null // 当前 .e2rproj 工程文件
  spritePositions: SpritePositions // 每角色 左/中/右 自定义位置 token
  setWorkbookPath: (p: string) => void
  setOutputDir: (p: string) => void
  setMode: (m: ConversionMode) => void
  setTtsConfigPath: (p: string) => void
  setSpritePositions: (s: SpritePositions) => void
  linkProject: (dir: string) => Promise<{ ok: boolean; error?: string }>
  setAssets: (a: AssetIndex) => void
  clearProject: () => void
  openProjectFile: () => Promise<void>
  saveProjectFile: (saveAs?: boolean) => Promise<boolean>
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workbookPath: '',
      outputDir: '',
      mode: 'default',
      assets: null,
      renpyDir: '',
      ttsConfigPath: '',
      currentProjectPath: null,
      spritePositions: {},
      setWorkbookPath: (workbookPath) => set({ workbookPath }),
      setOutputDir: (outputDir) => set({ outputDir }),
      setMode: (mode) => set({ mode }),
      setTtsConfigPath: (ttsConfigPath) => set({ ttsConfigPath }),
      setSpritePositions: (spritePositions) => set({ spritePositions }),
      linkProject: async (dir) => {
        const r = await window.e2r.linkProject(dir)
        if (r.ok) {
          set({
            assets: { gamePath: r.gamePath, images: r.images, audio: r.audio, transforms: r.transforms },
            renpyDir: dir,
          })
          return { ok: true }
        }
        return { ok: false, error: r.error }
      },
      setAssets: (assets) => set({ assets }),
      clearProject: () => set({ assets: null, renpyDir: '' }),
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
          spritePositions: m.spritePositions ?? {},
          currentProjectPath: path,
          assets: null,
          renpyDir: '',
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
          ...(s.renpyDir ? { renpyProject: s.renpyDir } : {}),
          ...(s.ttsConfigPath ? { ttsConfig: s.ttsConfigPath } : {}),
          ...(Object.keys(s.spritePositions).length ? { spritePositions: s.spritePositions } : {}),
          mode: s.mode,
        }
        const r = await window.e2r.writeProject(path, manifest)
        if (r.ok) set({ currentProjectPath: path })
        return r.ok
      },
    }),
    {
      name: 'e2r-workspace',
      partialize: (s) => ({
        workbookPath: s.workbookPath,
        outputDir: s.outputDir,
        mode: s.mode,
        renpyDir: s.renpyDir,
        ttsConfigPath: s.ttsConfigPath,
        currentProjectPath: s.currentProjectPath,
        spritePositions: s.spritePositions,
      }),
    },
  ),
)
