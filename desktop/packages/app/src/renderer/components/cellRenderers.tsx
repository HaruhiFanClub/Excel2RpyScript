import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CustomCellRendererProps } from 'ag-grid-react'
import { Play, Music, Upload, ChevronDown, Check, Search } from 'lucide-react'
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
  onImport: (kind: WsAssetType, name: string) => void
}

const ctxOf = (p: CustomCellRendererProps): GridContext => p.context as GridContext

// 关联工程但未命中资源时的「导入」按钮
function ImportBtn(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex h-5 shrink-0 items-center gap-0.5 rounded border border-dashed border-app-border px-1 text-[10px] text-app-muted hover:border-sky-400 hover:text-sky-500"
      title="导入到工程"
    >
      <Upload size={10} /> 导入
    </button>
  )
}

// 立绘：每段解析图像名 → 缩略图（点击放大）；未关联工程/未命中 → 名称 chip
export function SpriteCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!raw) return null
  const segs = raw.split(';').map((s) => s.trim()).filter(Boolean)
  return (
    <div className="flex h-full items-center gap-1.5 overflow-hidden">
      {segs.map((seg, i) => {
        const name = spriteImageName(seg)
        const rel = ctx.assets ? resolveImage(ctx.assets, name) : null
        if (rel) {
          const url = assetUrl(rel)
          return (
            <img
              key={i}
              src={url}
              title={seg}
              onClick={() => ctx.onImage(url, seg)}
              className="h-7 w-auto max-w-[44px] cursor-pointer rounded object-contain ring-1 ring-app-border"
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
  if (!raw) return null
  const names = raw.split(';').map((s) => s.trim()).filter(Boolean)
  return (
    <div className="flex h-full items-center gap-2 overflow-hidden">
      {names.map((name, i) => {
        const rel = ctx.assets ? resolveImage(ctx.assets, name) : null
        return (
          <span key={i} className="flex items-center gap-1 overflow-hidden">
            {rel && (
              <img
                src={assetUrl(rel)}
                title={name}
                onClick={() => ctx.onImage(assetUrl(rel), name)}
                className="h-7 w-auto max-w-[40px] cursor-pointer rounded object-contain ring-1 ring-app-border"
              />
            )}
            <span className="truncate text-[12px]">{name}</span>
            {!rel && <ImportBtn onClick={() => ctx.onImport('sprite', name)} />}
          </span>
        )
      })}
    </div>
  )
}

// 该列在某行可选的下拉项：角色列=已启用角色(含别名)；语音指令列=该行角色对应的语气。
function comboOptions(ctx: GridContext, field: string, row: Record<string, unknown>): string[] {
  const cfg = ctx.ttsConfig
  if (!cfg) return []
  if (field === 'role_name') {
    const out = new Set<string>()
    for (const [name, m] of Object.entries(cfg.roleModelMapping)) {
      if (!isRoleEnabled(m)) continue
      out.add(name)
      for (const a of m.aliases ?? []) out.add(a)
    }
    return [...out]
  }
  if (field === 'voice_cmd') return tonesForRole(cfg, String(row['role_name'] ?? ''))
  return []
}

// 角色 / 语音指令列：单元格内显示值（语音指令附语气 chip）+ 选中/悬浮时出现下拉按钮，
// 点按钮弹出美观可搜索的下拉框（portal，避免被表格裁剪）。双击仍可自由输入。
export function ComboCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const field = p.colDef?.field ?? ''
  const value = String(p.value ?? '')
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const tone = field === 'voice_cmd' && ctx.ttsConfig && value ? toneFor(ctx.ttsConfig, value) : ''

  const choose = (v: string) => {
    p.setValue?.(v)
    setOpen(false)
  }

  return (
    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden">
      {value ? <span className="truncate">{value}</span> : <span className="text-app-muted/40">—</span>}
      {tone && tone !== value && (
        <span className="shrink-0 rounded bg-sky-400/12 px-1.5 py-0.5 text-[11px] text-sky-600 dark:text-sky-300">
          {tone}
        </span>
      )}
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
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  options: string[]
  value: string
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

  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options

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
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-[12px] text-app-muted">
              {options.length === 0 ? '该角色暂无可选项' : '无匹配项'}
            </div>
          ) : (
            filtered.map((o) => {
              const active = o === value
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
                  <span className="truncate">{o}</span>
                </button>
              )
            })
          )}
        </div>
    </div>,
    document.body,
  )
}

// 背景：缩略图 / 纯色色块 / 名称
export function BgCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!raw) return null
  const rel = ctx.assets ? resolveImage(ctx.assets, raw) : null
  if (rel) {
    const url = assetUrl(rel)
    return (
      <div className="flex h-full items-center gap-1.5">
        <img
          src={url}
          onClick={() => ctx.onImage(url, raw)}
          className="h-6 w-10 cursor-pointer rounded object-cover ring-1 ring-app-border"
        />
        <span className="truncate text-[12px]">{raw}</span>
      </div>
    )
  }
  const color = COLOR_WORDS[raw.toLowerCase()]
  if (color) {
    return (
      <div className="flex h-full items-center gap-1.5">
        <span className="h-5 w-5 rounded ring-1 ring-app-border" style={{ background: color }} />
        <span className="text-[12px]">{raw}</span>
      </div>
    )
  }
  return (
    <div className="flex h-full items-center gap-1.5">
      <span className="truncate text-[12px]">{raw}</span>
      <ImportBtn onClick={() => ctx.onImport('background', raw)} />
    </div>
  )
}

// 音乐 / 音效：可播放则给播放按钮
export function AudioCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!raw) return null
  const name = audioRefName(raw)
  const rel = name && ctx.assets ? resolveAudio(ctx.assets, name) : null
  return (
    <div className="flex h-full items-center gap-1.5 overflow-hidden">
      {rel ? (
        <button
          type="button"
          onClick={() => ctx.onAudio(assetUrl(rel), raw)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 transition-colors hover:bg-sky-500/30 dark:text-sky-300"
          title={`播放 ${raw}`}
        >
          <Play size={11} />
        </button>
      ) : (
        <Music size={12} className="shrink-0 text-app-muted" />
      )}
      <span className="truncate text-[12px]">{raw}</span>
      {!rel && name && (
        <ImportBtn onClick={() => ctx.onImport(p.colDef?.field === 'sound' ? 'sound' : 'music', name)} />
      )}
    </div>
  )
}
