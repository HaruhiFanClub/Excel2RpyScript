# 分发与打包

目标：**一条命令**产出"打开即用"的安装包，TTS 引擎**全离线内置**，最终用户无需任何 Python/环境配置。

## 一条命令

在**目标操作系统**上（PyInstaller 不能跨平台冻结 torch，mac/win 各跑一次）：

```bash
# 内置 TTS：指向推理核心；首次会冻结引擎 + 下载基础模型（较慢、~GB）
E2R_TTS_CORE=/abs/GPT-SoVITS-inference-core pnpm --filter @e2r/app dist:mac   # 或 dist:win
```

产物在 `packages/app/release/`（mac: dmg；win: nsis 安装包 + zip 免安装包）。

不带内置引擎的快速包（仅连接外部 API 端点）：

```bash
pnpm --filter @e2r/app dist:mac --skip-tts
# 或仅验证打包：pnpm --filter @e2r/app pack   （electron-builder --dir，不压缩）
```

## 流程（scripts/build-dist.mjs）

1. **冻结 TTS**（`scripts/freeze-tts.mjs`，缺失时自动）：
   - `pip install pyinstaller`，`download_pretrained.py` 拉基础模型；
   - PyInstaller `--onedir` 冻结 `server.py` → `tts-server`（`--collect-all torch/torchaudio`、`--collect-submodules GPT_SoVITS`、`--add-data configs、GPT_SoVITS/text`）；
   - 冻结产物 + `pretrained_models` 拷到 `resources/tts/`。
2. `electron-vite build`（main/preload/renderer）。
3. `electron-builder --mac/--win`，存在 `resources/tts` 时通过 `--config.extraResources` 注入到安装包的 `resources/tts`。

运行时 `main/ttsServer.ts` 优先用打包内 `resources/tts/tts-server`（开发用 `E2R_TTS_CORE` 的 venv），取空闲端口拉起、等 `/health`。

## 平台注意

- **macOS(arm64, MPS)**：torch CPU/MPS 轮子；dmg 需对 app **与内置 `tts-server` 二进制/dylib 一并签名+公证**（hardened runtime 允许 JIT）。
- **Windows(x64)**：默认 CPU torch；可选 CUDA 包（`pip install --index-url .../cu121 torch torchaudio` 后再冻结）。Authenticode 签名避免 SmartScreen。
- **ffmpeg / libsndfile**：`soundfile` 轮子通常自带 libsndfile；ffmpeg 若系统无，放静态二进制到 `resources/tts/bin` 并加入 PATH。
- **体积**：torch + 基础模型 → 安装包数 GB。角色声音权重默认**运行时按绝对路径指向**（`set_*_weights`），不烘焙进包；如需烘焙可放入 `resources/tts/weights` 并在默认 config 指向。
- **CI**：用 macos-latest + windows-latest 矩阵各跑一次 `dist:*`。

## 体积优化（可选）

- 把仅渲染端用到的依赖（ag-grid、react、framer-motion 等）移到 `devDependencies`（已被 Vite 打进 `out/renderer`，无需作为运行时依赖收集）。
- PyInstaller `--exclude-module` 去掉用不到的大模块。
