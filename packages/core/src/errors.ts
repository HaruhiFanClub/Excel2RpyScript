// 移植自 corelib/exception.py（仅保留内核用到的）
export class RenderException extends Error {
  constructor(public msg: string) {
    super(msg)
    this.name = 'RenderException'
  }
}

export class ParseFileException extends Error {
  constructor(public msg: string) {
    super(msg)
    this.name = 'ParseFileException'
  }
}
