import { useCallback } from 'react'
import { Link2, Link2Off } from 'lucide-react'
import { PathPicker } from './PathPicker'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

// 共享工作区栏：一处选工作簿 + 关联工程，三页共用，避免重复
export function WorkspaceBar() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const setWorkbookPath = useWorkspaceStore((s) => s.setWorkbookPath)
  const assets = useWorkspaceStore((s) => s.assets)
  const linkProject = useWorkspaceStore((s) => s.linkProject)
  const clearProject = useWorkspaceStore((s) => s.clearProject)

  const onLink = useCallback(async () => {
    const dir = await window.e2r.selectDir()
    if (dir) await linkProject(dir)
  }, [linkProject])

  const count = assets ? Object.keys(assets.images).length + Object.keys(assets.audio).length : 0

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-app-border px-6 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">工作簿</span>
      <div className="min-w-0 max-w-[560px] flex-1">
        <PathPicker
          value={workbookPath}
          onChange={setWorkbookPath}
          mode="file"
          placeholder="拖入或选择 .xlsx / .xls 文件…"
          ariaLabel="工作簿"
        />
      </div>
      {assets ? (
        <button
          type="button"
          onClick={clearProject}
          title={`${assets.gamePath}（点击解除）`}
          className="nodrag flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-400/20 dark:text-emerald-300"
        >
          <Link2 size={14} /> 已关联工程 · {count} 资源
          <Link2Off size={13} className="ml-0.5 opacity-70" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onLink}
          className="nodrag flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-app-border bg-white/40 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/70 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
        >
          <Link2 size={14} /> 关联 Ren&apos;Py 工程
        </button>
      )}
    </div>
  )
}
