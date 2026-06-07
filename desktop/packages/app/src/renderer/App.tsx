import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar, type PageId } from './components/Sidebar'
import ConvertPage from './pages/ConvertPage'
import TablePage from './pages/TablePage'
import CheckPage from './pages/CheckPage'
import TtsPage from './pages/TtsPage'
import CharactersPage from './pages/CharactersPage'
import ProjectPage from './pages/ProjectPage'
import { WorkspaceBar } from './components/WorkspaceBar'
import { useWorkspaceStore } from './stores/useWorkspaceStore'
import { useCharactersStore } from './stores/useCharactersStore'

const PAGES: PageId[] = ['convert', 'table', 'tts', 'characters', 'check', 'project']

export function App(): JSX.Element {
  const initial = (window.e2r.demoPage as PageId | null) ?? null
  const [page, setPage] = useState<PageId>(initial && PAGES.includes(initial) ? initial : 'convert')

  // 开发钩子 + 恢复上次会话（持久化的关联工程在启动时重新扫描）
  const importWorkbook = useWorkspaceStore((s) => s.importWorkbook)
  const linkProject = useWorkspaceStore((s) => s.linkProject)
  const loadCharacters = useCharactersStore((s) => s.load)
  useEffect(() => {
    void loadCharacters()
    if (window.e2r.demoFile) void importWorkbook(window.e2r.demoFile)
    const st = useWorkspaceStore.getState()
    if (!window.e2r.demoFile && st.workbookPath) void st.runConvert(st.workbookPath)
    const dir = window.e2r.demoProject ?? (window.e2r.demoUnlink ? '' : st.renpyDir)
    if (dir && !st.assets) void linkProject(dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-app-bg text-app-text">
      {/* 静态背景光晕 */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-1/4 -left-1/4 h-[60%] w-[60%] rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[55%] w-[55%] rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
        <div className="absolute top-1/3 -right-1/6 h-[50%] w-[50%] rounded-full bg-violet-300/15 blur-3xl dark:bg-violet-500/10" />
      </div>

      {/* 玻璃外壳 */}
      <div className="absolute inset-2 overflow-hidden rounded-[18px] border border-white/60 bg-white/55 shadow-[0_10px_50px_-12px_rgb(15_23_42_/_0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/55 dark:shadow-none">
        {/* 顶部拖拽条（覆盖 mac 红绿灯区） */}
        <div className="drag pointer-events-auto absolute inset-x-0 top-0 z-10 h-8" />

        <div className="flex h-full">
          <Sidebar active={page} onNavigate={setPage} />

          <div className="flex min-w-0 flex-1 flex-col pt-8">
            <WorkspaceBar />
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="custom-scrollbar min-h-0 flex-1 overflow-y-auto"
              >
                <div
                  className={`mx-auto h-full px-8 pb-7 pt-6 ${
                    page === 'table' || page === 'tts' ? 'max-w-none' : 'max-w-5xl'
                  }`}
                >
                  {page === 'convert' && <ConvertPage />}
                  {page === 'table' && <TablePage />}
                  {page === 'tts' && <TtsPage />}
                  {page === 'characters' && <CharactersPage />}
                  {page === 'check' && <CheckPage />}
                  {page === 'project' && <ProjectPage />}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  )
}
