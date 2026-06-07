// 端到端落盘：xlsx → 解析 → 转换 → 写文件，再按字节读回与黄金样本比对（覆盖编码/换行）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readWorkbook } from '../src/xlsx/readWorkbook'
import { runPipeline } from '../src/pipeline'
import { writeRpyFiles } from '../src/io/writeFiles'
import { loadRpy, listRpyLabels, sourceXlsx, availableFixtures } from './helpers'

for (const name of availableFixtures) {
  it(`落盘字节一致 ${name}`, async () => {
    const { sheets } = await readWorkbook(sourceXlsx(name))
    const { files } = runPipeline(sheets, { mode: 'legacy-compat' })
    const out = mkdtempSync(join(tmpdir(), 'e2r-'))
    await writeRpyFiles(out, files)
    for (const label of listRpyLabels(name)) {
      const actual = readFileSync(join(out, `${label}.rpy`)) // Buffer
      const expected = Buffer.from(loadRpy(name, label), 'utf-8')
      expect(actual.equals(expected), `${label}.rpy 字节不一致`).toBe(true)
    }
  })
}

describe('writeRpyFiles', () => {
  it('文件不含 BOM 且仅用 LF', async () => {
    const out = mkdtempSync(join(tmpdir(), 'e2r-'))
    await writeRpyFiles(out, [{ label: 'x', content: 'a\nb\n' }])
    const buf = readFileSync(join(out, 'x.rpy'))
    expect(buf[0]).not.toBe(0xef) // 无 UTF-8 BOM
    expect(buf.includes(0x0d)).toBe(false) // 无 CR
  })
})
