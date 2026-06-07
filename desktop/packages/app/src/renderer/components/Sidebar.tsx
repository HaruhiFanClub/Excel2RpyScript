import {
  ArrowLeftRight,
  TableProperties,
  AudioLines,
  Users,
  ClipboardCheck,
  FolderKanban,
  Moon,
  Sun,
  Info,
  type LucideIcon,
} from 'lucide-react'
import { useThemeStore } from '../stores/useThemeStore'
import appIcon from '../assets/app-icon.png'

export type PageId = 'convert' | 'table' | 'tts' | 'characters' | 'check' | 'project'

interface NavItem {
  id: PageId
  label: string
  icon: LucideIcon
  badge?: string
}

const navItems: NavItem[] = [
  { id: 'convert', label: '转换', icon: ArrowLeftRight },
  { id: 'table', label: '表格', icon: TableProperties },
  { id: 'tts', label: '语音合成', icon: AudioLines },
  { id: 'characters', label: '角色配置', icon: Users },
  { id: 'check', label: '检查', icon: ClipboardCheck },
  { id: 'project', label: '工程', icon: FolderKanban },
]

function Item(props: {
  active?: boolean
  onClick?: () => void
  icon: React.ReactNode
  label: string
  badge?: string
}) {
  const { active, onClick, icon, label, badge } = props
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`nodrag group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-sky-400/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200'
          : 'text-app-muted hover:bg-black/5 hover:text-app-text dark:hover:bg-white/5 dark:hover:text-app-text'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-sky-500 dark:bg-sky-400" />
      )}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {badge && (
        <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
          {badge}
        </span>
      )}
    </button>
  )
}

export function Sidebar(props: { active: PageId; onNavigate: (id: PageId) => void }) {
  const { active, onNavigate } = props
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  return (
    <aside className="flex h-full w-[228px] shrink-0 flex-col border-r border-app-border bg-white/35 backdrop-blur-md dark:bg-zinc-900/30">
      {/* 顶部留白：避开 mac 红绿灯 + 作拖拽区 */}
      <div className="drag h-11 shrink-0" />

      <div className="drag flex items-center gap-2.5 px-4 pb-4">
        <img
          src={appIcon}
          alt=""
          draggable={false}
          className="nodrag h-9 w-9 shrink-0 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10"
        />
        <div className="leading-tight">
          <h1 className="text-[14px] font-semibold text-app-text">Excel2Rpy</h1>
          <span className="text-[11px] text-app-muted">Script Workbench</span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Item
              key={item.id}
              active={active === item.id}
              onClick={() => onNavigate(item.id)}
              icon={<Icon size={15} strokeWidth={1.8} />}
              label={item.label}
              badge={item.badge}
            />
          )
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5 border-t border-app-border px-2 py-2">
        <Item
          onClick={toggleTheme}
          icon={theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
          label={theme === 'dark' ? '切换浅色' : '切换深色'}
        />
        <Item
          onClick={() => window.e2r.openExternal('https://github.com/HaruhiFanClub/Excel2RpyScript')}
          icon={<Info size={15} strokeWidth={1.8} />}
          label="关于"
        />
      </div>

      <div className="px-4 pb-3 pt-1 text-[10px] text-app-muted">v0.1.0 · M0</div>
    </aside>
  )
}
