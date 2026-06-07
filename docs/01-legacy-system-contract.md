# 旧系统行为契约（Legacy System Contract）

> 本文是对**现有 Python 工具**（`app.py` + `handler/` + `const/` + `model/`）行为的逆向工程记录。
> 重构后的 Electron 应用的两大核心功能（Excel→RPY 转换、TTS 语音合成）必须与本文描述**逐字符对齐**。
> 黄金样本（golden master）：用现有工具在真实表格与示例表格上生成的 `.rpy`，作为重写的回归基准。
>
> 最后更新：2026-06-06（首次逆向）。修改本文前请先核对现有代码与黄金样本。

---

## 0. 黄金样本（回归基准）

用现有 Python 代码（`Parser`→`Converter`→`RpyFileWriter`，等价于 `app.py:ConvertButton_Cmd`）生成：

| 输入 | 输出目录 | 文件 |
|---|---|---|
| `雪山症候群第三集20260601.xlsx`（6 sheet） | `/tmp/e2r_golden/real/` | `start.rpy`, `Sheet2..Sheet6.rpy`（首 sheet→`start.rpy`） |
| `test/剧本示例表格.xlsx`（3 sheet） | `/tmp/e2r_golden/sample/` | `start.rpy`, `Sheet2.rpy`, `Sheet3.rpy` |

复现命令（需 `xlrd==1.2.0`，已建好临时 venv `/tmp/e2r_golden_venv`）：
驱动脚本 `/tmp/e2r_golden_driver.py` 直接调用 `handler.parser/converter/writer`。
> ⚠️ 这些样本在 `/tmp`，是临时的。重构时应把样本**固化进仓库**（如 `packages/core/test/fixtures/`）并写成自动回归测试。

---

## 1. 解析（Parser，`handler/parser.py` + `tools/excel.py` + `const/parser_setting.py`）

- 读取库：`xlrd==1.2.0`（同时支持 `.xls`/`.xlsx`）。数字单元格返回 **float**，文本返回 str。
- 逐 sheet 解析；每个 sheet 产出 `SheetParseResult(name, row_values)`。
- **起始行** `EXCEL_PARSE_START_ROW = 7`（0 索引）→ 即从 Excel 第 8 行开始读数据。
- **固定列数** `EXCEL_PARSE_START_COL = 31`（列索引 0..30）。
- 行处理：`row = [cell.value for cell in sheet.row(i)]`；
  - 若整行全空（`not any(data)`）→ **跳过**；
  - 若不足 31 列 → 用 `""` 补齐；
  - `assert len == 31`。

## 2. 列语义（`const/converter_setting.py: ElementColNumMapping`）

| 列(0索引) | Excel列 | 键名 | 含义 |
|---|---|---|---|
| 0 | A | `role_name` | 角色名 |
| 1 | B | `text` | 对话/旁白文本（中文） |
| 18 | S | `voice_text` | 选填语音文本（通常日文，供 TTS 用） |
| 19 | T | `character` | 立绘 |
| 20 | U | `background` | 背景 |
| 21 | V | `transition` | 转场 |
| 22 | W | `music` | 音乐 |
| 23 | X | `voice` | 语音（`tts` / 文件名 / `名 sustain`） |
| 24 | Y | `voice_cmd` | 语音指令 |
| 25 | Z | `mode` | 模式（nvl/adv，真实数据里常见大写 `ADV`） |
| 26 | AA | `change_page` | 换页 |
| 27 | AB | `sound` | 音效 |
| 28 | AC | `side_character` | 对话框头像 |
| 29 | AD | `menu` | 分支跳转目标（sheet 名） |
| 30 | AE | `remark` | 备注（不渲染） |

> 列 2..17（C..R）转换器**完全不读**，是预留/翻译/校对用空间。真实表格里它们基本为空。

## 3. 行→元素转换（`handler/converter.py`）

转换器状态：`current_mode`（默认 `'nvl'`）、`current_role`（默认 `Role("narrator_nvl","None")`）、`characters`（当前在场立绘缓存）、`role_name_mapping`（角色名→Role）、`side_characters`（pronoun→头像路径）。

`add_role(name)`：首次出现的真实角色 → `Role("role{N}", name)`，`N = 当前已登记角色数 + 1`（即 role1、role2…按**首次出现顺序**）。

逐列规则（`RowConverter`）：

