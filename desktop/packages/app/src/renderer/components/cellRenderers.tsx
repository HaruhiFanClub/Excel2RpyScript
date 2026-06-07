import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { CustomCellRendererProps } from 'ag-grid-react'
import { Play, Upload, ChevronDown, Check, Search, Plus } from 'lucide-react'
import {
  spriteImageName,
  resolveImage,
  resolveAudio,
  audioRefName,
  COLOR_WORDS,
  type AssetMaps,
} from '@e2r/core/assets'
import { toneFor, tonesForRole, isRoleEnabled, type TtsConfig } from '@e2r/core/tts'
import { assetUrl } from '../lib/asset'

export type WsAssetType = 'background' | 'sprite' | 'music' | 'sound'

export interface GridContext {
  assets: AssetMaps | null
  ttsConfig: TtsConfig | null
  onImage: (url: string, title: string) => void
  onAudio: (url: string, title: string) => void
  onImport: (kind: WsAssetType, currentValue: string) => Promise<string | null>
}

const ctxOf = (p: CustomCellRendererProps): GridContext => p.context as GridContext

function plainText(value: string) {
  return value ? <span className="truncate text-[12px]">{value}</span> : null
}

function importedCellValue(kind: WsAssetType, currentValue: string, imported: string): string {
  if (kind === 'sound' && currentValue.trim().startsWith('循环')) return `循环${imported}`
  return imported
}

function PreviewText(props: { label: string; title: string; onPreview: () => void }) {
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    }
  }, [])

  const cancel = () => {
    if (timer.current == null) return
    window.clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <span
      title={props.title}
      onClick={(e) => {
        if (e.detail > 1) return
        cancel()
        timer.current = window.setTimeout(() => {
          timer.current = null
          props.onPreview()
        }, 220)
      }}
      onDoubleClick={cancel}
      className="cursor-pointer truncate rounded px-1 text-left text-[12px] text-sky-700 hover:bg-sky-400/10 dark:text-sky-200"
    >
      {props.label}
    </span>
  )
}

async function importIntoCell(p: CustomCellRendererProps, kind: WsAssetType, currentValue: string): Promise<void> {
  const ctx = ctxOf(p)
  const field = p.colDef?.field
  if (!field) return
  const imported = await ctx.onImport(kind, currentValue)
  if (!imported) return
  p.node?.setDataValue?.(field, importedCellValue(kind, currentValue, imported))
}

// 关联工程时的导入/替换按钮：和下拉按钮一样，仅在悬浮/聚焦单元格时显示。
function ImportBtn(props: { label: string; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const click = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await props.onClick()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={click}
      style={busy ? { opacity: 1 } : undefined}
      className="e2r-asset-action flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-app-border text-app-muted hover:border-sky-400 hover:text-sky-500"
      title={props.label}
      aria-label={props.label}
    >
      {busy ? <span className="spinner !h-2.5 !w-2.5" /> : <Upload size={10} />}
    </button>
  )
}

// 立绘：每段解析图像名 → 缩略图（点击放大）；未关联工程/未命中 → 名称 chip
export function SpriteCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!raw) return null
  if (!ctx.assets) return plainText(raw)
  const segs = raw.split(';').map((s) => s.trim()).filter(Boolean)
  return (
    <div className="flex h-full items-center gap-1.5 overflow-hidden">
      {segs.map((seg, i) => {
        const name = spriteImageName(seg)
        const rel = resolveImage(ctx.assets!, name)
        if (rel) {
          const url = assetUrl(rel)
          return (
            <PreviewText
              key={i}
              label={name}
              title={seg}
              onPreview={() => ctx.onImage(url, seg)}
            />
          )
        }
        return (
          <span
            key={i}
            title={seg}
            className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[11px] text-app-muted dark:bg-white/10"
          >
            {name}
          </span>
        )
      })}
    </div>
  )
}

