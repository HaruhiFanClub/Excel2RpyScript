// RPY 元素 ↔ Excel 列号映射（移植自 const/converter_setting.py:ElementColNumMapping）
// 0 索引列。真实表格与该映射逐一对应（见 docs/01-legacy-system-contract.md §2）。
export const ElementColNumMapping = {
  role_name: 0,
  text: 1,
  voice_text: 18,
  character: 19,
  background: 20,
  transition: 21,
  music: 22,
  voice: 23,
  voice_cmd: 24,
  mode: 25,
  change_page: 26,
  sound: 27,
  side_character: 28,
  menu: 29,
  remark: 30,
} as const

export type ColKey = keyof typeof ElementColNumMapping

// 位置映射（const/converter_setting.py:PositionMapping）
// 注意：未命中时旧代码用 `PositionMapping.get(w) or w` 保留原词，因此自定义位置（如 kyon_left）原样透传。
export const PositionMapping: Record<string, string> = {
  left: 'left',
  right: 'right',
  mid: 'center',
  truecenter: 'truecenter',
}

// 图片指令映射（const/converter_setting.py:ImageCmdMapping）
export const ImageCmdMapping: Record<string, string> = {
  hide: 'hide',
}

// 转场映射（const/converter_setting.py:TransitionMapping）。未命中 → 空 style → 渲染为空行。
export const TransitionMapping: Record<string, string> = {
  溶解: 'dissolve',
  褪色: 'fade',
  闪白: 'Fade(0.1,0.0,0.5,color="#FFFFFF")',
  像素化: 'pixellate',
  横向振动: 'hpunch',
  纵向振动: 'vpunch',
  百叶窗: 'blinds',
  网格覆盖: 'squares',
  擦除: 'wipeleft',
  滑入: 'slideleft',
  滑出: 'slideawayleft',
  推出: 'pushright',
}

// 文本转义映射（const/converter_setting.py:ReplaceCharacterMapping）。
// 单次逐字符替换，不可链式 replace（否则会二次转义）。
export const ReplaceCharacterMapping: Record<string, string> = {
  '%': '\\%',
  '"': '\\"',
  "'": "\\'",
  '{': '{{',
  '[': '[[',
}