- **mode** (col25)：非空则更新 `current_mode = mode`（**原样**，不小写化）。
- **role** (col0)：读**原始单元格**（注意：不是前向填充值）。
  - 非空且 ≠ `"旁白"` → `current_role = add_role(name)`。
  - `== ""`（空）→ 保持 `current_role` 不变（**沿用上一个说话人**，包括旁白行也归到上一角色）。
  - `== "旁白"` 或其他 → `current_role = Role("narrator_{current_mode}", "None")`。
- **text** (col1)：`str(cell).replace("\n","\\n")`；空→`None`；否则逐字符做 `ReplaceCharacterMapping` 转义后包成 `Text(text, current_role)`。
  - 转义表：`%`→`\%`，`"`→`\"`，`'`→`\'`，`{`→`{{`，`[`→`[[`。
- **music** (col22)：空→None；`== "none"` → `Audio(music,'stop')`；否则 `Audio(music,'play')`。
- **background** (col20)：空→None；否则 `Image(bg,'scene')`。
- **character/立绘** (col19)：
  1. 先对**当前缓存**的每个立绘生成 `Image(name,'hide')`（统一回收旧立绘）；
  2. 若本行立绘为空 → 清空缓存，仅返回 hide 列表；
  3. 否则按 `;` 分割（无空格），每段 `generate_character(seg)`：
     - `last_word = seg.split(" ")[-1]`；`position = PositionMapping.get(last_word) or last_word`（**未命中映射时，最后一个词原样即位置**）；
     - `position` 真值（几乎总是）→ `Image(seg去掉last_word并strip, 'show', position)`；
     - 否则 → `Image(..., ImageCmdMapping.get(last_word,'hide'))`（极少触发）。
  4. 缓存更新为新立绘；返回 `hide列表 + 新立绘列表`。
  - `PositionMapping = {left:left, right:right, mid:center, truecenter:truecenter}`。真实数据里 last_word 多为自定义位置如 `kyon_left`/`haruhi_mid`/`itsuki_right` → 原样作为 `at <pos>`。
- **sound** (col27)：空→None；以 `循环` 开头→`Audio(去掉"循环",'loop')`；`== "stop"`→`Audio(...,'stop')`；否则 `Audio(sound,'sound')`。
- **transition** (col21)：空→None；`TransitionMapping.get(t,"")` → `Transition(style)`（未命中→空串→渲染为空）。
- **change_page** (col26)：非空→`Command("nvl clear")`。
- **voice** (col23)：strip 后：
  - `== "tts"`（不分大小写）→ `Voice("{role_name}_sheet{sheet_index+1}_row{row_index+8}_synthesized.wav")`，其中 `role_name` 是**前向填充**值，`row_index` 是该 sheet 内已解析行的 0 基序号。
  - 末词 `== "sustain"` → `Voice(首词, sustain=True)`。
  - 否则 → `Voice(voice_str)`。
- **menu** (col29)：非空**且** text 非空 → `Menu(label=转义后的text, target=menu)`。
- **side_character** (col28)：非空 → `side_characters[current_role.pronoun] = 值`；返回 None。

## 4. 渲染模板（`model/element.py`）

- `Role.render`：`define {pronoun} = Character('{name}', color="{color}", image="{pronoun}")`；默认 color `#c8c8ff`。
- `Text.render`：`{role.pronoun} "{text}"`（角色总非空，故旁白也用 `narrator_nvl/adv`）。
- `Image`：`show {name} at {position}` / `show {name}`（无位置）/ `scene {name}` / `hide {name}`。
- `Audio`：构造时若扩展名≠mp3 则补 `.mp3`，再前缀 `audio/`。`play`→`play music "audio/..."`；`sound`→`play sound "audio/..."`；`loop`→`play sound "audio/..." loop`；`stop`→`stop music`（**忽略名字**）。
- `Transition.render`：`with {style}`（style 空→`""`）。
- `Voice.render`：`voice "{name}"`。
- `Command.render`：原样输出（如 `nvl clear`）。
- `TransitionMapping`：溶解→dissolve，褪色→fade，闪白→`Fade(0.1,0.0,0.5,color="#FFFFFF")`，像素化→pixellate，横向振动→hpunch，纵向振动→vpunch，百叶窗→blinds，网格覆盖→squares，擦除→wipeleft，滑入→slideleft，滑出→slideawayleft，推出→pushright。

## 5. 文件写出（`handler/writer.py`）

每个 sheet 写一个 `{label}.rpy`（首 sheet→`start`，其余→sheet 名）。文件结构：

```
（对每个登记角色）define roleN = Character('名', color="#c8c8ff", image="roleN")
define narrator_nvl = Character(None, kind=nvl)
define narrator_adv = Character(None, kind=adv)
define config.voice_filename_format = "audio/{filename}"
（对每个 side character）image side {pronoun} = "{path}"

label {label}:
（逐行）...
```

