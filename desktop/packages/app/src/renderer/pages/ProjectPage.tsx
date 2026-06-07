import { useCallback, useState } from 'react'
import { Rocket, FolderGit2, FileCode2, AudioLines, CircleCheck, TriangleAlert, Link2 } from 'lucide-react'
import type { DeployResult } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

const assetCount = (map: Record<string, string>): number => new Set(Object.values(map)).size

export default function ProjectPage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const assets = useWorkspaceStore((s) => s.assets)
  const linkProject = useWorkspaceStore((s) => s.linkProject)
  const clearSheetChanges = useWorkspaceStore((s) => s.clearSheetChanges)

  const [scripts, setScripts] = useState(true)
  const [enableVoice, setEnableVoice] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DeployResult | null>(null)

  const onLink = useCallback(async () => {
    const dir = await window.e2r.selectDir()
    if (dir) await linkProject(dir)
  }, [linkProject])

  const deploy = useCallback(async () => {
    if (!workbookPath || !assets) return
    setBusy(true)
    setResult(null)
    try {
      const r = await window.e2r.deploy({ xlsxPath: workbookPath, scripts, enableVoice })
      setResult(r)
      if (r.ok && scripts) clearSheetChanges(undefined, workbookPath)
    } finally {
      setBusy(false)
    }
  }, [workbookPath, assets, scripts, enableVoice, clearSheetChanges])

  const imgCount = assets ? assetCount(assets.images) : 0
  const audCount = assets ? assetCount(assets.audio) : 0

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="mb-5">
        <h2 className="text-[20px] font-semibold text-app-text">工程与部署</h2>
        <p className="mt-1 text-[13px] text-app-muted">
          关联 Ren&apos;Py 工程后，一键把生成的 .rpy 写入 game/，打通到资源路径的全流程
        </p>
      </header>

      {/* 关联状态 */}
      <section className="glass-card mb-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-600 dark:text-sky-300">
            <FolderGit2 size={20} />
          </div>
          {assets ? (
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px] text-app-text">{assets.gamePath}</div>
              <div className="text-[12px] text-app-muted">图片 {imgCount} · 音频 {audCount}</div>
            </div>
          ) : (
            <div className="flex-1 text-[13px] text-app-muted">尚未关联 Ren&apos;Py 工程</div>
          )}
          <button
            type="button"
            onClick={onLink}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3.5 text-[12px] font-medium text-app-text hover:bg-white/80 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            <Link2 size={14} /> {assets ? '重新关联' : '关联工程'}
          </button>
        </div>
      </section>

      {/* 部署选项 */}
      <section className="glass-card mb-4 p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-app-text">部署内容</h3>
        <label className="mb-2 flex items-start gap-2.5">
          <input type="checkbox" checked={scripts} onChange={(e) => setScripts(e.target.checked)} className="mt-0.5" />
          <span className="flex items-center gap-1.5 text-[13px]">
            <FileCode2 size={14} className="text-app-muted" /> 生成并写入 .rpy 脚本到 game/
            <span className="text-app-muted">（覆盖同名文件，自动使用默认修正模式）</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={enableVoice} onChange={(e) => setEnableVoice(e.target.checked)} className="mt-0.5" />
          <span className="flex items-center gap-1.5 text-[13px]">
            <AudioLines size={14} className="text-app-muted" /> 启用语音（写 e2r_config.rpy：config.has_voice）
          </span>
        </label>
        <p className="mt-3 text-[12px] text-app-muted">
          提示：语音页在已关联工程时会直接把 wav 合成到 <code>game/audio/</code>，无需额外拷贝。
        </p>
      </section>

      <button
        type="button"
        onClick={deploy}
        disabled={!workbookPath || !assets || busy || (!scripts && !enableVoice)}
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 text-[14px] font-semibold text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:opacity-50"
      >
        {busy ? <span className="spinner" /> : <Rocket size={16} />} 部署到 Ren&apos;Py 工程
      </button>

      {result &&
        (result.ok ? (
          <div className="glass-card mt-4 p-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CircleCheck size={16} /> 部署成功
            </div>
            <p className="font-mono text-[12px] text-app-muted">→ {result.gamePath}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {result.written.map((f) => (
                <li key={f} className="rounded bg-black/5 px-2 py-0.5 font-mono text-[11px] dark:bg-white/10">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="glass-card mt-4 flex items-center gap-2 p-4 text-[13px] text-rose-500">
            <TriangleAlert size={15} /> {result.error}
          </div>
        ))}
    </div>
  )
}
