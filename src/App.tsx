import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dropdown, Input, InputNumber, message, Modal, Pagination, Select, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { DeleteOutlined, FileSearchOutlined, FolderOpenOutlined, RollbackOutlined } from '@ant-design/icons'
import './App.css'

type Category = '音视频' | '图片' | 'PDF' | 'Excel' | 'Word' | '开发工具'
type LocalFile = { name: string; outputName?: string; size: number; type: string; file?: File; path?: string; status: 'ready' | 'queued' | 'running' | 'done' | 'error'; detail?: string }
type Tool = { title: string; desc: string; from: string; to: string }
const tools: Record<Category, Tool[]> = {
  音视频: [{ title: '视频提取音频', desc: '从视频文件中提取音轨', from: 'MP4 / MOV / MKV / AVI', to: 'MP3' }, { title: '音频格式转换', desc: '转换常见音频格式与音质', from: 'MP3 / WAV / M4A / AAC / FLAC / OGG', to: 'WAV / MP3' }, { title: '视频格式转换', desc: '在常用视频容器之间转换', from: 'MP4 / MOV / MKV / AVI / WEBM', to: 'MP4 / MOV / MKV / AVI / WEBM' }, { title: 'GIF 转换', desc: '视频与动图互转，设置帧率和尺寸', from: 'GIF / MP4', to: 'MP4 / GIF' }],
  图片: [{ title: '图片格式转换', desc: '转换图片格式，保持清晰度', from: 'PNG / JPG / WEBP / BMP / TIFF', to: 'JPG / PNG / WEBP' }, { title: '图片压缩', desc: '调整图片质量，批量减小体积', from: '图片文件', to: 'JPG / WEBP / PNG' }, { title: '图片缩放', desc: '按宽度、高度或比例调整尺寸', from: '图片文件', to: '调整尺寸' }, { title: 'ICO 生成', desc: '为应用或网站制作图标文件', from: 'PNG / JPG', to: 'ICO' }],
  PDF: [{ title: 'PDF 转图片', desc: '将 PDF 每一页导出为图片', from: 'PDF', to: 'PNG / JPG' }, { title: '图片转 PDF', desc: '将一张或多张图片保存为 PDF', from: 'PNG / JPG', to: 'PDF' }, { title: '合并为 PDF', desc: '拖动排序，将多张图片合并成文档', from: '多张图片', to: 'PDF' }],
  Excel: [{ title: 'CSV 转换', desc: '在 Excel 与 CSV 之间转换', from: 'XLSX / CSV', to: 'CSV / XLSX' }, { title: 'JSON 转换', desc: '在 Excel 与 JSON 之间转换', from: 'XLSX / JSON', to: 'JSON / XLSX' }],
  Word: [{ title: 'DOCX 转 TXT', desc: '提取 Word 文档中的纯文本', from: 'DOCX', to: 'TXT' }, { title: 'DOCX 转 Markdown', desc: '保留标题、列表和表格结构', from: 'DOCX', to: 'MD' }],
  开发工具: [{ title: 'JSON 工具', desc: '格式化、压缩与校验 JSON', from: 'JSON', to: 'JSON' }, { title: 'YAML 转换', desc: 'JSON 与 YAML 互相转换', from: 'JSON / YAML', to: 'YAML / JSON' }, { title: 'XML 转换', desc: '在 XML 与 JSON 之间转换', from: 'XML / JSON', to: 'JSON / XML' }, { title: 'Base64 工具', desc: '文本编码解码，图片与 Base64 互转', from: '文本 / 图片', to: 'Base64 / 图片' }, { title: 'URL 工具', desc: 'URL Encode 与 Decode', from: 'URL', to: '编码 / 解码' }, { title: 'Hash 工具', desc: '生成 MD5、SHA-1、SHA-256 摘要', from: '文本', to: 'MD5 / SHA-1 / SHA-256' }],
}
const nav: { name: Category; icon: string }[] = [{ name: '音视频', icon: '◉' }, { name: '图片', icon: '▧' }, { name: 'PDF', icon: '▤' }, { name: 'Excel', icon: '▦' }, { name: 'Word', icon: '▤' }, { name: '开发工具', icon: '</>' }]
const fmtSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
const defaultTargetKb = (size: number) => Math.max(0.1, Math.round(size * 0.7 / 102.4) / 10)
const ext = (name: string) => name.split('.').pop()?.toUpperCase() || 'FILE'
const filePath = (file: File) => (file as File & { path?: string }).path
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', parseTagValue: false, parseAttributeValue: false, trimValues: false })
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', format: true, suppressEmptyNode: false })
const xmlArrayMarker = '@_fcs_array'
const encodeXmlArrays = (value: unknown): unknown => {
  if (Array.isArray(value)) return { [xmlArrayMarker]: 'array', item: value.map(encodeXmlArrays) }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeXmlArrays(item)]))
  return value
}
const decodeXmlArrays = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(decodeXmlArrays)
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    if (object[xmlArrayMarker] === 'array') {
      const items = object.item === undefined ? [] : Array.isArray(object.item) ? object.item : [object.item]
      return items.map(decodeXmlArrays)
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, decodeXmlArrays(item)]))
  }
  return value
}

