import { useState, type DragEvent } from 'react'
import { FolderOpen, FileSpreadsheet } from 'lucide-react'

interface Props {
  value: string
  onChange: (path: string) => void
  mode?: 'file' | 'directory'
  placeholder?: string
  ariaLabel?: string
}

const isXlsx = (p: string) => /\.(xlsx|xls)$/i.test(p)

export function PathPicker({ value, onChange, mode = 'file', placeholder, ariaLabel }: Props) {
  const [over, setOver] = useState(false)

  const pick = async () => {
    const picked = mode === 'directory' ? await window.e2r.selectDir() : await window.e2r.openXlsx()
    if (picked) onChange(picked)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (mode !== 'file') return
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    const p = window.e2r.pathForFile(f)
    if (p && isXlsx(p)) onChange(p)
  }

  return (
    <div
      className={`flex gap-2 rounded-[11px] ${over ? 'ring-2 ring-sky-400/60' : ''}`}
      onDragOver={(e) => {
        if (mode === 'file') {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        className="glass-input nodrag flex-1 font-mono text-[12px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
      />
      <button
        type="button"
        onClick={pick}
        className="nodrag flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-app-border bg-white/40 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/70 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
        aria-label={mode === 'directory' ? '选择目录' : '选择文件'}
      >
        {mode === 'directory' ? <FolderOpen size={14} /> : <FileSpreadsheet size={14} />}
        浏览
      </button>
    </div>
  )
}
