import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AgGridReact } from 'ag-grid-react'
import type { CustomCellRendererProps } from 'ag-grid-react'
import {
  type CellClickedEvent,
  type CellFocusedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community'
import { Download, FileSpreadsheet, Maximize2, Minimize2, Plus, Save, RotateCcw, Trash2, X } from 'lucide-react'
import { TABLE_COLUMNS, type TableRow } from '@e2r/core/table'
import { parseSprites, serializeSprites } from '@e2r/core/sprites'
import { spritePositionsFromConfig } from '@e2r/core/tts'
import { resolveImage } from '@e2r/core/assets'
import type { AssetMaps, CellEdit, TableChange, TableRowOperation } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { useCharactersStore } from '../stores/useCharactersStore'
import {
  SpriteSlotCell,
  BgCell,
  AudioCell,
  ComboCell,
  type GridContext,
} from '../components/cellRenderers'
import { SheetTabs, appGridTheme, defaultGridColDef } from '../components/dataGrid'
import { assetUrl } from '../lib/asset'

type Row = Record<string, string | number>
type AnchorRect = { left: number; right: number; top: number; bottom: number }
type ImagePreview = { url: string; title: string; anchor: AnchorRect; avoidLeft?: number; preferredTop?: number }
type RowDataCacheEntry = { sourceRows: TableRow[]; spriteKey: string; rows: Row[] }
type TableRowInsertOp = Extract<TableRowOperation, { type: 'insert-row' }>
type PendingInsertedRow = { op: TableRowInsertOp; sheet: string; excelRow: number }
interface TableGridContext extends GridContext {
  onJumpToTts: (sheetName: string, excelRow: number) => void
}
const EFFECTIVE_ROLE_FIELD = '__effectiveRole'
const LARGE_TEXT = new Set(['text', 'voice_text', 'remark'])
const IMAGE_PREVIEW_FIELDS = new Set(['background', 'sprite_left', 'sprite_mid', 'sprite_right'])
const RENDERERS: Record<string, ColDef<Row>['cellRenderer']> = {
  background: BgCell,
  music: AudioCell,
  sound: AudioCell,
}
const FIRST_DATA_EXCEL_ROW = 8
const IMAGE_PREVIEW_HEIGHT = 320
// 立绘列拆成 左/中/右 三个虚拟列（底层仍写回单一 character 列）
const SPRITE_SUB: { field: string; header: string; width: number }[] = [
  { field: 'sprite_left', header: '立绘·左', width: 112 },
  { field: 'sprite_mid', header: '立绘·中', width: 112 },
  { field: 'sprite_right', header: '立绘·右', width: 112 },
]
const editKey = (sheet: string, row: number, col: string) => `${sheet} ${row} ${col}`
const EMPTY_ASSETS: AssetMaps = { images: {}, audio: {} }

function mergeAssetMaps(workspace: AssetMaps | null, project: AssetMaps | null): AssetMaps {
  return {
    images: { ...(workspace?.images ?? {}), ...(project?.images ?? {}) },
    audio: { ...(workspace?.audio ?? {}), ...(project?.audio ?? {}) },
  }
}

function eventCellRect(event: Event | null | undefined): AnchorRect | null {
  const target = event?.target instanceof HTMLElement ? event.target : null
  const cell = target?.closest('.ag-cell') as HTMLElement | null
  const rect = cell?.getBoundingClientRect()
  return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null
}

function firstImageName(field: string, row: Row): string {
  const raw = String(row[field] ?? '').trim()
  if (!raw) return ''
  if (field === 'background') return raw
  return raw.split(';').map((s) => s.trim()).filter(Boolean)[0] ?? ''
}

function rightEdgeOfSpriteColumns(root: HTMLElement | null): number | undefined {
  if (!root) return undefined
  let right = 0
  root
    .querySelectorAll<HTMLElement>(
      '[col-id="sprite_left"], [col-id="sprite_mid"], [col-id="sprite_right"]',
    )
    .forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > right) right = r.right
    })
  return right > 0 ? right : undefined
}

function cssAttr(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}

function gridCellRect(root: HTMLElement | null, rowIndex: number, colId: string): AnchorRect | null {
  const row = root?.querySelector<HTMLElement>(`.ag-row[row-index="${rowIndex}"]`)
  const cell = row?.querySelector<HTMLElement>(`.ag-cell[col-id="${cssAttr(colId)}"]`)
  const rect = cell?.getBoundingClientRect()
  return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null
}

