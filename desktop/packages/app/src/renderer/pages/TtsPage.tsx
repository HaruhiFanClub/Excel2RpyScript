import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Play,
  RefreshCw,
  Wand2,
  Settings2,
  CircleCheck,
  CircleDashed,
  CircleAlert,
  X,
} from 'lucide-react'
import type { EnrichedJob, TtsConfig, TtsProgress } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { assetUrl } from '../lib/asset'

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

export default function TtsPage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const assets = useWorkspaceStore((s) => s.assets)
  const ttsConfigPath = useWorkspaceStore((s) => s.ttsConfigPath)
  const setTtsConfigPath = useWorkspaceStore((s) => s.setTtsConfigPath)

  const [config, setConfig] = useState<TtsConfig | null>(null)
  const [health, setHealth] = useState<{ ok: boolean; device?: string; error?: string } | null>(null)
  const [managedUrl, setManagedUrl] = useState<string | null>(null)
  const [engineStarting, setEngineStarting] = useState(false)
  const [builtins, setBuiltins] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    void window.e2r.ttsBuiltins().then(setBuiltins)
  }, [])
  const [textLang, setTextLang] = useState('auto')
  const [promptLang, setPromptLang] = useState('auto')
  const [useVoiceText, setUseVoiceText] = useState(false)
  const [jobs, setJobs] = useState<EnrichedJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Record<string, RunState>>({})
  const [audio, setAudio] = useState<{ url: string; title: string } | null>(null)

  // 加载 TTS 配置 + 健康检查
  useEffect(() => {
    if (!ttsConfigPath) {
      setConfig(null)
      return
    }
    window.e2r.ttsLoadConfig(ttsConfigPath).then((r) => {
      if (r.ok) {
        setConfig(r.config)
        setManagedUrl(null)
        if (r.config.serviceMode === 'remote') {
          void window.e2r.ttsHealth(r.config.apiBaseUrl).then(setHealth)
        } else {
          setHealth(null) // 内嵌：启动引擎后再检测
        }
      } else setError(r.error)
    })
  }, [ttsConfigPath])

  const refresh = useCallback(async () => {
    if (!workbookPath) {
      setJobs([])
      return
    }
    const r = await window.e2r.ttsJobs({
      xlsxPath: workbookPath,
      useVoiceText,
      configPath: ttsConfigPath || undefined,
      textLang,
    })
    if (r.ok) {
      setJobs(r.jobs)
      setError(null)
    } else setError(r.error)
  }, [workbookPath, useVoiceText, ttsConfigPath, textLang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return window.e2r.onTtsProgress((p: TtsProgress) => {
      setProgress((prev) => ({ ...prev, [p.outputName]: p.status }))
    })
  }, [])

  const pickConfig = useCallback(async () => {
    const p = await window.e2r.openJson()
    if (p) setTtsConfigPath(p)
  }, [setTtsConfigPath])

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
      if (!workbookPath || !ttsConfigPath) return
      setBusy(true)
      setProgress({})
      try {
        const r = await window.e2r.ttsSynthesize({
          xlsxPath: workbookPath,
          configPath: ttsConfigPath,
          useVoiceText,
          textLang,
          promptLang,
          ...(only ? { only } : {}),
          ...(managedUrl ? { baseUrl: managedUrl } : {}),
        })
        if (!r.ok && r.error) setError(r.error)
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [workbookPath, ttsConfigPath, useVoiceText, textLang, promptLang, refresh, managedUrl],
  )

  const audition = (job: EnrichedJob) => {
    if (!assets) return
    setAudio({ url: assetUrl(`audio/${job.outputName}`), title: job.outputName })
  }

  const counts = jobs.reduce(
    (a, j) => ({ ...a, [j.status]: (a[j.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">语音合成</h2>
          <p className="mt-1 text-[13px] text-app-muted">
            按角色切模型、按语音指令取参考音频，批量 / 单句合成并试听
          </p>
        </div>
        <button
          type="button"
          onClick={() => synth()}
          disabled={!workbookPath || !ttsConfigPath || busy || jobs.length === 0}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:opacity-50"
        >
          {busy ? <span className="spinner" /> : <Wand2 size={14} />} 合成全部
        </button>
      </header>

      {/* 配置条 */}
      <section className="glass-card mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-[12px]">
        <span className="flex items-center gap-1.5">
          <Settings2 size={13} className="text-app-muted" />
          <select
            value={ttsConfigPath.startsWith('builtin:') ? ttsConfigPath : ttsConfigPath ? '__file__' : ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__file__') void pickConfig()
              else setTtsConfigPath(v)
            }}
            className="rounded-md border border-app-border bg-white/50 px-2 py-1 text-[12px] text-app-text dark:bg-zinc-800/50"
          >
            <option value="" disabled>
              选择预设…
            </option>
            {builtins.map((b) => (
              <option key={b.id} value={`builtin:${b.id}`}>
                {b.name}
              </option>
            ))}
            <option value="__file__">从文件…（config.json）</option>
          </select>
          {ttsConfigPath && !ttsConfigPath.startsWith('builtin:') && (
            <span className="max-w-[160px] truncate font-mono text-app-muted" title={ttsConfigPath}>
              {ttsConfigPath.split('/').pop()}
            </span>
          )}
        </span>

        {config && (
          <>
            <span className="rounded-full bg-sky-400/12 px-2 py-0.5 text-sky-600 dark:text-sky-300">
              {config.serviceMode === 'embedded' ? '内嵌 zero-shot' : '远端服务'}
            </span>
            {config.serviceMode === 'embedded' ? (
              <button
                type="button"
                onClick={startEngine}
                disabled={engineStarting || !!managedUrl}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-app-border bg-white/40 px-3 font-medium text-app-text hover:bg-white/70 disabled:opacity-60 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
              >
                {engineStarting ? <span className="spinner" /> : <Wand2 size={13} />}
                {managedUrl ? '内置引擎已启动' : engineStarting ? '启动中…' : '启动内置引擎'}
              </button>
            ) : (
              <span className="font-mono text-app-muted">{config.apiBaseUrl}</span>
            )}
            {health && (
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
            <span className="text-app-muted">
              角色 {Object.keys(config.roleModelMapping).length} · 指令{' '}
              {Object.keys(config.voiceCmdMapping).length}
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <label className="text-app-muted">文本语言</label>
          <Select value={textLang} onChange={setTextLang} />
          <label className="text-app-muted">参考语言</label>
          <Select value={promptLang} onChange={setPromptLang} />
          <label className="flex items-center gap-1 text-app-muted">
            <input type="checkbox" checked={useVoiceText} onChange={(e) => setUseVoiceText(e.target.checked)} />
            用语音文本
          </label>
          <button onClick={() => void refresh()} className="text-app-muted hover:text-app-text" title="刷新">
            <RefreshCw size={14} />
          </button>
        </span>
      </section>

      {jobs.length > 0 && (
        <div className="mb-2 flex items-center gap-3 text-[12px] text-app-muted">
          <span>共 {jobs.length} 句</span>
          <span className="text-emerald-500">已生成 {counts['generated'] ?? 0}</span>
          <span className="text-amber-500">未重新生成 {counts['stale'] ?? 0}</span>
          <span>未生成 {counts['missing'] ?? 0}</span>
          {error && <span className="text-rose-500">· {error}</span>}
        </div>
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
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-app-surface text-app-muted backdrop-blur">
              <tr className="border-b border-app-border text-left">
                <th className="w-10 px-3 py-2">#</th>
                <th className="px-2 py-2">角色</th>
                <th className="px-2 py-2">语气</th>
                <th className="px-2 py-2">文本</th>
                <th className="w-24 px-2 py-2">状态</th>
                <th className="w-24 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const run = progress[j.outputName]
                return (
                  <tr key={j.outputName} className="border-b border-app-border/60 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 font-mono text-app-muted">{j.sheetName}:{j.rowIndex + 8}</td>
                    <td className="px-2 py-1.5">{j.roleName}</td>
                    <td className="px-2 py-1.5">
                      <span className="rounded bg-sky-400/12 px-1.5 py-0.5 text-sky-600 dark:text-sky-300">{j.tone}</span>
                    </td>
                    <td className="max-w-[1px] truncate px-2 py-1.5" title={j.text}>{j.text}</td>
                    <td className="px-2 py-1.5">
                      <StatusBadge status={j.status} run={run} />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        {j.status !== 'missing' && assets && (
                          <button
                            onClick={() => audition(j)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 hover:bg-sky-500/30 dark:text-sky-300"
                            title="试听"
                          >
                            <Play size={11} />
                          </button>
                        )}
                        <button
                          onClick={() => synth([j.outputName])}
                          disabled={busy || !ttsConfigPath}
                          className="rounded-md px-1.5 py-0.5 text-app-muted hover:bg-black/5 hover:text-app-text disabled:opacity-40 dark:hover:bg-white/5"
                          title="重新合成"
                        >
                          <RefreshCw size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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

function StatusBadge({ status, run }: { status: EnrichedJob['status']; run?: RunState }) {
  if (run === 'running') return <span className="flex items-center gap-1 text-sky-500"><span className="spinner" /> 合成中</span>
  if (run === 'error') return <span className="flex items-center gap-1 text-rose-500"><CircleAlert size={13} /> 失败</span>
  if (status === 'generated' || run === 'done')
    return <span className="flex items-center gap-1 text-emerald-500"><CircleCheck size={13} /> 已生成</span>
  if (status === 'stale')
    return <span className="flex items-center gap-1 text-amber-500"><CircleAlert size={13} /> 未重新生成</span>
  return <span className="flex items-center gap-1 text-app-muted"><CircleDashed size={13} /> 未生成</span>
}
