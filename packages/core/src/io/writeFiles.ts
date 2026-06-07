// 把转换结果写到磁盘。强制 UTF-8 无 BOM、LF（content 内部已用 \n），跨平台不产生 \r\n。
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConvertedFile } from '../pipeline'

export async function writeRpyFiles(outDir: string, files: ConvertedFile[]): Promise<string[]> {
  await mkdir(outDir, { recursive: true })
  const paths: string[] = []
  for (const f of files) {
    const p = join(outDir, `${f.label}.rpy`)
    await writeFile(p, Buffer.from(f.content, 'utf-8')) // 无 BOM；不做换行转换
    paths.push(p)
  }
  return paths
}
