// reader 对齐：ExcelJS 读取 + 解析 应与 xlrd 权威 dump（cells.json）完全相同；
// 并验证从 xlsx 直达 rpy 仍字节一致。
import { describe, it, expect } from 'vitest'
import { readWorkbook } from '../src/xlsx/readWorkbook'
import { runPipeline } from '../src/pipeline'
import { loadCells, loadRpy, listRpyLabels, sourceXlsx, availableFixtures } from './helpers'

for (const name of availableFixtures) {
  describe(`reader 对齐 ${name}`, () => {
    it('ExcelJS 读取+解析 == xlrd cells.json', async () => {
      const { sheets } = await readWorkbook(sourceXlsx(name))
      const expected = loadCells(name)
      expect(sheets.map((s) => s.name)).toEqual(expected.map((s) => s.name))
      for (let i = 0; i < expected.length; i++) {
        // 逐 sheet 比对，失败信息更可读
        expect(sheets[i]?.rows, `sheet ${expected[i]?.name} 行数/内容不一致`).toEqual(
          expected[i]?.rows,
        )
      }
    })

    it('xlsx → rpy 端到端字节一致', async () => {
      const { sheets } = await readWorkbook(sourceXlsx(name))
      const { files } = runPipeline(sheets, { mode: 'legacy-compat' })
      const byLabel = new Map(files.map((f) => [f.label, f.content]))
      for (const label of listRpyLabels(name)) {
        expect(byLabel.get(label), `${label}.rpy`).toBe(loadRpy(name, label))
      }
    })
  })
}
