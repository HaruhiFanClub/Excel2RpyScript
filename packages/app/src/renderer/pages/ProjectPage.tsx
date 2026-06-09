import { useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  CircleCheck,
  Gauge,
  RefreshCw,
  SearchCheck,
  TriangleAlert,
} from 'lucide-react'
import type {
  AudioNormalizeArgs,
  AudioNormalizePlan,
  AudioNormalizeProgress,
  AudioNormalizeScope,
  AudioNormalizeStandard,
  ProjectAuditReport,
} from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

const scopes: { value: AudioNormalizeScope; label: string }[] = [
  { value: 'table-voice', label: '所有语音' },
  { value: 'table-music', label: '所有音乐' },
  { value: 'table-music-voice', label: '音乐及语音' },
]

const standards: { value: AudioNormalizeStandard; label: string }[] = [
  { value: 'lufs', label: 'LUFS' },
  { value: 'peak', label: '峰值' },
  { value: 'rms', label: 'RMS' },
]

function formatDb(value: number | null | undefined, suffix = ' dB'): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : '-'
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function statusText(entry: AudioNormalizePlan['entries'][number]): string {
  if (entry.status === 'ready') return '待处理'
  if (entry.status === 'skipped') return entry.reason ?? '跳过'
  return entry.reason ?? '错误'
}

