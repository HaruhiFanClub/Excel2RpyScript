# Excel2Rpy Desktop（重构版）

把根目录的旧 Python/tkinter 工具重构为现代 **Electron 跨平台桌面应用**。
完整实施计划见上层约定与 `../docs/`；旧系统行为契约见 `../docs/01-legacy-system-contract.md`。

## 现状（功能基本齐备）

- **转换**：`@e2r/core` TS 重写，与旧工具**逐字符对齐**（黄金回归 + 对齐陷阱单测）。
- **表格**：AG Grid 多 sheet 浏览/编辑、保存回写 .xlsx（保留样式/合并）、快速搜索、冻结角色列；关联工程后单元格直接预览**立绘/背景缩略图、音乐/音效播放**，未命中可**一键导入到工程**；**立绘拆左/中/右三列**（只填角色+编号，位置按角色自动匹配）；语音指令**下拉选择 + 语气显示**。
- **语音合成（双模式）**：① **远端服务**——API 调用服务器、按角色切自定义模型（自带「凉宫春日（远端）」内置预设，写入软件内）；② **内嵌 zero-shot**——本地 GPT-SoVITS 引擎按参考音频克隆，角色仅给参考音频分组。两模式与表格联动一致（角色绑定/语音指令下拉/语气/未重新生成/试听）。逐句 角色/语气/状态、批量(按角色排序跳过切权重)/单句、试听；与旧版一致并修正 sheet 序号 bug。配置可视化编辑（设置弹窗，按模式条件显示）。
- **检查 / 对比**：error/warn/info（含音乐/立绘/背景太久未换、角色名空白）；关联工程后**校验立绘位置真实存在**（读 renpy transform）；新旧表 Diff。
- **工程**：`.e2rproj` 工程文件（打开/保存，重开恢复并重扫工程）；关联 Ren'Py 后一键把 .rpy 写入 game/ 并启用语音；TTS 配置可视化编辑（端点/角色+别名/语音指令+语气）。
- **导入校验**：非法模板即时红条提示。
- **UI**：玻璃拟态、浅/深双主题、共享 WorkspaceBar、会话持久化。
- **分发**：见 `docs/build-distribution.md`，一条命令产出全离线内置 TTS 的安装包（已验证 electron-builder 产出可运行 app）。

测试 **77 项通过**（`pnpm -r test`）。参考工程仅作风格参考，各页原创设计。

## 仍待（环境/外部相关）
- 在各目标 OS 上实际跑 `dist:*` 产出多 GB 全离线安装包；签名/公证 + CI 矩阵。
- 每角色立绘位置的可视化编辑（当前用 `<角色>_left/_mid/_right` 约定 + 关联工程后校验，已覆盖真实数据）。

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
