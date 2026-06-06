import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, FolderOpen } from 'lucide-react'
import type { TtsConfig } from '../../shared/ipc'
import { useUiStore } from '../stores/useUiStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { Modal } from './Modal'

type RoleRow = { name: string; gpt: string; sovits: string; aliases: string }
type CmdRow = { cmd: string; ref: string; prompt: string; tone: string }

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const close = useUiStore((s) => s.closeSettings)
  const ttsConfigPath = useWorkspaceStore((s) => s.ttsConfigPath)
  const setTtsConfigPath = useWorkspaceStore((s) => s.setTtsConfigPath)

  const [apiBaseUrl, setApiBaseUrl] = useState('http://127.0.0.1:9880/')
  const [defAudio, setDefAudio] = useState('')
  const [defText, setDefText] = useState('')
  const [deepL, setDeepL] = useState('')
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [cmds, setCmds] = useState<CmdRow[]>([])
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStatus(null)
    if (!ttsConfigPath) return
    window.e2r.ttsLoadConfig(ttsConfigPath).then((r) => {
      if (!r.ok) return
      const c = r.config
      setApiBaseUrl(c.apiBaseUrl)
      setDefAudio(c.defaultPromptAudio)
      setDefText(c.defaultPromptText)
      setDeepL(c.deepLApiKey ?? '')
      setRoles(
        Object.entries(c.roleModelMapping).map(([name, v]) => ({
          name,
          gpt: v.gpt,
          sovits: v.sovits,
          aliases: (v.aliases ?? []).join(', '),
        })),
      )
      setCmds(
        Object.entries(c.voiceCmdMapping).map(([cmd, v]) => ({
          cmd,
          ref: v.refAudioPath,
          prompt: v.promptText,
          tone: v.tone ?? '',
        })),
      )
    })
  }, [open, ttsConfigPath])

  const build = (): TtsConfig => ({
    apiBaseUrl,
    defaultPromptAudio: defAudio,
    defaultPromptText: defText,
    deepLApiKey: deepL,
    roleModelMapping: Object.fromEntries(
      roles
        .filter((r) => r.name.trim())
        .map((r) => [
          r.name.trim(),
          {
            gpt: r.gpt,
            sovits: r.sovits,
            ...(r.aliases.trim()
              ? { aliases: r.aliases.split(',').map((s) => s.trim()).filter(Boolean) }
              : {}),
          },
        ]),
    ),
    voiceCmdMapping: Object.fromEntries(
      cmds
        .filter((c) => c.cmd.trim())
        .map((c) => [
          c.cmd.trim(),
          { refAudioPath: c.ref, promptText: c.prompt, ...(c.tone.trim() ? { tone: c.tone.trim() } : {}) },
        ]),
    ),
  })

  const save = async (saveAs: boolean) => {
    let path = ttsConfigPath
    if (saveAs || !path) {
      const p = await window.e2r.saveJson('config.json')
      if (!p) return
      path = p
      setTtsConfigPath(p)
    }
    const r = await window.e2r.ttsSaveConfig(path, build())
    setStatus(r.ok ? '已保存' : `保存失败：${r.error}`)
  }

  const pickInto = async (set: (v: string) => void) => {
    const p = await window.e2r.openJson()
    if (p) set(p)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="TTS 配置"
      width={820}
      footer={
        <div className="flex items-center justify-end gap-2">
          {status && <span className="mr-auto text-[12px] text-app-muted">{status}</span>}
          <button
            onClick={() => save(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3.5 text-[12px] font-medium text-app-text hover:bg-white/80 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            另存为…
          </button>
          <button
            onClick={() => save(false)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white hover:bg-sky-600"
          >
            <Save size={14} /> 保存
          </button>
        </div>
      }
    >
      {/* 端点 & 默认 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="API 端点">
          <input className="glass-input w-full" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
        </Field>
        <Field label="DeepL Key（中译日，可空）">
          <input className="glass-input w-full" value={deepL} onChange={(e) => setDeepL(e.target.value)} />
        </Field>
        <Field label="默认参考音频">
          <div className="flex gap-1.5">
            <input className="glass-input w-full font-mono text-[12px]" value={defAudio} onChange={(e) => setDefAudio(e.target.value)} />
            <IconBtn onClick={() => pickInto(setDefAudio)} />
          </div>
        </Field>
        <Field label="默认参考文本">
          <input className="glass-input w-full" value={defText} onChange={(e) => setDefText(e.target.value)} />
        </Field>
      </div>

      {/* 角色模型 */}
      <Section
        title="角色 → 模型"
        hint="角色名对应表格第一列；别名逗号分隔（一个模型绑定多个角色名）"
        onAdd={() => setRoles((r) => [...r, { name: '', gpt: '', sovits: '', aliases: '' }])}
      >
        {roles.map((r, i) => (
          <div key={i} className="mb-1.5 grid grid-cols-[120px_1fr_1fr_120px_28px] gap-1.5">
            <input className="glass-input" placeholder="角色名" value={r.name} onChange={(e) => upd(setRoles, i, { name: e.target.value })} />
            <input className="glass-input font-mono text-[11px]" placeholder="GPT .ckpt" value={r.gpt} onChange={(e) => upd(setRoles, i, { gpt: e.target.value })} />
            <input className="glass-input font-mono text-[11px]" placeholder="SoVITS .pth" value={r.sovits} onChange={(e) => upd(setRoles, i, { sovits: e.target.value })} />
            <input className="glass-input" placeholder="别名,…" value={r.aliases} onChange={(e) => upd(setRoles, i, { aliases: e.target.value })} />
            <DelBtn onClick={() => setRoles((rs) => rs.filter((_, k) => k !== i))} />
          </div>
        ))}
      </Section>

      {/* 语音指令 */}
      <Section
        title="语音指令 → 参考音频 / 语气"
        hint="语气是显示用的可读标签（把指令编号映射为语气）"
        onAdd={() => setCmds((c) => [...c, { cmd: '', ref: '', prompt: '', tone: '' }])}
      >
        {cmds.map((c, i) => (
          <div key={i} className="mb-1.5 grid grid-cols-[120px_1fr_1fr_110px_28px] gap-1.5">
            <input className="glass-input" placeholder="指令名" value={c.cmd} onChange={(e) => upd(setCmds, i, { cmd: e.target.value })} />
            <input className="glass-input font-mono text-[11px]" placeholder="参考音频" value={c.ref} onChange={(e) => upd(setCmds, i, { ref: e.target.value })} />
            <input className="glass-input" placeholder="参考文本" value={c.prompt} onChange={(e) => upd(setCmds, i, { prompt: e.target.value })} />
            <input className="glass-input" placeholder="语气" value={c.tone} onChange={(e) => upd(setCmds, i, { tone: e.target.value })} />
            <DelBtn onClick={() => setCmds((cs) => cs.filter((_, k) => k !== i))} />
          </div>
        ))}
      </Section>
    </Modal>
  )
}

function upd<T>(setter: (fn: (prev: T[]) => T[]) => void, i: number, patch: Partial<T>) {
  setter((prev) => prev.map((row, k) => (k === i ? { ...row, ...patch } : row)))
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">{label}</span>
      {children}
    </label>
  )
}

function Section({
  title,
  hint,
  onAdd,
  children,
}: {
  title: string
  hint: string
  onAdd: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-[13px] font-semibold text-app-text">{title}</h4>
        <span className="text-[11px] text-app-muted">{hint}</span>
        <button
          onClick={onAdd}
          className="ml-auto flex h-7 items-center gap-1 rounded-md border border-app-border bg-white/40 px-2 text-[11px] text-app-text hover:bg-white/70 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
        >
          <Plus size={12} /> 新增
        </button>
      </div>
      {children}
    </div>
  )
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center rounded-md text-app-muted hover:text-rose-500">
      <Trash2 size={14} />
    </button>
  )
}
function IconBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-[34px] shrink-0 items-center rounded-lg border border-app-border bg-white/40 px-2 text-app-text hover:bg-white/70 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
    >
      <FolderOpen size={14} />
    </button>
  )
}