function imagePreviewStableTop(root: HTMLElement | null): number | undefined {
  const rect = root?.getBoundingClientRect()
  if (!rect) return undefined
  const top = rect.top + 58
  return Math.max(12, Math.min(top, window.innerHeight - IMAGE_PREVIEW_HEIGHT - 12))
}

function recomputeEffectiveRoles(rows: Row[]): void {
  let current = ''
  for (const row of [...rows].sort((a, b) => Number(a['__row']) - Number(b['__row']))) {
    const role = String(row['role_name'] ?? '')
    if (role.trim()) current = role
    row[EFFECTIVE_ROLE_FIELD] = current
  }
}

function ttsInputRowsFromChanges(changes: TableChange[]): Array<{ sheetName: string; excelRow: number }> {
  const rows = new Map<string, { sheetName: string; excelRow: number }>()
  for (const change of changes) {
    if ('type' in change) continue
    if (change.col !== 'voice_text' && change.col !== 'voice_cmd') continue
    const key = `${change.sheet}\u0000${change.excelRow}`
    rows.set(key, { sheetName: change.sheet, excelRow: change.excelRow })
  }
  return [...rows.values()]
}

function TableRowNumberCell(p: CustomCellRendererProps<Row>) {
  const ctx = p.context as TableGridContext
  const sheetName = String(p.data?.['__sheet'] ?? '')
  const excelRow = Number(p.data?.['__row'] ?? p.value)
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        ctx.onJumpToTts(sheetName, excelRow)
      }}
      className="h-full w-full text-left font-mono text-[12px] text-sky-600 hover:underline dark:text-sky-300"
      title="在语音合成页定位该行"
    >
      {excelRow}
    </button>
  )
}

