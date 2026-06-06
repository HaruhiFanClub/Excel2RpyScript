import { useState } from 'react'
import { GitCompare, ArrowRight, Plus, Minus, PencilLine } from 'lucide-react'
import type { DiffReport } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { PathPicker } from './PathPicker'

export function DiffPanel() {
  const newPath = useWorkspaceStore((s) => s.workbookPath)
  const [oldPath, setOldPath] = useState('')
  const [report, setReport] = useState<DiffReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">旧表</span>
        <div className="w-[360px]">
          <PathPicker value={oldPath} onChange={setOldPath} mode="file" placeholder="选择旧版 .xlsx…" />
        </div>
        <ArrowRight size={14} className="text-app-muted" />
        <span className="truncate font-mono text-[12px] text-app-muted">
          新：{newPath ? newPath.split('/').pop() : '（用工作区当前表）'}
        </span>
        <button
          type="button"
          onClick={run}
          disabled={!oldPath || !newPath || loading}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:opacity-50"
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
                  <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-app-text">
                    {s.name}
                    {s.status !== 'common' && (
                      <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] uppercase text-app-muted dark:bg-white/10">
                        {s.status === 'added' ? '新 sheet' : '已删除 sheet'}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {s.changed.map((c, i) => (
                      <li key={`c${i}`} className="text-[12px]">
                        <span className="mr-2 font-mono text-amber-500">~{c.excelRowNew}</span>
                        <span className="text-app-muted">{c.role}</span>{' '}
                        <span className="text-app-text">{c.text || '（无台词）'}</span>
                        <div className="ml-7 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {c.fields.map((f, k) => (
                            <span key={k} className="font-mono text-[11px]">
                              <span className="text-app-muted">{f.header}：</span>
                              <span className="text-rose-500 line-through">{f.old || '∅'}</span>
                              <ArrowRight size={9} className="mx-0.5 inline text-app-muted" />
                              <span className="text-emerald-600 dark:text-emerald-400">{f.new || '∅'}</span>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                    {s.added.map((a, i) => (
                      <li key={`a${i}`} className="text-[12px] text-emerald-600 dark:text-emerald-400">
                        <span className="mr-2 font-mono">+{a.excelRow}</span>
                        <span className="opacity-70">{a.role}</span> {a.text}
                      </li>
                    ))}
                    {s.removed.map((r, i) => (
                      <li key={`r${i}`} className="text-[12px] text-rose-500">
                        <span className="mr-2 font-mono">−{r.excelRow}</span>
                        <span className="opacity-70">{r.role}</span>{' '}
                        <span className="line-through">{r.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
