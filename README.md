# Excel2Rpy

现代化的 Electron 跨平台桌面应用，用于把 Excel 剧本表格转换为 Ren'Py 脚本，并提供表格编辑、资源预览/导入、语音合成、检查和双表对比。

旧 Python/tkinter 项目已经被替换；当前仓库根目录即新版 PNPM workspace。旧工具行为契约保留在 `docs/01-legacy-system-contract.md`，用于核心转换逻辑的回归校验。

## 功能

- **转换**：导入工作簿后自动生成每个 sheet 对应的 Ren'Py 脚本列表；脚本可单独导出或手动应用到关联工程。
- **表格编辑**：AG Grid 多 sheet 浏览/编辑，保存回写 `.xlsx` 并保留样式/合并；支持快速搜索、冻结角色列、合理默认列宽。
- **资源联动**：关联 Ren'Py 工程后，背景和立绘单元格选中即旁侧预览；音乐/音效可试听；资源可手动导入到 `game/images` 或 `game/audio`。
- **立绘编辑**：立绘列拆成左/中/右三列，底层仍无损写回单一 `character` 列；位置配置来自角色配置。
- **角色配置**：管理角色、别名、立绘位置和语音指令；内置凉宫春日相关角色保持锁定默认配置。
- **语音合成**：按 sheet 展示 TTS 行，支持语气下拉、逐句/批量合成、试听、未重新生成状态追踪；音频应用到工程需要手动触发。
- **检查 / 对比**：格式检查、资源/转场/角色相关问题提示，以及两个表格的独立导入对比。
- **分发 / 更新**：见 `docs/build-distribution.md`，支持 macOS DMG、Windows x64 安装包、zip 免安装包和应用内检查更新。

## 结构

```text
packages/
  core/                 纯 TypeScript 内核，无 Electron 依赖
    src/
      settings/         列映射、位置/转场/转义表、解析常量、TTS 语言码
      parse/            CellValue 与空行过滤/补齐
      model/            Ren'Py 基本元素与 render()
      convert/          转换状态机与逐行规则
      write/            RPY 文件组装
      xlsx/             ExcelJS 读取/保存
      renpy/            Ren'Py 工程资源扫描
      check/            表格检查
    test/               黄金回归、读取对齐、TTS、diff、资源解析等测试
  app/                  Electron 应用
    src/main/           主进程、IPC、工程/资源/TTS 操作
    src/preload/        contextBridge
    src/renderer/       React UI
    src/shared/         IPC 类型契约
scripts/                分发和 TTS 冻结脚本
docs/                   分发文档与旧行为契约
```

## 命令

```bash
pnpm install
pnpm -r test
pnpm -r typecheck
pnpm --filter @e2r/app dev
pnpm --filter @e2r/app build
```

分发包：

```bash
pnpm --filter @e2r/app dist:mac --skip-tts
pnpm --filter @e2r/app dist:win --skip-tts
```

云端一键发版：

```bash
# 先填写 notes/CHANGELOG-next.md
pnpm release 0.1.1
```

脚本会同步版本号、归档更新日志、提交并打 `v0.1.1` 注解 tag；tag push 会触发 GitHub Actions 构建 macOS arm64 DMG、Windows x64 安装包和 zip 免安装包，并生成 `latest.json`。

全离线内置 TTS 包需要在目标操作系统上设置 `E2R_TTS_CORE`，详见 `docs/build-distribution.md`。

## 工程同步语义

关联 Ren'Py 工程只会扫描资源索引，不会自动写工程文件。

- RPY 同步：在转换页点击“应用到工程”或“应用全部更改”才会覆盖 `game/*.rpy`。
- 语音同步：TTS 合成先写入工作区临时目录，点击应用后才复制到工作区 `voice/`，若有关联工程则同时复制到 `game/audio/`。
- 资源导入：表格页点击导入/替换资源时，会立即复制所选图片或音频到关联工程资源目录。

## 测试

核心测试当前覆盖 93 项，包含旧行为黄金样本、ExcelJS 读取对齐、写盘字节一致、TTS 任务规划、角色/语气配置、diff 和资源路径解析。

旧 Python 工具不再作为项目入口；如需重新核对历史行为，请参考 `docs/01-legacy-system-contract.md`。
