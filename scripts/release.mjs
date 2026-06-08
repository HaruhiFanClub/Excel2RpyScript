// 本地一键发版：bump 版本、归档更新日志、提交、打 tag 并推送。
//
// 使用：
//   1. 在 notes/CHANGELOG-next.md 写好这一版更新日志
//   2. pnpm release <version>，例如 pnpm release 0.1.1
//
// 它会：
//   1. 校验 semver、工作区、默认分支和远端同步状态
//   2. 同步 root / app / core 三处 package.json 版本号
//   3. pnpm install --lockfile-only --ignore-scripts 同步 lock
//   4. 把 CHANGELOG-next.md 归档为 notes/v<version>.md 并重置模板
//   5. git add -A -> commit "v<version>" -> 注解 tag -> push
//   6. tag push 触发 .github/workflows/release.yml
//
// 演练：pnpm release:dry-run <version>

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, '..')
const notesDir = path.join(rootDir, 'notes')
const nextNotesPath = path.join(notesDir, 'CHANGELOG-next.md')
const templateCommentLines = new Set([
  '<!-- 在这里写下一个版本的更新日志，中文自由发挥 -->',
  '<!-- 发版时会自动归档到 notes/v<version>.md，并作为 GitHub Release Notes 与 latest.json 的 notes 字段 -->',
])

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const rawVersion = args.find((arg) => !arg.startsWith('--'))

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

function info(message) {
  console.log(`-> ${message}`)
}

function run(cmd, options = {}) {
  info(`$ ${cmd}`)
  if (dryRun) return ''
  try {
    return execSync(cmd, {
      cwd: rootDir,
      stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      encoding: 'utf8',
    })
  } catch (err) {
    fail(`命令失败: ${cmd}\n${err instanceof Error ? err.message : String(err)}`)
  }
}

function stripTemplateComments(content) {
  return content
    .split('\n')
    .filter((line) => !templateCommentLines.has(line.trim()))
    .join('\n')
    .trim()
}

if (!rawVersion) {
  fail('用法: pnpm release <version>，例如 pnpm release 0.1.1')
}

const version = rawVersion.replace(/^v/, '')
if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
  fail(`版本号格式不对: ${version}（期望 semver，如 0.1.1 或 0.1.1-beta.1）`)
}

const tagName = `v${version}`

const gitStatus = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' })
if (gitStatus.trim() && !dryRun) {
  const dirty = gitStatus
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.endsWith('notes/CHANGELOG-next.md'))
  if (dirty.length) {
    fail(`工作区有未提交改动，请先提交或 stash：\n${dirty.join('\n')}`)
  }
}

const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
  cwd: rootDir,
  encoding: 'utf8',
}).trim()

function resolveDefaultBranch() {
  try {
    const ref = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim()
    const parts = ref.split('/')
    if (parts.length >= 2) return parts.slice(1).join('/')
  } catch {}
  try {
    const raw = execSync('git ls-remote --symref origin HEAD', {
      cwd: rootDir,
      encoding: 'utf8',
    })
    const match = raw.match(/^ref:\s*refs\/heads\/(\S+)\s+HEAD/m)
    if (match) return match[1]
  } catch {}
  return currentBranch
}

const defaultBranch = resolveDefaultBranch()
info(`检测到远端默认分支：${defaultBranch}`)

if (currentBranch !== defaultBranch && !dryRun) {
  fail(`当前分支是 ${currentBranch}，发版必须在 ${defaultBranch} 上。`)
}

if (!dryRun) {
  info(`拉取远端确认同步（origin/${defaultBranch}）...`)
  execSync(`git fetch origin ${defaultBranch}`, { cwd: rootDir, stdio: 'inherit' })
  const behindAhead = execSync(`git rev-list --left-right --count HEAD...origin/${defaultBranch}`, {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim()
  const [ahead, behind] = behindAhead.split(/\s+/).map(Number)
  if (behind > 0) fail(`本地落后远端 ${behind} 个 commit，先 git pull。`)
  if (ahead > 0) info(`本地领先远端 ${ahead} 个 commit，会随本次 release commit 一起推送。`)
}

if (!existsSync(nextNotesPath)) {
  fail(`没有 ${path.relative(rootDir, nextNotesPath)}。请先写本版更新日志。`)
}

const changelogContent = stripTemplateComments(readFileSync(nextNotesPath, 'utf8'))
const nonBlankLines = changelogContent
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line)
if (!nonBlankLines.length) {
  fail(`${path.relative(rootDir, nextNotesPath)} 还是空的，请先写本版更新日志。`)
}

function bumpJsonVersion(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const obj = JSON.parse(raw)
  const oldVersion = obj.version
  obj.version = version
  const serialized = `${JSON.stringify(obj, null, 2)}\n`
  if (!dryRun) writeFileSync(filePath, serialized)
  info(`${path.relative(rootDir, filePath)}: ${oldVersion} -> ${version}`)
}

bumpJsonVersion(path.join(rootDir, 'package.json'))
bumpJsonVersion(path.join(rootDir, 'packages', 'app', 'package.json'))
bumpJsonVersion(path.join(rootDir, 'packages', 'core', 'package.json'))

info('同步 pnpm-lock.yaml...')
run('pnpm install --lockfile-only --ignore-scripts')

mkdirSync(notesDir, { recursive: true })
const archivedNotesPath = path.join(notesDir, `${tagName}.md`)
if (!dryRun) {
  writeFileSync(archivedNotesPath, `${changelogContent}\n`)
  writeFileSync(
    nextNotesPath,
    [
      '<!-- 在这里写下一个版本的更新日志，中文自由发挥 -->',
      '<!-- 发版时会自动归档到 notes/v<version>.md，并作为 GitHub Release Notes 与 latest.json 的 notes 字段 -->',
      '',
      '',
    ].join('\n'),
  )
}
info(`更新日志归档到 notes/${tagName}.md；CHANGELOG-next.md 已重置。`)

run('git add -A')
run(`git commit -m "${tagName}"`)

info(`打注解 tag ${tagName}（注解内容 = 更新日志）`)
if (!dryRun) {
  const result = spawnSync(
    'git',
    ['tag', '-a', tagName, '--cleanup=verbatim', '-F', archivedNotesPath],
    { cwd: rootDir, stdio: 'inherit' },
  )
  if (result.status !== 0) fail('git tag 失败')
}

run(`git push origin ${defaultBranch}`)
run(`git push origin ${tagName}`)

console.log(`
发版触发完成：${tagName}

下一步：
  1. 打开 https://github.com/HaruhiFanClub/Excel2RpyScript/actions 查看 Release workflow
  2. release environment 首次运行需要在 GitHub Actions 页面 Approve
  3. 成功后 GitHub Releases 会出现安装包、免安装包和 latest.json
${dryRun ? '\n本次是 --dry-run，以上 git/package 写入和 push 均未执行。\n' : ''}`)
