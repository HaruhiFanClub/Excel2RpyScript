import { useCallback, useEffect, useMemo, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CustomCellRendererProps } from 'ag-grid-react'
import { type CellValueChangedEvent, type ColDef } from 'ag-grid-community'
import {
  AudioLines,
  Play,
  RefreshCw,
  Wand2,
  Check,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  CircleAlert,
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
  __job: EnrichedJob
}

interface TtsGridContext extends GridContext {
  onAudition: (job: EnrichedJob) => void
  onApplyJob: (job: EnrichedJob) => void
  onSynthJob: (job: EnrichedJob) => void
}

export default function TtsPage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const markSheetChanges = useWorkspaceStore((s) => s.markSheetChanges)
  const applyTableEditsToCache = useWorkspaceStore((s) => s.applyTableEditsToCache)
  const config = useCharactersStore((s) => s.config)

  const [health, setHealth] = useState<{ ok: boolean; device?: string; error?: string } | null>(null)
  const [managedUrl, setManagedUrl] = useState<string | null>(null)
  const [engineStarting, setEngineStarting] = useState(false)

  const [textLang, setTextLang] = useState('auto')
  const [promptLang, setPromptLang] = useState('auto')
  const [jobs, setJobs] = useState<EnrichedJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Record<string, RunState>>({})
  const [audio, setAudio] = useState<{ url: string; title: string } | null>(null)
  const [activeSheetKey, setActiveSheetKey] = useState('')

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
  }, [workbookPath, textLang])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [workbookPath, textLang, promptLang, refresh, managedUrl],
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

  const audition = useCallback((job: EnrichedJob) => {
    // 试听不依赖关联工程：音频由 asset:// 从 pending(已生成)/voice(已应用) 解析
    setAudio({ url: assetUrl(`audio/${job.outputName}`), title: job.outputName })
  }, [])

  // 可应用（有 pending 文件可落实）= 已生成 / 未重新生成
  const appliable = jobs.filter((j) => j.status === 'generated' || j.status === 'stale')

  const counts = jobs.reduce(
    (a, j) => ({ ...a, [j.status]: (a[j.status] ?? 0) + 1 }),
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
    if (jobSheets.length === 0) {
      setActiveSheetKey('')
      return
    }
    if (!jobSheets.some((s) => s.key === activeSheetKey)) setActiveSheetKey(jobSheets[0]!.key)
  }, [activeSheetKey, jobSheets])

  const activeSheet = jobSheets.find((s) => s.key === activeSheetKey) ?? jobSheets[0]
  const activeJobs = activeSheet?.jobs ?? []

  const context = useMemo<TtsGridContext>(
    () => ({
      assets: null,
      ttsConfig: config,
      onImage: () => undefined,
      onAudio: () => undefined,
      onImport: async () => null,
      onAudition: audition,
      onApplyJob: (job) => void apply([job.outputName]),
      onSynthJob: (job) => void synth([job.outputName]),
    }),
    [config, audition, apply, synth],
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
        cellClass: 'font-mono text-app-muted',
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
        tooltipField: 'dialogue_text',
      },
      {
        headerName: '语音文本',
        field: 'voice_text',
        width: 320,
        minWidth: 220,
        flex: 1,
        editable: false,
        tooltipField: 'voice_text',
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
        width: 118,
        minWidth: 104,
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
        status: job.status,
        outputName: job.outputName,
        run: progress[job.outputName],
        busy,
        __job: job,
      })),
    [activeJobs, busy, progress],
  )

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<TtsRow>) => {
      if (!workbookPath || e.colDef.field !== 'voice_cmd') return
      const job = e.data.__job
      const value = String(e.newValue ?? '').trim()
      if (value === job.voiceCmd) return
      const edits = [{ sheet: job.sheetName, excelRow: job.excelRow, col: 'voice_cmd' as const, value }]
      const r = await window.e2r.saveTable(workbookPath, edits)
      if (r.ok) {
        applyTableEditsToCache(edits, workbookPath)
        setError(null)
        markSheetChanges([job.sheetName], workbookPath)
        await refresh()
      } else {
        setError(r.error)
      }
    },
    [applyTableEditsToCache, markSheetChanges, workbookPath, refresh],
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
            <CheckCheck size={14} /> 应用全部{appliable.length ? ` (${appliable.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => synth()}
            disabled={!workbookPath || busy || jobs.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:opacity-50"
          >
            {busy ? <span className="spinner" /> : <Wand2 size={14} />} 合成全部
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
          <span className="text-amber-500">未重新生成 {counts['stale'] ?? 0}</span>
          <span>未生成 {counts['missing'] ?? 0}</span>
          {error && <span className="text-rose-500">· {error}</span>}
        </div>
      )}

      {jobSheets.length > 0 && (
        <SheetTabs
          tabs={jobSheets.map((s) => ({ key: s.key, label: s.name, count: s.jobs.length }))}
          activeKey={activeSheet?.key ?? ''}
          onChange={setActiveSheetKey}
        />
      )}

      <section className="glass-card custom-scrollbar min-h-0 flex-1 overflow-auto">
        {jobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-app-muted">
            <AudioLines size={36} strokeWidth={1.2} />
            <p className="text-[13px]">
              {workbookPath ? '该表没有标记为 tts 的语音行' : '选择工作簿后显示待合成语句'}
            </p>
          </div>
        ) : (
          <div className="h-full w-full">
            <AgGridReact<TtsRow>
              theme={appGridTheme}
              context={context}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              rowData={rowData}
              onCellValueChanged={onCellValueChanged}
              stopEditingWhenCellsLoseFocus
              animateRows={false}
            />
          </div>
        )}
      </section>

      {audio && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-2.5 shadow-lg backdrop-blur-xl">
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
  return (
    <div className="flex h-full items-center gap-1">
      {job.status !== 'missing' && (
        <button
          type="button"
          onClick={() => ctx.onAudition(job)}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 hover:bg-sky-500/30 dark:text-sky-300"
          title="试听"
        >
          <Play size={11} />
        </button>
      )}
      {(job.status === 'generated' || job.status === 'stale') && (
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
    return <span className="flex items-center gap-1 text-amber-500"><CircleAlert size={13} /> 未重新生成</span>
  return <span className="flex items-center gap-1 text-app-muted"><CircleDashed size={13} /> 未生成</span>
}
