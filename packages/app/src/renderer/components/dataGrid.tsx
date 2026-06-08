import type { ReactNode } from 'react'
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community'
import { TableProperties } from 'lucide-react'

ModuleRegistry.registerModules([AllCommunityModule])

export const appGridTheme = themeQuartz.withParams({
  accentColor: '#0ea5e9',
  backgroundColor: 'transparent',
  foregroundColor: 'var(--app-text)',
  borderColor: 'var(--app-border)',
  headerBackgroundColor: 'color-mix(in srgb, var(--app-text) 4%, transparent)',
  headerTextColor: 'var(--app-muted)',
  oddRowBackgroundColor: 'color-mix(in srgb, var(--app-text) 2.5%, transparent)',
  rowHoverColor: 'color-mix(in srgb, #0ea5e9 11%, transparent)',
  selectedRowBackgroundColor: 'color-mix(in srgb, #0ea5e9 16%, transparent)',
  fontFamily: 'inherit',
  fontSize: 12.5,
  headerFontWeight: 600,
  headerHeight: 36,
  rowHeight: 34,
  cellHorizontalPadding: 10,
  wrapperBorderRadius: 0,
  borderRadius: 5,
})

export const defaultGridColDef = {
  resizable: true,
  sortable: true,
} satisfies ColDef

export interface SheetTab {
  key: string
  label: string
  count: number
}

export function SheetTabs({
  tabs,
  activeKey,
  onChange,
  leading,
}: {
  tabs: SheetTab[]
  activeKey: string
  onChange: (key: string) => void
  leading?: ReactNode
}) {
  if (tabs.length === 0) return null
  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto">
      {leading}
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
            tab.key === activeKey
              ? 'bg-sky-400/15 text-sky-700 dark:text-sky-200'
              : 'text-app-muted hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <TableProperties size={13} />
          {tab.label}
          <span className="text-app-muted">{tab.count}</span>
        </button>
      ))}
    </div>
  )
}
