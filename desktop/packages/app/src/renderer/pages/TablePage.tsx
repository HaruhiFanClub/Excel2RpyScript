import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community'
import { FileSpreadsheet, TableProperties, Save, RotateCcw, X, MoveHorizontal } from 'lucide-react'
import { TABLE_COLUMNS, type TableData } from '@e2r/core/table'
import { parseSprites, serializeSprites } from '@e2r/core/sprites'
import { enabledRoleNames, tonesForRole, isRoleEnabled } from '@e2r/core/tts'
import type { CellEdit } from '../../shared/ipc'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { useCharactersStore } from '../stores/useCharactersStore'
import {
  SpriteSlotCell,
  BgCell,
  AudioCell,
  VoiceCmdCell,
  DatalistEditor,
  type GridContext,
} from '../components/cellRenderers'
import { SpritePositionsModal } from '../components/SpritePositionsModal'

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
  rowHeight: 34,
  cellHorizontalPadding: 10,
  wrapperBorderRadius: 0,
  borderRadius: 5,
})

type Row = Record<string, string | number>
const LARGE_TEXT = new Set(['text', 'voice_text', 'remark'])
const RENDERERS: Record<string, ColDef<Row>['cellRenderer']> = {
  background: BgCell,
  music: AudioCell,
  sound: AudioCell,
}
// 立绘列拆成 左/中/右 三个虚拟列（底层仍写回单一 character 列）
const SPRITE_SUB: { field: string; header: string }[] = [
  { field: 'sprite_left', header: '立绘·左' },
  { field: 'sprite_mid', header: '立绘·中' },
  { field: 'sprite_right', header: '立绘·右' },
]
const editKey = (sheet: string, row: number, col: string) => `${sheet} ${row} ${col}`

