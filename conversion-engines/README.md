# 本地转换引擎

## 运行模型

Electron 主进程拥有串行任务队列，并通过子进程调用 FFmpeg 或本地 Python worker。渲染进程只接收进度、逐文件状态和完成/错误事件。任务历史保存到 Electron `userData/history.json`，详细 JSONL 日志保存到 `userData/logs/conversion.log`。输出文件采用 `原文件名.ext`；目标已存在时按 `原文件名 (2).ext` 递增，避免覆盖。

XML 映射规则使用 `fast-xml-parser`：XML 根元素作为 JSON 对象的同名属性；属性保留为 `@_属性名`；混合文本节点使用 `#text`；同名重复元素解析为数组。JSON 单根对象键直接作为 XML 根元素，其他 JSON 根值包在 `<root>` 中。为保留单元素数组，JSON 数组会写入 `fcs_array` 标记属性并在 XML 反转时还原。

## Python worker

Mac（在当前构建架构上）执行 `npm run engines:python`。Windows 执行 `npm run engines:python:win`。两者会建立独立虚拟环境、安装 `requirements.txt`，并生成 `conversion-engines/python/dist/format-worker/`。打包程序调用该目录中的可执行文件，因此最终用户不需要安装 Python。

开发运行前可以通过相同命令生成 worker；若未生成，开发模式会使用 `python3`/`python` 和项目 `.venv`。worker 通过 stdin 接收一行 JSON 请求，通过 stdout 发出 JSON 进度事件及结果。

## FFmpeg

`ffmpeg-static` 作为应用运行时依赖随 Electron 包分发。主进程用 FFmpeg `-progress pipe:1` 读取时间进度；未使用系统 PATH 中的 FFmpeg。

## Poppler

`pdf2image` 调用 Poppler 的 `pdftoppm`、`pdfinfo` 等命令，必须打包二进制和运行库，最终用户无需安装 Poppler。Mac 构建机执行 `npm run engines:poppler:mac`（需要 Homebrew）；Windows 构建机执行 `npm run engines:poppler:win` 下载并暂存 Windows 发行包。暂存到 `conversion-engines/poppler/dist/` 的运行资源由 electron-builder 复制到应用资源目录。

## 包含的操作

- FFmpeg：提取音频、MP3/WAV 转换、视频容器转换、GIF/MP4 互转。
- Pillow：格式转换、质量压缩、按比例/宽度/高度缩放、ICO。
- PDF：pdf2image 多页导出、ReportLab 多图片 PDF 合并。
- 表格：pandas/openpyxl 的 CSV/XLSX/JSON 转换。
- Word：python-docx 文本提取；Mammoth 转 HTML 后转换为 Markdown，保留标题、列表和表格。
