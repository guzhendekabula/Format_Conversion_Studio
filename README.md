# Format Conversion Studio

Format Conversion Studio 是一款基于 Electron、React 和 TypeScript 的本地文件格式转换桌面应用。文件转换在本机执行，应用提供批量任务、进度反馈、错误详情和转换历史。

## 功能

### 音视频

- 从 MP4、MOV、MKV、AVI 视频中提取 MP3 音频。
- MP3、WAV、M4A、AAC、FLAC、OGG 音频转换为 MP3 或 WAV。
- MP4、MOV、MKV、AVI、WEBM 视频容器转换。
- GIF 与 MP4 互转，可设置帧率、输出宽度和截取时长。

音视频处理由 FFmpeg 执行。输出质量选项会影响有损格式的编码质量；WAV 等无损或未使用该参数的操作不一定受其影响。

### 图片

- PNG、JPG、WEBP、BMP、TIFF 图片格式转换，可导出 PNG、JPG、WEBP。
- PNG、JPG 生成 ICO 图标。
- 图片压缩，可设置输出格式、质量和每张图片的目标体积；支持批量处理。
- 图片缩放，可按比例、目标宽度或目标高度调整尺寸，并保持宽高比。

图片处理由 Pillow 执行。透明图片转 JPG 时会以白色作为背景。目标体积受图片内容和格式限制，过小的目标可能无法达到，任务会报告错误。

### PDF

- PDF 按页导出为 PNG 或 JPG，支持多页文件和分辨率设置。
- 一张或多张 PNG、JPG、WEBP 图片合并为多页 PDF，可拖动图片调整顺序。

PDF 页面渲染使用 pdf2image 和 Poppler；PDF 生成使用 ReportLab。加密 PDF 若无法通过空密码解锁，当前不能导出。

### Excel 与 Word

- XLSX ↔ CSV。
- XLSX ↔ JSON。
- DOCX → TXT。
- DOCX → Markdown，按 Word 文档中的标题样式生成 Markdown 标题，并转换列表和表格。

表格转换使用 pandas 和 openpyxl；Word 转换使用 python-docx、Mammoth 和 Markdownify。XLSX 转换当前读取默认工作表。

### 开发者工具

- JSON 格式化、压缩和校验。
- JSON ↔ YAML。
- JSON ↔ XML，支持嵌套对象和数组。
- 文本 Base64 编码/解码、图片与 Base64 互转。
- URL 编码/解码。
- MD5、SHA-1、SHA-256 摘要。

## 任务与历史

- 支持多文件选择、文件夹导入和批量转换。
- 每个文件可设置独立输出文件名；默认沿用原文件名。目标文件已存在时会自动追加序号，避免覆盖。
- 转换任务由 Electron 主进程串行执行，界面显示任务进度和逐文件状态。
- 最近活动记录包含输入文件、输出位置、耗时、状态和错误详情，可打开输出文件夹或删除单条历史。
- 历史最多保存 2,000 条。历史和日志位于 Electron 的 `userData` 目录：`history.json` 和 `logs/conversion.log`。

## 技术结构

```text
src/                         React、TypeScript、Ant Design 界面
electron/main.cjs            Electron 主进程与原生文件对话框
electron/preload.cjs         安全暴露给界面的桌面 API
electron/services/           转换引擎调度与串行任务队列
conversion-engines/python/   Python 转换 worker 和依赖
conversion-engines/scripts/  Python worker、Poppler 资源准备脚本
```

主进程通过子进程调用 FFmpeg 或 Python worker。生产包把 FFmpeg、冻结后的 Python worker 和 Poppler 放入应用资源中。渲染进程与 Node.js 隔离，通过 preload 暴露的 API 完成文件选择和任务通信。

## 开发环境

- Node.js 22.12 或更新版本。
- Python 3：仅开发运行未冻结的 worker、生成 worker 或准备依赖时需要。
- macOS 准备 Poppler 需要 Homebrew。

安装 Node 依赖：

```sh
npm install
```

### 准备本机转换引擎

macOS：

```sh
npm run engines:python
npm run engines:poppler:mac
```

Windows PowerShell：

```powershell
npm run engines:python:win
npm run engines:poppler:win
```

Python 依赖版本范围见 [`conversion-engines/python/requirements.txt`](conversion-engines/python/requirements.txt)。引擎资源需要在目标平台准备；跨平台打包时，应在相应平台上生成并暂存对应资源。

### 启动桌面开发版

在两个终端分别运行 Vite 和 Electron：

```sh
npm run dev
```

```sh
npm run desktop:dev
```

Electron 开发窗口默认加载 `http://localhost:5173/`，所以需要先启动 Vite。

### 构建与打包

```sh
# 构建 Web 界面
npm run build

# macOS DMG
npm run dist:mac

# Windows NSIS 安装程序（exe）
npm run dist:win

# 使用 electron-builder 的平台默认配置打包
npm run dist
```

打包前请先为目标平台准备 Python worker 和 Poppler 资源。macOS 包含 DMG、ZIP 和目录格式配置；Windows 目标为 NSIS 安装程序。发布包内含转换引擎，最终用户无需单独安装 Node.js、Python 或 FFmpeg。

## 项目脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run desktop:dev` | 启动 Electron 开发版 |
| `npm run build` | TypeScript 检查并构建前端 |
| `npm run lint` | 运行 ESLint |
| `npm run engines:python` | 在 macOS/Linux 环境生成 Python worker |
| `npm run engines:poppler:mac` | 准备 macOS Poppler 资源 |
| `npm run engines:python:win` | 在 Windows 生成 Python worker |
| `npm run engines:poppler:win` | 准备 Windows Poppler 资源 |
| `npm run dist:mac` | 构建 macOS DMG |
| `npm run dist:win` | 构建 Windows NSIS 安装程序 |

## 许可

仓库当前没有声明项目级开源许可证。第三方依赖及随应用分发的引擎仍受各自许可证约束。
