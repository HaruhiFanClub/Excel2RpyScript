// CI 用：扫描各平台构建产物，生成 GitHub/R2 两份 latest.json。
//
// 输入：
//   artifacts/<job>/* 或 packages/app/release/*
//
// 输出：
//   dist-release/latest.github.json  url -> GitHub Releases
//   dist-release/latest.r2.json      url -> R2_PUBLIC_BASE（配置时）
//
// latest.json 沿用参考项目的轻量 schema：
//   { version, notes, pub_date, release_url, platforms: { darwin-aarch64, windows-x86_64 } }
// Electron 当前只做“检查更新 + 打开下载链接”，signature 保留为空字符串。

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, '..')
const artifactsDir = path.join(rootDir, 'artifacts')
const localReleaseDir = path.join(rootDir, 'packages', 'app', 'release')
const outputDir = path.join(rootDir, 'dist-release')

const version = (process.env.VERSION || '').replace(/^v/, '').trim()
if (!version) {
  console.error('VERSION env var required')
  process.exit(1)
}

const notesFile = process.env.RELEASE_NOTES_FILE
let notes = `Excel2Rpy v${version}`
if (notesFile && existsSync(notesFile)) notes = readFileSync(notesFile, 'utf8').trim() || notes

const ghRepo = process.env.GITHUB_REPOSITORY || 'HaruhiFanClub/Excel2RpyScript'
const ghReleaseBase = `https://github.com/${ghRepo}/releases/download/v${version}`
const ghReleaseUrl = `https://github.com/${ghRepo}/releases/tag/v${version}`
const r2Base = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '')

function walkFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walkFiles(full))
    else if (st.isFile() && !entry.startsWith('.')) out.push(full)
  }
  return out
}

const sourceDir = existsSync(artifactsDir) ? artifactsDir : localReleaseDir
const files = walkFiles(sourceDir)
const byName = new Map(files.map((file) => [path.basename(file), file]))

function pick(patterns) {
  for (const pattern of patterns) {
    const found = [...byName.keys()].find((name) => pattern.test(name))
    if (found) return found
  }
  return null
}

const macDmg = pick([
  new RegExp(`^Excel2Rpy-${version.replace(/\./g, '\\.')}-arm64\\.dmg$`, 'i'),
  /\.dmg$/i,
])
const winZip = pick([
  new RegExp(`^Excel2Rpy-${version.replace(/\./g, '\\.')}-x64\\.zip$`, 'i'),
  /-x64\.zip$/i,
  /\.zip$/i,
])
const winSetup = pick([
  new RegExp(`^Excel2Rpy-${version.replace(/\./g, '\\.')}-x64-setup\\.exe$`, 'i'),
  /-setup\.exe$/i,
])

if (!macDmg && !winZip && !winSetup) {
  console.error(`No release assets found in ${sourceDir}`)
  process.exit(1)
}

function joinUrl(base, name) {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(name)}`
}

function makePlatforms(base) {
  const platforms = {}
  if (macDmg) {
    platforms['darwin-aarch64'] = {
      signature: '',
      url: joinUrl(base, macDmg),
      kind: 'dmg',
    }
  }
  if (winZip || winSetup) {
    platforms['windows-x86_64'] = {
      signature: '',
      url: joinUrl(base, winZip || winSetup),
      kind: winZip ? 'portable-zip' : 'nsis',
      portable_url: winZip ? joinUrl(base, winZip) : null,
      installer_url: winSetup ? joinUrl(base, winSetup) : null,
    }
  }
  return platforms
}

function makeLatest(base, releaseUrl) {
  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    release_url: releaseUrl,
    platforms: makePlatforms(base),
  }
}

mkdirSync(outputDir, { recursive: true })

const githubJson = makeLatest(ghReleaseBase, ghReleaseUrl)
writeFileSync(path.join(outputDir, 'latest.github.json'), `${JSON.stringify(githubJson, null, 2)}\n`)

if (r2Base) {
  const r2Json = makeLatest(r2Base, `${r2Base}/latest.json`)
  writeFileSync(path.join(outputDir, 'latest.r2.json'), `${JSON.stringify(r2Json, null, 2)}\n`)
}

console.log(`Composed latest.json for v${version}`)
console.log(`  assets: ${[macDmg, winSetup, winZip].filter(Boolean).join(', ')}`)
console.log(`  GitHub: ${path.join(outputDir, 'latest.github.json')}`)
if (r2Base) console.log(`  R2:     ${path.join(outputDir, 'latest.r2.json')}`)
