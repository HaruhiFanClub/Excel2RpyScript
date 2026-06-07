import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AssetIndex, PreviewData } from '../../shared/ipc'

let convertSeq = 0
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface SheetChangeState {
  workbookPath: string
  sheets: Record<string, number>
}

interface WorkspaceState {
  workbookPath: string // 当前活动工作簿 = workspace 里的副本（原表只作为导入种子，永不被改）
  workspaceDir: string // 当前表格的 workspace 文件夹（副本所在目录）
  outputDir: string
  convertResult: PreviewData | null
  convertWorkbookPath: string
  converting: boolean
  convertError: string | null
  sheetChanges: SheetChangeState // 已保存到表格、但尚未应用到关联工程的 sheet
  assets: AssetIndex | null // 关联的 Ren'Py 工程资源索引（不持久化，启动时按 renpyDir 重扫）
  renpyDir: string // 关联工程时用户选择的目录（持久化，用于重开时重新关联）
  currentProjectPath: string | null // 当前 .e2rproj 工程文件
  setWorkbookPath: (p: string) => void
  importWorkbook: (originalPath: string) => Promise<void> // 导入原表 → 建副本 → 切到副本
  setOutputDir: (p: string) => void
  setConvertResult: (result: PreviewData, workbookPath: string) => void
  clearConvertResult: () => void
  runConvert: (workbookPath?: string) => Promise<PreviewData | null>
  markSheetChanges: (sheetNames: string[], workbookPath?: string) => void
  clearSheetChanges: (sheetNames?: string[], workbookPath?: string) => void
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
      convertResult: null,
      convertWorkbookPath: '',
      converting: false,
      convertError: null,
      sheetChanges: { workbookPath: '', sheets: {} },
      assets: null,
      renpyDir: '',
      currentProjectPath: null,
      setWorkbookPath: (workbookPath) => {
        set({
          workbookPath,
          convertResult: null,
          convertWorkbookPath: '',
          convertError: null,
          sheetChanges: { workbookPath, sheets: {} },
        })
        if (workbookPath) void get().runConvert(workbookPath)
      },
      importWorkbook: async (originalPath) => {
        if (!originalPath) {
          set({
            workbookPath: '',
            workspaceDir: '',
            convertResult: null,
            convertWorkbookPath: '',
            converting: false,
            convertError: null,
            sheetChanges: { workbookPath: '', sheets: {} },
          })
          return
        }
        const r = await window.e2r.workspaceImport(originalPath)
        if (r.ok) {
          set({
            workbookPath: r.copyPath,
            workspaceDir: r.dir,
            convertResult: null,
            convertWorkbookPath: '',
            convertError: null,
            sheetChanges: { workbookPath: r.copyPath, sheets: {} },
          })
          void get().runConvert(r.copyPath)
        } else {
          // 兜底：导入失败仍可用原表
          set({
            workbookPath: originalPath,
            convertResult: null,
            convertWorkbookPath: '',
            convertError: null,
            sheetChanges: { workbookPath: originalPath, sheets: {} },
          })
          void get().runConvert(originalPath)
        }
      },
      setOutputDir: (outputDir) => set({ outputDir }),
      setConvertResult: (convertResult, convertWorkbookPath) =>
        set({ convertResult, convertWorkbookPath, convertError: null }),
      clearConvertResult: () =>
        set({ convertResult: null, convertWorkbookPath: '', convertError: null }),
      runConvert: async (workbookPath) => {
        const s = get()
        const targetWorkbook = workbookPath ?? s.workbookPath
        if (!targetWorkbook) return null
        const seq = ++convertSeq
        set({ converting: true, convertError: null })
        try {
          const r = await window.e2r.convert({ xlsxPath: targetWorkbook })
          if (seq !== convertSeq) return null
          const current = get()
          if (current.workbookPath !== targetWorkbook) return null
          if (!r.ok) {
            set({
              convertResult: null,
              convertWorkbookPath: '',
              convertError: r.error,
            })
            return null
          }
          const next = {
            sheetNames: r.sheetNames,
            files: r.files,
            warnings: r.warnings,
            readWarningCount: r.readWarningCount,
          }
          set({
            convertResult: next,
            convertWorkbookPath: targetWorkbook,
            convertError: null,
          })
          return next
        } catch (e) {
          if (seq === convertSeq) {
            set({
              convertResult: null,
              convertWorkbookPath: '',
              convertError: errMsg(e),
            })
          }
          return null
        } finally {
          if (seq === convertSeq) set({ converting: false })
        }
      },
      markSheetChanges: (sheetNames, workbookPath) => {
        const before = get()
        const targetWorkbook = workbookPath ?? before.workbookPath
        set((state) => {
          const base =
            state.sheetChanges.workbookPath === targetWorkbook ? state.sheetChanges.sheets : {}
          const next = { ...base }
          const now = Date.now()
          for (const name of sheetNames) if (name) next[name] = now
          return { sheetChanges: { workbookPath: targetWorkbook, sheets: next } }
        })
        if (targetWorkbook && targetWorkbook === get().workbookPath) void get().runConvert(targetWorkbook)
      },
      clearSheetChanges: (sheetNames, workbookPath) =>
        set((state) => {
          const targetWorkbook = workbookPath ?? state.workbookPath
          if (state.sheetChanges.workbookPath !== targetWorkbook) {
            return { sheetChanges: { workbookPath: targetWorkbook, sheets: {} } }
          }
          if (!sheetNames) return { sheetChanges: { workbookPath: targetWorkbook, sheets: {} } }
          const next = { ...state.sheetChanges.sheets }
          for (const name of sheetNames) delete next[name]
          return { sheetChanges: { workbookPath: targetWorkbook, sheets: next } }
        }),
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
          convertResult: null,
          convertWorkbookPath: '',
          convertError: null,
          sheetChanges: { workbookPath: m.workbook, sheets: {} },
          currentProjectPath: path,
          assets: null,
          renpyDir: '',
        })
        void get().runConvert(m.workbook)
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
        renpyDir: s.renpyDir,
        currentProjectPath: s.currentProjectPath,
      }),
    },
  ),
)
