// CellValue：复刻 xlrd 读到的单元格语义（见 docs/01-legacy-system-contract.md §B）。
// xlrd 把数字单元格读成 float、文本读成 str、空单元格读成 ''。
// 旧代码大量依赖"这个单元格到底是数字还是字符串"（Audio 的 str(int())、proofreader 的 isinstance 检查），
// 因此必须保留"是不是数字"这个判别信息，不能在读取阶段就拍平成字符串。
export type CellValue =
  | { kind: 'empty' }
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }

export const EMPTY: CellValue = { kind: 'empty' }

export function textCell(value: string): CellValue {
  return { kind: 'text', value }
}
export function numberCell(value: number): CellValue {
  return { kind: 'number', value }
}

// 复刻 Python `str(float)`：整数浮点 → "12.0"，与 Audio 的 `str(int())`（"12"）区分。
// 注：真实数据无数字单元格（见契约 §B 统计），此函数仅服务用户后续手填的数字名场景；
// 极大/极小指数表示与 Python 可能有出入，已在测试中覆盖常见整数区间。
export function pyStrOfNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e16) {
    return `${n}.0`
  }
  return String(n)
}

// 复刻旧代码的 `str(cell)`。
export function asStr(cv: CellValue): string {
  switch (cv.kind) {
    case 'empty':
      return ''
    case 'number':
      return pyStrOfNumber(cv.value)
    case 'text':
      return cv.value
  }
}

// 复刻旧代码的 `if cell:` 真值判断（xlrd 浮点 0.0 为假，空串为假）。
export function truthy(cv: CellValue): boolean {
  switch (cv.kind) {
    case 'empty':
      return false
    case 'number':
      return cv.value !== 0
    case 'text':
      return cv.value.length > 0
  }
}

// 复刻 `cell == "<字面量>"`：仅当单元格是文本且字面相等。
export function rawEq(cv: CellValue, s: string): boolean {
  return cv.kind === 'text' && cv.value === s
}

// proofreader 的 `isinstance(sound, str)` 取反：单元格是否为数字。
export function isNumeric(cv: CellValue): boolean {
  return cv.kind === 'number'
}
