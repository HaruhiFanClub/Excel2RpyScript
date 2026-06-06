import { useEffect, useMemo, useState } from 'react'
import { CircleAlert, TriangleAlert, Info, ShieldCheck, RefreshCw, FileSpreadsheet } from 'lucide-react'
import type { CheckIssue, CheckSummary } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { PathPicker } from '../components/PathPicker'

type Severity = CheckIssue['severity']
type Filter = 'all' | Severity

const META: Record<Severity, { label: string; Icon: typeof CircleAlert; cls: string; chip: string }> = {
  error: {
    label: '错误',
    Icon: CircleAlert,
    cls: 'text-rose-500',
    chip: 'bg-rose-500/12 text-rose-600 dark:text-rose-300',
  },
  warn: {
    label: '警告',
    Icon: TriangleAlert,
    cls: 'text-amber-500',
    chip: 'bg-amber-400/15 text-amber-600 dark:text-amber-300',
  },
  info: {
    label: '提示',
    Icon: Info,
    cls: 'text-sky-500',
    chip: 'bg-sky-400/15 text-sky-600 dark:text-sky-300',
  },
}

export default function CheckPage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const setWorkbookPath = useWorkspaceStore((s) => s.setWorkbookPath)

  const [issues, setIssues] = useState<CheckIssue[] | null>(null)
  const [summary, setSummary] = useState<CheckSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const run = async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = await window.e2r.check(path)
      if (r.ok) {
        setIssues(r.issues)
        setSummary(r.summary)
      } else {
        setError(r.error)
        setIssues(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (workbookPath) void run(workbookPath)
    else {
      setIssues(null)
      setSummary(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbookPath])

  const shown = useMemo(
    () => (issues ?? []).filter((i) => filter === 'all' || i.severity === filter),
    [issues, filter],
  )

  const total = summary ? summary.error + summary.warn + summary.info : 0

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">检查</h2>
          <p className="mt-1 text-[13px] text-app-muted">
            按填写规范扫描剧本，发现错误 / 警告 / 提示
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[360px]">
            <PathPicker
              value={workbookPath}
              onChange={setWorkbookPath}
              mode="file"
              placeholder="拖入或选择 .xlsx / .xls 文件…"
              ariaLabel="工作簿"
            />
          </div>
          <button
            type="button"
            onClick={() => workbookPath && run(workbookPath)}
            disabled={!workbookPath || loading}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? <span className="spinner" /> : <RefreshCw size={14} />} 重新检查
          </button>
        </div>
      </header>

      {/* 概览 chips（兼作筛选） */}
      {summary && (
        <div className="mb-3 flex items-center gap-2">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')} cls="bg-black/5 text-app-text dark:bg-white/10">
            全部 {total}
          </Chip>
          {(['error', 'warn', 'info'] as Severity[]).map((sev) => (
            <Chip key={sev} active={filter === sev} onClick={() => setFilter(sev)} cls={META[sev].chip}>
              {META[sev].label} {summary[sev]}
            </Chip>
          ))}
        </div>
      )}

      <section className="glass-card custom-scrollbar min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="flex h-full items-center justify-center p-10 text-rose-500">
            读取失败：{error}
          </div>
        ) : !issues ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-app-muted">
            <FileSpreadsheet size={36} strokeWidth={1.2} />
            <p className="text-[13px]">{loading ? '检查中…' : '选择工作簿开始检查'}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-emerald-500">
            <ShieldCheck size={40} strokeWidth={1.3} />
            <p className="text-[13px]">{total === 0 ? '未发现问题，一切正常' : '该类别下没有问题'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-app-border">
            {shown.map((it, i) => {
              const m = META[it.severity]
              return (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
                  <m.Icon size={15} className={`mt-0.5 shrink-0 ${m.cls}`} />
                  <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-app-muted dark:bg-white/10">
                    {it.sheet}:{it.row}
                  </span>
                  <span className="flex-1 text-[13px] text-app-text">{it.message}</span>
                  <code className="shrink-0 text-[11px] text-app-muted">{it.code}</code>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Chip(props: { active: boolean; onClick: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all ${props.cls} ${
        props.active ? 'ring-2 ring-sky-400/50' : 'opacity-80 hover:opacity-100'
      }`}
    >
      {props.children}
    </button>
  )
}
