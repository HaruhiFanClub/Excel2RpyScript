// 工作区（workspace）管理（主进程）。
// 导入表格时在 workspace 下建立「与表格同名」的文件夹（重名加 -2/-3），并复制一份表格进去：
// 后续软件内的所有修改都落在这个副本上，原表格永不被改动。
// 落实的语音/资源也按「rpy 代码里相同的文件名」分类型存进该文件夹。
//
// 位置：macOS → ~/Excel2Rpy/workspace；其它平台 → 软件所在目录/workspace。
import { app } from 'electron'
import { join, basename, extname, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { mkdir, copyFile, readFile, access } from 'node:fs/promises'

export type WsType = 'voice' | 'music' | 'sound' | 'background' | 'sprite'

export function workspaceRoot(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Excel2Rpy', 'workspace')
  const base = app.isPackaged ? dirname(app.getPath('exe')) : process.cwd()
  return join(base, 'workspace')
}

// 表格所在的 workspace 文件夹 = 副本所在目录
export function workspaceDirOf(workbookCopyPath: string): string {
  return dirname(workbookCopyPath)
}

// 某类型内容的落地子目录（不同类型分置不同文件夹）
export function workspaceSub(workspaceDir: string, type: WsType): string {
  return join(workspaceDir, type)
}

// 生成中的临时语音目录（可试听，未应用）。放系统临时区，符合「临时」语义。
export function pendingDirFor(workspaceDir: string): string {
  return join(tmpdir(), 'excel2rpy-pending', basename(workspaceDir))
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'table'
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function sameContent(a: string, b: string): Promise<boolean> {
  try {
    const [ba, bb] = await Promise.all([readFile(a), readFile(b)])
    return ba.equals(bb)
  } catch {
    return false
  }
}

export interface WorkspaceInfo {
  dir: string
  copyPath: string
}

// 导入表格：建同名文件夹（内容相同则复用，重名不同则 -2/-3）+ 复制副本，返回副本路径。
export async function importWorkbook(originalPath: string): Promise<WorkspaceInfo> {
  const root = workspaceRoot()
  await mkdir(root, { recursive: true })
  const ext = extname(originalPath)
  const base = sanitize(basename(originalPath, ext))
  const fileName = base + ext

  let dir = join(root, base)
  if (await exists(dir)) {
    const existingCopy = join(dir, fileName)
    // 重新导入同一份表（含直接拖入副本自身）→ 复用，不再 -2
    if ((await exists(existingCopy)) && (await sameContent(existingCopy, originalPath))) {
      return { dir, copyPath: existingCopy }
    }
    // 同名但内容不同 → -2、-3…
    let i = 2
    while (await exists(join(root, `${base}-${i}`))) i++
    dir = join(root, `${base}-${i}`)
  }
  await mkdir(dir, { recursive: true })
  const copyPath = join(dir, fileName)
  await copyFile(originalPath, copyPath)
  return { dir, copyPath }
}
