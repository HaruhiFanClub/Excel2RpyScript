import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConversionMode } from '@e2r/core'
import type { AssetIndex, SpritePositions } from '../../shared/ipc'

interface WorkspaceState {
  workbookPath: string // 当前活动工作簿 = workspace 里的副本（原表只作为导入种子，永不被改）
  workspaceDir: string // 当前表格的 workspace 文件夹（副本所在目录）
  outputDir: string
  mode: ConversionMode
  assets: AssetIndex | null // 关联的 Ren'Py 工程资源索引（不持久化，启动时按 renpyDir 重扫）
  renpyDir: string // 关联工程时用户选择的目录（持久化，用于重开时重新关联）
  currentProjectPath: string | null // 当前 .e2rproj 工程文件
  spritePositions: SpritePositions // 每角色 左/中/右 自定义位置 token
  setWorkbookPath: (p: string) => void
  importWorkbook: (originalPath: string) => Promise<void> // 导入原表 → 建副本 → 切到副本
  setOutputDir: (p: string) => void
  setMode: (m: ConversionMode) => void
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
      workspaceDir: '',
      outputDir: '',
      mode: 'default',
      assets: null,
      renpyDir: '',
      currentProjectPath: null,
      spritePositions: {},
      setWorkbookPath: (workbookPath) => set({ workbookPath }),
      importWorkbook: async (originalPath) => {
        if (!originalPath) {
          set({ workbookPath: '', workspaceDir: '' })
          return
        }
        const r = await window.e2r.workspaceImport(originalPath)
        if (r.ok) set({ workbookPath: r.copyPath, workspaceDir: r.dir })
        else set({ workbookPath: originalPath }) // 兜底：导入失败仍可用原表
      },
      setOutputDir: (outputDir) => set({ outputDir }),
      setMode: (mode) => set({ mode }),
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
          workspaceDir: m.workbook.replace(/[\\/][^\\/]*$/, ''), // 副本所在目录
          mode: m.mode,
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
        workspaceDir: s.workspaceDir,
        outputDir: s.outputDir,
        mode: s.mode,
        renpyDir: s.renpyDir,
        currentProjectPath: s.currentProjectPath,
        spritePositions: s.spritePositions,
      }),
    },
  ),
)