export default function TablePage() {
  const workbookPath = useWorkspaceStore((s) => s.workbookPath)
  const assets = useWorkspaceStore((s) => s.assets)
  const setAssets = useWorkspaceStore((s) => s.setAssets)
  const ttsConfig = useCharactersStore((s) => s.config)
  const spritePositions = useWorkspaceStore((s) => s.spritePositions)
  const setSpritePositions = useWorkspaceStore((s) => s.setSpritePositions)
  const [posOpen, setPosOpen] = useState(false)

  const [data, setData] = useState<TableData | null>(null)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')

  const [img, setImg] = useState<{ url: string; title: string } | null>(null)
  const [audio, setAudio] = useState<{ url: string; title: string } | null>(null)

  const edits = useRef(new Map<string, CellEdit>())
  const [dirty, setDirty] = useState(0)
  const gridApi = useRef<GridApi<Row> | null>(null)

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
          setActive((a) => (a < r.sheets.length ? a : 0))
          edits.current.clear()
          setDirty(0)
        } else setError(r.error)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workbookPath, reloadKey])

  // 关联工程 / 配置变化后刷新单元格
  useEffect(() => {
    gridApi.current?.refreshCells({ force: true })
  }, [assets, ttsConfig])

  const sheet = data?.sheets[active]

  const context = useMemo<GridContext>(
    () => ({
      assets: assets ? { images: assets.images, audio: assets.audio } : null,
      ttsConfig,
      onImage: (url, title) => setImg({ url, title }),
      onAudio: (url, title) => setAudio({ url, title }),
      onImport: (kind, name) => {
        if (!workbookPath) return
        void window.e2r.importAsset(kind, name, workbookPath).then((r) => {
          if (r.ok && r.index) {
            setAssets(r.index) // 关联工程：用回扫的索引刷新缩略图
            gridApi.current?.refreshCells({ force: true })
          }
        })
      },
    }),
    [assets, ttsConfig, setAssets, workbookPath],
  )


  // 已启用角色名 + 其别名（表格角色列下拉建议）
  const roleSuggestions = useMemo<string[]>(() => {
    if (!ttsConfig) return []
    const out = new Set<string>()
    for (const [name, m] of Object.entries(ttsConfig.roleModelMapping)) {
      if (!isRoleEnabled(m)) continue
      out.add(name)
      for (const a of m.aliases ?? []) out.add(a)
    }
    return [...out]
  }, [ttsConfig])

  const columnDefs = useMemo<ColDef<Row>[]>(() => {
    const defs: ColDef<Row>[] = [
      { headerName: '#', field: '__row', width: 60, pinned: 'left', sortable: false, editable: false, cellClass: 'text-app-muted' },
    ]
    for (const c of TABLE_COLUMNS) {
      if (c.key === 'character') {
        for (const s of SPRITE_SUB) {
          defs.push({
            headerName: s.header,
            field: s.field,
            width: 128,
            editable: true,
            cellRenderer: SpriteSlotCell,
          })
        }
      } else if (c.key === 'role_name') {
        // 角色列：下拉建议=已启用角色（含别名），同时允许自由输入其它说话人
        defs.push({
          headerName: c.header,
          field: c.key,
          width: c.width,
          editable: true,
          pinned: 'left' as const,
          cellEditor: DatalistEditor,
          cellEditorParams: { values: roleSuggestions },
        })
      } else if (c.key === 'voice_cmd') {
        // 语音指令列：下拉仅显示该行角色（名称/别名命中）对应的语气，仍允许自由输入
        defs.push({
          headerName: c.header,
          field: c.key,
          width: c.width,
          editable: true,
          cellRenderer: VoiceCmdCell,
          cellEditor: DatalistEditor,
          cellEditorParams: (p: { data?: Row }) => ({
            values: ttsConfig ? tonesForRole(ttsConfig, String(p.data?.['role_name'] ?? '')) : [],
          }),
        })
      } else {
        defs.push({
          headerName: c.header,
          field: c.key,
          width: c.width,
          editable: true,
          ...(RENDERERS[c.key] ? { cellRenderer: RENDERERS[c.key] } : {}),
          ...(LARGE_TEXT.has(c.key) ? { cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true } : {}),
        })
      }
    }
    return defs
  }, [ttsConfig, roleSuggestions])

  const defaultColDef = useMemo<ColDef<Row>>(() => ({ resizable: true, sortable: true }), [])
  const rowData = useMemo<Row[]>(
    () =>
      sheet?.rows.map((r) => {
        const s = parseSprites(r.cells['character'] ?? '', spritePositions)
        return {
          __row: r.excelRow,
          ...r.cells,
          sprite_left: s.left,
          sprite_mid: s.mid,
          sprite_right: s.right,
          sprite_other: s.other,
        }
      }) ?? [],
    [sheet, spritePositions],
  )

  // 当前表中出现的立绘角色（用于位置编辑器）
  const spriteChars = useMemo(() => {
    const set = new Set<string>()
    for (const sh of data?.sheets ?? []) {
      for (const r of sh.rows) {
        for (const seg of (r.cells['character'] ?? '').split(';')) {
          const t = seg.trim().split(/\s+/).filter(Boolean)
          if (t.length >= 2 && t[0]) set.add(t[0])
        }
      }
    }
    for (const c of Object.keys(spritePositions)) set.add(c)
    return [...set].sort()
  }, [data, spritePositions])

  const onGridReady = useCallback((e: GridReadyEvent<Row>) => {
    gridApi.current = e.api
  }, [])

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<Row>) => {
      const col = e.colDef.field
      if (!col || col === '__row' || !sheet) return
      const excelRow = Number(e.data['__row'])
      if (col.startsWith('sprite_')) {
        // 三列任一变化 → 重建单一 character 列（左→中→右→other 顺序）
        const col19 = serializeSprites(
          {
            left: String(e.data['sprite_left'] ?? ''),
            mid: String(e.data['sprite_mid'] ?? ''),
            right: String(e.data['sprite_right'] ?? ''),
            other: String(e.data['sprite_other'] ?? ''),
          },
          spritePositions,
        )
        edits.current.set(editKey(sheet.name, excelRow, 'character'), {
          sheet: sheet.name,
          excelRow,
          col: 'character',
          value: col19,
        })
      } else {
        edits.current.set(editKey(sheet.name, excelRow, col), {
          sheet: sheet.name,
          excelRow,
          col: col as CellEdit['col'],
          value: e.newValue == null ? '' : String(e.newValue),
        })
      }
      setDirty(edits.current.size)
    },
    [sheet, spritePositions],
  )

  const save = useCallback(async () => {
    if (!workbookPath || edits.current.size === 0) return
    setSaving(true)
    setError(null)
    try {
      const r = await window.e2r.saveTable(workbookPath, [...edits.current.values()])
      if (r.ok) {
        edits.current.clear()
        setDirty(0)
        setReloadKey((k) => k + 1)
      } else setError(r.error)
    } finally {
      setSaving(false)
    }
  }, [workbookPath])

  const discard = useCallback(() => {
    edits.current.clear()
    setDirty(0)
    setReloadKey((k) => k + 1)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-app-text">表格编辑</h2>
          <p className="mt-1 text-[13px] text-app-muted">
            多 sheet 浏览/编辑，关联 Ren&apos;Py 工程后直接预览立绘、背景与音频
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPosOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
          >
            <MoveHorizontal size={14} /> 立绘位置
          </button>
          {dirty > 0 && (
            <>
              <span className="text-[12px] text-amber-500">{dirty} 处未保存</span>
              <button
                type="button"
                onClick={discard}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-app-border bg-white/50 px-3 text-[12px] font-medium text-app-text transition-colors hover:bg-white/80 dark:bg-zinc-800/40 dark:hover:bg-zinc-700/60"
              >
                <RotateCcw size={13} /> 放弃
              </button>
            </>
          )}
          <button
            type="button"
            onClick={save}
            disabled={dirty === 0 || saving}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-[12px] font-medium text-white shadow-sm shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <span className="spinner" /> : <Save size={14} />} 保存
          </button>
        </div>
      </header>

      {data && data.sheets.length > 0 && (
        <div className="mb-3 flex items-center gap-1 overflow-x-auto">
          <input
            className="glass-input mr-2 w-48 shrink-0 text-[12px]"
            placeholder="搜索本表…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
              context={context}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              rowData={rowData}
              quickFilterText={query}
              onGridReady={onGridReady}
              onCellValueChanged={onCellValueChanged}
              stopEditingWhenCellsLoseFocus
              animateRows={false}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-app-muted">
            <FileSpreadsheet size={36} strokeWidth={1.2} />
            <p className="text-[13px]">
              {loading ? '读取中…' : error ? `读取失败：${error}` : '选择工作簿以浏览与编辑剧本数据'}
            </p>
          </div>
        )}
      </section>

      {/* 图片灯箱 */}
      {img && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setImg(null)}
        >
          <div className="max-h-[86vh] max-w-[86vw]" onClick={(e) => e.stopPropagation()}>
            <img src={img.url} className="max-h-[80vh] max-w-[86vw] rounded-lg object-contain shadow-2xl" />
            <div className="mt-2 text-center font-mono text-[12px] text-white/80">{img.title}</div>
          </div>
          <button
            className="absolute right-5 top-5 text-white/70 hover:text-white"
            onClick={() => setImg(null)}
          >
            <X size={22} />
          </button>
        </div>
      )}

      {/* 音频播放条 */}
      {audio && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-2.5 shadow-lg backdrop-blur-xl">
          <Music2 />
          <span className="max-w-[260px] truncate font-mono text-[12px] text-app-text">{audio.title}</span>
          <audio key={audio.url} src={audio.url} controls autoPlay className="h-8" />
          <button onClick={() => setAudio(null)} className="text-app-muted hover:text-app-text">
            <X size={16} />
          </button>
        </div>
      )}

      <SpritePositionsModal
        open={posOpen}
        onClose={() => setPosOpen(false)}
        chars={spriteChars}
        transforms={assets?.transforms ?? []}
        value={spritePositions}
        onChange={setSpritePositions}
      />
    </div>
  )
}

function Music2() {
  return <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
}
