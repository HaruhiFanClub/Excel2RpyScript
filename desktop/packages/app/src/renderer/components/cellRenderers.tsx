import { useEffect, useId, useRef } from 'react'
import type { CustomCellRendererProps, CustomCellEditorProps } from 'ag-grid-react'
import { Play, Music, Upload } from 'lucide-react'
import {
  spriteImageName,
  resolveImage,
  resolveAudio,
  audioRefName,
  COLOR_WORDS,
  type AssetMaps,
} from '@e2r/core/assets'
import { toneFor, type TtsConfig } from '@e2r/core/tts'
import { assetUrl } from '../lib/asset'

export interface GridContext {
  assets: AssetMaps | null
  ttsConfig: TtsConfig | null
  onImage: (url: string, title: string) => void
  onAudio: (url: string, title: string) => void
  onImport: (category: 'image' | 'audio', name: string) => void
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
            {!rel && ctx.assets && <ImportBtn onClick={() => ctx.onImport('image', name)} />}
          </span>
        )
      })}
    </div>
  )
}

// 语音指令：显示 指令 + 语气（关联 TTS 配置时）
export function VoiceCmdCell(p: CustomCellRendererProps) {
  const ctx = ctxOf(p)
  const raw = String(p.value ?? '').trim()
  if (!raw) return null
  const tone = ctx.ttsConfig ? toneFor(ctx.ttsConfig, raw) : ''
  return (
    <div className="flex h-full items-center gap-1.5 overflow-hidden">
      <span className="truncate">{raw}</span>
      {tone && tone !== raw && (
        <span className="shrink-0 rounded bg-sky-400/12 px-1.5 py-0.5 text-[11px] text-sky-600 dark:text-sky-300">
          {tone}
        </span>
      )}
    </div>
  )
}

// 通用「自由输入 + 下拉建议」单元格编辑器（datalist）：
// 角色列建议=已启用角色（含别名）；语音指令列建议=该行角色对应的语气。两者都仍可自由输入。
export function DatalistEditor(props: CustomCellEditorProps & { values?: string[] }) {
  const { value, onValueChange, stopEditing, values = [] } = props
  const ref = useRef<HTMLInputElement>(null)
  const listId = useId()
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <div className="flex h-full w-full items-center">
      <input
        ref={ref}
        list={listId}
        value={value ?? ''}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') stopEditing()
        }}
        className="h-full w-full bg-transparent px-2 text-[12.5px] text-app-text outline-none"
      />
      <datalist id={listId}>
        {values.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
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
      {ctx.assets && <ImportBtn onClick={() => ctx.onImport('image', raw)} />}
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
      {!rel && name && ctx.assets && <ImportBtn onClick={() => ctx.onImport('audio', name)} />}
    </div>
  )
}
