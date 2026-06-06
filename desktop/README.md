# Excel2Rpy Desktop（重构版）

把根目录的旧 Python/tkinter 工具重构为现代 **Electron 跨平台桌面应用**。
完整实施计划见上层约定与 `../docs/`；旧系统行为契约见 `../docs/01-legacy-system-contract.md`。

## 现状：M0（正确性内核）已完成 ✅

- 转换内核 `@e2r/core` 用 TypeScript 重写，**逐字符对齐**旧工具输出。
- 黄金回归 + reader 对齐 + 落盘字节比对 + 对齐陷阱单测：**38/38 通过**。
- 最简 Electron 壳：选 Excel → 选模式 → 转换 → 写出 `.rpy`，含预览与告警。

## 结构

```
desktop/
  packages/
    core/                 纯 TS 内核（无 Electron）。输入 CellValue[][]，输出 rpy 字符串。
      src/
        settings/         列映射、位置/转场/转义表、解析常量、TTS 语言码（移植自 const/*.py）
        parse/            cellValue（xlrd 语义判别联合）、parser（空行跳过/补齐）
        model/element.ts  Role/Text/Image/Audio/Transition/Voice/Menu/Command + render()
        convert/          Converter + RowConverter（逐列规则、状态机）
        write/writer.ts   文件组装（行序、menu 块、voice sustain 怪癖）
        xlsx/             ExcelJS → CellValue[][]（对齐 xlrd，含合并区处理）
        io/writeFiles.ts  落盘（UTF-8 无 BOM、LF）
        pipeline.ts       parse→convert→write 编排 + legacy-compat/default 双模式
      test/
        fixtures/{real,sample}/   cells.json（xlrd 权威 dump）+ rpy/（黄金样本）+ source.xlsx
        golden.spec.ts            字节级回归（硬门槛）
        readerParity.spec.ts      ExcelJS 读取 == xlrd dump；xlsx→rpy 端到端
        writeDisk.spec.ts         落盘字节一致 + 无 BOM/CR
        parity.spec.ts            每个对齐陷阱的定点单测
    app/                  Electron（electron-vite）：main / preload / renderer(React)
      src/main/index.ts   窗口 + IPC（openXlsx / selectDir / convert）
      src/preload/index.ts contextBridge 暴露 window.e2r
      src/renderer/        React UI（选文件/模式/转换/预览/告警）
      src/shared/ipc.ts    IPC 契约类型
```

## 命令

```bash
cd desktop
pnpm install            # 需要 pnpm 10+；首装会下载 Electron 二进制
pnpm -r test            # 跑全部测试（核心 38 项）
pnpm -r typecheck       # TS strict 类型检查
pnpm --filter @e2r/app dev     # 启动应用（开发模式，HMR）
pnpm --filter @e2r/app build   # 构建产物
```

## 双模式（ConversionMode）

- `legacy-compat`：与旧工具**逐字符一致**（保留已知 bug，用于回归基准与迁移中工程）。
- `default`（新工程默认）：修正已知 bug 并产出**告警**：
  - 角色名首尾空白归一（`trimRoleNames`）——旧工具会把 `朝比奈实玖瑠` 与 `朝比奈实玖瑠\t` 当两个角色。
  - 模式大小写归一 `ADV→adv`（`normalizeMode`）。
  - TTS sheet 序号错位：在 TTS 路径用绝对 sheet 索引（保证 `voice "..."` 与 wav 文件名一致）——M3 落地。

## 黄金样本再生（当需要重新核对旧行为时）

旧 Python 代码是「oracle」。用 `xlrd==1.2.0` 跑 `handler.parser/converter/writer`：
1. `python3 -m venv /tmp/v && /tmp/v/bin/pip install xlrd==1.2.0`
2. 调用 `Parser→Converter→RpyFileWriter.write_file` 生成 `.rpy`（见 `../docs/01-legacy-system-contract.md §0`）。
3. 用 xlrd 按 `ctype` dump 每个 sheet 的 31 列为 `CellValue`（空串文本归一为 empty），覆盖 `test/fixtures/*/cells.json`。

## 路线图（后续里程碑）

- **M1** 可编辑多 sheet 表单（AG Grid）+ ExcelJS 就地写回保样式/合并 + `.e2rproj` 工程 + 校对器 + diff。
- **M2** 立绘左/中/右三列（有序 sprite 模型，无损往返）+ renpy 工程关联（读 transform）+ 资源缩略图。
- **M3** 内置 GPT-SoVITS TTS（冻结子进程）+ 批量/单句合成 + 试听 + 语气映射 + 「未重新生成」追踪。
- **M4** 全离线分发（PyInstaller 冻结 + electron-builder）+ 一键部署到 renpy。
