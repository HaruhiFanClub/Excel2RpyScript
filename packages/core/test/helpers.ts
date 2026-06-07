import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ParsedSheet } from '../src/convert/converter'

const here = dirname(fileURLToPath(import.meta.url))
export const fixturesDir = join(here, 'fixtures')

export type FixtureName = 'real' | 'sample'

// 'real' 来自私有生产表格，仅本地存在（git 忽略）；公开仓库只带 'sample'。
// 测试按可用 fixture 动态执行，缺失 'real' 时不报错。
export function hasFixture(name: FixtureName): boolean {
  return existsSync(join(fixturesDir, name, 'cells.json'))
}

export const availableFixtures: FixtureName[] = (['sample', 'real'] as FixtureName[]).filter(
  hasFixture,
)

export function loadCells(name: FixtureName): ParsedSheet[] {
  return JSON.parse(readFileSync(join(fixturesDir, name, 'cells.json'), 'utf-8')) as ParsedSheet[]
}

export function loadRpy(name: FixtureName, label: string): string {
  return readFileSync(join(fixturesDir, name, 'rpy', `${label}.rpy`), 'utf-8')
}

export function listRpyLabels(name: FixtureName): string[] {
  return readdirSync(join(fixturesDir, name, 'rpy'))
    .filter((f) => f.endsWith('.rpy'))
    .map((f) => f.replace(/\.rpy$/, ''))
}

export function sourceXlsx(name: FixtureName): string {
  return join(fixturesDir, name, 'source.xlsx')
}
