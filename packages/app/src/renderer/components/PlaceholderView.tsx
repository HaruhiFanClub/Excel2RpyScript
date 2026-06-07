import type { LucideIcon } from 'lucide-react'

export function PlaceholderView(props: {
  icon: LucideIcon
  title: string
  desc: string
}) {
  const { icon: Icon, title, desc } = props
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-app-muted">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-app-border bg-white/40 dark:bg-white/5">
        <Icon size={28} strokeWidth={1.4} />
      </div>
      <div className="text-center">
        <h2 className="text-[16px] font-semibold text-app-text">{title}</h2>
        <p className="mt-1.5 text-[13px]">{desc}</p>
        <span className="mt-3 inline-block rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
          即将推出
        </span>
      </div>
    </div>
  )
}