// 立绘单列（左/中/右）：值即「角色 编号」，直接解析为图像名 → 缩略图 + 文本
export function SpriteSlotCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!ctx.assets) return plainText(raw)
  const names = raw ? raw.split(';').map((s) => s.trim()).filter(Boolean) : []
  return (
    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden">
      {names.length === 0 ? (
        <span className="truncate text-[12px] text-app-muted/40">—</span>
      ) : (
        names.map((name, i) => {
          const rel = resolveImage(ctx.assets!, name)
          return rel ? (
            <PreviewText
              key={i}
              label={name}
              title={name}
              onPreview={() => ctx.onImage(assetUrl(rel), name)}
            />
          ) : (
            <span key={i} title={name} className="truncate text-[12px]">
              {name}
            </span>
          )
        })
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ImportBtn
          label={raw ? '替换' : '导入'}
          onClick={() => importIntoCell(p, 'sprite', raw)}
        />
      </div>
    </div>
  )
}

// 该列在某行可选的下拉项：角色列=已启用角色主名称；语音指令列=该行有效角色对应的语气。
function comboOptions(ctx: GridContext, field: string, row: Record<string, unknown>): string[] {
  const cfg = ctx.ttsConfig
  if (!cfg) return []
  if (field === 'role_name') {
    return Object.entries(cfg.roleModelMapping)
      .filter(([, m]) => isRoleEnabled(m))
      .map(([name]) => name)
  }
  if (field === 'voice_cmd') return tonesForRole(cfg, String(row['__effectiveRole'] ?? row['role_name'] ?? ''))
  return []
}

// 角色 / 语音指令列：单元格内显示值（语音指令附语气 chip）+ 选中/悬浮时出现下拉按钮，
// 点按钮弹出美观可搜索的下拉框（portal，避免被表格裁剪）。
export function ComboCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const field = p.colDef?.field ?? ''
  const value = String(p.value ?? '')
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  // 语音指令：把语气直接拼到指令后面显示（如 kyon_1 认真 有些严厉），不单开蓝框
  const toneOf =
    field === 'voice_cmd' && ctx.ttsConfig ? (o: string) => toneFor(ctx.ttsConfig!, o) : undefined
  const tone = toneOf && value ? toneOf(value) : ''
  const allowCustom = field !== 'voice_cmd'

  // 用「原生」dblclick 监听拦下下拉按钮上的双击：它在按钮本身（target）触发，
  // 早于 AG Grid 绑在祖先上的原生 dblclick（即「双击进入编辑」），从而只阻止按钮的双击、
  // 不影响双击单元格其它区域进入编辑。React 的 onDoubleClick 走根节点委托太晚，拦不住。
  useEffect(() => {
    const el = btnRef.current
    if (!el) return
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener('dblclick', stop)
    el.addEventListener('mousedown', stop)
    return () => {
      el.removeEventListener('dblclick', stop)
      el.removeEventListener('mousedown', stop)
    }
  }, [])

  const choose = (v: string) => {
    p.node?.setDataValue?.(field, v)
    setOpen(false)
  }

  return (
    <div
      className="flex h-full w-full items-center gap-1.5 overflow-hidden"
      onDoubleClick={(e) => {
        if (field !== 'voice_cmd') return
        e.stopPropagation()
        setOpen(true)
      }}
    >
      {value ? <span className="shrink-0">{value}</span> : <span className="text-app-muted/40">—</span>}
      {tone && tone !== value && <span className="truncate text-app-muted">{tone}</span>}
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        style={open ? { opacity: 1 } : undefined}
        className="e2r-combo-caret ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-app-muted hover:bg-black/10 hover:text-app-text dark:hover:bg-white/10"
        title="选择"
        aria-label="选择"
      >
        <ChevronDown size={13} />
      </button>
      {open && (
        <ComboPopup
          anchorRef={btnRef}
          options={comboOptions(ctx, field, p.data ?? {})}
          value={value}
          toneOf={toneOf}
          allowCustom={allowCustom}
          onPick={choose}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// 下拉浮层：右对齐于触发按钮、可搜索、当前值打勾；点击外部/Esc 关闭。
function ComboPopup({
  anchorRef,
  options,
  value,
  toneOf,
  allowCustom,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  options: string[]
  value: string
  toneOf?: (o: string) => string
  allowCustom: boolean
  onPick: (v: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const WIDTH = 248

  useLayoutEffect(() => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8))
    const below = r.bottom + 4
    const estH = Math.min(320, 52 + Math.max(1, options.length) * 30)
    const top = below + estH > window.innerHeight - 8 ? Math.max(8, r.top - estH - 4) : below
    setPos({ left, top })
    inputRef.current?.focus()
  }, [anchorRef, options.length])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchorRef, onClose])

  const raw = query.trim()
  const q = raw.toLowerCase()
  // 搜索同时匹配指令名与语气（如输入「严厉」也能命中 kyon_1 认真 有些严厉）
  const label = (o: string) => {
    const t = toneOf?.(o)
    return t && t !== o ? `${o} ${t}` : o
  }
  const filtered = q ? options.filter((o) => label(o).toLowerCase().includes(q)) : options
  // 角色名允许自由输入；语音指令/语气必须从候选项里选。
  const custom = allowCustom && raw && !options.includes(raw) ? raw : ''

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: WIDTH }}
      className="fixed z-[100] overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-[0_12px_40px_-8px_rgb(15_23_42_/_0.28)] backdrop-blur-2xl"
    >
        <div className="flex items-center gap-1.5 border-b border-app-border px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-app-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索…"
            className="w-full bg-transparent text-[12.5px] text-app-text outline-none placeholder:text-app-muted/60"
          />
        </div>
        <div className="custom-scrollbar max-h-[268px] overflow-y-auto py-1">
          {custom && (
            <button
              type="button"
              onClick={() => onPick(custom)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-app-text transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Plus size={13} className="shrink-0 text-sky-500" />
              <span className="truncate">
                使用 <span className="font-medium">“{custom}”</span>
              </span>
            </button>
          )}
          {filtered.length === 0 && !custom ? (
            <div className="px-3 py-3 text-center text-[12px] text-app-muted">
              {options.length === 0 ? '该角色暂无可选项' : '无匹配项'}
            </div>
          ) : (
            filtered.map((o) => {
              const active = o === value
              const t = toneOf?.(o)
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onPick(o)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors ${
                    active
                      ? 'bg-sky-400/12 text-sky-700 dark:text-sky-200'
                      : 'text-app-text hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <Check
                    size={13}
                    className={`shrink-0 ${active ? 'text-sky-500' : 'text-transparent'}`}
                  />
                  <span className="shrink-0">{o}</span>
                  {t && t !== o && <span className="truncate text-app-muted">{t}</span>}
                </button>
              )
            })
          )}
        </div>
    </div>,
    document.body,
  )
}

