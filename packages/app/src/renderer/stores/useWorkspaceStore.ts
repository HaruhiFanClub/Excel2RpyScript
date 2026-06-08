import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TABLE_COLUMNS, type TableData } from '@e2r/core/table'
import type { AssetIndex, AssetMaps, CellEdit, PreviewData, TableRowOperation } from '../../shared/ipc'

let convertSeq = 0
let tableReadSeq = 0
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
  tableData: TableData | null
  tableDataRevision: number
  tableWorkbookPath: string
  tableLoading: boolean
  tableError: string | null
  sheetChanges: SheetChangeState // 已保存到表格、但尚未应用到关联工程的 sheet
  workspaceAssets: AssetMaps | null // 当前工作簿 workspace 内已导入的图片/音频资源
  workspaceAssetsWorkbookPath: string
  assets: AssetIndex | null // 关联的 Ren'Py 工程资源索引（不持久化，启动时按 renpyDir 重扫）
  renpyDir: string // 关联工程时用户选择的目录（持久化，用于重开时重新关联）
  setWorkbookPath: (p: string) => void
  importWorkbook: (originalPath: string) => Promise<void> // 导入原表 → 建副本 → 切到副本
  setOutputDir: (p: string) => void
  setConvertResult: (result: PreviewData, workbookPath: string) => void
  clearConvertResult: () => void
  runConvert: (workbookPath?: string) => Promise<PreviewData | null>
  loadTableData: (workbookPath?: string, opts?: { force?: boolean }) => Promise<TableData | null>
  applyTableEditsToCache: (edits: CellEdit[], workbookPath?: string) => void
  applyTableRowOpsToCache: (ops: TableRowOperation[], workbookPath?: string) => void
  markSheetChanges: (sheetNames: string[], workbookPath?: string) => void
  clearSheetChanges: (sheetNames?: string[], workbookPath?: string) => void
  refreshWorkspaceAssets: (workbookPath?: string) => Promise<AssetMaps | null>
  setWorkspaceAssets: (assets: AssetMaps, workbookPath?: string) => void
  linkProject: (dir: string) => Promise<{ ok: boolean; error?: string }>
  setAssets: (a: AssetIndex) => void
  clearProject: () => Promise<void>
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
      tableData: null,
      tableDataRevision: 0,
      tableWorkbookPath: '',
      tableLoading: false,
      tableError: null,
      sheetChanges: { workbookPath: '', sheets: {} },
      workspaceAssets: null,
      workspaceAssetsWorkbookPath: '',
      assets: null,
      renpyDir: '',
      setWorkbookPath: (workbookPath) => {
        set({
          workbookPath,
          convertResult: null,
          convertWorkbookPath: '',
          convertError: null,
          tableData: null,
          tableDataRevision: 0,
          tableWorkbookPath: '',
          tableError: null,
          sheetChanges: { workbookPath, sheets: {} },
          workspaceAssets: null,
          workspaceAssetsWorkbookPath: '',
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
            tableData: null,
            tableDataRevision: 0,
            tableWorkbookPath: '',
            tableLoading: false,
            tableError: null,
            sheetChanges: { workbookPath: '', sheets: {} },
            workspaceAssets: null,
            workspaceAssetsWorkbookPath: '',
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
            tableData: null,
            tableDataRevision: 0,
            tableWorkbookPath: '',
            tableError: null,
            sheetChanges: { workbookPath: r.copyPath, sheets: {} },
            workspaceAssets: null,
            workspaceAssetsWorkbookPath: '',
          })
          void get().refreshWorkspaceAssets(r.copyPath)
          void get().runConvert(r.copyPath)
        } else {
          // 兜底：导入失败仍可用原表
          set({
            workbookPath: originalPath,
            convertResult: null,
            convertWorkbookPath: '',
            convertError: null,
            tableData: null,
            tableDataRevision: 0,
            tableWorkbookPath: '',
            tableError: null,
            sheetChanges: { workbookPath: originalPath, sheets: {} },
            workspaceAssets: null,
            workspaceAssetsWorkbookPath: '',
          })
          void get().refreshWorkspaceAssets(originalPath)
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
      loadTableData: async (workbookPath, opts) => {
        const targetWorkbook = workbookPath ?? get().workbookPath
        if (!targetWorkbook) {
          set({
            tableData: null,
            tableDataRevision: 0,
            tableWorkbookPath: '',
            tableLoading: false,
            tableError: null,
          })
          return null
        }

        const current = get()
        if (
          !opts?.force &&
          current.tableWorkbookPath === targetWorkbook &&
          current.tableData
        ) {
          return current.tableData
        }

        const seq = ++tableReadSeq
        set({ tableLoading: true, tableError: null })
        try {
          const r = await window.e2r.readTable(targetWorkbook)
          if (seq !== tableReadSeq || get().workbookPath !== targetWorkbook) return null
          if (!r.ok) {
            set({ tableData: null, tableWorkbookPath: '', tableError: r.error })
            return null
          }
          const next = { sheets: r.sheets }
          set((state) => ({
            tableData: next,
            tableDataRevision: state.tableDataRevision + 1,
            tableWorkbookPath: targetWorkbook,
            tableError: null,
          }))
          return next
        } catch (e) {
          if (seq === tableReadSeq) {
            set({ tableData: null, tableWorkbookPath: '', tableError: errMsg(e) })
          }
          return null
        } finally {
          if (seq === tableReadSeq) set({ tableLoading: false })
        }
      },
      applyTableEditsToCache: (edits, workbookPath) => {
        if (edits.length === 0) return
        const targetWorkbook = workbookPath ?? get().workbookPath
        set((state) => {
          if (!state.tableData || state.tableWorkbookPath !== targetWorkbook) return {}

          const bySheet = new Map<string, Map<number, CellEdit[]>>()
          for (const edit of edits) {
            let rows = bySheet.get(edit.sheet)
            if (!rows) {
              rows = new Map()
              bySheet.set(edit.sheet, rows)
            }
            const rowEdits = rows.get(edit.excelRow) ?? []
            rowEdits.push(edit)
            rows.set(edit.excelRow, rowEdits)
          }

          let changed = false
          const sheets = state.tableData.sheets.map((sheet) => {
            const rowsByNumber = bySheet.get(sheet.name)
            if (!rowsByNumber) return sheet
            const rows = sheet.rows.map((row) => {
              const rowEdits = rowsByNumber.get(row.excelRow)
              if (!rowEdits) return row
              changed = true
              const cells = { ...row.cells }
              for (const edit of rowEdits) cells[edit.col] = edit.value
              return { ...row, cells }
            })
            return { ...sheet, rows }
          })

          return changed
            ? { tableData: { sheets }, tableDataRevision: state.tableDataRevision + 1 }
            : {}
        })
      },
      applyTableRowOpsToCache: (ops, workbookPath) => {
        if (ops.length === 0) return
        const targetWorkbook = workbookPath ?? get().workbookPath
        set((state) => {
          if (!state.tableData || state.tableWorkbookPath !== targetWorkbook) return {}

          const opsBySheet = new Map<string, TableRowOperation[]>()
          for (const op of ops) {
            const sheetOps = opsBySheet.get(op.sheet) ?? []
            sheetOps.push(op)
            opsBySheet.set(op.sheet, sheetOps)
          }

          let changed = false
          const sheets = state.tableData.sheets.map((sheet) => {
            const sheetOps = opsBySheet.get(sheet.name)
            if (!sheetOps?.length) return sheet
            let rows = sheet.rows.map((row) => ({ ...row, cells: { ...row.cells } }))
            for (const op of sheetOps) {
              changed = true
              if (op.type === 'insert-row') {
                const cells: Record<string, string> = {}
                for (const col of TABLE_COLUMNS) cells[col.key] = op.values?.[col.key] ?? ''
                rows = rows
                  .map((row) => (row.excelRow >= op.excelRow ? { ...row, excelRow: row.excelRow + 1 } : row))
                  .concat({ excelRow: op.excelRow, cells })
                  .sort((a, b) => a.excelRow - b.excelRow)
              } else {
                rows = rows
                  .filter((row) => row.excelRow !== op.excelRow)
                  .map((row) => (row.excelRow > op.excelRow ? { ...row, excelRow: row.excelRow - 1 } : row))
              }
            }
            return { ...sheet, rows }
          })

          return changed
            ? { tableData: { sheets }, tableDataRevision: state.tableDataRevision + 1 }
            : {}
        })
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
      refreshWorkspaceAssets: async (workbookPath) => {
        const targetWorkbook = workbookPath ?? get().workbookPath
        if (!targetWorkbook) {
          set({ workspaceAssets: null, workspaceAssetsWorkbookPath: '' })
          return null
        }
        const r = await window.e2r.workspaceAssets(targetWorkbook)
        if (!r.ok) return null
        set({ workspaceAssets: r.assets, workspaceAssetsWorkbookPath: targetWorkbook })
        return r.assets
      },
      setWorkspaceAssets: (workspaceAssets, workbookPath) =>
        set((state) => ({
          workspaceAssets,
          workspaceAssetsWorkbookPath: workbookPath ?? state.workbookPath,
        })),
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
      clearProject: async () => {
        await window.e2r.clearProject()
        set({ assets: null, renpyDir: '' })
      },
    }),
    {
      name: 'e2r-workspace',
      partialize: (s) => ({
        workbookPath: s.workbookPath,
        workspaceDir: s.workspaceDir,
        outputDir: s.outputDir,
        renpyDir: s.renpyDir,
      }),
    },
  ),
)
