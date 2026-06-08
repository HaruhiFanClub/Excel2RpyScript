# Excel2Rpy

借助 Excel 演出表格，以零编程方式创建 AVG / 视觉小说。

## 功能

- **脚本生成**：导入演出表格后，转换成对应的 Ren'Py 脚本。
- **表格编辑**：在软件中通过专为视觉小说设计的模式编辑表格。
- **资源联动**：关联 Ren'Py 工程后，背景和立绘单元格选中即旁侧预览；音乐/音效可试听；在软件中添加的资源会同步到工程文件夹。
- **角色配置**：管理角色、别名、立绘位置和语音指令；内置凉宫春日系列角色。
- **语音合成**：提供内嵌的语音合成服务，和工程深度关联。
- **检查 / 对比**：格式检查、资源/转场/角色相关问题提示，以及两个表格的独立导入对比。

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

## 快速启动

```bash
pnpm install
pnpm --filter @e2r/app dev
```

常用检查：

```bash
pnpm -r test
pnpm -r typecheck
pnpm --filter @e2r/app build
```

分发包：

```bash
pnpm --filter @e2r/app dist:mac --skip-tts
pnpm --filter @e2r/app dist:win --skip-tts
```
