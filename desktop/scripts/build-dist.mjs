// 一条命令分发：冻结 TTS（缺则跑）→ 构建渲染/主进程 → electron-builder 打包。
// 用法：node scripts/build-dist.mjs [mac|win] [--skip-tts]
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const platform = process.argv.find((a) => a === 'mac' || a === 'win') ?? (process.platform === 'win32' ? 'win' : 'mac')
const skipTts = process.argv.includes('--skip-tts')
const ttsDir = join(root, 'resources', 'tts')
const frozen = join(ttsDir, process.platform === 'win32' ? 'tts-server.exe' : 'tts-server')

const sh = (cmd) => {
  console.log('\n$', cmd)
  execSync(cmd, { stdio: 'inherit', cwd: root })
}

// 1) 冻结 TTS（全离线内置）
if (!skipTts && !existsSync(frozen)) {
  if (!process.env.E2R_TTS_CORE) {
    console.error('✗ 需要内置 TTS：设置 E2R_TTS_CORE 后重试，或加 --skip-tts 打不带引擎的包')
    process.exit(1)
  }
  sh('node scripts/freeze-tts.mjs')
}

// 2) 构建
sh('pnpm --filter @e2r/app build')

// 3) 打包（存在冻结引擎时注入 extraResources）
const extra = existsSync(ttsDir)
  ? `--config.extraResources.0.from=${ttsDir} --config.extraResources.0.to=tts`
  : ''
sh(`pnpm --filter @e2r/app exec electron-builder --${platform} ${extra}`.trim())
console.log('\n✓ 分发完成，见 packages/app/release/')