// 背景：未关联工程时纯文本；关联后可按单元格文本命中资源并预览/替换。
export function BgCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!ctx.assets) return plainText(raw)
  const rel = raw ? resolveImage(ctx.assets, raw) : null
  const color = COLOR_WORDS[raw.toLowerCase()]
  return (
    <div
      className="flex h-full w-full items-center gap-1.5 overflow-hidden"
      title={rel ? `预览 ${raw}` : raw}
    >
      {color && <span className="h-4 w-4 shrink-0 rounded ring-1 ring-app-border" style={{ background: color }} />}
      {raw && rel ? (
        <PreviewText label={raw} title={`预览 ${raw}`} onPreview={() => ctx.onImage(assetUrl(rel), raw)} />
      ) : raw ? (
        <span className="truncate text-[12px]">{raw}</span>
      ) : (
        <span className="truncate text-[12px] text-app-muted/40">—</span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ImportBtn
          label={raw ? '替换' : '导入'}
          onClick={() => importIntoCell(p, 'background', raw)}
        />
      </div>
    </div>
  )
}

// 音乐 / 音效：未关联工程时纯文本；关联后可按单元格文本试听/替换。
export function AudioCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!ctx.assets) return plainText(raw)
  const name = audioRefName(raw)
  const rel = name ? resolveAudio(ctx.assets, name) : null
  const kind = p.colDef?.field === 'sound' ? 'sound' : 'music'
  return (
    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden" title={raw}>
      {raw ? (
        <span className={`truncate text-[12px] ${rel ? 'text-sky-700 dark:text-sky-200' : ''}`}>{raw}</span>
      ) : (
        <span className="truncate text-[12px] text-app-muted/40">—</span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {rel && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              ctx.onAudio(assetUrl(rel), raw)
            }}
            className="e2r-asset-action flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 transition-colors hover:bg-sky-500/30 dark:text-sky-300"
            title={`播放 ${raw}`}
          >
            <Play size={11} />
          </button>
        )}
        <ImportBtn
          label={raw ? '替换' : '导入'}
          onClick={() => importIntoCell(p, kind, raw)}
        />
      </div>
    </div>
  )
}
