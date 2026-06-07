import { describe, it, expect } from 'vitest'
import { validateHeaders } from '../src/format'

const r7 = (a: string, b: string) => [a, b]
const r6 = () => {
  const arr = new Array<string>(31).fill('')
  arr[18] = '选填语音文本'
  arr[19] = '立绘'
  return arr
}

describe('validateHeaders', () => {
  it('合法模板通过', () => {
    expect(validateHeaders(r7('角色', '台词'), r6()).valid).toBe(true)
  })
  it('缺角色/台词 → 非法', () => {
    const r = validateHeaders(r7('名字', '内容'), r6())
    expect(r.valid).toBe(false)
    expect(r.problems.length).toBeGreaterThanOrEqual(2)
  })
  it('缺右侧表头 → 非法', () => {
    const r = validateHeaders(r7('角色', '台词'), new Array<string>(31).fill(''))
    expect(r.valid).toBe(false)
  })
})