function App() {
  const [category, setCategory] = useState<Category>('图片')
  const [tool, setTool] = useState<Tool>(tools.图片[0])
  const [files, setFiles] = useState<LocalFile[]>([])
  const [dark, setDark] = useState(false)
  const [outputDir, setOutputDir] = useState('与源文件相同')
  const [outputFormat, setOutputFormat] = useState('PNG')
  const [input, setInput] = useState('')
  const [result, setResult] = useState('')
  const base64InputRef = useRef<string | null>(null)
  const [quality, setQuality] = useState(85)
  const [compressionModal, setCompressionModal] = useState(false)
  const [compressionTargets, setCompressionTargets] = useState<Record<string, number | null>>({})
  const [fps, setFps] = useState(12)
  const [gifWidth, setGifWidth] = useState(640)
  const [gifDuration, setGifDuration] = useState(0)
  const [resizeMode, setResizeMode] = useState<'percent' | 'width' | 'height'>('percent')
  const [resizePercent, setResizePercent] = useState(50)
  const [resizeWidth, setResizeWidth] = useState(800)
  const [resizeHeight, setResizeHeight] = useState(600)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressText, setProgressText] = useState('等待任务')
  const [queueCount, setQueueCount] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [errorDetail, setErrorDetail] = useState('')
  const [errorModal, setErrorModal] = useState(false)
  const [aboutModal, setAboutModal] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const devImageRef = useRef<HTMLInputElement>(null)
  const dragIndex = useRef<number | null>(null)
  const isDev = category === '开发工具'

  const extensions = useMemo(() => {
    if (category === '图片') return tool.title === 'ICO 生成' ? '.png,.jpg,.jpeg' : '.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff'
    if (category === '音视频') {
      if (tool.title === '视频提取音频') return '.mp4,.mov,.mkv,.avi'
      if (tool.title === '音频格式转换') return '.mp3,.wav,.m4a,.aac,.flac,.ogg'
      if (tool.title === 'GIF 转换') return '.gif,.mp4'
      return '.mp4,.mov,.mkv,.avi,.webm'
    }
    if (category === 'PDF') return tool.title === 'PDF 转图片' ? '.pdf' : '.png,.jpg,.jpeg,.webp'
    if (category === 'Excel') return tool.title === 'CSV 转换' ? '.xlsx,.csv' : '.xlsx,.json'
    if (category === 'Word') return '.docx'
    return '.json,.yaml,.yml,.xml,.txt'
  }, [category, tool])
  const formatChoices = useMemo(() => {
    if (category === '音视频') {
      if (tool.title === '视频提取音频') return ['MP3']
      if (tool.title === '音频格式转换') return ['MP3', 'WAV']
      if (tool.title === '视频格式转换') return ['MP4', 'MOV', 'MKV', 'AVI', 'WEBM']
      return ['MP4', 'GIF']
    }
    if (category === '图片') return tool.title === 'ICO 生成' ? ['ICO'] : tool.title === '图片压缩' ? ['JPG', 'WEBP', 'PNG'] : ['PNG', 'JPG', 'WEBP']
    if (category === 'PDF') return tool.title === 'PDF 转图片' ? ['PNG', 'JPG'] : ['PDF']
    if (category === 'Excel') return tool.title === 'CSV 转换' ? ['CSV', 'XLSX'] : ['JSON', 'XLSX']
    if (category === 'Word') return tool.title === 'DOCX 转 TXT' ? ['TXT'] : ['MD']
    return []
  }, [category, tool])

  const refreshHistory = async () => {
    if (window.desktop?.getHistory) {
      try {
        const entries = await window.desktop.getHistory()
        setHistory(entries)
        setHistoryPage(page => Math.min(page, Math.max(1, Math.ceil(entries.length / 10))))
      } catch (error) { message.error(`读取历史失败：${(error as Error).message}`) }
    }
  }
  const deleteHistoryEntry = async (entry: HistoryEntry) => {
    if (!window.desktop?.deleteHistory) return
    try {
      await window.desktop.deleteHistory(entry.id)
      const entries = await window.desktop.getHistory()
      setHistory(entries)
      setHistoryPage(page => Math.min(page, Math.max(1, Math.ceil(entries.length / 10))))
      message.success('已删除这条历史记录')
    } catch (error) { message.error(`删除历史失败：${(error as Error).message}`) }
  }
  useEffect(() => {
    void refreshHistory()
    if (!window.desktop?.onJobEvent) return
    const unsubscribers = [
      window.desktop.onJobEvent('jobs:queued', event => { setQueueCount(value => value + 1); setProgressText(`任务已排队${event.position ? ` · 队列位置 ${event.position}` : ''}`) }),
      window.desktop.onJobEvent('jobs:started', () => { setProgressPercent(0); setProgressText('正在准备任务') }),
      window.desktop.onJobEvent('jobs:progress', event => { setProgressPercent(event.percent || 0); setProgressText(event.message || '正在转换') }),
      window.desktop.onJobEvent('jobs:file', event => {
        if (event.path) setFiles(current => current.map(file => file.path === event.path ? { ...file, status: (event.status === 'partial' ? 'error' : event.status || 'ready') as LocalFile['status'], detail: event.detail || event.error } : file))
        if (event.status === 'error') { setErrorDetail(event.detail || event.error || '未知转换错误'); message.error(`${event.name || '任务'}转换失败`) }
      }),
      window.desktop.onJobEvent('jobs:done', event => {
        setQueueCount(value => Math.max(0, value - 1)); setProgressPercent(value => event.status === 'done' ? 100 : value)
        setProgressText(`任务结束 · ${((event.elapsedMs || 0) / 1000).toFixed(1)} 秒`)
        if (event.status === 'done') message.success('转换任务已完成')
        else message.warning(event.status === 'partial' ? '任务部分完成，请查看失败文件详情' : '任务失败，请查看错误详情')
        if (event.status === 'error' && event.detail) { setErrorDetail(event.detail); setErrorModal(true) }
        void refreshHistory()
      }),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [])

  const chooseTool = (nextCategory: Category, nextTool: Tool) => {
    setCategory(nextCategory); setTool(nextTool); setFiles([]); setResult(''); setInput(''); base64InputRef.current = null
    const choices = nextCategory === '开发工具' ? [] : nextCategory === '图片' ? (nextTool.title === 'ICO 生成' ? ['ICO'] : nextTool.title === '图片压缩' ? ['JPG', 'WEBP', 'PNG'] : ['PNG', 'JPG', 'WEBP']) : nextCategory === '音视频' ? (nextTool.title === '视频提取音频' ? ['MP3'] : nextTool.title === '音频格式转换' ? ['MP3', 'WAV'] : nextTool.title === 'GIF 转换' ? ['MP4', 'GIF'] : ['MP4', 'MOV', 'MKV', 'AVI', 'WEBM']) : nextCategory === 'PDF' ? (nextTool.title === 'PDF 转图片' ? ['PNG', 'JPG'] : ['PDF']) : nextCategory === 'Excel' ? (nextTool.title === 'CSV 转换' ? ['CSV', 'XLSX'] : ['JSON', 'XLSX']) : nextTool.title === 'DOCX 转 TXT' ? ['TXT'] : ['MD']
    if (choices.length) setOutputFormat(choices[0])
  }
  const addFiles = async (list: FileList | File[]) => {
    const all = Array.from(list)
    const accepted = all.filter(file => extensions.split(',').some(suffix => file.name.toLowerCase().endsWith(suffix)))
    if (all.length !== accepted.length) message.warning(`已跳过 ${all.length - accepted.length} 个不支持的文件`)
    const mapped = accepted.map(file => {
      let path = filePath(file)
      if (!path && window.desktop?.getPathForFile) { try { path = window.desktop.getPathForFile(file) } catch { path = undefined } }
      return { name: file.name, outputName: file.name.replace(/\.[^.]+$/, ''), size: file.size, type: file.type, file, path, status: 'ready' as const }
    })
    setFiles(current => [...current, ...mapped])
    if (category === 'Excel' && accepted.length) {
      const suffix = accepted[0].name.split('.').pop()?.toLowerCase()
      setOutputFormat(tool.title === 'CSV 转换' ? suffix === 'csv' ? 'XLSX' : 'CSV' : suffix === 'json' ? 'XLSX' : 'JSON')
    }
  }
  const browse = async () => {
    if (window.desktop?.selectFiles) {
      const selected = await window.desktop.selectFiles(extensions)
      if (selected.length) setFiles(current => [...current, ...selected.map(file => ({ ...file, outputName: file.name.replace(/\.[^.]+$/, ''), type: '', status: 'ready' as const }))])
    } else fileRef.current?.click()
  }
  const browseFolder = async () => {
    if (!window.desktop?.selectFolderFiles) { message.info('文件夹导入需要在 Electron 桌面模式中使用'); return }
    const selected = await window.desktop.selectFolderFiles(extensions)
    setFiles(current => [...current, ...selected.map(file => ({ ...file, outputName: file.name.replace(/\.[^.]+$/, ''), type: '', status: 'ready' as const }))])
    if (selected.length) message.success(`已添加 ${selected.length} 个文件`)
  }
  const outputFolder = async () => {
    if (!window.desktop?.selectDirectory) { message.info('目录选择需要在 Electron 桌面模式中使用'); return }
    const directory = await window.desktop.selectDirectory()
    if (directory) setOutputDir(directory)
  }
  const moveFile = (from: number, to: number) => setFiles(current => {
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current
    const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next
  })

  const doDeveloperAction = async (action: string) => {
    try {
      if (tool.title === 'JSON 工具') {
        const value = JSON.parse(input)
        setResult(action === '压缩' ? JSON.stringify(value) : action === '校验' ? '✓ JSON 格式有效' : JSON.stringify(value, null, 2)); return
      }
      if (tool.title === 'YAML 转换') {
        setResult(action === 'JSON → YAML' ? stringifyYaml(JSON.parse(input)) : JSON.stringify(parseYaml(input), null, 2)); return
      }
      if (tool.title === 'XML 转换') {
        if (action === 'XML → JSON') {
          const validation = XMLValidator.validate(input)
          if (validation !== true) throw new Error(validation.err.msg)
          setResult(JSON.stringify(decodeXmlArrays(xmlParser.parse(input)), null, 2))
        } else {
          const value: unknown = JSON.parse(input)
          const encoded = encodeXmlArrays(value)
          const hasSingleRoot = value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && !Object.keys(value)[0].startsWith('@_')
          setResult(xmlBuilder.build(hasSingleRoot ? encoded : { root: encoded }))
        }
        return
      }
      if (tool.title === 'URL 工具') { setResult(action === 'Encode' ? encodeURIComponent(input) : decodeURIComponent(input)); return }
      if (tool.title === 'Base64 工具') {
        const source = base64InputRef.current ?? input
        if (action === 'Encode') { setResult(btoa(unescape(encodeURIComponent(source)))); return }
        const decoded = decodeURIComponent(escape(atob(source.trim().replace(/^data:[^,]*,/, ''))))
        setResult(decoded); return
      }
      if (tool.title === 'Hash 工具') {
        if (!window.desktop?.hashText) throw new Error('Hash 工具需要在 Electron 桌面模式中使用')
        setResult(await window.desktop.hashText(action.toLowerCase(), input)); return
      }
    } catch (error) { setResult(`处理失败：${(error as Error).message}`) }
  }
  const selectBase64Image = async (file?: File) => {
    try {
      let bytes: number[]
      let mime: string
      if (file) {
        bytes = Array.from(new Uint8Array(await file.arrayBuffer())); mime = file.type || 'image/png'
      } else {
        if (!window.desktop?.selectFiles || !window.desktop?.readFile) throw new Error('请在 Electron 桌面模式中选择图片')
        const selected = await window.desktop.selectFiles('.png,.jpg,.jpeg,.webp,.gif,.bmp')
        if (!selected.length) return
        bytes = await window.desktop.readFile(selected[0].path)
        mime = `image/${selected[0].name.split('.').pop()?.toLowerCase() === 'jpg' ? 'jpeg' : selected[0].name.split('.').pop()?.toLowerCase()}`
      }
      let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.slice(index, index + 0x8000))
      setResult(`data:${mime};base64,${btoa(binary)}`)
    } catch (error) { message.error(`图片编码失败：${(error as Error).message}`) }
  }
  const saveBase64Image = async () => {
    try {
      const match = result.match(/^data:(image\/[\w.+-]+);base64,(.*)$/s)
      if (!match) throw new Error('结果不是图片 Data URL')
      const bytes = Array.from(atob(match[2]), char => char.charCodeAt(0))
      const extension = match[1].split('/')[1].replace('jpeg', 'jpg')
      if (window.desktop?.saveFile) await window.desktop.saveFile({ name: `base64-image.${extension}`, data: bytes, directory: outputDir === '与源文件相同' ? undefined : outputDir })
      else { const anchor = document.createElement('a'); anchor.href = result; anchor.download = `base64-image.${extension}`; anchor.click() }
      message.success('图片已保存')
    } catch (error) { message.error((error as Error).message) }
  }
  const decodeBase64Image = () => {
    try {
      const value = (base64InputRef.current ?? input).trim()
      const dataUrl = value.startsWith('data:image/') ? value : (() => {
        const encoded = value.replace(/\s/g, '').replace(/^data:[^,]*,/, '')
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
        const starts = (prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte)
        const mime = starts([0x89, 0x50, 0x4e, 0x47]) ? 'image/png' : starts([0xff, 0xd8, 0xff]) ? 'image/jpeg' : starts([0x47, 0x49, 0x46]) ? 'image/gif' : starts([0x42, 0x4d]) ? 'image/bmp' : starts([0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : ''
        if (!mime) throw new Error('无法识别图片格式，请粘贴 PNG/JPG/WEBP/GIF/BMP 图片 Base64')
        return `data:${mime};base64,${encoded}`
      })()
      setResult(dataUrl)
      base64InputRef.current = null
      setInput('')
    } catch (error) { setResult(`处理失败：${(error as Error).message}`) }
  }

  const operationForFile = (file: LocalFile) => {
    if (category === '音视频') {
      if (tool.title === '视频提取音频') return 'media.extract-audio'
      if (tool.title === '音频格式转换') return 'media.audio'
      if (tool.title === 'GIF 转换') return file.name.toLowerCase().endsWith('.gif') ? 'media.gif-to-video' : 'media.video-to-gif'
      return 'media.video'
    }
    if (category === '图片') return tool.title === '图片缩放' ? 'image.resize' : tool.title === '图片压缩' ? 'image.compress' : tool.title === 'ICO 生成' ? 'image.ico' : 'image.convert'
    if (category === 'PDF') return tool.title === 'PDF 转图片' ? 'pdf.pdf-to-images' : 'pdf.images-to-pdf'
    if (category === 'Excel') {
      const sourceExt = file.name.split('.').pop()?.toLowerCase()
      if (tool.title === 'CSV 转换') {
        if ((sourceExt === 'csv' && outputFormat === 'CSV') || (sourceExt === 'xlsx' && outputFormat === 'XLSX')) throw new Error(`文件 ${file.name} 的输入格式和输出格式相同`)
        return sourceExt === 'csv' ? 'excel.csv-to-xlsx' : 'excel.xlsx-to-csv'
      }
      if ((sourceExt === 'json' && outputFormat === 'JSON') || (sourceExt === 'xlsx' && outputFormat === 'XLSX')) throw new Error(`文件 ${file.name} 的输入格式和输出格式相同`)
      return sourceExt === 'json' ? 'excel.json-to-xlsx' : 'excel.xlsx-to-json'
    }
    if (category === 'Word') return tool.title === 'DOCX 转 TXT' ? 'word.docx-to-txt' : 'word.docx-to-md'
    throw new Error('当前工具不接受文件转换任务')
  }
  const optionsForTask = (targetBytesByPath?: Record<string, number>) => ({
    format: outputFormat, quality, fps, width: gifWidth, duration: gifDuration || undefined,
    outputNamesByPath: Object.fromEntries(files.filter(file => file.path && file.outputName?.trim()).map(file => [file.path!, file.outputName!.trim()])),
    dpi: tool.title === 'PDF 转图片' ? Math.round(72 + (quality / 100) * 228) : undefined,
    resize: { mode: resizeMode, percent: resizePercent, width: resizeWidth, height: resizeHeight },
    ...(targetBytesByPath ? { targetBytesByPath } : {}),
  })
  const submitTask = async () => {
    if (isDev) { void doDeveloperAction(tool.title === 'JSON 工具' ? '格式化' : 'Encode'); return }
    if (!files.length) { message.warning('请先添加要转换的文件'); return }
    if (!window.desktop?.enqueueTask) { message.error('转换任务需要在 Electron 桌面模式中运行'); return }
    if (files.some(file => !file.path)) { message.error('有文件缺少本地路径，请使用桌面文件选择器重新添加'); return }
    try {
      const operation = operationForFile(files[0])
      if (category === 'Excel' && new Set(files.map(file => file.name.split('.').pop()?.toLowerCase())).size > 1) { message.warning('同一批次请添加相同输入格式的文件'); return }
      if (category === '音视频' && tool.title === 'GIF 转换') {
        const expected = files[0].name.toLowerCase().endsWith('.gif') ? 'MP4' : 'GIF'
        if (outputFormat !== expected) { message.warning(`该输入文件需要选择 ${expected} 输出格式`); return }
      }
      if (category === 'PDF' && tool.title === '合并为 PDF' && files.length < 2) { message.warning('请至少选择两张图片'); return }
      if (category === '图片' && tool.title === '图片压缩' && files.some(file => {
        const targetKb = compressionTargets[file.path!]
        return targetKb === null || (targetKb ?? defaultTargetKb(file.size)) <= 0
      })) { message.warning('压缩目标体积必须大于 0 KB'); return }
      const targetBytesByPath = category === '图片' && tool.title === '图片压缩'
        ? Object.fromEntries(files.map(file => [file.path!, Math.max(1, Math.round((compressionTargets[file.path!] ?? defaultTargetKb(file.size)) * 1024))]))
        : undefined
      const request = await window.desktop.enqueueTask({ operation, files: files.map(({ path, name }) => ({ path: path!, name })), outputDir: outputDir === '与源文件相同' ? '' : outputDir, options: optionsForTask(targetBytesByPath) })
      setFiles(current => current.map(file => ({ ...file, status: 'queued' })))
      message.success(`任务已加入队列（位置 ${request.position}）`)
      setCompressionModal(false)
    } catch (error) { message.error(`无法创建任务：${(error as Error).message}`) }
  }
  const start = async () => {
    if (category === '图片' && tool.title === '图片压缩') {
      if (!files.length) { message.warning('请先添加要转换的文件'); return }
      if (!window.desktop?.enqueueTask) { message.error('转换任务需要在 Electron 桌面模式中运行'); return }
      if (files.some(file => !file.path)) { message.error('有文件缺少本地路径，请使用桌面文件选择器重新添加'); return }
      setCompressionTargets(current => Object.fromEntries(files.map(file => [file.path!, current[file.path!] === undefined ? defaultTargetKb(file.size) : current[file.path!]])))
      setCompressionModal(true)
      return
    }
    await submitTask()
  }

  const menuItems: MenuProps['items'] = [{ key: 'new', label: '新建任务' }, { key: 'history', label: '转换历史' }, { key: 'about', label: '关于 Format Studio' }]
  const runDev = (action: string) => <Button type="primary" onClick={() => void doDeveloperAction(action)}>{action}</Button>
  const qualityLabel = tool.title === '图片缩放' ? '缩放' : tool.title === 'PDF 转图片' ? '分辨率' : tool.title.includes('音频') || tool.title === '视频提取音频' ? '音质' : '质量'
  const showQuality = category === '图片' && tool.title !== '图片缩放' || category === '音视频' && tool.title !== 'GIF 转换' || tool.title === 'PDF 转图片'

  return <div className={`app-shell ${dark ? 'dark' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span>F</span></div><div><strong>Format Studio</strong><small>LOCAL CONVERTER</small></div></div>
      <div className="nav-label">工作空间</div>
      <nav>{nav.map(item => <button key={item.name} className={`nav-item ${category === item.name ? 'active' : ''}`} onClick={() => chooseTool(item.name, tools[item.name][0])}><span className="nav-icon">{item.icon}</span>{item.name}<span className="nav-chevron">›</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="local-card"><span className="secure-icon">✓</span><div><b>文件仅在本地处理</b><small>不会上传到任何服务器</small></div></div><div className="profile"><div className="avatar">F</div><div><b>本地工作区</b><small>个人版 · 离线可用</small></div><span className="dots">•••</span></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>工作空间</span><i>/</i><b>{category}</b></div><div className="top-actions"><div className="offline"><span />离线可用</div><Tooltip title="切换主题"><button className="icon-button" onClick={() => setDark(!dark)}>{dark ? '☼' : '◐'}</button></Tooltip><Dropdown menu={{ items: menuItems, onClick: ({ key }) => { if (key === 'new') { base64InputRef.current = null; setFiles([]); setInput(''); setResult('') } if (key === 'history') document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' }); if (key === 'about') setAboutModal(true) } }}><button className="icon-button">•••</button></Dropdown></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{category === '开发工具' ? 'UTILITIES' : 'CONVERSION WORKSPACE'} <span>·</span> 01</div><h1>{category}工具</h1><p>简单、快速地处理文件，所有操作都在你的设备上完成。</p></div><div className="heading-badge"><span className="sparkle">✳</span><span>私密且安全<small>本地运行 · 无需联网</small></span></div></div>
        <div className="tool-row"><div className="tool-tabs">{tools[category].map(item => <button key={item.title} className={`tool-tab ${tool.title === item.title ? 'selected' : ''}`} onClick={() => chooseTool(category, item)}>{item.title}</button>)}</div><div className="tool-count">{tools[category].length} 个工具</div></div>
        <section className="workspace-card"><div className="workspace-head"><div><div className="task-title"><span className="task-dot" />{tool.title}</div><p>{tool.desc}</p></div><button className="more-btn">•••</button></div>
          {isDev ? <div className="dev-workspace"><div className="editor-head"><span>输入内容</span><span className="editor-hint">{tool.title === 'Base64 工具' && base64InputRef.current ? '大型内容已暂存，不会完整显示在输入框中' : '在此粘贴或输入内容'}</span></div><Input.TextArea value={input} onChange={event => { base64InputRef.current = null; setInput(event.target.value) }} onPaste={event => { if (tool.title !== 'Base64 工具') return; const pasted = event.clipboardData.getData('text'); if (pasted.length < 16000) return; event.preventDefault(); base64InputRef.current = pasted; setInput(`已暂存大型 Base64 内容（约 ${(pasted.length * 0.75 / 1024 / 1024).toFixed(1)} MB），可点击“Base64 → 图片”解码`) }} placeholder={tool.title === 'JSON 工具' ? '{\n  "name": "Format Studio",\n  "local": true\n}' : '在此粘贴或输入内容…'} autoSize={{ minRows: 7, maxRows: 12 }} className="code-input"/><input ref={devImageRef} hidden type="file" accept="image/*" onChange={event => { if (event.target.files?.[0]) void selectBase64Image(event.target.files[0]); event.target.value = '' }}/><div className="editor-actions">{tool.title === 'JSON 工具' ? <>{runDev('格式化')}{runDev('压缩')}{runDev('校验')}</> : tool.title === 'URL 工具' ? <>{runDev('Encode')}{runDev('Decode')}</> : tool.title === 'Base64 工具' ? <>{runDev('Encode')}{runDev('Decode')}<Button onClick={() => window.desktop?.selectFiles ? void selectBase64Image() : devImageRef.current?.click()}>选择图片 → Base64</Button><Button onClick={decodeBase64Image}>Base64 → 图片</Button></> : tool.title === 'Hash 工具' ? <>{runDev('MD5')}{runDev('SHA1')}{runDev('SHA256')}</> : tool.title === 'YAML 转换' ? <>{runDev('JSON → YAML')}{runDev('YAML → JSON')}</> : <>{runDev('XML → JSON')}{runDev('JSON → XML')}</>}<Button onClick={() => { base64InputRef.current = null; setInput(''); setResult('') }}>清空</Button></div>{result && <div className={`result-box ${result.startsWith('处理失败') ? 'error' : ''}`}><div className="result-title">输出结果 <span><button onClick={() => { void navigator.clipboard.writeText(result); message.success('已复制') }}>复制</button>{result.startsWith('data:image/') && <button onClick={() => void saveBase64Image()}>保存图片</button>}</span></div>{result.startsWith('data:image/') ? <><img src={result} alt="Base64 解码图片" style={{ maxWidth: 240, maxHeight: 180, display: 'block', marginTop: 8 }}/><pre>{result.slice(0, 100)}…</pre></> : <pre>{tool.title === 'Base64 工具' && result.length > 8000 ? `${result.slice(0, 8000)}…\n\n（内容较长，已仅显示预览；复制按钮可复制完整结果）` : result}</pre>}</div>}</div> : <><div className={`dropzone ${files.length ? 'compact' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files) }} onClick={() => void browse()}><div className="upload-icon"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg></div><b>拖放文件到这里，或 <span>浏览文件</span></b><small>支持 {extensions.replaceAll('.', '').toUpperCase().replaceAll(',', ' · ')}，可一次选择多个文件</small><input ref={fileRef} hidden type="file" multiple accept={extensions} onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }}/></div>
            <div className="file-list-head"><span>待处理文件 <b>{files.length}</b></span><div className="head-actions"><button onClick={() => void browse()}>＋ 添加文件</button><button onClick={() => void browseFolder()}>＋ 添加文件夹</button><button onClick={() => setFiles([])} disabled={!files.length}>清空列表</button></div></div>
            {files.length ? <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.path || file.name}-${index}`} draggable onDragStart={() => { dragIndex.current = index }} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragIndex.current !== null) moveFile(dragIndex.current, index); dragIndex.current = null }} title={file.detail}><div className={`file-badge ${ext(file.name).toLowerCase()}`}>{ext(file.name).slice(0, 4)}</div><div className="file-meta"><b>{file.name}</b><small>{fmtSize(file.size)} <span>·</span> {ext(file.name)}</small></div><div className="file-output-name"><Input aria-label={`${file.name} 的输出文件名`} value={file.outputName ?? ''} onChange={event => setFiles(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, outputName: event.target.value } : item))} placeholder="输出文件名" addonAfter={`.${outputFormat.toLowerCase()}`} size="small" disabled={file.status !== 'ready'}/></div><div className={`file-status ${file.status}`}>{file.status === 'ready' ? '就绪' : file.status === 'queued' ? '排队中' : file.status === 'running' ? '处理中' : file.status === 'done' ? '已完成' : <button onClick={() => { setErrorDetail(file.detail || '未知错误'); setErrorModal(true) }}>查看错误</button>}</div><button className="remove-file" onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div> : <div className="empty-queue">文件将显示在这里 <span>⌄</span></div>}
            <div className="options-row">
              <div className="format-choice"><label>输出格式</label><Select value={outputFormat} onChange={setOutputFormat} options={formatChoices.map(value => ({ value, label: value }))} size="large"/></div>
              {category === '图片' && tool.title === '图片缩放' ? <div className="quality-control resize-control">
                <label>缩放方式</label><Select size="small" value={resizeMode} onChange={value => setResizeMode(value as typeof resizeMode)} options={[{ value: 'percent', label: '按比例' }, { value: 'width', label: '按宽度' }, { value: 'height', label: '按高度' }]}/>
                {resizeMode === 'percent' ? <><label>缩放比例 {resizePercent}%</label><input type="range" min={1} max={200} value={resizePercent} onChange={event => setResizePercent(Number(event.target.value))}/></> : <><label>目标{resizeMode === 'width' ? '宽度' : '高度'}（像素）</label><InputNumber size="small" min={1} addonAfter="px" value={resizeMode === 'width' ? resizeWidth : resizeHeight} onChange={value => resizeMode === 'width' ? setResizeWidth(Number(value || 1)) : setResizeHeight(Number(value || 1))}/><small className="option-hint">另一边按原图比例自动计算</small></>}
              </div> : category === '音视频' && tool.title === 'GIF 转换' ? <div className="quality-control"><label>帧率 {fps} fps</label><input type="range" min={1} max={30} value={fps} onChange={event => setFps(Number(event.target.value))}/></div> : showQuality && <div className="quality-control"><label>{`${qualityLabel} ${tool.title === 'PDF 转图片' ? Math.round(72 + quality * 2.28) : quality}${tool.title === 'PDF 转图片' ? ' dpi' : '%'}`}</label><input type="range" min={1} max={100} value={quality} onChange={event => setQuality(Number(event.target.value))}/></div>}
              {category === '音视频' && tool.title === 'GIF 转换' && <div className="format-choice gif-controls"><label>输出宽度与截取时长</label><InputNumber size="small" min={64} max={1920} addonAfter="px" placeholder="输出宽度" value={gifWidth} onChange={value => setGifWidth(Number(value || 640))}/><InputNumber size="small" min={0} max={999} addonAfter="秒" placeholder="时长（0 为完整）" value={gifDuration} onChange={value => setGifDuration(Number(value || 0))}/><small className="option-hint">时长设为 0 表示使用完整时长</small></div>}
              <div className="output-choice"><div className="output-choice-label"><label>输出位置</label><Tooltip title="使用源文件所在目录"><button className="output-reset" aria-label="使用源文件所在目录" onClick={() => setOutputDir('与源文件相同')}><RollbackOutlined/></button></Tooltip></div><Tooltip title={outputDir === '与源文件相同' ? '源文件所在目录' : outputDir}><button onClick={() => void outputFolder()}><span>▱</span>{outputDir === '与源文件相同' ? '源文件所在目录' : outputDir}<b>⌄</b></button></Tooltip></div>
            </div>
            <div className="convert-footer"><div className="queue-summary"><span className="summary-icon">▤</span><span><b>{queueCount ? `${queueCount} 个任务排队中` : `${files.length} 个文件`}</b><small>{progressText}{queueCount ? ` · ${progressPercent}%` : ''}</small></span></div><Button type="primary" className="convert-btn" onClick={() => void start()}>开始转换 <span>→</span></Button></div>
          </>}
        </section>
        <section className="history-section" id="history"><div className="section-heading"><div><h2>最近活动</h2><p>查看近期处理的文件与任务状态</p></div><button onClick={async () => { if (window.desktop?.clearHistory) { await window.desktop.clearHistory(); setHistory([]); setHistoryPage(1) } else { setHistory([]); setHistoryPage(1) } }}>清除历史　→</button></div><div className="history-table"><div className="history-head"><span>文件名称</span><span>文件保存路径</span><span>处理时间</span><span>输出格式</span><span>状态</span><span>操作</span></div>{history.length ? history.slice((historyPage - 1) * 10, historyPage * 10).map(entry => {
          const savePath = entry.savePath || (entry.outputs[0] ? entry.outputs[0].replace(/[\\/][^\\/]*$/, '') : entry.inputs[0]?.replace(/[\\/][^\\/]*$/, '')) || '—'
          return <div className="history-row" key={entry.id}><Tooltip title={entry.name}><span className="history-file"><i>▧</i>{entry.name}</span></Tooltip><Tooltip title={savePath}><span className="history-path">{savePath}</span></Tooltip><span>{new Date(entry.completedAt).toLocaleString()}</span><span>{entry.outputFormat || '—'} <small>· {(entry.elapsedMs / 1000).toFixed(1)} 秒</small></span><span className={entry.status === 'done' ? 'success-state' : 'error-state'}>{entry.status === 'done' ? '● 完成' : '● 失败'}</span><span className="history-actions">{entry.status === 'error' ? <Tooltip title="查看错误"><button aria-label="查看错误" onClick={() => { setErrorDetail(entry.detail || entry.error); setErrorModal(true) }}><FileSearchOutlined/></button></Tooltip> : <Tooltip title="打开文件所在文件夹"><button aria-label="打开文件所在文件夹" disabled={!entry.outputs[0]} onClick={() => entry.outputs[0] && window.desktop?.showItemInFolder(entry.outputs[0])}><FolderOpenOutlined/></button></Tooltip>}<Tooltip title="删除这条历史记录"><button className="history-delete" aria-label="删除这条历史记录" onClick={() => void deleteHistoryEntry(entry)}><DeleteOutlined/></button></Tooltip></span></div>
        }) : <div className="history-empty"><span className="history-empty-icon">◷</span><b>还没有转换记录</b><small>完成的任务会出现在这里，方便你快速查看。</small></div>}</div>{history.length > 10 && <Pagination className="history-pagination" current={historyPage} pageSize={10} total={history.length} showSizeChanger={false} onChange={page => setHistoryPage(page)}/>}</section>
        <footer className="app-footer"><span>FORMAT STUDIO <i>·</i> 版本 1.1</span><span>为本地工作而设计 <b>✳</b></span></footer>
      </div>
    </main>
    <Modal title="转换错误详情" open={errorModal} onCancel={() => setErrorModal(false)} footer={<Button onClick={() => setErrorModal(false)}>关闭</Button>}><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '50vh', overflow: 'auto' }}>{errorDetail}</pre></Modal>
    <Modal title="图片压缩目标" rootClassName="compression-modal" open={compressionModal} onCancel={() => setCompressionModal(false)} onOk={() => void submitTask()} okText="开始压缩" cancelText="返回" width={680}>
      <p className="compression-help">显示每张图片的当前体积，并分别设置压缩后的目标上限。JPEG / WEBP 会调整图像质量，PNG 会在保留透明效果的情况下缩小尺寸。</p>
      <div className="compression-target-list">
        <div className="compression-target-head"><span>文件</span><span>当前体积</span><span>目标体积（KB）</span></div>
        {files.map(file => {
          const key = file.path || file.name
          const targetKb = compressionTargets[key] === undefined ? defaultTargetKb(file.size) : compressionTargets[key]
          return <div className="compression-target-row" key={key}><Tooltip title={file.name}><span className="compression-target-name">{file.name}</span></Tooltip><span>{fmtSize(file.size)}</span><InputNumber min={0} step={0.1} precision={1} value={targetKb} onChange={value => setCompressionTargets(current => ({ ...current, [key]: value === null ? null : Number(value) }))} addonAfter="KB" size="small"/></div>
        })}
      </div>
    </Modal>
    <Modal title="关于 Format Studio" centered open={aboutModal} onCancel={() => setAboutModal(false)} footer={<Button onClick={() => setAboutModal(false)}>关闭</Button>}><div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}><span className="brand-mark">F</span><div><b>Format Conversion Studio</b><div style={{ color: '#929a93', fontSize: 12, marginTop: 4 }}>版本 1.1</div></div></div><p style={{ margin: '12px 0 8px', color: '#78827a' }}>本地文件格式转换工具。文件处理均在你的设备上完成。</p><div className="about-links"><p><a href="https://github.com/guzhendekabula/Format_Conversion_Studio" onClick={event => { event.preventDefault(); void window.desktop?.openExternal('https://github.com/guzhendekabula/Format_Conversion_Studio') }}>获取更多细节</a></p><p><a href="https://github.com/guzhendekabula/Format_Conversion_Studio/issues" onClick={event => { event.preventDefault(); void window.desktop?.openExternal('https://github.com/guzhendekabula/Format_Conversion_Studio/issues') }}>使用过程如有问题可于此反馈</a></p></div></Modal>
  </div>
}

export default App
