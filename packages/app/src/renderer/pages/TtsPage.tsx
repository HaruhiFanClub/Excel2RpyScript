import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AgGridReact } from 'ag-grid-react'
import type { CustomCellRendererProps } from 'ag-grid-react'
import {
  type CellClickedEvent,
  type CellFocusedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type ColumnResizedEvent,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community'
import {
  AudioLines,
  Pause,
  Play,
  RefreshCw,
  Undo2,
  Wand2,
  Check,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  CircleAlert,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react'
import type { EnrichedJob, TtsProgress } from '../../shared/ipc'
import { isRoleEnabled, isRemoteRole } from '@e2r/core/tts'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { useCharactersStore } from '../stores/useCharactersStore'
import { assetUrl } from '../lib/asset'
import { ComboCell, type GridContext } from '../components/cellRenderers'
import { SheetTabs, appGridTheme, defaultGridColDef } from '../components/dataGrid'

const LANGS: [string, string][] = [
  ['多语种混合', 'auto'],
  ['中文', 'all_zh'],
  ['日文', 'all_ja'],
  ['中英混合', 'zh'],
  ['日英混合', 'ja'],
  ['英文', 'en'],
  ['粤语', 'all_yue'],
  ['韩文', 'all_ko'],
]

const EMPTY_SCROLL_BY_WORKBOOK_SHEET: Record<string, { top: number; left: number }> = {}
const EMPTY_MODIFIED_ROWS_BY_WORKBOOK: Record<string, Record<string, number>> = {}
const EMPTY_MODIFIED_ROWS: Record<string, number> = {}

type RunState = 'running' | 'done' | 'error'
type TtsRow = {
  line: number
  role_name: string
  voice_cmd: string
  dialogue_text: string
  voice_text: string
  status: EnrichedJob['status']
  outputName: string
  run?: RunState
  busy: boolean
  playing: boolean
  playbackPaused: boolean
  expandedTextField?: TtsTextField
  __job: EnrichedJob
}

type TtsInputField = 'voice_cmd' | 'voice_text'
type TtsTextField = 'dialogue_text' | 'voice_text'
type ExpandedTextCell = { outputName: string; field: TtsTextField; width: number }

interface TtsGridContext extends GridContext {
  onAudition: (job: EnrichedJob) => void
  onApplyJob: (job: EnrichedJob) => void
  onRevertJob: (job: EnrichedJob) => void
  onSynthJob: (job: EnrichedJob) => void
  onJumpToTable: (sheetName: string, excelRow: number) => void
}

const ttsRowKey = (sheetName: string, excelRow: number): string => `${sheetName}\u0000${excelRow}`
const ttsScrollKey = (workbookPath: string, sheetKey: string): string => `${workbookPath}\u0000${sheetKey}`

function isTtsInputField(field: string | undefined): field is TtsInputField {
  return field === 'voice_cmd' || field === 'voice_text'
}

function isTtsTextField(field: string | undefined): field is TtsTextField {
  return field === 'dialogue_text' || field === 'voice_text'
}

function effectiveStatus(job: EnrichedJob, modifiedRows: Record<string, number>): EnrichedJob['status'] {
  if (job.status !== 'missing' && job.statusTracked === false && modifiedRows[ttsRowKey(job.sheetName, job.excelRow)]) {
    return 'stale'
  }
  return job.status
}

function gridScrollElements(root: HTMLElement | null): { body: HTMLElement | null; horizontal: HTMLElement | null } {
  const body = root?.querySelector<HTMLElement>('.ag-body-viewport') ?? null
  const horizontal = root?.querySelector<HTMLElement>('.ag-body-horizontal-scroll-viewport') ?? body
  return { body, horizontal }
}

function weightedTextLength(text: string): number {
  let length = 0
  for (const char of text) length += /[\u0000-\u00ff]/.test(char) ? 0.55 : 1
  return length
}

function textLineCount(text: string, columnWidth: number): number {
  const usableWidth = Math.max(120, columnWidth - 32)
  const charsPerLine = Math.max(10, Math.floor(usableWidth / 13))
  return text
    .split(/\r\n|\r|\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(weightedTextLength(line) / charsPerLine)), 0)
}

function expandedTextRowHeight(text: string, columnWidth: number): number {
  return Math.max(96, 50 + textLineCount(text, columnWidth) * 24)
}

function TtsRowNumberCell(p: CustomCellRendererProps<TtsRow>) {
  const ctx = p.context as TtsGridContext
  const job = p.data?.__job
  const excelRow = Number(p.data?.line ?? p.value)
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (job) ctx.onJumpToTable(job.sheetName, job.excelRow)
      }}
      className="h-full w-full text-left font-mono text-[12px] text-sky-600 hover:underline dark:text-sky-300"
      title="在表格编辑页定位该行"
    >
      {excelRow}
    </button>
  )
}

