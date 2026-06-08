// 语言显示名 → GPT-SoVITS 语言码（handler/tts.py:LANG_OPTIONS / app.py:get_lang_codes）
export const LANG_OPTIONS: Record<string, string> = {
  中文: 'all_zh',
  粤语: 'all_yue',
  英文: 'en',
  日文: 'all_ja',
  韩文: 'all_ko',
  中英混合: 'zh',
  粤英混合: 'yue',
  日英混合: 'ja',
  韩英混合: 'ko',
  多语种混合: 'auto',
  '多语种混合(粤语)': 'auto_yue',
}
