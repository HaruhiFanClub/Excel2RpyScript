import { useEffect, useState } from 'react'
import { GitCompare, ArrowRight, Plus, Minus, PencilLine, FileSpreadsheet } from 'lucide-react'
import type { DiffReport } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { PathPicker } from './PathPicker'

export function DiffPanel() {
  const [oldPath, setOldPath] = useState('')
  const workspacePath = useWorkspaceStore((s) => s.workbookPath)
  const [newPath, setNewPath] = useState('')
  const [report, setReport] = useState<DiffReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!newPath && workspacePath) setNewPath(workspacePath)
  }, [newPath, workspacePath])

  const updateOldPath = (path: string) => {
    setOldPath(path)
    setReport(null)
    setError(null)
  }

  const updateNewPath = (path: string) => {
    setNewPath(path)
    setReport(null)
    setError(null)
  }

  const run = async () => {
    if (!oldPath || !newPath) return
    setLoading(true)
    setError(null)
    try {
      const r = await window.e2r.diff(oldPath, newPath)
      if (r.ok) setReport(r.report)
      else {
        setError(r.error)
        setReport(null)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-app-muted">旧表</div>
          <PathPicker value={oldPath} onChange={updateOldPath} mode="file" placeholder="选择或拖入旧版 .xlsx…" />
        </div>
        <ArrowRight size={14} className="mb-2 text-app-muted" />
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">新表</span>
            {workspacePath && workspacePath !== newPath && (
              <button
                type="button"
                onClick={() => updateNewPath(workspacePath)}
                className="text-[11px] text-sky-600 hover:text-sky-700 dark:text-sky-300"
              >
                使用当前表
              </button>
            )}
          </div>
          <PathPicker value={newPath} onChange={updateNewPath} mode="file" placeholder="选择或拖入新版 .xlsx…" />
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!oldPath || !newPath || loading}
          className="mb-0.5 flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:opacity-50"
        >
          {loading ? <span className="spinner" /> : <GitCompare size={14} />} 对比
        </button>
      </div>

      {report && (
        <div className="mb-3 flex items-center gap-2 text-[12px]">
          <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-600 dark:text-emerald-300">
            <Plus size={12} /> 新增 {report.summary.added}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-rose-500/12 px-2.5 py-1 text-rose-600 dark:text-rose-300">
            <Minus size={12} /> 删除 {report.summary.removed}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-600 dark:text-amber-300">
            <PencilLine size={12} /> 修改 {report.summary.changed}
          </span>
        </div>
      )}

      <section className="glass-card custom-scrollbar min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="flex h-full items-center justify-center p-10 text-rose-500">{error}</div>
        ) : !report ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-app-muted">
            <GitCompare size={36} strokeWidth={1.2} />
            <p className="text-[13px]">选择旧表后点击「对比」，生成差异报告</p>
          </div>
        ) : report.summary.added + report.summary.removed + report.summary.changed === 0 ? (
          <div className="flex h-full items-center justify-center p-10 text-emerald-500">两版完全一致</div>
        ) : (
          <div className="divide-y divide-app-border">
            {report.sheets
              .filter((s) => s.added.length || s.removed.length || s.changed.length)
              .map((s) => (
                <div key={s.name} className="px-4 py-3">
                  <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-app-text">
                    <FileSpreadsheet size={14} className="text-app-muted" />
                    <span>{s.name}</span>
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-app-muted dark:bg-white/10">
                      +{s.added.length} -{s.removed.length} ~{s.changed.length}
                    </span>
                    {s.status !== 'common' && (
                      <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] uppercase text-app-muted dark:bg-white/10">
                        {s.status === 'added' ? '新 sheet' : '已删除 sheet'}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {sheetOps(s).map((op, i) => {
                      if (op.type === 'changed') return <ChangedOp key={i} change={op.change} />
                      if (op.type === 'added') {
                        return (
                          <li key={i} className="rounded-lg bg-emerald-400/8 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                            <span className="mr-2 font-mono">+{op.row.excelRow}</span>
                            <span className="opacity-70">{op.row.role}</span> {op.row.text || '（无台词）'}
                          </li>
                        )
                      }
                      return (
                        <li key={i} className="rounded-lg bg-rose-500/8 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-300">
                          <span className="mr-2 font-mono">-{op.row.excelRow}</span>
                          <span className="opacity-70">{op.row.role}</span>{' '}
                          <span className="line-through">{op.row.text || '（无台词）'}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}

function sheetOps(sheet: DiffReport['sheets'][number]) {
  return sheet.ops ?? [
    ...sheet.changed.map((change) => ({ type: 'changed' as const, change })),
    ...sheet.removed.map((row) => ({ type: 'removed' as const, row })),
    ...sheet.added.map((row) => ({ type: 'added' as const, row })),
  ]
}

function ChangedOp({ change }: { change: DiffReport['sheets'][number]['changed'][number] }) {
  return (
    <li className="rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-[12px]">
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <span className="font-mono text-amber-600 dark:text-amber-300">
          {`~${change.excelRowOld}->${change.excelRowNew}`}
        </span>
        <span className="truncate text-app-muted">{change.newRole || change.oldRole || '（无角色）'}</span>
        <span className="min-w-0 truncate text-app-text">{change.newText || change.oldText || '（无台词）'}</span>
      </div>
      <div className="space-y-1">
        {change.fields.map((f, k) => (
          <div key={k} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 font-mono text-[11px]">
            <span className="text-right text-app-muted">{f.header}</span>
            <div className="min-w-0 space-y-0.5">
              <div className="min-w-0 rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-600 dark:text-rose-300">
                <span className="mr-1">-</span>
                <span className="break-words">{f.old || '∅'}</span>
              </div>
              <div className="min-w-0 rounded bg-emerald-400/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                <span className="mr-1">+</span>
                <span className="break-words">{f.new || '∅'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </li>
  )
}
