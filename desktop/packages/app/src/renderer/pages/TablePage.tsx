import { useEffect, useMemo, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from 'ag-grid-community'
import { FileSpreadsheet, TableProperties } from 'lucide-react'
import { TABLE_COLUMNS, type TableData } from '@e2r/core/table'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { PathPicker } from '../components/PathPicker'

ModuleRegistry.registerModules([AllCommunityModule])

const gridTheme = themeQuartz.withParams({
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
  rowHeight: 32,
  cellHorizontalPadding: 10,
  wrapperBorderRadius: 0,
  borderRadius: 5,
})

type Row = Record<string, string | number>

export default function TablePage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const setWorkbookPath = useWorkspaceStore((s) => s.setWorkbookPath)

  const [data, setData] = useState<TableData | null>(null)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workbookPath) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    window.e2r
      .readTable(workbookPath)
      .then((r) => {
        if (cancelled) return
        if (r.ok) {
          setData({ sheets: r.sheets })
          setActive(0)
        } else {
          setError(r.error)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workbookPath])

  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      {
        headerName: '#',
        field: '__row',
        width: 64,
        pinned: 'left',
        sortable: false,
        cellClass: 'text-app-muted',
        headerClass: 'text-app-muted',
      },
      ...TABLE_COLUMNS.map(
        (c): ColDef<Row> => ({
          headerName: c.header,
          field: c.key,
          width: c.width,
          tooltipField: c.key,
        }),
      ),
    ],
    [],
  )

  const defaultColDef = useMemo<ColDef<Row>>(
    () => ({ resizable: true, sortable: true, suppressMovable: false }),
    [],
  )

  const sheet = data?.sheets[active]
  const rowData = useMemo<Row[]>(
    () => sheet?.rows.map((r) => ({ __row: r.excelRow, ...r.cells })) ?? [],
    [sheet],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">表格预览</h2>
          <p className="mt-1 text-[13px] text-app-muted">
            多 sheet 浏览剧本数据（编辑与保存即将上线）
          </p>
        </div>
        <div className="w-[420px]">
          <PathPicker
            value={workbookPath}
            onChange={setWorkbookPath}
            mode="file"
            placeholder="拖入或选择 .xlsx / .xls 文件…"
            ariaLabel="工作簿"
          />
        </div>
      </header>

      {/* sheet 标签 */}
      {data && data.sheets.length > 0 && (
        <div className="mb-3 flex items-center gap-1 overflow-x-auto">
          {data.sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActive(i)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                i === active
                  ? 'bg-sky-400/15 text-sky-700 dark:text-sky-200'
                  : 'text-app-muted hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <TableProperties size={13} />
              {s.name}
              <span className="text-app-muted">{s.rows.length}</span>
            </button>
          ))}
        </div>
      )}

      <section className="glass-card relative min-h-0 flex-1 overflow-hidden">
        {sheet && sheet.rows.length > 0 ? (
          <div className="h-full w-full">
            <AgGridReact<Row>
              theme={gridTheme}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              rowData={rowData}
              tooltipShowDelay={300}
              suppressCellFocus={false}
              animateRows={false}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-app-muted">
            <FileSpreadsheet size={36} strokeWidth={1.2} />
            <p className="text-[13px]">
              {loading
                ? '读取中…'
                : error
                  ? `读取失败：${error}`
                  : '选择工作簿以预览剧本数据'}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
