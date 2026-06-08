// 内置 TTS 引擎托管：主进程拉起 GPT-SoVITS server.py（开发用 venv，打包用冻结二进制），
// 取空闲端口、等 /health 就绪，对外给出本地端点。这是「开箱即用」的核心。
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

let proc: ChildProcess | null = null
let baseUrl: string | null = null
let starting = false

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

// 解析引擎位置：开发用 E2R_TTS_CORE（含 server.py + .venv）；打包用 resources/tts（冻结二进制）。
interface Engine {
  cmd: string
  args: string[]
  cwd: string
}
function resolveEngine(port: number): Engine | null {
  const core = process.env['E2R_TTS_CORE']
  if (core && existsSync(join(core, 'server.py'))) {
    const py =
      process.platform === 'win32'
        ? join(core, '.venv', 'Scripts', 'python.exe')
        : join(core, '.venv', 'bin', 'python')
    const python = existsSync(py) ? py : 'python3'
    return { cmd: python, args: ['server.py', '--host', '127.0.0.1', '--port', String(port)], cwd: core }
  }
  // 打包版：resources/tts/tts-server（冻结二进制）—— 由分发流程放置
  const resBase = process.resourcesPath ? join(process.resourcesPath, 'tts') : ''
  if (resBase) {
    const bin =
      process.platform === 'win32' ? join(resBase, 'tts-server.exe') : join(resBase, 'tts-server')
    if (existsSync(bin))
      return { cmd: bin, args: ['--host', '127.0.0.1', '--port', String(port)], cwd: resBase }
  }
  return null
}

export function engineStatus(): { running: boolean; baseUrl: string | null; starting: boolean } {
  return { running: !!proc && !!baseUrl, baseUrl, starting }
}

export async function engineStart(
  onLog: (line: string) => void,
): Promise<{ ok: true; baseUrl: string } | { ok: false; error: string }> {
  if (proc && baseUrl) return { ok: true, baseUrl }
  if (starting) return { ok: false, error: '引擎正在启动中' }
  starting = true
  try {
    const port = await freePort()
    const eng = resolveEngine(port)
    if (!eng) return { ok: false, error: '未找到内置 TTS 引擎（开发请设 E2R_TTS_CORE，或使用打包版）' }
    onLog(`[engine] ${eng.cmd} ${eng.args.join(' ')}`)
    proc = spawn(eng.cmd, eng.args, {
      cwd: eng.cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })
    proc.stdout?.on('data', (d) => onLog(String(d)))
    proc.stderr?.on('data', (d) => onLog(String(d)))
    proc.on('exit', (code) => {
      onLog(`[engine] exited ${code}`)
      proc = null
      baseUrl = null
    })
    const url = `http://127.0.0.1:${port}/`
    const deadline = Date.now() + 240_000 // 首启加载模型较慢
    while (Date.now() < deadline) {
      if (!proc) return { ok: false, error: '引擎进程已退出（见日志）' }
      try {
        const r = await fetch(`${url}health`)
        if (r.ok) {
          baseUrl = url
          return { ok: true, baseUrl: url }
        }
      } catch {
        /* 还没起来 */
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    return { ok: false, error: '引擎启动超时' }
  } finally {
    starting = false
  }
}

export function engineStop(): void {
  proc?.kill()
  proc = null
  baseUrl = null
}
