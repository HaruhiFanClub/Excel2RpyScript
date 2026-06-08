import { useEffect, useState } from 'react'
import {
  UserPlus,
  ChevronDown,
  ChevronRight,
  Lock,
  Plus,
  Trash2,
  FolderOpen,
  Users,
  Server,
  AudioLines,
  MoveHorizontal,
} from 'lucide-react'
import type { TtsConfig, RoleModel, VoiceCmd } from '@e2r/core/tts'
import { isRoleEnabled } from '@e2r/core/tts'
import type { Slot } from '@e2r/core/sprites'
import { useCharactersStore } from '../stores/useCharactersStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

const SLOTS: { slot: Slot; label: string }[] = [
  { slot: 'left', label: '左' },
  { slot: 'mid', label: '中' },
  { slot: 'right', label: '右' },
]
const NO_TRANSFORMS: string[] = [] // 稳定空数组引用：避免 zustand selector 每次返回新数组导致无限渲染

// 保序重命名 Record 的某个键
function renameKey<T>(
  rec: Record<string, T>,
  oldKey: string,
  newKey: string,
  transform?: (v: T) => T,
): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (k === oldKey) out[newKey] = transform ? transform(v) : v
    else out[k] = v
  }
  return out
}

function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export default function CharactersPage() {
  const config = useCharactersStore((s) => s.config)
  const loaded = useCharactersStore((s) => s.loaded)
  const load = useCharactersStore((s) => s.load)
  const update = useCharactersStore((s) => s.update)
  // 关联工程时可选的 transform；selector 返回稳定引用（数组本体或 undefined），避免无限渲染
  const transforms = useWorkspaceStore((s) => s.assets?.transforms) ?? NO_TRANSFORMS
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['测试角色']))

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  if (!config) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-app-muted">
        <Users size={36} strokeWidth={1.2} />
        <p className="text-[13px]">加载角色配置…</p>
      </div>
    )
  }

  const toggleExpand = (name: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })

  // ---- 角色级操作 ----
  const setRole = (name: string, patch: Partial<RoleModel>) =>
    update((c) => ({
      ...c,
      roleModelMapping: { ...c.roleModelMapping, [name]: { ...c.roleModelMapping[name]!, ...patch } },
    }))

  const toggleEnabled = (name: string) =>
    setRole(name, { enabled: !isRoleEnabled(config.roleModelMapping[name]!) })

  const addRole = () => {
    const taken = new Set(Object.keys(config.roleModelMapping))
    const name = uniqueKey('新角色', taken)
    update((c) => ({
      ...c,
      roleModelMapping: { ...c.roleModelMapping, [name]: { gpt: '', sovits: '', enabled: true } },
    }))
    setExpanded((s) => new Set(s).add(name))
  }

  const deleteRole = (name: string) => {
    update((c) => {
      const roleModelMapping = { ...c.roleModelMapping }
      delete roleModelMapping[name]
      const voiceCmdMapping = Object.fromEntries(
        Object.entries(c.voiceCmdMapping).filter(([, v]) => v.role !== name),
      )
      return { ...c, roleModelMapping, voiceCmdMapping }
    })
  }

  const renameRole = (oldName: string, raw: string) => {
    const newName = raw.trim()
    if (!newName || newName === oldName || config.roleModelMapping[newName]) return
    update((c) => ({
      ...c,
      roleModelMapping: renameKey(c.roleModelMapping, oldName, newName),
      voiceCmdMapping: Object.fromEntries(
        Object.entries(c.voiceCmdMapping).map(([k, v]) =>
          v.role === oldName ? [k, { ...v, role: newName }] : [k, v],
        ),
      ),
    }))
    setExpanded((s) => {
      if (!s.has(oldName)) return s
      const n = new Set(s)
      n.delete(oldName)
      n.add(newName)
      return n
    })
  }

  const setAliases = (name: string, raw: string) => {
    const aliases = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    setRole(name, aliases.length ? { aliases } : { aliases: [] })
  }

  const setSpritePos = (name: string, slot: Slot, raw: string) => {
    const cur = config.roleModelMapping[name]?.spritePos ?? {}
    const next = { ...cur, [slot]: raw.trim() || undefined }
    const has = next.left || next.mid || next.right
    setRole(name, { spritePos: has ? next : undefined })
  }

  // ---- 语气（语音指令）级操作 ----
  const addTone = (roleName: string) => {
    const taken = new Set(Object.keys(config.voiceCmdMapping))
    const key = uniqueKey(`${roleName}_1`, taken)
    update((c) => ({
      ...c,
      voiceCmdMapping: {
        ...c.voiceCmdMapping,
        [key]: { refAudioPath: '', promptText: '', tone: '', role: roleName },
      },
    }))
  }

  const setTone = (key: string, patch: Partial<VoiceCmd>) =>
    update((c) => ({
      ...c,
      voiceCmdMapping: { ...c.voiceCmdMapping, [key]: { ...c.voiceCmdMapping[key]!, ...patch } },
    }))

  const renameTone = (oldKey: string, raw: string) => {
    const newKey = raw.trim()
    if (!newKey || newKey === oldKey || config.voiceCmdMapping[newKey]) return
    update((c) => ({ ...c, voiceCmdMapping: renameKey(c.voiceCmdMapping, oldKey, newKey) }))
  }

  const deleteTone = (key: string) =>
    update((c) => {
      const voiceCmdMapping = { ...c.voiceCmdMapping }
      delete voiceCmdMapping[key]
      return { ...c, voiceCmdMapping }
    })

  const pickAudio = async (key: string) => {
    const p = await window.e2r.pickAudio()
    if (p) setTone(key, { refAudioPath: p })
  }

  // 自建角色排前、内置角色（锁定）排后；组内保持原顺序
  const roles = Object.entries(config.roleModelMapping).sort(
    (a, b) => Number(a[1].builtin ?? false) - Number(b[1].builtin ?? false),
  )
  const enabledCount = roles.filter(([, m]) => isRoleEnabled(m)).length

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">角色配置</h2>
          <p className="mt-1 text-[13px] text-app-muted">
            勾选启用角色、设置别名与语气、绑定参考语音。已启用 {enabledCount} / {roles.length}
          </p>
        </div>
        <button
          type="button"
          onClick={addRole}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600"
        >
          <UserPlus size={14} /> 新建角色
        </button>
      </header>

      <section className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
        {roles.map(([name, role]) => {
          const builtin = role.builtin === true
          const enabled = isRoleEnabled(role)
          const open = !builtin && expanded.has(name)
          const tones = Object.entries(config.voiceCmdMapping).filter(([, v]) => v.role === name)
          return (
            <div key={name} className="glass-card overflow-hidden p-0">
              {/* 角色行 */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleEnabled(name)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-sky-500"
                  title={enabled ? '已启用（取消勾选则停用）' : '已停用（勾选以启用）'}
                />

                {builtin ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-app-muted/50">
                    <Lock size={13} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleExpand(name)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-app-muted hover:bg-black/5 hover:text-app-text dark:hover:bg-white/5"
                  >
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                )}

                {builtin ? (
                  <span
                    className={`text-[13px] font-medium ${enabled ? 'text-app-text' : 'text-app-muted'}`}
                  >
                    {name}
                  </span>
                ) : (
                  <input
                    key={name}
                    defaultValue={name}
                    onBlur={(e) => renameRole(name, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="min-w-0 max-w-[220px] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-medium text-app-text hover:border-app-border focus:border-sky-400 focus:bg-white/60 focus:outline-none dark:focus:bg-zinc-800/60"
                  />
                )}

                {builtin && (
                  <span className="flex items-center gap-1 rounded-full bg-violet-400/12 px-2 py-0.5 text-[11px] text-violet-600 dark:text-violet-300">
                    <Server size={11} /> 远端内置
                  </span>
                )}
                {!builtin && tones.length > 0 && (
                  <span className="rounded-full bg-sky-400/12 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-300">
                    {tones.length} 语气
                  </span>
                )}
                {role.aliases?.length ? (
                  <span className="truncate text-[11px] text-app-muted" title={role.aliases.join('、')}>
                    别名：{role.aliases.join('、')}
                  </span>
                ) : null}

                <div className="ml-auto flex items-center gap-1">
                  {builtin ? (
                    <span className="text-[11px] text-app-muted/70">锁定（仅可启用 / 停用）</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => deleteRole(name)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-app-muted hover:bg-rose-500/10 hover:text-rose-500"
                      title="删除角色"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* 展开：角色配置项 + 语气列表（仅自建角色） */}
              {open && (
                <div className="border-t border-app-border/60 bg-black/[0.015] px-3 py-3 dark:bg-white/[0.015]">
                  <label className="mb-3 flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">
                      别名（逗号分隔；表格角色名命中别名即自动绑定本角色）
                    </span>
                    <input
                      key={`${name}-alias`}
                      defaultValue={role.aliases?.join('，') ?? ''}
                      onBlur={(e) => setAliases(name, e.target.value)}
                      placeholder="如 春日, Haruhi"
                      className="glass-input max-w-[420px] text-[12px]"
                    />
                  </label>

                  {/* 立绘位置（左/中/右）：留空即用 Ren'Py 内置位置 left/mid/right */}
                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <MoveHorizontal size={13} className="text-app-muted" />
                      <h4 className="text-[12px] font-semibold text-app-text">立绘位置</h4>
                      <span className="text-[11px] text-app-muted">
                        留空即用 <code>left / mid / right</code>
                        {transforms.length > 0 && ` · 可从工程 ${transforms.length} 个 transform 选择`}
                      </span>
                    </div>
                    <datalist id={`e2r-transforms-${name}`}>
                      {transforms.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                    <div className="grid max-w-[560px] grid-cols-3 gap-1.5">
                      {SLOTS.map(({ slot, label }) => (
                        <label key={slot} className="flex flex-col gap-1">
                          <span className="text-[10px] text-app-muted">{label}</span>
                          <input
                            key={`${name}-${slot}-${role.spritePos?.[slot] ?? ''}`}
                            list={`e2r-transforms-${name}`}
                            defaultValue={role.spritePos?.[slot] ?? ''}
                            onBlur={(e) => setSpritePos(name, slot, e.target.value)}
                            placeholder={slot}
                            className="glass-input font-mono text-[11px]"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mb-1.5 flex items-center gap-2">
                    <h4 className="text-[12px] font-semibold text-app-text">语气</h4>
                    <span className="text-[11px] text-app-muted">每个编号对应一段参考语音与语气描述</span>
                    <button
                      type="button"
                      onClick={() => addTone(name)}
                      className="ml-auto flex h-7 items-center gap-1 rounded-md border border-app-border bg-white/40 px-2 text-[11px] text-app-text hover:bg-white/70 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
                    >
                      <Plus size={12} /> 新建语气
                    </button>
                  </div>

                  {tones.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-app-border px-3 py-3 text-[12px] text-app-muted">
                      <AudioLines size={14} /> 还没有语气，点击「新建语气」添加
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {/* 表头 */}
                      <div className="grid grid-cols-[120px_120px_1fr_1fr_28px] gap-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wide text-app-muted">
                        <span>编号</span>
                        <span>语气描述</span>
                        <span>参考音频</span>
                        <span>参考文本</span>
                        <span />
                      </div>
                      {tones.map(([key, v]) => (
                        <div key={key} className="grid grid-cols-[120px_120px_1fr_1fr_28px] gap-1.5">
                          <input
                            key={key}
                            defaultValue={key}
                            onBlur={(e) => renameTone(key, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            className="glass-input font-mono text-[11px]"
                            placeholder="如 haruhi_1"
                          />
                          <input
                            value={v.tone ?? ''}
                            onChange={(e) => setTone(key, { tone: e.target.value })}
                            className="glass-input text-[12px]"
                            placeholder="如 害羞"
                          />
                          <div className="flex gap-1.5">
                            <input
                              value={v.refAudioPath}
                              onChange={(e) => setTone(key, { refAudioPath: e.target.value })}
                              className="glass-input w-full font-mono text-[11px]"
                              placeholder="参考音频路径"
                            />
                            <button
                              type="button"
                              onClick={() => void pickAudio(key)}
                              className="flex h-[34px] shrink-0 items-center rounded-lg border border-app-border bg-white/40 px-2 text-app-text hover:bg-white/70 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
                              title="选择音频文件"
                            >
                              <FolderOpen size={14} />
                            </button>
                          </div>
                          <input
                            value={v.promptText}
                            onChange={(e) => setTone(key, { promptText: e.target.value })}
                            className="glass-input text-[12px]"
                            placeholder="参考音频对应文本"
                          />
                          <button
                            type="button"
                            onClick={() => deleteTone(key)}
                            className="flex items-center justify-center rounded-md text-app-muted hover:text-rose-500"
                            title="删除语气"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