function TtsTextCell(p: CustomCellRendererProps<TtsRow>) {
  const field = p.colDef?.field
  const expanded = isTtsTextField(field) && p.data?.expandedTextField === field
  const value = String(p.value ?? '')
  return (
    <div className={`e2r-tts-text-cell ${expanded ? 'e2r-tts-text-cell-expanded' : ''}`}>
      {value || <span className="text-app-muted/45">—</span>}
    </div>
  )
}

export default function TtsPage({
  active: pageActive = true,
  onOpenTable,
}: {
  active?: boolean
  onOpenTable?: () => void
}) {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const projectKey = useWorkspaceStore((s) => s.assets?.gamePath ?? '')
  const markSheetChanges = useWorkspaceStore((s) => s.markSheetChanges)
  const applyTableEditsToCache = useWorkspaceStore((s) => s.applyTableEditsToCache)
  const tableDataRevision = useWorkspaceStore((s) => s.tableDataRevision)
  const tableWorkbookPath = useWorkspaceStore((s) => s.tableWorkbookPath)
  const textLang = useWorkspaceStore((s) => s.ttsTextLang)
  const promptLang = useWorkspaceStore((s) => s.ttsPromptLang)
  const setTextLang = useWorkspaceStore((s) => s.setTtsTextLang)
  const setPromptLang = useWorkspaceStore((s) => s.setTtsPromptLang)
  const savedActiveSheetKey = useWorkspaceStore((s) => (s.ttsActiveSheetByWorkbook ?? {})[s.workbookPath] ?? '')
  const setStoredActiveSheet = useWorkspaceStore((s) => s.setTtsActiveSheet)
  const ttsScrollByWorkbookSheet = useWorkspaceStore(
    (s) => s.ttsScrollByWorkbookSheet ?? EMPTY_SCROLL_BY_WORKBOOK_SHEET,
  )
  const setTtsScrollPosition = useWorkspaceStore((s) => s.setTtsScrollPosition)
  const modifiedRows = useWorkspaceStore(
    (s) => (s.ttsModifiedRowsByWorkbook ?? EMPTY_MODIFIED_ROWS_BY_WORKBOOK)[s.workbookPath] ?? EMPTY_MODIFIED_ROWS,
  )
  const markTtsRowsModified = useWorkspaceStore((s) => s.markTtsRowsModified)
  const clearTtsRowsModified = useWorkspaceStore((s) => s.clearTtsRowsModified)
  const requestTableLocate = useWorkspaceStore((s) => s.requestTableLocate)
  const ttsLocateTarget = useWorkspaceStore((s) => s.ttsLocateTarget)
  const config = useCharactersStore((s) => s.config)

  const [health, setHealth] = useState<{ ok: boolean; device?: string; error?: string } | null>(null)
  const [managedUrl, setManagedUrl] = useState<string | null>(null)
  const [engineStarting, setEngineStarting] = useState(false)

  const [jobs, setJobs] = useState<EnrichedJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Record<string, RunState>>({})
  const [audio, setAudio] = useState<{ url: string; title: string; outputName: string } | null>(null)
  const [audioPaused, setAudioPaused] = useState(true)
  const [gridFullscreen, setGridFullscreen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const gridApi = useRef<GridApi<TtsRow> | null>(null)
  const gridShell = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)
  const rowHeightFrame = useRef<number | null>(null)
  const lastExpandedTextCell = useRef<ExpandedTextCell | null>(null)
  const lastSeenTableRevision = useRef(tableDataRevision)
  const lastRestoredScrollKey = useRef('')
  const [activeSheetKey, setActiveSheetKey] = useState(savedActiveSheetKey)
  const [expandedTextCell, setExpandedTextCell] = useState<ExpandedTextCell | null>(null)

  // 启用角色分类：远端（自带模型/端点）/ 内嵌（本地引擎 zero-shot）
  const roleEntries = config ? Object.entries(config.roleModelMapping) : []
  const enabledRemote = roleEntries.filter(([, m]) => isRoleEnabled(m) && isRemoteRole(m))
  const enabledEmbedded = roleEntries.filter(([, m]) => isRoleEnabled(m) && !isRemoteRole(m))
  const enabledCount = enabledRemote.length + enabledEmbedded.length
  const remoteEndpoint = enabledRemote[0]?.[1].apiBaseUrl || config?.apiBaseUrl || ''

  // 远端角色：检测端点健康（不展示具体地址）
  useEffect(() => {
    if (!config) return
    if (enabledRemote.length) void window.e2r.ttsHealth(remoteEndpoint).then(setHealth)
    else setHealth(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const refresh = useCallback(async () => {
    if (!workbookPath) {
      setJobs([])
      return
    }
    const r = await window.e2r.ttsJobs({ xlsxPath: workbookPath, textLang })
    if (r.ok) {
      setJobs(r.jobs)
      setError(null)
    } else setError(r.error)
  }, [workbookPath, textLang, projectKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!workbookPath || tableWorkbookPath !== workbookPath) {
      lastSeenTableRevision.current = tableDataRevision
      return
    }
    if (lastSeenTableRevision.current === tableDataRevision) return
    lastSeenTableRevision.current = tableDataRevision
    void refresh()
  }, [refresh, tableDataRevision, tableWorkbookPath, workbookPath])

  useEffect(() => {
    if (!workbookPath) return
    const resolvedRows = jobs
      .filter((job) => {
        const key = ttsRowKey(job.sheetName, job.excelRow)
        return Boolean(modifiedRows[key]) && job.statusTracked !== false && job.status !== 'stale'
      })
      .map((job) => ({ sheetName: job.sheetName, excelRow: job.excelRow }))
    if (resolvedRows.length > 0) clearTtsRowsModified(workbookPath, resolvedRows)
  }, [clearTtsRowsModified, jobs, modifiedRows, workbookPath])

  useEffect(() => {
    return window.e2r.onTtsProgress((p: TtsProgress) => {
      setProgress((prev) => ({ ...prev, [p.outputName]: p.status }))
    })
  }, [])

  const startEngine = useCallback(async () => {
    setEngineStarting(true)
    setError(null)
    try {
      const r = await window.e2r.ttsEngineStart()
      if (r.ok) {
        setManagedUrl(r.baseUrl)
        setHealth(await window.e2r.ttsHealth(r.baseUrl))
      } else setError(r.error)
    } finally {
      setEngineStarting(false)
    }
  }, [])

  const synth = useCallback(
    async (only?: string[]) => {
      if (!workbookPath) return
      setBusy(true)
      setProgress({})
      try {
        const r = await window.e2r.ttsSynthesize({
          xlsxPath: workbookPath,
          textLang,
          promptLang,
          ...(only ? { only } : {}),
          // 内嵌角色走本地引擎地址；远端角色按各自端点合成（忽略此项）
          ...(managedUrl ? { baseUrl: managedUrl } : {}),
        })
        if (!r.ok && r.error) setError(r.error)
        const doneNames = r.doneNames ?? (r.ok ? (only ?? jobs.map((job) => job.outputName)) : [])
        if (doneNames.length > 0) {
          const done = new Set(doneNames)
          clearTtsRowsModified(
            workbookPath,
            jobs
              .filter((job) => done.has(job.outputName))
              .map((job) => ({ sheetName: job.sheetName, excelRow: job.excelRow })),
          )
        }
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [clearTtsRowsModified, jobs, workbookPath, textLang, promptLang, refresh, managedUrl],
  )

  const apply = useCallback(
    async (outputNames: string[]) => {
      if (!workbookPath || outputNames.length === 0) return
      const r = await window.e2r.ttsApply({ xlsxPath: workbookPath, outputNames })
      if (!r.ok && r.error) setError(r.error)
      await refresh()
    },
    [workbookPath, refresh],
  )

  const revertGenerated = useCallback(
    async (outputNames: string[]) => {
      if (!workbookPath || outputNames.length === 0) return
      const reverted = new Set(outputNames)
      const r = await window.e2r.ttsRevert({ xlsxPath: workbookPath, outputNames })
      if (!r.ok && r.error) {
        setError(r.error)
      } else {
        setError(null)
        setProgress((prev) => {
          const next = { ...prev }
          for (const name of outputNames) delete next[name]
          return next
        })
        setAudio((current) => {
          if (!current || !reverted.has(current.outputName)) return current
          audioRef.current?.pause()
          setAudioPaused(true)
          return null
        })
      }
      await refresh()
    },
    [workbookPath, refresh],
  )

  const toggleAudio = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      void el.play().catch((e: unknown) => {
        setAudioPaused(true)
        setError(e instanceof Error ? e.message : String(e))
      })
    } else {
      el.pause()
    }
  }, [])

  const audition = useCallback((job: EnrichedJob) => {
    // 试听不依赖 workspace 应用状态：音频由 asset:// 从 pending → voice → 工程 audio 解析
    setAudio((current) => {
      if (current?.outputName === job.outputName) {
        toggleAudio()
        return current
      }
      audioRef.current?.pause()
      setAudioPaused(false)
      setError(null)
      return {
        url: `${assetUrl(`audio/${job.outputName}`)}?t=${Date.now()}`,
        title: job.outputName,
        outputName: job.outputName,
      }
    })
  }, [toggleAudio])

  // 可应用（有 pending 文件可落实）= 当前输入对应的已生成音频。
  const appliable = jobs.filter((j) => effectiveStatus(j, modifiedRows) === 'generated')

  const counts = jobs.reduce(
    (a, j) => {
      const status = effectiveStatus(j, modifiedRows)
      return { ...a, [status]: (a[status] ?? 0) + 1 }
    },
    {} as Record<string, number>,
  )

  const jobSheets = useMemo(() => {
    const byKey = new Map<string, { key: string; name: string; sheetIndex: number; jobs: EnrichedJob[] }>()
    for (const job of jobs) {
      const key = `${job.sheetIndex}:${job.sheetName}`
      const group = byKey.get(key)
      if (group) group.jobs.push(job)
      else byKey.set(key, { key, name: job.sheetName, sheetIndex: job.sheetIndex, jobs: [job] })
    }
    return [...byKey.values()].sort((a, b) => a.sheetIndex - b.sheetIndex)
  }, [jobs])

  useEffect(() => {
    setActiveSheetKey(savedActiveSheetKey)
    setExpandedTextCell(null)
    lastRestoredScrollKey.current = ''
  }, [workbookPath])

  useEffect(() => {
    if (jobSheets.length === 0) {
      if (activeSheetKey) setActiveSheetKey('')
      if (workbookPath && savedActiveSheetKey) setStoredActiveSheet(workbookPath, '')
      return
    }
    const saved = savedActiveSheetKey && jobSheets.some((s) => s.key === savedActiveSheetKey)
      ? savedActiveSheetKey
      : ''
    const current = activeSheetKey && jobSheets.some((s) => s.key === activeSheetKey)
      ? activeSheetKey
      : ''
    const next = current || saved || jobSheets[0]!.key
    if (activeSheetKey !== next) setActiveSheetKey(next)
    if (workbookPath && savedActiveSheetKey !== next) setStoredActiveSheet(workbookPath, next)
  }, [activeSheetKey, jobSheets, savedActiveSheetKey, setStoredActiveSheet, workbookPath])

  const activeSheet = jobSheets.find((s) => s.key === activeSheetKey) ?? jobSheets[0]
  const activeJobs = activeSheet?.jobs ?? []
  const activeAppliable = activeJobs.filter((j) => effectiveStatus(j, modifiedRows) === 'generated')
  const activeScrollKey = workbookPath && activeSheetKey ? ttsScrollKey(workbookPath, activeSheetKey) : ''
  const savedScroll = activeScrollKey ? ttsScrollByWorkbookSheet[activeScrollKey] : undefined

  const selectSheet = useCallback(
    (key: string) => {
      setActiveSheetKey(key)
      setExpandedTextCell(null)
      if (workbookPath) setStoredActiveSheet(workbookPath, key)
    },
    [setStoredActiveSheet, workbookPath],
  )

  const rememberScroll = useCallback(() => {
    if (!activeScrollKey) return
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = null
      const { body, horizontal } = gridScrollElements(gridShell.current)
      setTtsScrollPosition(activeScrollKey, {
        top: body?.scrollTop ?? 0,
        left: horizontal?.scrollLeft ?? body?.scrollLeft ?? 0,
      })
    })
  }, [activeScrollKey, setTtsScrollPosition])

  const jumpToTable = useCallback(
    (sheetName: string, excelRow: number) => {
      if (!workbookPath || !sheetName || !Number.isFinite(excelRow)) return
      requestTableLocate({ workbookPath, sheetName, excelRow })
      onOpenTable?.()
    },
    [onOpenTable, requestTableLocate, workbookPath],
  )

  useEffect(() => {
    return () => {
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
      if (rowHeightFrame.current !== null) window.cancelAnimationFrame(rowHeightFrame.current)
    }
  }, [])

  const context = useMemo<TtsGridContext>(
    () => ({
      assets: null,
      ttsConfig: config,
      onImage: () => undefined,
      onAudio: () => undefined,
      onImport: async () => null,
      onAudition: audition,
      onApplyJob: (job) => void apply([job.outputName]),
      onRevertJob: (job) => void revertGenerated([job.outputName]),
      onSynthJob: (job) => void synth([job.outputName]),
      onJumpToTable: jumpToTable,
    }),
    [config, audition, apply, revertGenerated, synth, jumpToTable],
  )

  const columnDefs = useMemo<ColDef<TtsRow>[]>(
    () => [
      {
        headerName: '行',
        field: 'line',
        width: 68,
        minWidth: 58,
        pinned: 'left',
        editable: false,
        cellRenderer: TtsRowNumberCell,
        cellClass: 'p-0',
      },
      {
        headerName: '角色',
        field: 'role_name',
        width: 118,
        minWidth: 90,
        pinned: 'left',
        editable: false,
      },
      {
        headerName: '语气',
        field: 'voice_cmd',
        width: 220,
        minWidth: 150,
        editable: false,
        cellRenderer: ComboCell,
      },
      {
        headerName: '台词',
        field: 'dialogue_text',
        width: 360,
        minWidth: 220,
        flex: 1.15,
        editable: false,
        cellRenderer: TtsTextCell,
      },
      {
        headerName: '语音文本',
        field: 'voice_text',
        width: 320,
        minWidth: 220,
        flex: 1,
        editable: true,
        cellRenderer: TtsTextCell,
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
      },
      {
        headerName: '状态',
        field: 'status',
        width: 128,
        minWidth: 112,
        editable: false,
        cellRenderer: StatusCell,
      },
      {
        headerName: '',
        field: 'outputName',
        width: 146,
        minWidth: 132,
        editable: false,
        sortable: false,
        cellRenderer: ActionsCell,
      },
    ],
    [],
  )
  const defaultColDef = useMemo<ColDef<TtsRow>>(() => defaultGridColDef, [])
  const rowData = useMemo<TtsRow[]>(
    () =>
      activeJobs.map((job) => ({
        line: job.excelRow,
        role_name: job.roleName,
        voice_cmd: job.voiceCmd,
        dialogue_text: job.dialogueText,
        voice_text: job.voiceText,
        status: effectiveStatus(job, modifiedRows),
        outputName: job.outputName,
        run: progress[job.outputName],
        busy,
        playing: audio?.outputName === job.outputName,
        playbackPaused: audioPaused,
        expandedTextField:
          expandedTextCell?.outputName === job.outputName ? expandedTextCell.field : undefined,
        __job: job,
      })),
    [activeJobs, audio?.outputName, audioPaused, busy, expandedTextCell, modifiedRows, progress],
  )

  const expandedTextValue = useMemo(() => {
    if (!expandedTextCell) return ''
    const row = rowData.find((item) => item.outputName === expandedTextCell.outputName)
    return row ? String(row[expandedTextCell.field] ?? '') : ''
  }, [expandedTextCell, rowData])

  useEffect(() => {
    const api = gridApi.current
    if (!api) {
      lastExpandedTextCell.current = expandedTextCell
      return
    }
    if (rowHeightFrame.current !== null) window.cancelAnimationFrame(rowHeightFrame.current)
    const previous = lastExpandedTextCell.current
    lastExpandedTextCell.current = expandedTextCell
    rowHeightFrame.current = window.requestAnimationFrame(() => {
      rowHeightFrame.current = null
      const { body, horizontal } = gridScrollElements(gridShell.current)
      const top = body?.scrollTop ?? 0
      const left = horizontal?.scrollLeft ?? body?.scrollLeft ?? 0

      const affectedNodes = []
      if (previous && previous.outputName !== expandedTextCell?.outputName) {
        const previousNode = api.getRowNode(previous.outputName)
        if (previousNode) {
          previousNode.setRowHeight(null)
          affectedNodes.push(previousNode)
        }
      }

      if (expandedTextCell) {
        const currentNode = api.getRowNode(expandedTextCell.outputName)
        if (currentNode) {
          currentNode.setRowHeight(expandedTextRowHeight(expandedTextValue, expandedTextCell.width))
          affectedNodes.push(currentNode)
        }
      }

      if (affectedNodes.length) {
        api.onRowHeightChanged()
        api.refreshCells({ force: true, rowNodes: affectedNodes })
      }

      window.requestAnimationFrame(() => {
        const next = gridScrollElements(gridShell.current)
        if (next.body) next.body.scrollTop = top
        if (next.horizontal) next.horizontal.scrollLeft = left
        else if (next.body) next.body.scrollLeft = left
      })
    })
    return () => {
      if (rowHeightFrame.current !== null) {
        window.cancelAnimationFrame(rowHeightFrame.current)
        rowHeightFrame.current = null
      }
    }
  }, [expandedTextCell, expandedTextValue])

  useEffect(() => {
    if (!pageActive || !activeScrollKey) return
    const restoreKey = `${activeScrollKey}:${rowData.length}`
    if (lastRestoredScrollKey.current === restoreKey) return
    lastRestoredScrollKey.current = restoreKey
    const pos = savedScroll
    window.requestAnimationFrame(() => {
      const { body, horizontal } = gridScrollElements(gridShell.current)
      if (body) body.scrollTop = pos?.top ?? 0
      if (horizontal) horizontal.scrollLeft = pos?.left ?? 0
      else if (body) body.scrollLeft = pos?.left ?? 0
    })
  }, [activeScrollKey, pageActive, rowData.length, savedScroll])

  useEffect(() => {
    if (!pageActive) return
    const id = window.requestAnimationFrame(() => {
      gridApi.current?.refreshCells({ force: false })
    })
    return () => window.cancelAnimationFrame(id)
  }, [pageActive])

  const getRowId = useCallback((p: GetRowIdParams<TtsRow>) => p.data.outputName, [])

  const onGridReady = useCallback((e: GridReadyEvent<TtsRow>) => {
    gridApi.current = e.api
  }, [])

  const locateTtsRow = useCallback((excelRow: number) => {
    const api = gridApi.current
    if (!api) return
    let displayedIndex: number | null = null
    api.forEachNodeAfterFilterAndSort((node) => {
      if (displayedIndex !== null) return
      if (Number(node.data?.line) === excelRow) displayedIndex = node.rowIndex ?? null
    })
    if (displayedIndex === null) return
    api.ensureIndexVisible(displayedIndex, 'middle')
    api.setFocusedCell(displayedIndex, 'line')
  }, [])

  useEffect(() => {
    const target = ttsLocateTarget
    if (!target || target.workbookPath !== workbookPath) return
    const group = jobSheets.find((s) => s.name === target.sheetName)
    if (!group) return
    if (activeSheetKey !== group.key) {
      selectSheet(group.key)
      return
    }
    if (!pageActive) return
    const id = window.requestAnimationFrame(() => locateTtsRow(target.excelRow))
    return () => window.cancelAnimationFrame(id)
  }, [
    activeSheetKey,
    jobSheets,
    locateTtsRow,
    pageActive,
    selectSheet,
    ttsLocateTarget,
    workbookPath,
  ])

  const expandTextCell = useCallback((row: TtsRow | undefined, field: string | undefined, width: number) => {
    if (!row || !isTtsTextField(field)) {
      setExpandedTextCell(null)
      return
    }
    setExpandedTextCell((current) => {
      if (current?.outputName === row.outputName && current.field === field && current.width === width) {
        return current
      }
      return { outputName: row.outputName, field, width }
    })
  }, [])

  const onCellClicked = useCallback(
    (e: CellClickedEvent<TtsRow>) => {
      expandTextCell(e.data, e.colDef.field, e.column.getActualWidth())
    },
    [expandTextCell],
  )

  const onCellFocused = useCallback(
    (e: CellFocusedEvent<TtsRow>) => {
      const rowIndex = e.rowIndex
      const field = typeof e.column === 'string' ? e.column : e.column?.getColId()
      const width = typeof e.column === 'string' ? 320 : (e.column?.getActualWidth() ?? 320)
      const row = rowIndex == null ? undefined : e.api.getDisplayedRowAtIndex(rowIndex)?.data
      expandTextCell(row, field, width)
    },
    [expandTextCell],
  )

  const onColumnResized = useCallback((e: ColumnResizedEvent<TtsRow>) => {
    if (!e.finished) return
    setExpandedTextCell((current) => {
      if (!current) return current
      const resizedColumns = [
        ...(e.column ? [e.column] : []),
        ...(e.columns ?? []),
        ...(e.flexColumns ?? []),
      ]
      const column = resizedColumns.find((col) => col.getColId() === current.field)
      if (!column) return current
      const width = column.getActualWidth()
      return width === current.width ? current : { ...current, width }
    })
  }, [])

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<TtsRow>) => {
      const field = e.colDef.field
      if (!workbookPath || !isTtsInputField(field)) return
      const job = e.data.__job
      const rawValue = e.newValue == null ? '' : String(e.newValue)
      const value = field === 'voice_cmd' ? rawValue.trim() : rawValue
      const previous = field === 'voice_cmd' ? job.voiceCmd : job.voiceText
      if (value === previous) return
      const edits = [{ sheet: job.sheetName, excelRow: job.excelRow, col: field, value }]
      const r = await window.e2r.saveTable(workbookPath, edits)
      if (r.ok) {
        applyTableEditsToCache(edits, workbookPath)
        markTtsRowsModified(workbookPath, [{ sheetName: job.sheetName, excelRow: job.excelRow }])
        setError(null)
        markSheetChanges([job.sheetName], workbookPath)
        await refresh()
      } else {
        setError(r.error)
      }
    },
    [applyTableEditsToCache, markSheetChanges, markTtsRowsModified, workbookPath, refresh],
  )

  const gridPanel = (
    <section className={`glass-card e2r-grid-panel ${gridFullscreen ? 'e2r-grid-panel-fullscreen' : 'flex-1'}`}>
      <div className="e2r-grid-panel-toolbar">
        <span className="min-w-0 truncate text-[12px] text-app-muted">
          当前 sheet
          {activeSheet && (
            <>
              <span className="mx-2 text-app-muted/60">:</span>
              <span className="font-medium text-app-text">{activeSheet.name}</span>
              <span className="ml-2">共 {activeJobs.length} 句</span>
            </>
          )}
        </span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => apply(activeAppliable.map((j) => j.outputName))}
            disabled={busy || activeAppliable.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-400/20 disabled:opacity-50 dark:text-emerald-300"
            title="只应用当前 sheet 中已生成且与当前输入匹配的语音"
          >
            <CheckCheck size={13} /> 应用当前 sheet
            {activeAppliable.length ? ` (${activeAppliable.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => synth(activeJobs.map((j) => j.outputName))}
            disabled={!workbookPath || busy || activeJobs.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-[12px] font-medium text-white shadow-sm shadow-sky-500/20 transition-all hover:bg-sky-600 disabled:opacity-50"
            title="只合成当前 sheet 中的全部 TTS 语句"
          >
            {busy ? <span className="spinner" /> : <Wand2 size={13} />} 合成当前 sheet
          </button>
          <button
            type="button"
            onClick={() => setGridFullscreen((v) => !v)}
            disabled={jobs.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-app-text transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
            title={gridFullscreen ? '退出全屏' : '全屏编辑'}
          >
            {gridFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {gridFullscreen ? '退出全屏' : '全屏'}
          </button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-10 text-app-muted">
          <AudioLines size={36} strokeWidth={1.2} />
          <p className="text-[13px]">
            {workbookPath ? '该表没有标记为 tts 的语音行' : '选择工作簿后显示待合成语句'}
          </p>
        </div>
      ) : (
        <div ref={gridShell} className="h-full min-h-0 w-full flex-1">
          <AgGridReact<TtsRow>
            theme={appGridTheme}
            context={context}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            rowData={rowData}
            onGridReady={onGridReady}
            onColumnResized={onColumnResized}
            onBodyScroll={rememberScroll}
            onCellClicked={onCellClicked}
            onCellFocused={onCellFocused}
            onCellValueChanged={onCellValueChanged}
            stopEditingWhenCellsLoseFocus
            animateRows={false}
          />
        </div>
      )}
    </section>
  )

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">语音合成</h2>
          <p className="mt-1 text-[13px] text-app-muted">
            按已启用角色合成语音并试听，在「角色配置」页管理角色与语气
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => apply(appliable.map((j) => j.outputName))}
            disabled={busy || appliable.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3.5 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-400/20 disabled:opacity-50 dark:text-emerald-300"
            title="把已生成的语音全部应用到 workspace（关联工程则同时覆盖到工程）"
          >
            <CheckCheck size={14} /> 应用所有 sheet{appliable.length ? ` (${appliable.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => synth()}
            disabled={!workbookPath || busy || jobs.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:opacity-50"
          >
            {busy ? <span className="spinner" /> : <Wand2 size={14} />} 合成所有 sheet
          </button>
        </div>
      </header>

      {/* 配置条 */}
      <section className="glass-card mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-[12px]">
        <span className="text-app-muted">
          已启用角色 <span className="text-app-text">{enabledCount}</span>
          {enabledRemote.length > 0 && <span className="ml-1">· 远端 {enabledRemote.length}</span>}
          {enabledEmbedded.length > 0 && <span className="ml-1">· 内嵌 {enabledEmbedded.length}</span>}
        </span>

        {enabledEmbedded.length > 0 && (
          <button
            type="button"
            onClick={startEngine}
            disabled={engineStarting || !!managedUrl}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white/40 px-3 font-medium text-app-text hover:bg-white/70 disabled:opacity-60 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            {engineStarting ? <span className="spinner" /> : <Wand2 size={13} />}
            {managedUrl ? '内置引擎已启动' : engineStarting ? '启动中…' : '启动内置引擎'}
          </button>
        )}

        {health && (enabledRemote.length > 0 || managedUrl) && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
              health.ok
                ? 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300'
                : 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${health.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {health.ok ? `引擎在线${health.device ? ` · ${health.device}` : ''}` : '引擎离线'}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          <label className="text-app-muted">文本语言</label>
          <Select value={textLang} onChange={setTextLang} />
          <label className="text-app-muted">参考语言</label>
          <Select value={promptLang} onChange={setPromptLang} />
          <button onClick={() => void refresh()} className="text-app-muted hover:text-app-text" title="刷新">
            <RefreshCw size={14} />
          </button>
        </span>
      </section>

      {jobs.length > 0 && (
        <div className="mb-2 flex items-center gap-3 text-[12px] text-app-muted">
          <span>共 {jobs.length} 句</span>
          <span className="text-emerald-500">已应用 {counts['applied'] ?? 0}</span>
          <span className="text-sky-500">已生成 {counts['generated'] ?? 0}</span>
          <span className="text-amber-500">修改待合成 {counts['stale'] ?? 0}</span>
          <span>未生成 {counts['missing'] ?? 0}</span>
          {error && <span className="text-rose-500">· {error}</span>}
        </div>
      )}

      {jobSheets.length > 0 && (
        <SheetTabs
          tabs={jobSheets.map((s) => ({ key: s.key, label: s.name, count: s.jobs.length }))}
          activeKey={activeSheet?.key ?? ''}
          onChange={selectSheet}
        />
      )}

      {gridFullscreen ? createPortal(gridPanel, document.body) : gridPanel}

      {audio && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-2.5 shadow-lg backdrop-blur-xl">
          <span className="max-w-[260px] truncate font-mono text-[12px] text-app-text">{audio.title}</span>
          <button
            type="button"
            onClick={toggleAudio}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 hover:bg-sky-500/30 dark:text-sky-300"
            title={audioPaused ? '播放' : '暂停'}
          >
            {audioPaused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <audio
            key={audio.url}
            ref={audioRef}
            src={audio.url}
            controls
            autoPlay
            className="h-8"
            onPlay={() => setAudioPaused(false)}
            onPause={() => setAudioPaused(true)}
            onEnded={() => setAudioPaused(true)}
            onError={() => setAudioPaused(true)}
          />
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause()
              setAudio(null)
              setAudioPaused(true)
            }}
            className="text-app-muted hover:text-app-text"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function Select({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-app-border bg-white/50 px-1.5 py-1 text-[12px] text-app-text dark:bg-zinc-800/50"
    >
      {LANGS.map(([label, code]) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  )
}

function StatusCell(p: CustomCellRendererProps<TtsRow>) {
  if (!p.data) return null
  return <StatusBadge status={p.data.status} run={p.data.run} />
}

function ActionsCell(p: CustomCellRendererProps<TtsRow>) {
  if (!p.data) return null
  const ctx = p.context as TtsGridContext
  const job = p.data.__job
  const isPlaying = p.data.playing && !p.data.playbackPaused
  return (
    <div className="flex h-full items-center gap-1">
      {p.data.status !== 'missing' && (
        <button
          type="button"
          onClick={() => ctx.onAudition(job)}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-sky-600 hover:bg-sky-500/30 dark:text-sky-300 ${
            p.data.playing ? 'bg-sky-500/25' : 'bg-sky-500/15'
          }`}
          title={isPlaying ? '暂停' : p.data.playing ? '继续播放' : '试听'}
        >
          {isPlaying ? <Pause size={11} /> : <Play size={11} />}
        </button>
      )}
      {p.data.status === 'generated' && (
        <button
          type="button"
          onClick={() => ctx.onApplyJob(job)}
          disabled={p.data.busy}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/30 disabled:opacity-40 dark:text-emerald-300"
          title="应用（打对号）：落实到 workspace（关联工程则同时覆盖）"
        >
          <Check size={12} />
        </button>
      )}
      {p.data.status === 'generated' && (
        <button
          type="button"
          onClick={() => ctx.onRevertJob(job)}
          disabled={p.data.busy}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 hover:bg-amber-500/30 disabled:opacity-40 dark:text-amber-300"
          title="撤销未应用的生成音频"
        >
          <Undo2 size={12} />
        </button>
      )}
      <button
        type="button"
        onClick={() => ctx.onSynthJob(job)}
        disabled={p.data.busy}
        className="rounded-md px-1.5 py-0.5 text-app-muted hover:bg-black/5 hover:text-app-text disabled:opacity-40 dark:hover:bg-white/5"
        title="重新合成"
      >
        <RefreshCw size={12} />
      </button>
    </div>
  )
}

function StatusBadge({ status, run }: { status: EnrichedJob['status']; run?: RunState }) {
  if (run === 'running') return <span className="flex items-center gap-1 text-sky-500"><span className="spinner" /> 合成中</span>
  if (run === 'error') return <span className="flex items-center gap-1 text-rose-500"><CircleAlert size={13} /> 失败</span>
  if (status === 'applied')
    return <span className="flex items-center gap-1 text-emerald-500"><CheckCheck size={13} /> 已应用</span>
  if (status === 'generated' || run === 'done')
    return <span className="flex items-center gap-1 text-sky-500"><CircleCheck size={13} /> 已生成</span>
  if (status === 'stale')
    return <span className="flex items-center gap-1 text-amber-500"><CircleAlert size={13} /> 修改待合成</span>
  return <span className="flex items-center gap-1 text-app-muted"><CircleDashed size={13} /> 未生成</span>
}
