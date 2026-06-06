import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal(props: {
  open: boolean
  onClose: () => void
  title: string
  width?: number
  children: ReactNode
  footer?: ReactNode
}) {
  if (!props.open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="glass-card flex max-h-[86vh] flex-col"
        style={{ width: props.width ?? 760 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app-border px-5 py-3">
          <h3 className="text-[15px] font-semibold text-app-text">{props.title}</h3>
          <button onClick={props.onClose} className="text-app-muted hover:text-app-text">
            <X size={18} />
          </button>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-5">{props.children}</div>
        {props.footer && <div className="border-t border-app-border px-5 py-3">{props.footer}</div>}
      </div>
    </div>
  )
}
