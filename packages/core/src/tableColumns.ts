// 纯数据/类型（无 Node / exceljs 依赖），可被渲染进程安全导入。
import type { ColKey } from './settings/converterSetting'
import type { WorkbookSchema } from './tableSchema'

// 表格编辑器展示的「有意义列」（跳过 C–R 预留空列）
export const TABLE_COLUMNS: { key: ColKey; header: string; width: number }[] = [
  { key: 'role_name', header: '角色', width: 112 },
  { key: 'text', header: '台词', width: 420 },
  { key: 'voice_text', header: '选填语音文本', width: 340 },
  { key: 'character', header: '立绘', width: 336 },
  { key: 'background', header: '背景', width: 156 },
  { key: 'transition', header: '转场', width: 92 },
  { key: 'music', header: '音乐', width: 168 },
  { key: 'voice', header: '语音', width: 88 },
  { key: 'voice_cmd', header: '语音指令', width: 148 },
  { key: 'mode', header: '模式', width: 82 },
  { key: 'change_page', header: '换页', width: 82 },
  { key: 'sound', header: '音效', width: 168 },
  { key: 'side_character', header: '头像', width: 108 },
  { key: 'menu', header: '分支', width: 120 },
  { key: 'remark', header: '备注', width: 260 },
]

export interface TableRow {
  excelRow: number // 真实 Excel 行号（1 基）
  cells: Record<string, string> // 按 ColKey 的文本值
}
export interface TableSheet {
  name: string
  rows: TableRow[]
  schema?: WorkbookSchema
}
export interface TableData {
  sheets: TableSheet[]
}