export default function TablePage({
  active: pageActive = true,
  onOpenTts,
}: {
  active?: boolean
  onOpenTts?: () => void
}) {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const workspaceAssets = useWorkspaceStore((s) =>
    s.workspaceAssetsWorkbookPath === s.workbookPath ? s.workspaceAssets : null,
  )
  const assets = useWorkspaceStore((s) => s.assets)
  const setAssets = useWorkspaceStore((s) => s.setAssets)
  const setWorkspaceAssets = useWorkspaceStore((s) => s.setWorkspaceAssets)
  const refreshWorkspaceAssets = useWorkspaceStore((s) => s.refreshWorkspaceAssets)
  const markSheetChanges = useWorkspaceStore((s) => s.markSheetChanges)
  const tableData = useWorkspaceStore((s) => s.tableData)
  const tableDataRevision = useWorkspaceStore((s) => s.tableDataRevision)
  const tableWorkbookPath = useWorkspaceStore((s) => s.tableWorkbookPath)
  const tableLoading = useWorkspaceStore((s) => s.tableLoading)
  const tableError = useWorkspaceStore((s) => s.tableError)
  const loadTableData = useWorkspaceStore((s) => s.loadTableData)
  const applyTableRowOpsToCache = useWorkspaceStore((s) => s.applyTableRowOpsToCache)
  const savedActiveSheetName = useWorkspaceStore((s) => (s.tableActiveSheetByWorkbook ?? {})[s.workbookPath] ?? '')
  const setTableActiveSheet = useWorkspaceStore((s) => s.setTableActiveSheet)
  const markTtsRowsModified = useWorkspaceStore((s) => s.markTtsRowsModified)
  const requestTtsLocate = useWorkspaceStore((s) => s.requestTtsLocate)
  const tableLocateTarget = useWorkspaceStore((s) => s.tableLocateTarget)
  const ttsConfig = useCharactersStore((s) => s.config)
  // 立绘位置来自「角色配置」：自建角色留空用 left/mid/right，内置凉宫角色已带前缀配置。
  const spritePositions = useMemo(
    () => (ttsConfig ? spritePositionsFromConfig(ttsConfig) : {}),
    [ttsConfig],
  )

  const data = tableWorkbookPath === workbookPath ? tableData : null
  const loading = tableLoading && !data
  const error = tableError
  const [active, setActive] = useState(0)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedRow, setSelectedRow] = useState<{ sheet: string; excelRow: number } | null>(null)
  const [gridFullscreen, setGridFullscreen] = useState(false)

  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const [audio, setAudio] = useState<{ url: string; title: string } | null>(null)

  const edits = useRef(new Map<string, CellEdit>())
  const rowOps = useRef<TableRowOperation[]>([])
  const pendingInsertedRows = useRef<PendingInsertedRow[]>([])
  const [dirty, setDirty] = useState(0)
  const gridApi = useRef<GridApi<Row> | null>(null)
  const gridShell = useRef<HTMLDivElement>(null)
  const rowDataCache = useRef(new Map<string, RowDataCacheEntry>())
  const lastWorkbookPath = useRef('')

  useEffect(() => {
    if (lastWorkbookPath.current === workbookPath) return
    lastWorkbookPath.current = workbookPath
    edits.current.clear()
    rowOps.current = []
    pendingInsertedRows.current = []
    rowDataCache.current.clear()
    setDirty(0)
    setActive(0)
    setSelectedRow(null)
    setLocalError(null)
    setStatus(null)
    setImagePreview(null)
    setGridFullscreen(false)
  }, [workbookPath])

  useEffect(() => {
    if (!workbookPath || !pageActive) return
    if (data) return
    void loadTableData(workbookPath)
  }, [data, loadTableData, pageActive, workbookPath])

  useEffect(() => {
    if (!workbookPath || !pageActive) return
    void refreshWorkspaceAssets(workbookPath)
  }, [pageActive, refreshWorkspaceAssets, workbookPath])

  useEffect(() => {
    if (!data) return
    setActive((current) => {
      const savedIndex = savedActiveSheetName
        ? data.sheets.findIndex((s) => s.name === savedActiveSheetName)
        : -1
      if (savedIndex >= 0) return savedIndex
      return current < data.sheets.length ? current : 0
    })
  }, [data, savedActiveSheetName])

  useEffect(() => {
    if (!pageActive) return
    const id = window.requestAnimationFrame(() => {
      gridApi.current?.refreshCells({ force: false })
      gridApi.current?.resetRowHeights()
    })
    return () => window.cancelAnimationFrame(id)
  }, [pageActive])

  useEffect(() => {
    if (tableError) setLocalError(null)
  }, [tableError])

  useEffect(() => {
    setImagePreview(null)
    setSelectedRow(null)
  }, [active, assets, workspaceAssets])

  // 角色配置会影响立绘三列拆分结果，缓存必须失效。
  const spriteKey = useMemo(() => JSON.stringify(spritePositions), [spritePositions])

  useEffect(() => {
    rowDataCache.current.clear()
  }, [spriteKey, data, tableDataRevision])

  // 关联工程 / 配置变化后刷新单元格
  useEffect(() => {
    gridApi.current?.refreshCells({ force: true })
  }, [assets, ttsConfig, tableDataRevision, workspaceAssets])

  const sheet = data?.sheets[active]
  const shownError = localError ?? error
  const updateDirty = useCallback(() => setDirty(edits.current.size + rowOps.current.length), [])
  const availableAssets = useMemo(
    () => (workbookPath ? mergeAssetMaps(workspaceAssets, assets) : null),
    [assets, workbookPath, workspaceAssets],
  )

  const jumpToTts = useCallback(
    (sheetName: string, excelRow: number) => {
      if (!workbookPath || !sheetName || !Number.isFinite(excelRow)) return
      requestTtsLocate({ workbookPath, sheetName, excelRow })
      onOpenTts?.()
    },
    [onOpenTts, requestTtsLocate, workbookPath],
  )

  const context = useMemo<TableGridContext>(
    () => ({
      assets: availableAssets ?? EMPTY_ASSETS,
      ttsConfig,
      onJumpToTts: jumpToTts,
      onImage: (url, title) =>
        setImagePreview({
          url,
          title,
          anchor: { left: window.innerWidth - 340, right: window.innerWidth - 328, top: 120, bottom: 140 },
        }),
      onAudio: (url, title) => setAudio({ url, title }),
      onImport: async (kind, currentValue) => {
        if (!workbookPath) return null
        const r = await window.e2r.importAsset(kind, currentValue, workbookPath)
        if (r.ok) {
          setWorkspaceAssets(r.workspace, workbookPath)
          if (r.project) setAssets(r.project)
          gridApi.current?.refreshCells({ force: true })
          setLocalError(null)
          return r.value
        }
        if (r.error) setLocalError(r.error)
        return null
      },
    }),
    [availableAssets, ttsConfig, jumpToTts, workbookPath, setWorkspaceAssets, setAssets],
  )

  useEffect(() => {
    if (workbookPath && sheet) setTableActiveSheet(workbookPath, sheet.name)
  }, [setTableActiveSheet, sheet, workbookPath])

  const getRowId = useCallback((p: GetRowIdParams<Row>) => {
    return `${p.data['__sheet']}:${p.data['__row']}`
  }, [])

  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const defs: ColDef<Row>[] = [
      {
        headerName: '#',
        field: '__row',
        width: 60,
        pinned: 'left',
        sortable: false,
        editable: false,
        cellRenderer: TableRowNumberCell,
        cellClass: 'p-0',
      },
    ]
    for (const c of TABLE_COLUMNS) {
      if (c.key === 'character') {
        for (const s of SPRITE_SUB) {
          defs.push({
            headerName: s.header,
            field: s.field,
            width: s.width,
            editable: true,
            cellRenderer: SpriteSlotCell,
          })
        }
      } else if (c.key === 'role_name') {
        // 角色列：双击单元格可自由输入；选中/悬浮出现下拉按钮（已启用角色主名称，或下拉里输入自定义值）。
        // 双击「下拉按钮」由 ComboCell 用原生监听拦下，不会误触发编辑。
        defs.push({
          headerName: c.header,
          field: c.key,
          width: c.width,
          editable: true,
          pinned: 'left' as const,
          cellRenderer: ComboCell,
        })
      } else if (c.key === 'voice_cmd') {
        // 语音指令列：只能从下拉选择该行角色对应的语气。
        defs.push({
          headerName: c.header,
          field: c.key,
          width: c.width,
          editable: false,
          cellRenderer: ComboCell,
        })
      } else {
        defs.push({
          headerName: c.header,
          field: c.key,
          width: c.width,
          editable: true,
          ...(RENDERERS[c.key] ? { cellRenderer: RENDERERS[c.key] } : {}),
          ...(LARGE_TEXT.has(c.key) ? { cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true } : {}),
        })
      }
    }
    return defs
  }, [])

  const defaultColDef = useMemo<ColDef<Row>>(() => defaultGridColDef, [])
  const rowData = useMemo<Row[]>(() => {
    if (!sheet) return []
    const cacheKey = `${tableWorkbookPath}:${sheet.name}:${tableDataRevision}`
    const cached = rowDataCache.current.get(cacheKey)
    if (cached && cached.sourceRows === sheet.rows && cached.spriteKey === spriteKey) {
      return cached.rows
    }
    let currentRole = ''
    const rows = sheet.rows.map((r) => {
      const s = parseSprites(r.cells['character'] ?? '', spritePositions)
      const role = r.cells['role_name'] ?? ''
      if (role.trim()) currentRole = role
      return {
        __sheet: sheet.name,
        __row: r.excelRow,
        [EFFECTIVE_ROLE_FIELD]: currentRole,
        ...r.cells,
        sprite_left: s.left,
        sprite_mid: s.mid,
        sprite_right: s.right,
        sprite_other: s.other,
      }
    })
    rowDataCache.current.set(cacheKey, { sourceRows: sheet.rows, spriteKey, rows })
    return rows
  }, [sheet, spriteKey, spritePositions, tableDataRevision, tableWorkbookPath])

  const onGridReady = useCallback((e: GridReadyEvent<Row>) => {
    gridApi.current = e.api
  }, [])

  const locateDisplayedRow = useCallback(
    (excelRow: number) => {
      const api = gridApi.current
      if (!api || !sheet) return
      let displayedIndex: number | null = null
      api.forEachNodeAfterFilterAndSort((node) => {
        if (displayedIndex !== null) return
        if (Number(node.data?.['__row']) === excelRow) displayedIndex = node.rowIndex ?? null
      })
      if (displayedIndex === null) return
      api.ensureIndexVisible(displayedIndex, 'middle')
      api.setFocusedCell(displayedIndex, '__row')
      setSelectedRow({ sheet: sheet.name, excelRow })
    },
    [sheet],
  )

  useEffect(() => {
    const target = tableLocateTarget
    if (!target || target.workbookPath !== workbookPath || !data) return
    const sheetIndex = data.sheets.findIndex((s) => s.name === target.sheetName)
    if (sheetIndex < 0) return
    if (active !== sheetIndex) {
      setActive(sheetIndex)
      setQuery('')
      setImagePreview(null)
      return
    }
    if (query) {
      setQuery('')
      return
    }
    if (!pageActive) return
    const id = window.requestAnimationFrame(() => locateDisplayedRow(target.excelRow))
    return () => window.cancelAnimationFrame(id)
  }, [
    active,
    data,
    locateDisplayedRow,
    pageActive,
    query,
    tableLocateTarget,
    workbookPath,
  ])

  const baseCellValue = useCallback(
    (excelRow: number, col: CellEdit['col']): string => {
      const row = sheet?.rows.find((r) => r.excelRow === excelRow)
      return row?.cells[col] ?? ''
    },
    [sheet],
  )

  const stageCellEdit = useCallback(
    (edit: CellEdit) => {
      const key = editKey(edit.sheet, edit.excelRow, edit.col)
      if (edit.value === baseCellValue(edit.excelRow, edit.col)) {
        edits.current.delete(key)
      } else {
        edits.current.set(key, edit)
      }
    },
    [baseCellValue],
  )

  const showImagePreviewForCell = useCallback(
    (field: string | undefined, row: Row | undefined, anchor: AnchorRect | null) => {
      if (!assets || !field || !IMAGE_PREVIEW_FIELDS.has(field) || !row) {
        setImagePreview(null)
        return
      }
      const name = firstImageName(field, row)
      const rel = name ? resolveImage(assets, name) : null
      if (!rel || !anchor) {
        setImagePreview(null)
        return
      }
      setImagePreview({
        url: assetUrl(rel),
        title: name,
        anchor,
        avoidLeft: field.startsWith('sprite_') ? rightEdgeOfSpriteColumns(gridShell.current) : undefined,
        preferredTop: imagePreviewStableTop(gridShell.current),
      })
    },
    [assets],
  )

  const onCellClicked = useCallback(
    (e: CellClickedEvent<Row>) => {
      if (e.data) setSelectedRow({ sheet: String(e.data['__sheet'] ?? ''), excelRow: Number(e.data['__row']) })
      showImagePreviewForCell(e.colDef.field, e.data, eventCellRect(e.event))
    },
    [showImagePreviewForCell],
  )

  const onCellFocused = useCallback(
    (e: CellFocusedEvent<Row>) => {
      const rowIndex = e.rowIndex
      const colId = typeof e.column === 'string' ? e.column : e.column?.getColId()
      if (rowIndex == null || !colId) {
        setImagePreview(null)
        return
      }
      const row = e.api.getDisplayedRowAtIndex(rowIndex)?.data
      if (row) setSelectedRow({ sheet: String(row['__sheet'] ?? ''), excelRow: Number(row['__row']) })
      showImagePreviewForCell(colId, row, gridCellRect(gridShell.current, rowIndex, colId))
    },
    [showImagePreviewForCell],
  )

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<Row>) => {
      const col = e.colDef.field
      if (!col || col === '__row' || col === '__sheet' || !sheet) return
      const excelRow = Number(e.data['__row'])
      if (col.startsWith('sprite_')) {
        // 三列任一变化 → 重建单一 character 列（左→中→右→other 顺序）
        const col19 = serializeSprites(
          {
            left: String(e.data['sprite_left'] ?? ''),
            mid: String(e.data['sprite_mid'] ?? ''),
            right: String(e.data['sprite_right'] ?? ''),
            other: String(e.data['sprite_other'] ?? ''),
          },
          spritePositions,
        )
        stageCellEdit({
          sheet: sheet.name,
          excelRow,
          col: 'character',
          value: col19,
        })
      } else {
        stageCellEdit({
          sheet: sheet.name,
          excelRow,
          col: col as CellEdit['col'],
          value: e.newValue == null ? '' : String(e.newValue),
        })
      }
      if (col === 'role_name') {
        const rows: Row[] = []
        gridApi.current?.forEachNode((node) => {
          if (node.data) rows.push(node.data)
        })
        recomputeEffectiveRoles(rows)
        gridApi.current?.refreshCells({ columns: ['voice_cmd'], force: true })
      }
      setStatus(null)
      updateDirty()
    },
    [sheet, spritePositions, stageCellEdit, updateDirty],
  )

  const editedSheetNames = useCallback(
    () => [
      ...new Set(
        [...edits.current.values(), ...rowOps.current].map((change) => change.sheet).filter(Boolean),
      ),
    ],
    [],
  )

  const shiftEditsForRowOp = useCallback((op: TableRowOperation) => {
    const next = new Map<string, CellEdit>()
    for (const edit of edits.current.values()) {
      if (edit.sheet !== op.sheet) {
        next.set(editKey(edit.sheet, edit.excelRow, edit.col), edit)
        continue
      }
      if (op.type === 'insert-row') {
        const excelRow = edit.excelRow >= op.excelRow ? edit.excelRow + 1 : edit.excelRow
        const moved = excelRow === edit.excelRow ? edit : { ...edit, excelRow }
        next.set(editKey(moved.sheet, moved.excelRow, moved.col), moved)
      } else {
        if (edit.excelRow === op.excelRow) continue
        const excelRow = edit.excelRow > op.excelRow ? edit.excelRow - 1 : edit.excelRow
        const moved = excelRow === edit.excelRow ? edit : { ...edit, excelRow }
        next.set(editKey(moved.sheet, moved.excelRow, moved.col), moved)
      }
    }
    edits.current = next
  }, [])

  const trackPendingInsertedRows = useCallback((op: TableRowOperation) => {
    if (op.type === 'insert-row') {
      for (const row of pendingInsertedRows.current) {
        if (row.sheet === op.sheet && row.excelRow >= op.excelRow) row.excelRow += 1
      }
      pendingInsertedRows.current.push({ op, sheet: op.sheet, excelRow: op.excelRow })
      return
    }

    for (const row of pendingInsertedRows.current) {
      if (row.sheet === op.sheet && row.excelRow > op.excelRow) row.excelRow -= 1
    }
  }, [])

  const stageRowOp = useCallback(
    (op: TableRowOperation, nextSelection: { sheet: string; excelRow: number } | null) => {
      if (!workbookPath) return
      rowOps.current.push(op)
      trackPendingInsertedRows(op)
      shiftEditsForRowOp(op)
      applyTableRowOpsToCache([op], workbookPath)
      rowDataCache.current.clear()
      setSelectedRow(nextSelection)
      setStatus(null)
      setLocalError(null)
      updateDirty()
    },
    [applyTableRowOpsToCache, shiftEditsForRowOp, trackPendingInsertedRows, updateDirty, workbookPath],
  )

  const cancelPendingInsertedRow = useCallback(
    (op: TableRowOperation, nextSelection: { sheet: string; excelRow: number } | null): boolean => {
      if (!workbookPath || op.type !== 'delete-row') return false
      const pendingIndex = pendingInsertedRows.current.findIndex(
        (row) => row.sheet === op.sheet && row.excelRow === op.excelRow,
      )
      if (pendingIndex < 0) return false

      const pending = pendingInsertedRows.current[pendingIndex]!
      const opIndex = rowOps.current.indexOf(pending.op)
      if (opIndex < 0) return false

      const nextOps: TableRowOperation[] = []
      for (let i = 0; i < rowOps.current.length; i++) {
        const current = rowOps.current[i]!
        if (i === opIndex) continue
        if (i > opIndex && current.sheet === pending.sheet && current.excelRow > pending.op.excelRow) {
          current.excelRow -= 1
        }
        nextOps.push(current)
      }
      rowOps.current = nextOps

      pendingInsertedRows.current.splice(pendingIndex, 1)
      for (const row of pendingInsertedRows.current) {
        if (row.sheet === op.sheet && row.excelRow > op.excelRow) row.excelRow -= 1
      }

      shiftEditsForRowOp(op)
      applyTableRowOpsToCache([op], workbookPath)
      rowDataCache.current.clear()
      setSelectedRow(nextSelection)
      setStatus(null)
      setLocalError(null)
      updateDirty()
      return true
    },
    [applyTableRowOpsToCache, shiftEditsForRowOp, updateDirty, workbookPath],
  )

  const appendRow = useCallback(() => {
    if (!sheet || !workbookPath) return
    const lastRow = sheet.rows.reduce((max, row) => Math.max(max, row.excelRow), FIRST_DATA_EXCEL_ROW - 1)
    const excelRow = Math.max(FIRST_DATA_EXCEL_ROW, lastRow + 1)
    stageRowOp({ type: 'insert-row', sheet: sheet.name, excelRow, values: {} }, { sheet: sheet.name, excelRow })
  }, [sheet, stageRowOp, workbookPath])

  const insertRowAbove = useCallback(() => {
    if (!sheet || !workbookPath || selectedRow?.sheet !== sheet.name) return
    const excelRow = selectedRow.excelRow
    stageRowOp({ type: 'insert-row', sheet: sheet.name, excelRow, values: {} }, { sheet: sheet.name, excelRow })
  }, [selectedRow, sheet, stageRowOp, workbookPath])

  const deleteRow = useCallback(() => {
    if (!sheet || !workbookPath || selectedRow?.sheet !== sheet.name) return
    const excelRow = selectedRow.excelRow
    const nextRow = rowData
      .map((row) => Number(row['__row']))
      .filter((row) => row !== excelRow)
      .sort((a, b) => a - b)
      .find((row) => row > excelRow)
    const fallback = rowData
      .map((row) => Number(row['__row']))
      .filter((row) => row !== excelRow)
      .sort((a, b) => b - a)[0]
    const nextSelectionRow = nextRow ?? fallback
    const op: TableRowOperation = { type: 'delete-row', sheet: sheet.name, excelRow }
    const nextSelection = nextSelectionRow
      ? { sheet: sheet.name, excelRow: nextSelectionRow > excelRow ? nextSelectionRow - 1 : nextSelectionRow }
      : null
    if (cancelPendingInsertedRow(op, nextSelection)) return
    stageRowOp(op, nextSelection)
  }, [cancelPendingInsertedRow, rowData, selectedRow, sheet, stageRowOp, workbookPath])

  const save = useCallback(async () => {
    if (!workbookPath || dirty === 0) return
    const changedSheets = editedSheetNames()
    const pendingEdits = [...edits.current.values()]
    const pendingChanges: TableChange[] = [...rowOps.current, ...pendingEdits]
    setSaving(true)
    setLocalError(null)
    setStatus(null)
    try {
      const r = await window.e2r.saveTable(workbookPath, pendingChanges)
      if (r.ok) {
        rowDataCache.current.clear()
        edits.current.clear()
        rowOps.current = []
        pendingInsertedRows.current = []
        setDirty(0)
        await loadTableData(workbookPath, { force: true })
        markTtsRowsModified(workbookPath, ttsInputRowsFromChanges(pendingChanges))
        markSheetChanges(changedSheets, workbookPath)
        setStatus('已保存，脚本列表会自动更新，并在转换页提示未应用到工程的 sheet 更改')
      } else setLocalError(r.error)
    } finally {
      setSaving(false)
    }
  }, [dirty, editedSheetNames, loadTableData, markSheetChanges, markTtsRowsModified, workbookPath])

  const saveAs = useCallback(async () => {
    if (!workbookPath) return
    const pendingEdits = [...edits.current.values()]
    const pendingChanges: TableChange[] = [...rowOps.current, ...pendingEdits]
    const changedSheets = editedSheetNames()
    setExporting(true)
    setLocalError(null)
    setStatus(null)
    try {
      const r = await window.e2r.saveTableAs(workbookPath, pendingChanges)
      if (r.ok) {
        rowDataCache.current.clear()
        edits.current.clear()
        rowOps.current = []
        pendingInsertedRows.current = []
        setDirty(0)
        await loadTableData(workbookPath, { force: true })
        markTtsRowsModified(workbookPath, ttsInputRowsFromChanges(pendingChanges))
        if (changedSheets.length > 0) markSheetChanges(changedSheets, workbookPath)
        setStatus(`已另存为：${r.path}`)
      } else if (r.error) {
        setLocalError(r.error)
      }
    } finally {
      setExporting(false)
    }
  }, [editedSheetNames, loadTableData, markSheetChanges, markTtsRowsModified, workbookPath])

  const discard = useCallback(() => {
    edits.current.clear()
    rowOps.current = []
    pendingInsertedRows.current = []
    rowDataCache.current.clear()
    setDirty(0)
    setSelectedRow(null)
    setLocalError(null)
    setStatus(null)
    if (workbookPath) void loadTableData(workbookPath, { force: true })
  }, [loadTableData, workbookPath])

  const selectedExcelRow = sheet && selectedRow?.sheet === sheet.name ? selectedRow.excelRow : null
  const gridPanel = (
    <section className={`glass-card e2r-grid-panel ${gridFullscreen ? 'e2r-grid-panel-fullscreen' : 'flex-1'}`}>
      <div className="e2r-grid-panel-toolbar">
        <span className="min-w-0 truncate text-[12px] text-app-muted">
          表格编辑
          {sheet && (
            <>
              <span className="mx-2 text-app-muted/60">/</span>
              <span className="font-medium text-app-text">{sheet.name}</span>
              <span className="ml-2">共 {sheet.rows.length} 行</span>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => setGridFullscreen((v) => !v)}
          disabled={!sheet}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-app-text transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
          title={gridFullscreen ? '退出全屏' : '全屏编辑'}
        >
          {gridFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          {gridFullscreen ? '退出全屏' : '全屏'}
        </button>
      </div>
      {sheet && sheet.rows.length > 0 ? (
        <div ref={gridShell} className="h-full min-h-0 w-full flex-1">
          <AgGridReact<Row>
            theme={appGridTheme}
            context={context}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            rowData={rowData}
            quickFilterText={query}
            onGridReady={onGridReady}
            onCellClicked={onCellClicked}
            onCellFocused={onCellFocused}
            onCellValueChanged={onCellValueChanged}
            onBodyScroll={() => setImagePreview(null)}
            stopEditingWhenCellsLoseFocus
            animateRows={false}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-10 text-app-muted">
          <FileSpreadsheet size={36} strokeWidth={1.2} />
          <p className="text-[13px]">
            {loading ? '读取中…' : shownError ? `读取失败：${shownError}` : '选择工作簿以浏览与编辑剧本数据'}
          </p>
        </div>
      )}
    </section>
  )

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">表格编辑</h2>
          <p className="mt-1 text-[13px] text-app-muted">
            多 sheet 浏览/编辑，关联 Ren&apos;Py 工程后直接预览立绘、背景与音频
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shownError && <span className="max-w-[360px] truncate text-[12px] text-rose-500">{shownError}</span>}
          {status && <span className="max-w-[360px] truncate text-[12px] text-emerald-600 dark:text-emerald-300">{status}</span>}
          {dirty > 0 && (
            <>
              <span className="text-[12px] text-amber-500">{dirty} 处未保存</span>
              <button
                type="button"
                onClick={discard}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
              >
                <RotateCcw size={13} /> 放弃
              </button>
            </>
          )}
          <button
            type="button"
            onClick={save}
            disabled={dirty === 0 || saving || exporting}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <span className="spinner" /> : <Save size={14} />} 保存
          </button>
          <button
            type="button"
            onClick={saveAs}
            disabled={!workbookPath || saving || exporting}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            {exporting ? <span className="spinner" /> : <Download size={14} />} 表格另存为
          </button>
        </div>
      </header>

      {data && data.sheets.length > 0 && (
        <SheetTabs
          tabs={data.sheets.map((s, i) => ({ key: String(i), label: s.name, count: s.rows.length }))}
          activeKey={String(active)}
          onChange={(key) => setActive(Number(key))}
          leading={
            <input
              className="glass-input mr-2 w-48 shrink-0 text-[12px]"
              placeholder="搜索本表…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          }
        />
      )}

      {sheet && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
          <button
            type="button"
            onClick={appendRow}
            disabled={!workbookPath || saving || exporting}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 font-medium text-app-text transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            <Plus size={13} /> 新建行
          </button>
          <button
            type="button"
            onClick={insertRowAbove}
            disabled={!workbookPath || !selectedExcelRow || saving || exporting}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 font-medium text-app-text transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            <Plus size={13} /> 插入上方
          </button>
          <button
            type="button"
            onClick={deleteRow}
            disabled={!workbookPath || !selectedExcelRow || saving || exporting}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 font-medium text-rose-600 transition-colors hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300"
          >
            <Trash2 size={13} /> 删除行
          </button>
          <span className="ml-1 text-app-muted">
            {selectedExcelRow ? `已选中 Excel 第 ${selectedExcelRow} 行` : '选中单元格后可插入或删除该行'}
          </span>
        </div>
      )}

      {gridFullscreen ? createPortal(gridPanel, document.body) : gridPanel}

      {imagePreview && <ImageSidePreview preview={imagePreview} onClose={() => setImagePreview(null)} />}

      {/* 音频播放条 */}
      {audio && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-2.5 shadow-lg backdrop-blur-xl">
          <Music2 />
          <span className="max-w-[260px] truncate font-mono text-[12px] text-app-text">{audio.title}</span>
          <audio key={audio.url} src={audio.url} controls autoPlay className="h-8" />
          <button onClick={() => setAudio(null)} className="text-app-muted hover:text-app-text">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function ImageSidePreview(props: { preview: ImagePreview; onClose: () => void }) {
  const { preview } = props
  const width = 300
  const height = IMAGE_PREVIEW_HEIGHT
  const gutter = 10
  const minLeft = preview.avoidLeft ? preview.avoidLeft + gutter : 8
  const rightSide = Math.max(preview.anchor.right + gutter, minLeft)
  const canUseRight = rightSide + width <= window.innerWidth - 12
  const leftSide = preview.anchor.left - width - gutter
  const canUseLeft = leftSide >= minLeft
  const left = canUseRight
    ? rightSide
    : canUseLeft
      ? leftSide
      : Math.max(minLeft, window.innerWidth - width - 12)
  const rawTop = preview.preferredTop ?? preview.anchor.top - 14
  const top = Math.max(12, Math.min(rawTop, window.innerHeight - height - 12))

  return (
    <div
      style={{ left, top, width, height }}
      className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-[0_18px_55px_-16px_rgb(15_23_42_/_0.35)]"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-app-border px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-app-text">{preview.title}</span>
        <button
          type="button"
          onClick={props.onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-app-muted hover:bg-black/5 hover:text-app-text dark:hover:bg-white/10"
          aria-label="关闭预览"
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-[linear-gradient(45deg,rgb(148_163_184_/_0.12)_25%,transparent_25%,transparent_75%,rgb(148_163_184_/_0.12)_75%),linear-gradient(45deg,rgb(148_163_184_/_0.12)_25%,transparent_25%,transparent_75%,rgb(148_163_184_/_0.12)_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] p-3">
        <img src={preview.url} alt={preview.title} className="h-full w-full object-contain" />
      </div>
    </div>
  )
}

function Music2() {
  return <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
}