> 注意：writer 每个 sheet 都写出**全部**角色定义（`role_name_mapping` 跨 sheet 累积）。

行内元素**输出顺序**：`music → background → character(逐个) → sound → transition → voice → text → change_page`。
- 文本前的 voice sustain：若**上一行**的 voice 有 `sustain=True` 且本行有 text，则在 text 前补一行 `voice sustain`。
- **菜单**：连续的 menu 行被收集；遇到第一个非 menu 行时，输出 `menu:` 块（每项 `    "{label}":\n        jump {target}`）并 `continue`（**会跳过那一行的其他元素** —— 既有行为/潜在 bug）。文件末尾若仍有未输出 menu 也补上。

## 6. TTS 管线（`handler/tts.py` + `const/tts_setting.py` + `config.json`）

- 仅对 **语音列(col23) strip().lower()=='tts'** 的行合成。
- `filter_parsed_sheets_tts`：前向填充 role_name，提取 `{role_name, text(col1), voice_text(col18), voice_cmd(col24), original_row_index}`，并按 role_name **排序**；只保留有 tts 行的 sheet。
- 合成 `synthesize_voice(sheets, language, text_lang_code, prompt_lang_code, use_voice_text)`：
  - text = `voice_text` 若 use_voice_text 否则 `text`。
  - `voice_cmd_mapping[voice_cmd]` → `ref_audio_path` / `prompt_text`（缺省用 default）。
  - `language=='JA'` → 用 DeepL 把 text 译成日文。
  - `switch_models(role_name)`：GET `set_gpt_weights?weights_path=...` 与 `set_sovits_weights?weights_path=...`（来自 `role_model_mapping[role_name]`）。
  - POST `/tts`，body：`{text, text_lang, ref_audio_path, prompt_text, prompt_lang, text_split_method:"cut1", batch_size:1}`。
  - 输出写到 `audio/{role_name}_sheet{sheet_index+1}_row{original_row_index+8}_synthesized.wav`。
- 语言码 `LANG_OPTIONS`：中文 all_zh / 粤语 all_yue / 英文 en / 日文 all_ja / 韩文 all_ko / 中英 zh / 粤英 yue / 日英 ja / 韩英 ko / 多语种 auto / 多语种(粤) auto_yue。

### ⚠️ 已知 bug / 需在重写中修正并对用户透明
1. **sheet 序号错位**：转换器的 `voice` 文件名用的 `sheet_index` 是**全部 sheet**的索引；TTS 用的是**仅含 tts 行的 sheet**的索引。当存在前置无 tts 行的 sheet 时，`voice "..."` 引用名与实际 wav 文件名**对不上**。重写须按构造保证两者一致。
2. **mode 大小写**：真实数据用 `ADV`（大写），但旁白角色生成 `narrator_{mode}`，writer 只定义 `narrator_nvl/narrator_adv`（小写）→ 若出现大写 mode 的旁白行会引用未定义角色。重写应规范化大小写。
3. **角色名脏数据**：真实表格里 `朝比奈实玖瑠` 与 `朝比奈实玖瑠\t`（尾随 TAB）被当成两个角色（role6/role13）。重写的校对器应警告角色名首尾空白；是否归一化需可配置。

## 7. config.json 结构（`TTSConfig`）

```jsonc
{
  "role_model_mapping": { "角色名": { "gpt": "...ckpt", "sovits": "...pth" }, ... },
  "voice_cmd_mapping":  { "指令名": { "ref_audio_path": "...wav", "prompt_text": "..." }, ... },
  "default_prompt_audio": "./predef_ref/正常有希/01_有希_平静.wav",
  "default_prompt_text": "...",
  "API_BASE_URL": { "base": "http://127.0.0.1:9880/" },
  "deepL_api_key": "..."
}
```
真实 `config.json` 含 11 个角色（凉宫春日等）、大量 `voice_cmd`（yuki_a1、haruhi_1..32、kyon_*…）。
角色权重实际在 `/Volumes/data/GPT-SoVITS/{GPT,SoVITS}_weights_v2ProPlus/...`。

## 8. 现有校对器规则（`handler/proofreader.py`，"检查"功能的种子）

阈值：立绘 `_FACE_GAP_THRESHOLD=10`、背景 `_BG_GAP_THRESHOLD=80`、音乐 `_MUSIC_GAP_THRESHOLD=80`、台词 `_MAX_TEXT_LEN=60`。行号 = 索引 + 8。

