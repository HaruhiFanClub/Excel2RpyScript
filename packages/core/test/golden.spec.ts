// 黄金回归：用 xlrd 权威 cells.json 跑 legacy-compat 流水线，与旧工具输出逐字符比对。
// 这是 M0 的硬门槛。
import { describe, it, expect } from 'vitest'
import { runPipeline } from '../src/pipeline'
import { loadCells, loadRpy, listRpyLabels, availableFixtures } from './helpers'

for (const name of availableFixtures) {
  describe(`golden ${name} (legacy-compat 字节级一致)`, () => {
    const sheets = loadCells(name)
    const { files } = runPipeline(sheets, { mode: 'legacy-compat' })
    const byLabel = new Map(files.map((f) => [f.label, f.content]))

    it('生成的文件集合与预期一致', () => {
      expect([...byLabel.keys()].sort()).toEqual(listRpyLabels(name).sort())
    })

    for (const label of listRpyLabels(name)) {
      it(`${label}.rpy 字节一致`, () => {
        const actual = byLabel.get(label)
        expect(actual, `缺少生成文件 ${label}`).toBeDefined()
        expect(actual).toBe(loadRpy(name, label))
      })
    }
  })
}
