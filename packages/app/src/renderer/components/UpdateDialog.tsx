import { AlertTriangle, CheckCircle2, Download, ExternalLink, RefreshCw, X } from 'lucide-react'
import type { UpdateCheckResult } from '../../shared/ipc'

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function UpdateDialog(props: {
  open: boolean
  checking: boolean
  result: UpdateCheckResult | null
  onClose: () => void
  onCheck: () => void
}) {
  const { open, checking, result, onClose, onCheck } = props
  if (!open) return null

  const canDownload = Boolean(result?.updateAvailable && (result.downloadUrl || result.releaseUrl))
  const publishedAt = formatDate(result?.publishedAt ?? null)
  const title = checking
    ? '正在检查更新'
    : result?.updateAvailable
      ? '发现新版本'
      : result?.ok
        ? '已是最新版本'
        : '检查更新失败'

  const Icon = checking ? RefreshCw : result?.updateAvailable ? Download : result?.ok ? CheckCircle2 : AlertTriangle

  return (
    <div className="nodrag fixed inset-0 z-50 flex items-center justify-center bg-slate-950/24 px-4 backdrop-blur-sm">
      <section className="w-full max-w-[520px] overflow-hidden rounded-xl border border-app-border bg-white/95 shadow-2xl dark:bg-slate-900/96">
        <header className="flex items-center gap-3 border-b border-app-border px-5 py-4">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              result?.updateAvailable
                ? 'bg-sky-400/15 text-sky-600 dark:text-sky-300'
                : result?.ok
                  ? 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300'
                  : 'bg-amber-400/15 text-amber-600 dark:text-amber-300'
            }`}
          >
            <Icon size={18} className={checking ? 'animate-spin' : ''} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-app-text">{title}</h2>
            <p className="mt-0.5 truncate text-[12px] text-app-muted">
              当前版本 {result?.currentVersion || '...'}
              {result?.latestVersion ? ` · 最新版本 ${result.latestVersion}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-black/5 hover:text-app-text dark:hover:bg-white/8"
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {checking && <p className="text-[13px] text-app-muted">正在连接更新源...</p>}

          {!checking && result?.error && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-200">
              {result.error}
            </p>
          )}

          {!checking && result?.updateAvailable && (
            <p className="text-[13px] leading-6 text-app-text">
              新版本已经发布，可以下载后替换当前应用。Windows 默认提供 zip 免安装包，同时保留安装包。
            </p>
          )}

          {!checking && result?.ok && !result.updateAvailable && (
            <p className="text-[13px] leading-6 text-app-muted">当前安装的版本已经是最新。</p>
          )}

          {!checking && result?.releaseNotes && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-app-text">更新说明</span>
                {publishedAt && <span className="text-[11px] text-app-muted">{publishedAt}</span>}
              </div>
              <pre className="custom-scrollbar max-h-44 overflow-auto rounded-lg border border-app-border bg-black/[0.035] p-3 font-sans text-[12px] leading-5 text-app-muted whitespace-pre-wrap dark:bg-white/[0.04]">
                {result.releaseNotes}
              </pre>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-app-border px-5 py-3">
          <button
            type="button"
            onClick={onCheck}
            disabled={checking}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-800/50 dark:hover:bg-zinc-700/70"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            重新检查
          </button>
          <div className="flex items-center gap-2">
            {result?.releaseUrl && (
              <button
                type="button"
                onClick={() => window.e2r.openExternal(result.releaseUrl!)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 dark:bg-zinc-800/50 dark:hover:bg-zinc-700/70"
              >
                <ExternalLink size={14} />
                发布页
              </button>
            )}
            <button
              type="button"
              disabled={!canDownload}
              onClick={() => {
                const url = result?.downloadUrl || result?.releaseUrl
                if (url) window.e2r.openExternal(url)
              }}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
            >
              <Download size={14} />
              下载更新
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