- 台词 ≥60 字 → warn。
- voice_text 非空但 voice≠tts → warn。
- 立绘：1 词（如 hide）合法；≥2 词时末词须 ∈ {left,right,mid,truecenter} 否则 **error**；立绘变化但转场空 → warn；连续 10 行无立绘 → warn。
- 背景变化但转场空 → warn；连续 80 行无背景 → warn。
- 转场不在映射表 → error。
- 连续 80 行无音乐 → warn。
- voice==tts 但 voice_cmd 空 → error；voice_cmd 非空但 voice≠tts → warn。
- mode==nvl 但 change_page≠"换页" → warn。
- sound 为纯数字（非 str）→ error。
- side_character 非空 → warn（未充分实现）。
- menu 目标不在 sheet 名集合 → error。

## 9. 真实 Excel 表格结构（`雪山症候群第三集20260601.xlsx`）

- 6 个 sheet（Sheet1..Sheet6），分别为某一话；结构一致。Sheet2 最大（~967 行）。
- 行 1-3：标题/元数据（合并单元格）；行 4：小节名（合并 A4:R4）；行 6：右侧表头(S..AE)；行 7：左侧表头(A,B)；行 8+：数据。
- 合并单元格：标题行、小节行、以及叙述行的 B:R 合并。每 sheet 数百个合并区。
- 语义底色：粉红=小节标记，浅绿=角色表头，浅灰=数据行底。
- **无** Excel 数据验证/下拉（约束靠人工约定）。
- 立绘列格式：`角色id 四位编号 位置[;角色id 编号 位置...]`，例 `kyon 0012 kyon_left;sanmisen 0001 right`（分号无空格，最多见 3 个）。
- 背景：`bg <id>[ 修饰]` 或颜色名（如 `white`）。
- 语音指令：`角色_序号`（kyon_3、haruhi_29、nakagawa_6）。

## 10. renpy 部署目标（`/Volumes/data/renpy-8.5.3-sdk/the_question`）

- 游戏目录：`<proj>/game/`，内含 `*.rpy`、`images/`、音频、`options.rpy`、`gui/`、`cache/`。
- 图片解析：`show sylvie green normal` → 找 `game/images/sylvie green normal.png`（**文件名即注册**，含空格、大小写敏感，无需 image 定义）。
- 背景同理：`scene bg club` → `game/images/bg club.jpg`。
- 音乐：`play music "X"` 默认从 `game/` 根找（the_question 里 `illurock.opus` 在 game 根）。但本工具的 `Audio` 强制前缀 `audio/` 且补 `.mp3` → 实际要求音乐放在 `game/audio/`。
- 语音：`config.voice_filename_format="audio/{filename}"`（writer 写死）→ `voice "X"` 找 `game/audio/X`。
- `config.has_voice` 默认 **False**（the_question 的 options.rpy）→ 部署带语音的脚本时必须设为 True。
- 位置：`truecenter` 是 renpy 内置 transform（`renpy/common/00definitions.rpy`）；`left/right/center` 是内置 Position。自定义位置（如 `kyon_left`）须由**项目自身**定义为 `transform`/`Position`。→ 关联项目时可读取这些定义。

## 11. 当前 GUI 功能清单（`app.py`，需在新 UI 全部覆盖或增强）

主功能页：多文件输入框、保存目录（源目录/自定义）、转换、校对、3 种合成（按源语言 / 按中译日 / 按选填语音文本）、text_lang/prompt_lang 下拉、帮助菜单（视频教程/检查更新）。
配置页：角色列表 + GPT/SoVITS 路径增删改、语音指令列表 + 参考音频/提示文本增删改、默认参考音频/文本、API base URL、DeepL key、保存配置。

## 12. 本机 TTS 可行性（已验证）

- `GPT-SoVITS-inference-core/.venv`：torch 2.11.0，**MPS 可用**；系统 ffmpeg 7.1.1、soundfile 0.12.1 均在。
- 预训练基础模型 `GPT_SoVITS/pretrained_models` 已存在（904M：chinese-hubert-base / chinese-roberta-wwm-ext-large / sv）。
- 核心 API：`/health`、POST `/tts`（返回 WAV，可 stream）、GET `/set_gpt_weights`、GET `/set_sovits_weights`；CLI/env 配置 host/port/device/is-half/api-key 等；`examples/embed_subprocess.py` 给出"子进程 + /health 等待 + TTSClient"的嵌入范式。
- 打包：`make_dist.py` 三档（minimal ~30MB / light ~150-200MB / full ~600MB+）。Python 3.10/3.11，需 ffmpeg + libsndfile。
