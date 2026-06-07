import { useEffect, useMemo, useState } from 'react'
import {
  FileSpreadsheet,
  Download,
  FileCode2,
  TriangleAlert,
  Layers,
  Upload,
  CircleCheck,
} from 'lucide-react'
import type { RpyFile } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

type FileAction = 'export' | 'apply'
const fileKey = (file: RpyFile, index: number): string => `${index}:${file.label}`

export default function ConvertPage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const assets = useWorkspaceStore((s) => s.assets)
  const storedResult = useWorkspaceStore((s) => s.convertResult)
  const convertWorkbookPath = useWorkspaceStore((s) => s.convertWorkbookPath)
  const converting = useWorkspaceStore((s) => s.converting)
  const convertError = useWorkspaceStore((s) => s.convertError)
  const runConvert = useWorkspaceStore((s) => s.runConvert)
  const sheetChanges = useWorkspaceStore((s) => s.sheetChanges)
  const clearSheetChanges = useWorkspaceStore((s) => s.clearSheetChanges)

  const result = storedResult && convertWorkbookPath === workbookPath ? storedResult : null
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, FileAction | undefined>>({})
  const [done, setDone] = useState<Record<string, string | undefined>>({})
  const [syncing, setSyncing] = useState(false)
  const displayError = error ?? convertError

  const pendingSheetNames = useMemo(
    () => (sheetChanges.workbookPath === workbookPath ? Object.keys(sheetChanges.sheets) : []),
    [sheetChanges, workbookPath],
  )
  const pendingSheetSet = useMemo(() => new Set(pendingSheetNames), [pendingSheetNames])

  useEffect(() => {
    setDone({})
  }, [result])

  const warningsByFile = useMemo(() => {
    const out = new Map<number, number>()
    for (const w of result?.warnings ?? []) out.set(w.sheetIndex, (out.get(w.sheetIndex) ?? 0) + 1)
    return out
  }, [result])

  const runFileAction = async (file: RpyFile, index: number, action: FileAction) => {
    const key = fileKey(file, index)
    setBusy((prev) => ({ ...prev, [key]: action }))
    setError(null)
    try {
      const sheetName = result?.sheetNames[index] ?? ''
      let target = file
      if (converting && workbookPath) {
        const latest = await runConvert(workbookPath)
        if (!latest) return
        target = latest.files[index] ?? file
      }
      const r =
        action === 'export'
          ? await window.e2r.exportRpyFile(target)
          : await window.e2r.applyRpyFile(target, workbookPath, sheetName)
      if (r.ok) {
        setDone((prev) => ({
          ...prev,
          [key]: action === 'export' ? `已导出：${r.path}` : `已应用：${r.path}`,
        }))
        if (action === 'apply' && sheetName) clearSheetChanges([sheetName], workbookPath)
      } else if (r.error) {
        setError(r.error)
      }
    } finally {
      setBusy((prev) => ({ ...prev, [key]: undefined }))
    }
  }

  const applyChangedSheets = async (sheetNames: string[]) => {
    if (!assets || !result || sheetNames.length === 0) return
    setSyncing(true)
    setError(null)
    try {
      const base = converting && workbookPath ? await runConvert(workbookPath) : result
      if (!base) return
      const applied: string[] = []
      for (const sheetName of sheetNames) {
        const index = base.sheetNames.indexOf(sheetName)
        const file = index >= 0 ? base.files[index] : undefined
        if (!file) {
          setError(`未找到 sheet "${sheetName}" 对应的脚本`)
          break
        }
        const r = await window.e2r.applyRpyFile(file, workbookPath, sheetName)
        if (r.ok) {
          applied.push(sheetName)
          setDone((prev) => ({ ...prev, [fileKey(file, index)]: `已应用：${r.path}` }))
        } else if (r.error) {
          setError(r.error)
          break
        }
      }
      if (applied.length > 0) clearSheetChanges(applied, workbookPath)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mb-5">
        <h2 className="text-[20px] font-semibold text-app-text">Excel → Ren&apos;Py 转换</h2>
        <p className="mt-1 text-[13px] text-app-muted">
          解析剧本表格并生成 Ren&apos;Py 脚本；生成后可按文件单独导出或应用到关联工程
        </p>
      </header>

      <div className="mb-4 flex items-center gap-3 text-[12px] text-app-muted">
        {displayError ? (
          <span className="flex items-center gap-1.5 text-rose-500">
            <TriangleAlert size={13} /> {displayError}
          </span>
        ) : converting ? (
          <span className="flex items-center gap-1.5">
            <span className="spinner" /> 自动转换中
          </span>
        ) : !result ? (
          <span>{workbookPath ? '正在等待自动转换结果' : '选择工作簿后自动生成脚本列表'}</span>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <Layers size={13} /> {result.sheetNames.length} sheet · {result.files.length} 文件
            </span>
            {result.warnings.length > 0 && (
              <span className="flex items-center gap-1.5 text-amber-500">
                <TriangleAlert size={13} /> {result.warnings.length} 告警
              </span>
            )}
            {result.readWarningCount > 0 && <span>读取告警 {result.readWarningCount}</span>}
          </>
        )}
      </div>

      {pendingSheetNames.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-200">
          <TriangleAlert size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">
            已保存、脚本列表已自动更新，但尚未应用到工程：{pendingSheetNames.join('、')}
          </span>
          <button
            type="button"
            onClick={() => void applyChangedSheets(pendingSheetNames)}
            disabled={!assets || !result || syncing}
            title={assets ? '覆盖这些 sheet 当前脚本到关联工程' : '需要先关联 Ren’Py 工程'}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[12px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {syncing ? <span className="spinner" /> : <Upload size={13} />}
            应用全部更改
          </button>
        </div>
      )}

      <section className="glass-card min-h-0 flex-1 overflow-hidden">
        {result && result.files.length > 0 ? (
          <div className="custom-scrollbar h-full overflow-auto">
            <div className="grid grid-cols-[minmax(180px,1fr)_minmax(120px,220px)_90px_100px_220px] gap-3 border-b border-app-border bg-black/5 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-app-muted dark:bg-white/5">
              <span>脚本</span>
              <span>来源</span>
              <span>大小</span>
              <span>告警</span>
              <span className="text-right">操作</span>
            </div>
            {result.files.map((file, i) => {
              const key = fileKey(file, i)
              const fileBusy = busy[key]
              const warnCount = warningsByFile.get(i) ?? 0
              const sourceSheet = result.sheetNames[i] ?? ''
              const sheetChanged = pendingSheetSet.has(sourceSheet)
              return (
                <div
                  key={key}
                  className="grid grid-cols-[minmax(180px,1fr)_minmax(120px,220px)_90px_100px_220px] items-center gap-3 border-b border-app-border/70 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-app-text">
                      <FileCode2 size={14} className="shrink-0 text-app-muted" />
                      <span className="truncate font-mono">{file.label}.rpy</span>
                    </div>
                    {done[key] && (
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-300">
                        <CircleCheck size={12} className="shrink-0" />
                        <span className="truncate">{done[key]}</span>
                      </div>
                    )}
                    {sheetChanged && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-500">
                        <TriangleAlert size={12} className="shrink-0" />
                        <span>脚本已自动更新，尚未应用到工程</span>
                      </div>
                    )}
                  </div>
                  <span className="truncate text-[12px] text-app-muted">{sourceSheet || '-'}</span>
                  <span className="font-mono text-[12px] text-app-muted">{(file.bytes / 1024).toFixed(1)}K</span>
                  <span className={warnCount ? 'text-[12px] text-amber-500' : 'text-[12px] text-app-muted'}>
                    {warnCount || '-'}
                  </span>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void runFileAction(file, i, 'export')}
                      disabled={!!fileBusy}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white/45 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
                    >
                      {fileBusy === 'export' ? <span className="spinner" /> : <Download size={13} />}
                      导出
                    </button>
                    <button
                      type="button"
                      onClick={() => void runFileAction(file, i, 'apply')}
                      disabled={!assets || !!fileBusy}
                      title={assets ? '覆盖到关联工程 game/ 中的同名脚本' : '需要先关联 Ren’Py 工程'}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {fileBusy === 'apply' ? <span className="spinner" /> : <Upload size={13} />}
                      应用到工程
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-app-muted">
            <FileSpreadsheet size={36} strokeWidth={1.2} />
            <p className="text-[13px]">
              {converting ? '正在自动转换…' : '选择工作簿后自动生成脚本列表'}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
