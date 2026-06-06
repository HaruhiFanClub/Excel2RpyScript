// RPY 基本元素 + render()（移植自 model/element.py）。render() 输出必须逐字符对齐。
import { RenderException } from '../errors'
import type { CellValue } from '../parse/cellValue'

// 角色：define {pronoun} = Character('{name}', color="{color}", image="{pronoun}")
export class Role {
  constructor(
    public pronoun: string,
    public name: string,
    public color: string = '#c8c8ff',
  ) {}

  render(): string {
    if (!this.name) return ''
    return `define ${this.pronoun} = Character('${this.name}', color="${this.color}", image="${this.pronoun}")`
  }
}

// 对话文本：{pronoun} "{text}"
export class Text {
  constructor(
    public text: string,
    public role: Role | null,
  ) {}

  render(mode: 'nvl' | 'adv' = 'nvl'): string {
    if (this.role) {
      return `${this.role.pronoun} "${this.text}"`
    }
    return mode === 'nvl' ? `narrator_nvl "${this.text}"` : `narrator_adv "${this.text}"`
  }
}

// 图像：show/scene/hide。注意 Image 不补扩展名、不加 audio/ 前缀（只有 Audio 会）。
export class Image {
  constructor(
    public name: string,
    public cmd: string, // 'show' | 'scene' | 'hide'
    public position: string = '',
  ) {}

  private renderHide(): string {
    return this.name ? `hide ${this.name}` : ''
  }
  private renderScene(): string {
    return `scene ${this.name}`
  }
  private renderShow(): string {
    return this.position ? `show ${this.name} at ${this.position}` : `show ${this.name}`
  }

  render(): string {
    if (this.cmd === 'show') return this.renderShow()
    if (this.cmd === 'scene') return this.renderScene()
    if (this.cmd === 'hide') return this.renderHide()
    throw new RenderException(`不存在的Image指令:${this.cmd}`)
  }
}

// 转场：with {style}；style 为空 → 空字符串
export class Transition {
  constructor(public style: string) {}
  render(): string {
    return this.style ? `with ${this.style}` : ''
  }
}

// 音频：构造时补 .mp3、加 audio/ 前缀；数字单元格名按 str(int()) 处理（"12"，非 "12.0"）。
export class Audio {
  name: string
  fadeout = 0.5
  fadein = 0.5

  constructor(
    name: CellValue | string,
    public cmd: string, // 'play' | 'sound' | 'loop' | 'stop' | ...
  ) {
    let n: string
    if (typeof name === 'string') {
      n = name
    } else if (name.kind === 'number') {
      n = String(Math.trunc(name.value)) // 对齐 Python str(int(float))
    } else if (name.kind === 'text') {
      n = name.value
    } else {
      n = ''
    }
    const parts = n.split('.')
    if ((parts[parts.length - 1] ?? '').toLowerCase() !== 'mp3') {
      n += '.mp3'
    }
    this.name = 'audio/' + n
  }

  render(): string {
    switch (this.cmd) {
      case 'play':
        return `play music "${this.name}"`
      case 'sound':
        return `play sound "${this.name}"`
      case 'loop':
        return `play sound "${this.name}" loop`
      case 'stop':
        return 'stop music'
      default:
        throw new RenderException(`不存在的Audio指令:${this.cmd}`)
    }
  }
}

// 语音：voice "{name}"
export class Voice {
  constructor(
    public name: string,
    public sustain: boolean = false,
  ) {}
  render(): string {
    return `voice "${this.name}"`
  }
}

// 菜单项（分支跳转）。无 render，由 writer 组装 menu: 块。
export class Menu {
  constructor(
    public label: string,
    public target: string,
  ) {}
}

// 自定义指令（如 nvl clear）
export class Command {
  constructor(public cmd: string) {}
  render(): string {
    return this.cmd
  }
}