export default function ProjectPage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const assets = useWorkspaceStore((s) => s.assets)
  const renpyDir = useWorkspaceStore((s) => s.renpyDir)
  const linkProject = useWorkspaceStore((s) => s.linkProject)

  const [scope, setScope] = useState<AudioNormalizeScope>('table-music-voice')
  const [standard, setStandard] = useState<AudioNormalizeStandard>('lufs')
  const [targetLufs, setTargetLufs] = useState(-18)
  const [truePeakDb, setTruePeakDb] = useState(-1.5)
  const [lra, setLra] = useState(11)
  const [targetPeakDb, setTargetPeakDb] = useState(-1)
  const [targetRmsDb, setTargetRmsDb] = useState(-20)
  const [limitDb, setLimitDb] = useState(-1)
  const [minGainDb, setMinGainDb] = useState(0.1)
  const [maxGainDb, setMaxGainDb] = useState(24)
  const [backup, setBackup] = useState(true)

  const [plan, setPlan] = useState<AudioNormalizePlan | null>(null)
  const [busy, setBusy] = useState<'analyze' | 'apply' | 'audit' | 'refresh' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<AudioNormalizeProgress | null>(null)
  const [applied, setApplied] = useState<{ processed: number; failed: number } | null>(null)
  const [audit, setAudit] = useState<ProjectAuditReport | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)

  useEffect(() => window.e2r.onAudioNormalizeProgress(setProgress), [])
  useEffect(() => {
    setPlan(null)
    setApplied(null)
    setProgress(null)
  }, [
    workbookPath,
    assets?.gamePath,
    scope,
    standard,
    targetLufs,
    truePeakDb,
    lra,
    targetPeakDb,
    targetRmsDb,
    limitDb,
    minGainDb,
    maxGainDb,
    backup,
  ])

  const normalizeArgs = (): AudioNormalizeArgs => ({
    xlsxPath: workbookPath || undefined,
    scope,
    standard,
    targetLufs,
    truePeakDb,
    lra,
    targetPeakDb,
    targetRmsDb,
    limitDb,
    minGainDb,
    maxGainDb,
    backup,
  })

  const canAnalyze = Boolean(assets && workbookPath)
  const readyCount = plan?.summary.ready ?? 0

  const analyze = async () => {
    if (!canAnalyze) return
    setBusy('analyze')
    setError(null)
    setApplied(null)
    setPlan(null)
    try {
      const r = await window.e2r.projectAudioNormalizePlan(normalizeArgs())
      if (r.ok) setPlan(r)
      else setError(r.error)
    } finally {
      setBusy(null)
    }
  }

  const apply = async () => {
    if (!plan || readyCount === 0) return
    setBusy('apply')
    setError(null)
    setApplied(null)
    try {
      const r = await window.e2r.projectAudioNormalizeApply(normalizeArgs())
      if (r.ok) {
        setApplied({ processed: r.processed, failed: r.failed })
        setPlan(null)
      } else {
        setError(r.error)
      }
    } finally {
      setBusy(null)
    }
  }

  const runAudit = async () => {
    if (!workbookPath || !assets) return
    setBusy('audit')
    setAuditError(null)
    try {
      const r = await window.e2r.projectAudit(workbookPath)
      if (r.ok) setAudit({ referenced: r.referenced, missing: r.missing, unused: r.unused })
      else setAuditError(r.error)
    } finally {
      setBusy(null)
    }
  }

  const refreshProject = async () => {
    if (!renpyDir) return
    setBusy('refresh')
    setError(null)
    try {
      const r = await linkProject(renpyDir)
      if (!r.ok) setError(r.error ?? '刷新失败')
    } finally {
      setBusy(null)
    }
  }

  const shownEntries = useMemo(() => plan?.entries.slice(0, 360) ?? [], [plan])
  const hiddenEntries = (plan?.entries.length ?? 0) - shownEntries.length
  const missingPreview = audit?.missing.slice(0, 80) ?? []
  const unusedPreview = audit?.unused.slice(0, 80) ?? []

  return (
    <div className="flex h-full flex-col">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">工程</h2>
          <p className="mt-1 text-[13px] text-app-muted">关联工程的批量处理与资源维护</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshProject()}
          disabled={!renpyDir || busy === 'refresh'}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-app-border bg-white/45 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
        >
          {busy === 'refresh' ? <span className="spinner" /> : <RefreshCw size={14} />}
          刷新工程索引
        </button>
      </header>

      {!assets && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-200">
          <TriangleAlert size={14} />
          需要先关联 Ren&apos;Py 工程。
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,430px)_minmax(0,1fr)] gap-4">
        <section className="glass-card custom-scrollbar min-h-0 overflow-auto p-4">
          <div className="mb-4 flex items-center gap-2">
            <Gauge size={17} className="text-sky-500" />
            <h3 className="text-[15px] font-semibold text-app-text">音量归一化</h3>
          </div>

          <Field label="范围">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as AudioNormalizeScope)}
              className="glass-input h-9 w-full py-0"
            >
              {scopes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="标准">
            <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-app-border bg-black/5 p-0.5 dark:bg-white/5">
              {standards.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStandard(item.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    standard === item.value
                      ? 'bg-white text-app-text shadow-sm dark:bg-zinc-700'
                      : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </Field>

          {standard === 'lufs' && (
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="目标 LUFS" value={targetLufs} onChange={setTargetLufs} step={0.5} />
              <NumberField label="真峰值" value={truePeakDb} onChange={setTruePeakDb} step={0.5} />
              <NumberField label="LRA" value={lra} onChange={setLra} step={1} />
            </div>
          )}
          {standard === 'peak' && (
            <NumberField label="目标峰值 dBFS" value={targetPeakDb} onChange={setTargetPeakDb} step={0.5} />
          )}
          {standard === 'rms' && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="目标 RMS dB" value={targetRmsDb} onChange={setTargetRmsDb} step={0.5} />
              <NumberField label="限制峰值 dB" value={limitDb} onChange={setLimitDb} step={0.5} />
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField label="最小增益 dB" value={minGainDb} onChange={setMinGainDb} step={0.1} />
            <NumberField label="最大增益 dB" value={maxGainDb} onChange={setMaxGainDb} step={1} />
          </div>

          <label className="mt-3 flex items-center gap-2 text-[12px] text-app-muted">
            <input
              type="checkbox"
              checked={backup}
              onChange={(e) => setBackup(e.target.checked)}
              className="h-4 w-4 accent-sky-500"
            />
            写入前备份到 `.e2r-normalize-backup`
          </label>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={!canAnalyze || busy !== null}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 text-[12px] font-semibold text-white shadow-sm shadow-sky-500/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'analyze' ? <span className="spinner" /> : <AudioLines size={14} />}
              分析
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!plan || readyCount === 0 || busy !== null}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[12px] font-semibold text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'apply' ? <span className="spinner" /> : <CircleCheck size={14} />}
              应用
            </button>
          </div>

          {progress && (
            <div className="mt-3 rounded-lg border border-app-border bg-black/[0.03] px-3 py-2 text-[12px] text-app-muted dark:bg-white/[0.04]">
              {progress.phase === 'analyze' ? '分析' : '写入'} {Math.min(progress.index + 1, progress.total)}/{progress.total}
              <span className="ml-2 font-mono">{progress.rel}</span>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-300">
              {error}
            </div>
          )}

          {applied && (
            <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-600 dark:text-emerald-300">
              已处理 {applied.processed} 个文件，失败 {applied.failed} 个。
            </div>
          )}
        </section>

        <section className="glass-card min-h-0 overflow-hidden">
          <div className="grid grid-cols-[minmax(180px,1fr)_82px_82px_82px_82px_110px] gap-3 border-b border-app-border bg-black/5 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-app-muted dark:bg-white/5">
            <span>文件</span>
            <span>大小</span>
            <span>LUFS</span>
            <span>峰值</span>
            <span>RMS</span>
            <span>状态</span>
          </div>
          <div className="custom-scrollbar h-full overflow-auto pb-12">
            {!plan ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-app-muted">
                <AudioLines size={36} strokeWidth={1.2} />
                <p className="text-[13px]">{busy === 'analyze' ? '正在分析…' : '先分析表格范围内音频'}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-app-border px-4 py-3 text-[12px] text-app-muted">
                  <span>{plan.scopeLabel}</span>
                  <Chip>总数 {plan.summary.total}</Chip>
                  <Chip>待处理 {plan.summary.ready}</Chip>
                  <Chip>跳过 {plan.summary.skipped}</Chip>
                  <Chip>错误 {plan.summary.error}</Chip>
                  <Chip>平均增益 {formatDb(plan.summary.avgGainDb)}</Chip>
                </div>
                {shownEntries.map((entry) => (
                  <div
                    key={entry.filePath}
                    className="grid grid-cols-[minmax(180px,1fr)_82px_82px_82px_82px_110px] items-center gap-3 border-b border-app-border/70 px-4 py-2.5 text-[12px] last:border-b-0"
                  >
                    <span className="truncate font-mono text-app-text" title={entry.filePath}>
                      {entry.rel}
                    </span>
                    <span className="font-mono text-app-muted">{formatSize(entry.size)}</span>
                    <span className="font-mono text-app-muted">{formatDb(entry.measuredLufs, '')}</span>
                    <span className="font-mono text-app-muted">{formatDb(entry.measuredPeakDb)}</span>
                    <span className="font-mono text-app-muted">{formatDb(entry.measuredRmsDb)}</span>
                    <span
                      className={`truncate ${
                        entry.status === 'ready'
                          ? 'text-emerald-500'
                          : entry.status === 'error'
                            ? 'text-rose-500'
                            : 'text-app-muted'
                      }`}
                      title={statusText(entry)}
                    >
                      {entry.status === 'ready' ? `${formatDb(entry.gainDb)} 增益` : statusText(entry)}
                    </span>
                  </div>
                ))}
                {hiddenEntries > 0 && (
                  <div className="px-4 py-3 text-[12px] text-app-muted">
                    还有 {hiddenEntries} 个文件未在列表中展开。
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      <section className="glass-card mt-4 shrink-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
          <div className="flex items-center gap-2">
            <SearchCheck size={16} className="text-sky-500" />
            <h3 className="text-[14px] font-semibold text-app-text">资源体检</h3>
          </div>
          <button
            type="button"
            onClick={() => void runAudit()}
            disabled={!workbookPath || !assets || busy !== null}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white/45 px-3 text-[12px] font-medium text-app-text hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            {busy === 'audit' ? <span className="spinner" /> : <SearchCheck size={13} />}
            体检
          </button>
        </div>
        {auditError ? (
          <div className="px-4 py-3 text-[12px] text-rose-500">{auditError}</div>
        ) : audit ? (
          <div className="grid max-h-[220px] grid-cols-2 gap-4 overflow-auto p-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[12px] text-app-muted">
                引用图片 {audit.referenced.images} · 引用音频 {audit.referenced.audio} · 缺失 {audit.missing.length}
              </div>
              <div className="custom-scrollbar max-h-[160px] overflow-auto rounded-lg border border-app-border">
                {missingPreview.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-emerald-500">未发现缺失引用</div>
                ) : (
                  missingPreview.map((item, i) => (
                    <div key={`${item.kind}-${item.name}-${i}`} className="border-b border-app-border/70 px-3 py-2 text-[12px] last:border-b-0">
                      <span className="mr-2 rounded bg-rose-400/12 px-1.5 py-0.5 text-rose-500">
                        {item.kind === 'image' ? '图片' : '音频'}
                      </span>
                      <span className="font-mono text-app-text">{item.name}</span>
                      <span className="ml-2 text-app-muted">{item.sheet}:{item.row} · {item.source}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[12px] text-app-muted">当前表格未引用资源 {audit.unused.length}</div>
              <div className="custom-scrollbar max-h-[160px] overflow-auto rounded-lg border border-app-border">
                {unusedPreview.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-emerald-500">未发现未引用资源</div>
                ) : (
                  unusedPreview.map((item) => (
                    <div key={`${item.kind}-${item.rel}`} className="border-b border-app-border/70 px-3 py-2 text-[12px] last:border-b-0">
                      <span className="mr-2 rounded bg-black/5 px-1.5 py-0.5 text-app-muted dark:bg-white/10">
                        {item.kind === 'image' ? '图片' : '音频'}
                      </span>
                      <span className="font-mono text-app-text">{item.rel}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 text-[12px] text-app-muted">选择工作簿并关联工程后可执行体检。</div>
        )}
      </section>
    </div>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[12px] font-medium text-app-muted">{props.label}</span>
      {props.children}
    </label>
  )
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-app-muted">{props.label}</span>
      <input
        type="number"
        value={props.value}
        step={props.step ?? 1}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="glass-input h-9 w-full py-0 font-mono text-[12px]"
      />
    </label>
  )
}

function Chip(props: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-black/5 px-2 py-1 text-[11px] font-medium text-app-muted dark:bg-white/10">
      {props.children}
    </span>
  )
}
