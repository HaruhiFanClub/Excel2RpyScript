import { useEffect, useRef, useState } from 'react'
import {
  FileSpreadsheet,
  Eye,
  Download,
  FileCode2,
  Copy,
  Check,
  TriangleAlert,
  Layers,
} from 'lucide-react'
import type { ConversionMode } from '@e2r/core'
import type { ConvertResult, PreviewData, PreviewResult, RpyFile } from '../../shared/ipc'
import { PathPicker } from '../components/PathPicker'

const MODES: { id: ConversionMode; label: string; hint: string }[] = [
  { id: 'default', label: '默认', hint: '修正 + 告警' },
  { id: 'legacy-compat', label: '旧版兼容', hint: '逐字符一致' },
]

export default function ConvertPage() {
  const [workbookPath, setWorkbookPath] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [mode, setMode] = useState<ConversionMode>('default')

  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [exportedDir, setExportedDir] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<'preview' | 'convert' | null>(null)

  const apply = (r: PreviewResult | ConvertResult, exported: string | null) => {
    if (r.ok) {
      setPreview({
        sheetNames: r.sheetNames,
        files: r.files,
        warnings: r.warnings,
        readWarningCount: r.readWarningCount,
      })
      setActiveIndex(0)
      setExportedDir(exported)
      setError(null)
    } else {
      setError(r.error)
    }
  }

  const runPreview = async () => {
    if (!workbookPath) return
    setLoading('preview')
    setError(null)
    try {
      apply(await window.e2r.preview({ xlsxPath: workbookPath, mode }), null)
    } finally {
      setLoading(null)
    }
  }

  const runConvert = async () => {
    if (!workbookPath) return
    setLoading('convert')
    setError(null)
    try {
      const r = await window.e2r.convert({
        xlsxPath: workbookPath,
        outDir: outputDir || null,
        mode,
      })
      apply(r, r.ok ? r.outDir : null)
    } finally {
      setLoading(null)
    }
  }

  // 开发钩子：E2R_DEMO 自动预览
  const demoRan = useRef(false)
  useEffect(() => {
    const demo = window.e2r.demoFile
    if (demo && !demoRan.current) {
      demoRan.current = true
      setWorkbookPath(demo)
      setLoading('preview')
      window.e2r
        .preview({ xlsxPath: demo, mode: 'default' })
        .then((r) => apply(r, null))
        .finally(() => setLoading(null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeFile: RpyFile | undefined = preview?.files[activeIndex]

  const handleCopy = async () => {
    if (!activeFile) return
    await navigator.clipboard.writeText(activeFile.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mb-5">
        <h2 className="text-[20px] font-semibold text-app-text">Excel → Ren&apos;Py 转换</h2>
        <p className="mt-1 text-[13px] text-app-muted">
          解析剧本表格并生成 Ren&apos;Py 脚本，与旧工具逐字符对齐，可在导出前预览
        </p>
      </header>

      {/* 路径 + 模式 */}
      <section className="glass-card mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-app-muted">工作簿</label>
            <PathPicker
              value={workbookPath}
              onChange={setWorkbookPath}
              mode="file"
              placeholder="拖入或选择 .xlsx / .xls 文件…"
              ariaLabel="工作簿路径"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-app-muted">
              输出目录
            </label>
            <PathPicker
              value={outputDir}
              onChange={setOutputDir}
              mode="directory"
              placeholder="默认：表格所在目录"
              ariaLabel="输出目录"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">模式</span>
          <div className="inline-flex rounded-[10px] border border-app-border bg-black/5 p-0.5 dark:bg-white/5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  mode === m.id
                    ? 'bg-white text-app-text shadow-sm dark:bg-zinc-700'
                    : 'text-app-muted hover:text-app-text'
                }`}
              >
                {m.label}
                <span className="text-[10px] text-app-muted">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 操作条 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[12px] text-app-muted">
          {error ? (
            <span className="flex items-center gap-1.5 text-rose-500">
              <TriangleAlert size={13} /> {error}
            </span>
          ) : preview ? (
            <>
              <span className="flex items-center gap-1.5">
                <Layers size={13} /> {preview.sheetNames.length} sheet · {preview.files.length} 文件
              </span>
              {preview.warnings.length > 0 && (
                <span className="flex items-center gap-1.5 text-amber-500">
                  <TriangleAlert size={13} /> {preview.warnings.length} 告警
                </span>
              )}
              {exportedDir && <span className="text-emerald-500">已导出 → {exportedDir}</span>}
            </>
          ) : (
            '尚未预览'
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={!workbookPath || loading !== null}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3.5 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            {loading === 'preview' ? <span className="spinner" /> : <Eye size={14} />}
            预览
          </button>
          <button
            type="button"
            onClick={runConvert}
            disabled={!workbookPath || loading !== null}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === 'convert' ? <span className="spinner" /> : <Download size={14} />}
            转换并导出
          </button>
        </div>
      </div>

      {/* 预览区 */}
      <section className="glass-card flex min-h-0 flex-1 flex-col overflow-hidden">
        {preview && preview.files.length > 0 ? (
          <>
            <div className="flex items-center gap-1 overflow-x-auto border-b border-app-border bg-black/5 px-2 py-1.5 dark:bg-white/5">
              {preview.files.map((file, i) => (
                <button
                  key={file.label}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    i === activeIndex
                      ? 'bg-white text-app-text shadow-sm dark:bg-zinc-700'
                      : 'text-app-muted hover:bg-white/50 dark:hover:bg-zinc-700/50'
                  }`}
                >
                  <FileCode2 size={11} />
                  {file.label}.rpy
                  <span className="text-app-muted">{(file.bytes / 1024).toFixed(0)}K</span>
                </button>
              ))}
              <div className="flex-1" />
              {activeFile && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-app-muted transition-colors hover:bg-white/50 hover:text-app-text dark:hover:bg-zinc-700/50"
                >
                  {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                  {copied ? '已复制' : '复制'}
                </button>
              )}
            </div>
            <pre className="custom-scrollbar code-block flex-1 overflow-auto p-4 text-app-text">
              {activeFile?.content}
            </pre>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-app-muted">
            <FileSpreadsheet size={36} strokeWidth={1.2} />
            <p className="text-[13px]">选择工作簿后点击「预览」查看转换结果</p>
          </div>
        )}
      </section>
    </div>
  )
}
