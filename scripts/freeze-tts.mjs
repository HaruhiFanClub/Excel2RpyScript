// 把 GPT-SoVITS 推理核心冻结为自包含的 tts-server，连同基础模型放进 resources/tts。
// 需在「目标操作系统」上运行（PyInstaller 无法跨平台冻结 torch）。
// 用法：E2R_TTS_CORE=/path/to/GPT-SoVITS-inference-core node scripts/freeze-tts.mjs [--hf-mirror]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, cpSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '..', 'resources', 'tts')
const core = process.env.E2R_TTS_CORE
const hfMirror = process.argv.includes('--hf-mirror')

if (!core || !existsSync(join(core, 'server.py'))) {
  console.error('✗ 请设置 E2R_TTS_CORE 指向 GPT-SoVITS-inference-core（含 server.py）')
  process.exit(1)
}

const isWin = process.platform === 'win32'
const py = isWin ? join(core, '.venv', 'Scripts', 'python.exe') : join(core, '.venv', 'bin', 'python')
const sep = isWin ? ';' : ':'
const run = (cmd, args, cwd = core) => {
  console.log('›', cmd, args.join(' '))
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

mkdirSync(out, { recursive: true })

// 1) 工具与基础模型
run(py, ['-m', 'pip', 'install', '-U', 'pyinstaller'])
run(py, ['download_pretrained.py', ...(hfMirror ? ['--hf-mirror'] : [])])

// 2) PyInstaller 冻结（onedir，自包含 torch 等）
run(py, [
  '-m',
  'PyInstaller',
  '--noconfirm',
  '--onedir',
  '--name',
  'tts-server',
  '--collect-all',
  'torch',
  '--collect-all',
  'torchaudio',
  '--collect-submodules',
  'GPT_SoVITS',
  '--add-data',
  `configs${sep}configs`,
  '--add-data',
  `GPT_SoVITS/text${sep}GPT_SoVITS/text`,
  'server.py',
])

// 3) 拷贝冻结产物 + 基础模型到 resources/tts
const frozen = join(core, 'dist', 'tts-server')
cpSync(frozen, out, { recursive: true })
const models = join(core, 'GPT_SoVITS', 'pretrained_models')
if (existsSync(models)) cpSync(models, join(out, 'GPT_SoVITS', 'pretrained_models'), { recursive: true })

// 4) ffmpeg（如系统未内置，请把静态 ffmpeg 放到 resources/tts/bin）
console.log('✓ TTS 引擎已冻结 →', out)
console.log('  注意：确保 ffmpeg / libsndfile 可用（mac: brew；打包请放 resources/tts/bin 或随 wheel）')
