import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Button, Dropdown, Input, InputNumber, message, Modal, Pagination, Select, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import ImageEditor, { type ImageEditAction } from './ImageEditor'
import { DeleteOutlined, EyeOutlined, FileSearchOutlined, FolderOpenOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusCircleOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons'
import './App.css'

type Category = '音视频' | '图片' | 'PDF' | 'Excel' | 'Word' | '开发工具' | '系统工具'
type ClipSegment = { start: number | null; end: number | null }
type CaptureRegion = { x: number; y: number; width: number; height: number }
type CaptureRegionDrag = { mode: 'draw' | 'move' | 'resize'; start: { x: number; y: number }; original: CaptureRegion | null; handle?: 'nw' | 'ne' | 'sw' | 'se' }
type EditedImage = { data: number[]; extension: string; actions: ImageEditAction[]; exported?: boolean }
type LocalFile = { id: string; name: string; outputName?: string; segments?: ClipSegment[]; crop?: { x: number; y: number; width: number; height: number }; duration?: number; durationLoading?: boolean; durationError?: string; size: number; type: string; file?: File; path?: string; status: 'ready' | 'queued' | 'running' | 'done' | 'error'; detail?: string }
type Tool = { title: string; desc: string; from: string; to: string }
const tools: Record<Category, Tool[]> = {
  音视频: [{ title: '视频提取音频', desc: '从视频文件中提取音轨', from: 'MP4 / MOV / MKV / AVI', to: 'MP3' }, { title: '音频格式转换', desc: '转换常见音频格式与音质', from: 'MP3 / WAV / M4A / AAC / FLAC / OGG', to: 'WAV / MP3' }, { title: '音频裁剪', desc: '设置并拼接要保留的音频片段', from: 'MP3 / WAV / M4A / AAC / FLAC / OGG', to: '保持原格式' }, { title: '音频拼接', desc: '按顺序合并多个音频文件', from: 'MP3 / WAV / M4A / AAC / FLAC / OGG', to: 'MP3 / WAV' }, { title: '视频格式转换', desc: '在常用视频容器之间转换', from: 'MP4 / MOV / MKV / AVI / WEBM', to: 'MP4 / MOV / MKV / AVI / WEBM' }, { title: '视频裁剪', desc: '设置并拼接要保留的视频片段', from: 'MP4 / MOV / MKV / AVI / WEBM', to: '保持原格式' }, { title: '视频画面裁剪', desc: '拖动选择视频画面要保留的区域', from: 'MP4 / MOV / MKV / AVI / WEBM', to: 'MP4/H.264' }, { title: '视频拼接', desc: '兼容时无损拼接，其他情况统一编码', from: 'MP4 / MOV / MKV', to: 'MP4' }, { title: 'GIF 转换', desc: '视频与动图互转，设置帧率和尺寸', from: 'GIF / MP4', to: 'MP4 / GIF' }],
  图片: [{ title: '图片格式转换', desc: '转换图片格式，保持清晰度', from: 'PNG / JPG / WEBP / BMP / TIFF', to: 'JPG / PNG / WEBP' }, { title: '图片压缩', desc: '调整图片质量，批量减小体积', from: '图片文件', to: 'JPG / WEBP / PNG' }, { title: '图片缩放', desc: '按宽度、高度或比例调整尺寸', from: '图片文件', to: '调整尺寸' }, { title: '图片裁剪', desc: '拖动选区或输入坐标裁剪图片', from: 'PNG / JPG / WEBP / BMP / TIFF', to: 'PNG / JPG / WEBP' }, { title: '图片编辑', desc: '裁剪、旋转、添加文字、画笔和马赛克', from: 'PNG / JPG / WEBP / BMP', to: 'PNG / JPG / WEBP' }, { title: 'ICO 生成', desc: '为应用或网站制作图标文件', from: 'PNG / JPG', to: 'ICO' }],
  PDF: [{ title: 'PDF 转图片', desc: '将 PDF 每一页导出为图片', from: 'PDF', to: 'PNG / JPG' }, { title: '图片转 PDF', desc: '将一张或多张图片保存为 PDF', from: 'PNG / JPG', to: 'PDF' }, { title: '合并为 PDF', desc: '拖动排序，将多张图片合并成文档', from: '多张图片', to: 'PDF' }],
  Excel: [{ title: 'CSV 转换', desc: '在 Excel 与 CSV 之间转换', from: 'XLSX / CSV', to: 'CSV / XLSX' }, { title: 'JSON 转换', desc: '在 Excel 与 JSON 之间转换', from: 'XLSX / JSON', to: 'JSON / XLSX' }],
  Word: [{ title: 'DOCX 转 TXT', desc: '提取 Word 文档中的纯文本', from: 'DOCX', to: 'TXT' }, { title: 'DOCX 转 Markdown', desc: '保留标题、列表和表格结构', from: 'DOCX', to: 'MD' }],
  开发工具: [{ title: 'JSON 工具', desc: '格式化、压缩与校验 JSON', from: 'JSON', to: 'JSON' }, { title: 'YAML 转换', desc: 'JSON 与 YAML 互相转换', from: 'JSON / YAML', to: 'YAML / JSON' }, { title: 'XML 转换', desc: '在 XML 与 JSON 之间转换', from: 'XML / JSON', to: 'JSON / XML' }, { title: 'Base64 工具', desc: '文本编码解码，图片与 Base64 互转', from: '文本 / 图片', to: 'Base64 / 图片' }, { title: 'URL 工具', desc: 'URL Encode 与 Decode', from: 'URL', to: '编码 / 解码' }, { title: 'Hash 工具', desc: '生成 MD5、SHA-1、SHA-256 摘要', from: '文本', to: 'MD5 / SHA-1 / SHA-256' }],
  系统工具: [{ title: '屏幕截图', desc: '截取屏幕或窗口并保存、复制', from: '显示器 / 窗口', to: 'PNG / JPG' }, { title: '屏幕录制', desc: '录制屏幕并可选麦克风音频', from: '显示器 / 窗口', to: 'WEBM' }],
}
const nav: { name: Category; icon: string }[] = [{ name: '音视频', icon: '◉' }, { name: '图片', icon: '▧' }, { name: 'PDF', icon: '▤' }, { name: 'Excel', icon: '▦' }, { name: 'Word', icon: '▤' }, { name: '开发工具', icon: '</>' }, { name: '系统工具', icon: '▣' }]
const fmtSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
const defaultTargetKb = (size: number) => Math.max(0.1, Math.round(size * 0.7 / 102.4) / 10)
const captureTimestamp = () => { const d = new Date(); return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}_${String(d.getMinutes()).padStart(2, '0')}_${String(d.getSeconds()).padStart(2, '0')}` }
const defaultCaptureName = (toolTitle: string) => `${toolTitle === '屏幕截图' ? 'ScreenShot' : 'ScreenRecording'}_${captureTimestamp()}`
const safeCaptureName = (name: string, toolTitle: string) => name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '') || defaultCaptureName(toolTitle)
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
  const [concatQuality, setConcatQuality] = useState(23)
  const [concatFps, setConcatFps] = useState(0)
  const [concatBaseIndex, setConcatBaseIndex] = useState(0)
  const [concatAudioBitrate, setConcatAudioBitrate] = useState(192)
  const [concatSampleRate, setConcatSampleRate] = useState(44100)
  const [concatChannels, setConcatChannels] = useState('stereo')
  const [concatOutputName, setConcatOutputName] = useState('merged')
  const [concatNameCustomized, setConcatNameCustomized] = useState(false)
  const [cropModalIndex, setCropModalIndex] = useState<number | null>(null)
  const [cropPreviewUrl, setCropPreviewUrl] = useState('')
  const [cropSize, setCropSize] = useState<[number, number]>([0, 0])
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [cropFrameReady, setCropFrameReady] = useState(false)
  const [cropResultPreview, setCropResultPreview] = useState<{ index: number; url: string; crop: NonNullable<LocalFile['crop']>; video: boolean } | null>(null)
  const [cropResultPreviewSize, setCropResultPreviewSize] = useState<[number, number]>([0, 0])
  const cropResultVideoRef = useRef<HTMLVideoElement>(null)
  const cropResultVideoSeekRef = useRef<HTMLInputElement>(null)
  const cropResultVideoElapsedRef = useRef<HTMLSpanElement>(null)
  const cropResultVideoFrameRef = useRef<number | null>(null)
  const [cropResultVideoPlaying, setCropResultVideoPlaying] = useState(false)
  const [cropResultVideoDuration, setCropResultVideoDuration] = useState(0)
  const [cropResultVideoVolume, setCropResultVideoVolume] = useState(1)
  const [cropResultVideoMuted, setCropResultVideoMuted] = useState(false)
  const [cropAspect, setCropAspect] = useState<number | null>(null)
  const [imageEditorTarget, setImageEditorTarget] = useState<{ id: string; path: string; name: string } | null>(null)
  const [editedImages, setEditedImages] = useState<Record<string, EditedImage>>({})
  const cropImageRef = useRef<HTMLImageElement>(null)
  const cropVideoRef = useRef<HTMLVideoElement>(null)
  const cropStageRef = useRef<HTMLDivElement>(null)
  const [cropMediaFrame, setCropMediaFrame] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const cropDragRef = useRef<{ x: number; y: number; rect: typeof cropRect; mode: 'select' | 'move' | 'resize'; handle?: string } | null>(null)
  const [captureSources, setCaptureSources] = useState<{ id: string; name: string }[]>([])
  const [captureSupportsSystemAudio, setCaptureSupportsSystemAudio] = useState(false)
  const [captureSourceId, setCaptureSourceId] = useState('')
  const [captureFileName, setCaptureFileName] = useState('')
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null)
  const [captureAudio, setCaptureAudio] = useState<'none' | 'microphone' | 'system' | 'both'>('none')
  const [recording, setRecording] = useState(false)
  const [recordingPaused, setRecordingPaused] = useState(false)
  const [recordingCountdown, setRecordingCountdown] = useState<number | null>(null)
  const [recordingFormat, setRecordingFormat] = useState<'MP4' | 'WEBM'>('MP4')
  const [captureFps, setCaptureFps] = useState(30)
  const [captureResolution, setCaptureResolution] = useState<'original' | '1080p' | '720p'>('original')
  const captureVideoRef = useRef<HTMLVideoElement>(null)
  const capturePreviewRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const [captureRegion, setCaptureRegion] = useState<CaptureRegion | null>(null)
  const captureRegionStartRef = useRef<CaptureRegionDrag | null>(null)
  const recordingCountdownTimerRef = useRef<number | null>(null)
  const recordingCountdownResolveRef = useRef<(() => void) | null>(null)
  const recordingCountdownCancelledRef = useRef(false)
  const recordingCanvasFrameRef = useRef<number | null>(null)
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
  const [visualTrim, setVisualTrim] = useState<{ fileIndex: number; segmentIndex: number } | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewDuration, setPreviewDuration] = useState(0)
  const [previewPeaks, setPreviewPeaks] = useState<number[]>([])
  const [previewHasAudio, setPreviewHasAudio] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewRange, setPreviewRange] = useState<[number, number]>([0, 1])
  const [previewTime, setPreviewTime] = useState(0)
  const previewMediaRef = useRef<HTMLMediaElement>(null)
  const previewPlayheadRef = useRef<HTMLSpanElement>(null)
  const previewWaveformRef = useRef<HTMLDivElement>(null)
  const previewSeekingRef = useRef(false)
  const previewSeekRef = useRef<HTMLInputElement>(null)
  const previewElapsedRef = useRef<HTMLSpanElement>(null)
  const clipPreviewTrackRef = useRef<HTMLDivElement>(null)
  const clipPreviewFillRef = useRef<HTMLSpanElement>(null)
  const clipPreviewThumbRef = useRef<HTMLSpanElement>(null)
  const clipPreviewElapsedRef = useRef<HTMLSpanElement>(null)
  const clipPreviewingRef = useRef(false)
  const [clipPreviewActive, setClipPreviewActive] = useState(false)
  const previewPlayheadFrameRef = useRef<number | null>(null)
  const [trimResultPreviewIndex, setTrimResultPreviewIndex] = useState<number | null>(null)
  const [trimResultPreviewUrl, setTrimResultPreviewUrl] = useState('')
  const [trimResultPreviewLoading, setTrimResultPreviewLoading] = useState(false)
  const [trimResultPreviewError, setTrimResultPreviewError] = useState('')
  const [trimResultPreviewDuration, setTrimResultPreviewDuration] = useState(0)
  const [trimResultPreviewPlaying, setTrimResultPreviewPlaying] = useState(false)
  const trimResultMediaRef = useRef<HTMLMediaElement>(null)
  const trimResultSegmentsRef = useRef<ClipSegment[]>([])
  const trimResultSegmentIndexRef = useRef(0)
  const trimResultRequestIdRef = useRef(0)
  const trimResultElapsedRef = useRef<HTMLSpanElement>(null)
  const trimResultSeekRef = useRef<HTMLInputElement>(null)
  const trimResultFrameRef = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const devImageRef = useRef<HTMLInputElement>(null)
  const dragIndex = useRef<number | null>(null)
  const isDev = category === '开发工具'
  const isAudioTrim = category === '音视频' && tool.title === '音频裁剪'
  const isVideoTrim = category === '音视频' && tool.title === '视频裁剪'
  const isMediaTrim = isAudioTrim || isVideoTrim
  const isMediaConcat = category === '音视频' && (tool.title === '音频拼接' || tool.title === '视频拼接')
  useEffect(() => {
    if (!isMediaConcat || concatNameCustomized) return
    setConcatOutputName(files.map(file => file.name.replace(/\.[^.]+$/, '')).join('+'))
  }, [isMediaConcat, concatNameCustomized, files])
  const isVideoConcat = category === '音视频' && tool.title === '视频拼接'
  const isImageCrop = category === '图片' && tool.title === '图片裁剪'
  const isImageEdit = category === '图片' && tool.title === '图片编辑'
  const isVideoFrameCrop = category === '音视频' && tool.title === '视频画面裁剪'
  const isSystemTool = category === '系统工具'

  useEffect(() => {
    if (!visualTrim) return
    const file = files[visualTrim.fileIndex]
    const sourcePath = file?.path || (file?.file ? window.desktop?.getPathForFile(file.file) : '')
    if (!sourcePath || !window.desktop?.registerMediaPreview || !window.desktop?.analyzeMedia) {
      setPreviewError('可视化预览需要在桌面应用中打开本地文件。')
      return
    }
    let cancelled = false
    setPreviewLoading(true); setPreviewError(''); setPreviewUrl(''); setPreviewPeaks([])
    Promise.all([window.desktop.registerMediaPreview(sourcePath), window.desktop.analyzeMedia(sourcePath)]).then(([url, info]) => {
      if (cancelled) return
      setPreviewUrl(url); setPreviewDuration(info.duration); setPreviewPeaks(info.peaks); setPreviewHasAudio(info.hasAudio)
      const segment = file.segments?.[visualTrim.segmentIndex]
      setPreviewRange([Math.min(segment?.start ?? 0, info.duration), Math.min(segment?.end ?? Math.min(1, info.duration), info.duration)])
      setPreviewTime(0); setPreviewLoading(false)
    }).catch(error => { if (!cancelled) { setPreviewError((error as Error).message || '生成媒体预览失败'); setPreviewLoading(false) } })
    return () => { cancelled = true; previewMediaRef.current?.pause(); stopPreviewPlayhead() }
  }, [visualTrim])

  const updatePreviewRange = (handle: 0 | 1, value: number) => {
    setPreviewRange(current => handle === 0
      ? [Math.min(value, current[1]), current[1]]
      : [current[0], Math.max(value, current[0])])
  }

  const stopPreviewPlayhead = () => {
    if (previewPlayheadFrameRef.current !== null) cancelAnimationFrame(previewPlayheadFrameRef.current)
    previewPlayheadFrameRef.current = null
  }

  const syncPreviewPlayback = (media: HTMLMediaElement) => {
    const time = media.currentTime
    const duration = previewDuration || 1
    const percent = Math.min(1, Math.max(0, time / duration))
    const waveform = previewPlayheadRef.current?.parentElement
    if (previewPlayheadRef.current && waveform) {
      const x = Math.max(0, waveform.clientWidth - 20) * percent
      previewPlayheadRef.current.style.transform = `translate3d(${x}px,0,0)`
    }
    if (previewSeekRef.current) previewSeekRef.current.value = String(Math.min(time, previewDuration || time))
    if (previewElapsedRef.current) previewElapsedRef.current.textContent = `${time.toFixed(3)} 秒`
    if (clipPreviewingRef.current) {
      const clipTime = Math.max(0, Math.min(time - previewRange[0], previewRange[1] - previewRange[0]))
      const clipDuration = Math.max(0.001, previewRange[1] - previewRange[0])
      const clipPercent = Math.min(1, clipTime / clipDuration)
      if (clipPreviewFillRef.current) clipPreviewFillRef.current.style.transform = `scaleX(${clipPercent})`
      if (clipPreviewThumbRef.current && clipPreviewTrackRef.current) clipPreviewThumbRef.current.style.transform = `translateX(${clipPreviewTrackRef.current.clientWidth * clipPercent}px)`
      if (clipPreviewElapsedRef.current) clipPreviewElapsedRef.current.textContent = `${clipTime.toFixed(3)} 秒`
    }
  }

  const seekPreviewFromPointer = (clientX: number) => {
    const media = previewMediaRef.current
    const waveform = previewWaveformRef.current
    if (!media || !waveform || !previewDuration) return
    const bounds = waveform.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - bounds.left - 10) / Math.max(1, bounds.width - 20)))
    media.currentTime = fraction * previewDuration
    syncPreviewPlayback(media)
  }

  const finishPreviewSeek = () => {
    previewSeekingRef.current = false
    if (previewMediaRef.current) setPreviewTime(previewMediaRef.current.currentTime)
  }

  const closeVisualTrim = () => {
    previewMediaRef.current?.pause()
    stopPreviewPlayhead()
    setVisualTrim(null)
  }

  const toggleClipPreview = async () => {
    const media = previewMediaRef.current
    if (!media || previewRange[1] <= previewRange[0]) return
    if (clipPreviewActive && !media.paused) {
      clipPreviewingRef.current = false
      setClipPreviewActive(false)
      media.pause()
      return
    }
    try {
      clipPreviewingRef.current = true
      media.currentTime = previewRange[0]
      syncPreviewPlayback(media)
      await media.play()
      setClipPreviewActive(true)
    } catch (error) { clipPreviewingRef.current = false; setClipPreviewActive(false); message.error((error as Error).message || '片段试听失败') }
  }

  const syncTrimResultProgress = (media: HTMLMediaElement) => {
    const segments = trimResultSegmentsRef.current
    if (!segments.length) return
    const index = trimResultSegmentIndexRef.current
    const elapsedBefore = segments.slice(0, index).reduce((sum, segment) => sum + Number(segment.end) - Number(segment.start), 0)
    const current = segments[index]
    const elapsed = Math.min(trimResultPreviewDuration, elapsedBefore + Math.max(0, media.currentTime - Number(current.start)))
    if (trimResultElapsedRef.current) trimResultElapsedRef.current.textContent = `${elapsed.toFixed(3)} 秒`
    if (trimResultSeekRef.current) trimResultSeekRef.current.value = String(elapsed)
  }

  const seekTrimResultPreview = (elapsed: number) => {
    const media = trimResultMediaRef.current
    const segments = trimResultSegmentsRef.current
    if (!media || !segments.length) return
    let remaining = Math.max(0, Math.min(elapsed, trimResultPreviewDuration))
    let index = 0
    while (index < segments.length - 1 && remaining > Number(segments[index].end) - Number(segments[index].start)) {
      remaining -= Number(segments[index].end) - Number(segments[index].start)
      index += 1
    }
    trimResultSegmentIndexRef.current = index
    media.currentTime = Number(segments[index].start) + remaining
    if (trimResultElapsedRef.current) trimResultElapsedRef.current.textContent = `${Math.min(elapsed, trimResultPreviewDuration).toFixed(3)} 秒`
  }

  const openTrimResultPreview = async (file: LocalFile, fileIndex: number) => {
    const segments = (file.segments || []).map(segment => ({ start: Number(segment.start), end: Number(segment.end) })).sort((a, b) => a.start - b.start)
    if (!segments.length || segments.some(segment => !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start)) {
      message.warning('请先为所有片段填写有效的开始和结束时间')
      return
    }
    if (segments.some((segment, index) => index > 0 && segment.start < segments[index - 1].end)) {
      message.warning('保留片段不能重叠，请调整时间范围后预览')
      return
    }
    const sourcePath = file.path || (file.file ? window.desktop?.getPathForFile(file.file) : '')
    if (!sourcePath || !window.desktop?.createTrimPreview) {
      message.error('片段预览需要在桌面应用中打开本地文件')
      return
    }
    const requestId = ++trimResultRequestIdRef.current
    setTrimResultPreviewIndex(fileIndex)
    setTrimResultPreviewUrl('')
    setTrimResultPreviewError('')
    setTrimResultPreviewLoading(true)
    setTrimResultPreviewPlaying(false)
    try {
      const preview = await window.desktop.createTrimPreview(sourcePath, segments, isVideoTrim)
      if (requestId !== trimResultRequestIdRef.current) {
        await window.desktop.releaseMediaPreview(preview.url)
        return
      }
      trimResultSegmentsRef.current = [{ start: 0, end: preview.duration }]
      trimResultSegmentIndexRef.current = 0
      setTrimResultPreviewDuration(preview.duration)
      setTrimResultPreviewUrl(preview.url)
      setTrimResultPreviewLoading(false)
    } catch (error) {
      if (requestId !== trimResultRequestIdRef.current) return
      setTrimResultPreviewError((error as Error).message || '无法打开媒体预览')
      setTrimResultPreviewLoading(false)
    }
  }

  const closeTrimResultPreview = () => {
    trimResultRequestIdRef.current += 1
    trimResultMediaRef.current?.pause()
    if (trimResultFrameRef.current !== null) cancelAnimationFrame(trimResultFrameRef.current)
    trimResultFrameRef.current = null
    if (trimResultPreviewUrl && window.desktop?.releaseMediaPreview) void window.desktop.releaseMediaPreview(trimResultPreviewUrl)
    setTrimResultPreviewPlaying(false)
    setTrimResultPreviewIndex(null)
    setTrimResultPreviewUrl('')
  }

  const handleTrimResultTimeUpdate = (media: HTMLMediaElement) => {
    const segments = trimResultSegmentsRef.current
    if (!segments.length) return
    const index = trimResultSegmentIndexRef.current
    if (index >= segments.length) return
    const isLastSegment = index === segments.length - 1
    const reachedSegmentEnd = isLastSegment
      ? media.ended || media.currentTime >= Number(segments[index].end)
      : media.currentTime >= Number(segments[index].end) - 0.025
    if (reachedSegmentEnd) {
      if (index < segments.length - 1) {
        trimResultSegmentIndexRef.current = index + 1
        media.currentTime = Number(segments[index + 1].start)
      } else {
        // Keep the completed position visible, but mark playback as finished so
        // the next Play action can restart at the first retained segment.
        trimResultSegmentIndexRef.current = segments.length
        if (trimResultElapsedRef.current) trimResultElapsedRef.current.textContent = `${trimResultPreviewDuration.toFixed(3)} 秒`
        if (trimResultSeekRef.current) trimResultSeekRef.current.value = String(trimResultPreviewDuration)
        media.pause()
        return
      }
    }
    syncTrimResultProgress(media)
  }

  const animateTrimResultProgress = () => {
    if (trimResultFrameRef.current !== null) cancelAnimationFrame(trimResultFrameRef.current)
    const update = () => {
      const media = trimResultMediaRef.current
      if (!media || media.paused || media.ended) { trimResultFrameRef.current = null; return }
      handleTrimResultTimeUpdate(media)
      if (!media.paused) trimResultFrameRef.current = requestAnimationFrame(update)
    }
    trimResultFrameRef.current = requestAnimationFrame(update)
  }

  const toggleTrimResultPlayback = async () => {
    const media = trimResultMediaRef.current
    const segments = trimResultSegmentsRef.current
    if (!media || !segments.length) return
    if (!media.paused) { media.pause(); return }
    try {
      const index = trimResultSegmentIndexRef.current
      const current = segments[index]
      if (index >= segments.length || media.currentTime >= Number(current.end) || media.currentTime < Number(current.start)) {
        trimResultSegmentIndexRef.current = 0
        media.currentTime = Number(segments[0].start)
        if (trimResultElapsedRef.current) trimResultElapsedRef.current.textContent = '0.000 秒'
        if (trimResultSeekRef.current) trimResultSeekRef.current.value = '0'
      }
      await media.play()
    } catch (error) { message.error((error as Error).message || '预览播放失败') }
  }

  const animatePreviewPlayhead = () => {
    stopPreviewPlayhead()
    const update = () => {
      const media = previewMediaRef.current
      if (!media || media.paused || media.ended) {
        previewPlayheadFrameRef.current = null
        return
      }
      syncPreviewPlayback(media)
      previewPlayheadFrameRef.current = requestAnimationFrame(update)
    }
    previewPlayheadFrameRef.current = requestAnimationFrame(update)
  }

  const confirmPreviewRange = () => {
    if (!visualTrim) return
    const { fileIndex, segmentIndex } = visualTrim
    setFiles(current => current.map((file, index) => index === fileIndex ? {
      ...file,
      segments: (file.segments || []).map((segment, partIndex) => partIndex === segmentIndex
        ? { start: Number(previewRange[0].toFixed(3)), end: Number(previewRange[1].toFixed(3)) }
        : segment),
    } : file))
    closeVisualTrim()
  }

  const extensions = useMemo(() => {
    if (category === '系统工具') return ''
    if (category === '图片') return tool.title === 'ICO 生成' ? '.png,.jpg,.jpeg' : tool.title === '图片编辑' ? '.png,.jpg,.jpeg,.webp,.bmp' : '.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff'
    if (category === '音视频') {
      if (tool.title === '视频提取音频') return '.mp4,.mov,.mkv,.avi'
      if (tool.title === '音频格式转换') return '.mp3,.wav,.m4a,.aac,.flac,.ogg'
      if (tool.title === '音频裁剪') return '.mp3,.wav,.m4a,.aac,.flac,.ogg'
      if (tool.title === '音频拼接') return '.mp3,.wav,.m4a,.aac,.flac,.ogg'
      if (tool.title === '视频裁剪') return '.mp4,.mov,.mkv,.avi,.webm'
      if (tool.title === '视频拼接') return '.mp4,.mov,.mkv'
      if (tool.title === '视频画面裁剪') return '.mp4,.mov,.mkv,.avi,.webm'
      if (tool.title === 'GIF 转换') return '.gif,.mp4'
      return '.mp4,.mov,.mkv,.avi,.webm'
    }
    if (category === 'PDF') return tool.title === 'PDF 转图片' ? '.pdf' : '.png,.jpg,.jpeg,.webp'
    if (category === 'Excel') return tool.title === 'CSV 转换' ? '.xlsx,.csv' : '.xlsx,.json'
    if (category === 'Word') return '.docx'
    return '.json,.yaml,.yml,.xml,.txt'
  }, [category, tool])
  const formatChoices = useMemo(() => {
    if (category === '系统工具') return []
    if (category === '音视频') {
      if (tool.title === '视频提取音频') return ['MP3']
      if (tool.title === '音频格式转换') return ['MP3', 'WAV']
      if (tool.title === '音频拼接') return ['MP3', 'WAV']
      if (tool.title === '音频裁剪' || tool.title === '视频裁剪') return []
      if (tool.title === '视频拼接') return ['MP4']
      if (tool.title === '视频画面裁剪') return ['MP4']
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
  const openHistoryFolder = async (entry: HistoryEntry) => {
    if (!window.desktop?.showItemInFolder) return
    for (const filePath of [entry.outputs[0], entry.inputs[0]]) {
      if (!filePath) continue
      try {
        await window.desktop.showItemInFolder(filePath)
        return
      } catch { /* Older Windows history may contain a path damaged by console encoding. */ }
    }
    message.error('无法打开文件所在文件夹，请确认文件仍在原位置。')
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
    if (recording) stopRecording()
    cancelRecordingCountdown()
    captureStream?.getTracks().forEach(track => track.stop()); setCaptureStream(null)
    setCategory(nextCategory); setTool(nextTool); setFiles([]); setResult(''); setInput(''); base64InputRef.current = null
    if (nextCategory === '系统工具') setCaptureFileName(defaultCaptureName(nextTool.title))
    if (nextTool.title === '音频拼接' || nextTool.title === '视频拼接') { setConcatOutputName(''); setConcatNameCustomized(false) }
    const choices = nextCategory === '开发工具' || nextCategory === '系统工具' ? [] : nextCategory === '图片' ? (nextTool.title === 'ICO 生成' ? ['ICO'] : nextTool.title === '图片压缩' ? ['JPG', 'WEBP', 'PNG'] : ['PNG', 'JPG', 'WEBP']) : nextCategory === '音视频' ? (nextTool.title === '音频裁剪' || nextTool.title === '视频裁剪' ? [] : nextTool.title === '视频提取音频' ? ['MP3'] : nextTool.title === '音频格式转换' || nextTool.title === '音频拼接' ? ['MP3', 'WAV'] : nextTool.title === '视频拼接' || nextTool.title === '视频画面裁剪' ? ['MP4'] : nextTool.title === 'GIF 转换' ? ['MP4', 'GIF'] : ['MP4', 'MOV', 'MKV', 'AVI', 'WEBM']) : nextCategory === 'PDF' ? (nextTool.title === 'PDF 转图片' ? ['PNG', 'JPG'] : ['PDF']) : nextCategory === 'Excel' ? (nextTool.title === 'CSV 转换' ? ['CSV', 'XLSX'] : ['JSON', 'XLSX']) : nextTool.title === 'DOCX 转 TXT' ? ['TXT'] : ['MD']
    if (choices.length) setOutputFormat(choices[0])
  }
  const loadTrimDurations = async (addedFiles: LocalFile[]) => {
    if (!isMediaTrim || !window.desktop?.getMediaDuration) return
    const seen = new Set<string>()
    for (const file of addedFiles) {
      if (!file.path || seen.has(file.path)) continue
      seen.add(file.path)
      setFiles(current => current.map(item => item.path === file.path ? { ...item, durationLoading: true, durationError: undefined } : item))
      try {
        const duration = await window.desktop!.getMediaDuration(file.path)
        setFiles(current => current.map(item => item.path === file.path ? { ...item, duration, durationLoading: false, durationError: undefined } : item))
      } catch (error) {
        const durationError = (error as Error).message || '无法读取文件时长'
        setFiles(current => current.map(item => item.path === file.path ? { ...item, durationLoading: false, durationError } : item))
      }
    }
  }
  const openImageCrop = async (file: LocalFile, index: number) => {
    if (!file.path || !window.desktop?.registerMediaPreview) { message.error('裁剪需要在桌面应用中选择本地文件'); return }
    try {
      const url = await window.desktop.registerMediaPreview(file.path)
      setCropPreviewUrl(url); setCropModalIndex(index); setCropSize([0, 0]); setCropFrameReady(false); setCropMediaFrame({ left: 0, top: 0, width: 0, height: 0 }); setCropRect(file.crop || { x: 0, y: 0, width: 0, height: 0 }); setCropAspect(null)
    } catch (error) { message.error(`无法打开图片：${(error as Error).message}`) }
  }
  const openCropResultPreview = async (file: LocalFile, index: number) => {
    if (!file.crop) return
    if (!file.path || !window.desktop?.registerMediaPreview) { message.error('预览需要在桌面应用中选择本地文件'); return }
    try {
      const url = await window.desktop.registerMediaPreview(file.path)
      setCropResultPreview({ index, url, crop: file.crop, video: isVideoFrameCrop })
      setCropResultPreviewSize([0, 0])
      setCropResultVideoPlaying(false); setCropResultVideoDuration(0); setCropResultVideoVolume(1); setCropResultVideoMuted(false)
    } catch (error) { message.error(`无法打开预览：${(error as Error).message}`) }
  }
  const closeCropResultPreview = () => {
    cropResultVideoRef.current?.pause()
    if (cropResultVideoFrameRef.current !== null) cancelAnimationFrame(cropResultVideoFrameRef.current)
    cropResultVideoFrameRef.current = null
    if (cropResultPreview?.url) void window.desktop?.releaseMediaPreview?.(cropResultPreview.url)
    setCropResultPreview(null); setCropResultPreviewSize([0, 0]); setCropResultVideoPlaying(false)
  }
  const syncCropResultVideoProgress = () => {
    const video = cropResultVideoRef.current
    if (!video) return
    if (cropResultVideoElapsedRef.current) cropResultVideoElapsedRef.current.textContent = `${Math.floor(video.currentTime / 60)}:${String(Math.floor(video.currentTime % 60)).padStart(2, '0')}`
    if (cropResultVideoSeekRef.current) cropResultVideoSeekRef.current.value = String(video.currentTime)
  }
  const animateCropResultVideoProgress = () => {
    if (cropResultVideoFrameRef.current !== null) cancelAnimationFrame(cropResultVideoFrameRef.current)
    const update = () => {
      const video = cropResultVideoRef.current
      if (!video || video.paused || video.ended) { cropResultVideoFrameRef.current = null; return }
      syncCropResultVideoProgress()
      cropResultVideoFrameRef.current = requestAnimationFrame(update)
    }
    cropResultVideoFrameRef.current = requestAnimationFrame(update)
  }
  const openImageEditor = (file: LocalFile) => {
    if (!file.path) { message.error('图片编辑需要使用桌面应用的文件选择器添加本地图片'); return }
    setImageEditorTarget({ id: file.id, path: file.path, name: file.name })
  }
  const exportEditedImages = async () => {
    if (!window.desktop?.saveEditedImage) { message.error('图片导出需要在桌面应用中运行'); return }
    const pending = files.flatMap(file => file.path && editedImages[file.id] && !editedImages[file.id].exported ? [{ file, edited: editedImages[file.id] }] : [])
    if (!pending.length) { message.warning('请先逐张打开编辑器并点击“确定”'); return }
    let exported = 0
    for (const { file, edited } of pending) {
      const stem = file.name.replace(/\.[^.]+$/, '')
      try {
        await window.desktop.saveEditedImage({ name: `${stem}_edited.${edited.extension}`, data: edited.data, directory: outputDir === '与源文件相同' ? undefined : outputDir, sourcePath: file.path! })
        setEditedImages(current => ({ ...current, [file.id]: { ...current[file.id], exported: true } }))
        setFiles(current => current.map(item => item.id === file.id ? { ...item, status: 'done' } : item))
        exported += 1
        await refreshHistory()
        setHistoryPage(1)
      } catch (error) {
        message.error(`导出 ${file.name} 失败：${(error as Error).message}（已成功导出 ${exported} 张）`)
        return
      }
    }
    message.success(`已批量导出 ${exported} 张图片`)
  }
  const stopCapture = () => {
    cancelRecordingCountdown()
    if (recording) stopRecording()
    captureStream?.getTracks().forEach(track => track.stop())
    setCaptureStream(null)
  }
  const getCaptureContentFrame = () => {
    const video = captureVideoRef.current, wrapper = capturePreviewRef.current
    if (!video || !wrapper || !video.videoWidth || !video.videoHeight) return null
    const bounds = video.getBoundingClientRect(), outer = wrapper.getBoundingClientRect()
    const scale = Math.min(bounds.width / video.videoWidth, bounds.height / video.videoHeight)
    const width = video.videoWidth * scale, height = video.videoHeight * scale
    return { left: bounds.left + (bounds.width - width) / 2, top: bounds.top + (bounds.height - height) / 2, width, height, scale, offsetLeft: bounds.left + (bounds.width - width) / 2 - outer.left, offsetTop: bounds.top + (bounds.height - height) / 2 - outer.top }
  }
  const capturePoint = (clientX: number, clientY: number) => {
    const video = captureVideoRef.current, frame = getCaptureContentFrame()
    if (!video || !frame) return null
    return { x: Math.round(Math.max(0, Math.min(video.videoWidth, (clientX - frame.left) / frame.scale))), y: Math.round(Math.max(0, Math.min(video.videoHeight, (clientY - frame.top) / frame.scale))) }
  }
  const refreshCaptureSources = async () => {
    try {
      const result = await window.desktop?.getCaptureSources()
      if (!result) return
      setCaptureSources(result.sources)
      setCaptureSupportsSystemAudio(result.supportsSystemAudio)
      if (!captureSourceId && result.sources[0]) setCaptureSourceId(result.sources[0].id)
    } catch (error) {
      message.error(`读取屏幕列表失败：${(error as Error).message}。请检查屏幕录制权限。`)
    }
  }
  const captureRegionPixels = () => captureRegion
  const startCapture = async () => {
    if (!captureSourceId) { message.warning('请先选择屏幕或窗口'); return }
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: captureSourceId } } as MediaTrackConstraints })
      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()]
      const audioStreams: MediaStream[] = []
      if (captureAudio === 'microphone' || captureAudio === 'both') audioStreams.push(await navigator.mediaDevices.getUserMedia({ audio: true, video: false }))
      if ((captureAudio === 'system' || captureAudio === 'both') && captureSupportsSystemAudio) audioStreams.push(await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: captureSourceId } } as MediaTrackConstraints, video: false }))
      if (audioStreams.length === 1) tracks.push(...audioStreams[0].getAudioTracks())
      else if (audioStreams.length > 1) {
        const context = new AudioContext(), destination = context.createMediaStreamDestination()
        audioStreams.forEach(stream => context.createMediaStreamSource(stream).connect(destination))
        tracks.push(...destination.stream.getAudioTracks())
      }
      setCaptureStream(new MediaStream(tracks)); setCaptureRegion(null)
      message.success('屏幕预览已启动')
    } catch (error) {
      message.error(`无法启动屏幕捕获：${(error as Error).message || '请检查系统屏幕录制权限'}`)
    }
  }
  const takeScreenshot = async (copy = false) => {
    const video = captureVideoRef.current
    if (!video?.videoWidth || !video.videoHeight) { message.warning('请先启动屏幕预览'); return }
    const canvas = document.createElement('canvas')
    const crop = captureRegionPixels() || { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight }
    canvas.width = Math.max(1, Math.min(video.videoWidth - crop.x, crop.width)); canvas.height = Math.max(1, Math.min(video.videoHeight - crop.y, crop.height))
    canvas.getContext('2d')?.drawImage(video, crop.x, crop.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('截图编码失败')), outputFormat === 'JPG' ? 'image/jpeg' : 'image/png', 0.9))
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
    if (copy) { await window.desktop?.copyScreenshot(bytes); message.success('截图已复制到剪贴板'); return }
    const directory = outputDir !== '与源文件相同' ? outputDir : await window.desktop?.selectDirectory()
    if (!directory) return
    const name = `${safeCaptureName(captureFileName, tool.title)}.${outputFormat.toLowerCase()}`
    await window.desktop?.saveFile({ name, data: bytes, directory })
    const separator = directory.includes('\\') ? '\\' : '/'
    await window.desktop?.recordCaptureOutput({ name, path: `${directory.replace(/[\\/]+$/, '')}${separator}${name}`, operation: 'screenshot' })
    await refreshHistory()
    message.success('截图已保存')
  }
  const cancelRecordingCountdown = () => {
    recordingCountdownCancelledRef.current = true
    if (recordingCountdownTimerRef.current !== null) window.clearTimeout(recordingCountdownTimerRef.current)
    recordingCountdownTimerRef.current = null
    recordingCountdownResolveRef.current?.()
    recordingCountdownResolveRef.current = null
    setRecordingCountdown(null)
  }
  const waitForCountdownSecond = () => new Promise<void>(resolve => {
    recordingCountdownResolveRef.current = resolve
    recordingCountdownTimerRef.current = window.setTimeout(() => {
      recordingCountdownTimerRef.current = null
      recordingCountdownResolveRef.current = null
      resolve()
    }, 1000)
  })
  const startRecording = async () => {
    if (!captureStream) { message.warning('请先启动屏幕预览'); return }
    const preferred = recordingFormat === 'MP4' ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    const mimeType = preferred.find(type => MediaRecorder.isTypeSupported(type))
    if (!mimeType && recordingFormat === 'WEBM') { message.error('此设备不支持 WEBM 录制格式'); return }
    const actualMime = mimeType || 'video/webm;codecs=vp9,opus'
    const recordingName = safeCaptureName(captureFileName, tool.title)
    recordingCountdownCancelledRef.current = false
    for (let count = 3; count > 0; count -= 1) {
      setRecordingCountdown(count)
      await waitForCountdownSecond()
      if (recordingCountdownCancelledRef.current) return
    }
    setRecordingCountdown(null)
    if (!captureStream || !captureVideoRef.current?.videoWidth) { message.warning('屏幕预览已停止，请重新启动后录制'); return }
    try {
      let recordingStream = captureStream
      const sourceVideo = captureVideoRef.current, crop = captureRegionPixels()
      if (sourceVideo) {
        const source = crop || { x: 0, y: 0, width: sourceVideo.videoWidth, height: sourceVideo.videoHeight }
        const scale = captureResolution === 'original' ? 1 : Math.min(1, Number(captureResolution.replace('p', '')) / source.height)
        const width = Math.max(2, Math.round(source.width * scale) & ~1), height = Math.max(2, Math.round(source.height * scale) & ~1)
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        const paint = () => { if (context && sourceVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) context.drawImage(sourceVideo, source.x, source.y, source.width, source.height, 0, 0, width, height); recordingCanvasFrameRef.current = requestAnimationFrame(paint) }
        paint()
        recordingStream = new MediaStream([...canvas.captureStream(captureFps).getVideoTracks(), ...captureStream.getAudioTracks()])
      }
      const recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined)
      recordingChunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size) recordingChunksRef.current.push(event.data) }
      recorder.onerror = event => message.error(`录制失败：${(event as ErrorEvent).message || '媒体录制器错误'}`)
      recorder.onstop = () => { void (async () => {
        const blob = new Blob(recordingChunksRef.current, { type: actualMime })
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
        if (!bytes.length) { message.error('录制文件为空'); return }
        const directory = outputDir !== '与源文件相同' ? outputDir : await window.desktop?.selectDirectory()
        if (!directory) { message.warning('已停止录制；选择保存位置已取消，录制数据未保存'); return }
        try {
          const name = recordingName
          const saved = await window.desktop?.saveRecording({ bytes, mime: blob.type, name, directory, format: recordingFormat })
          if (saved) { const outputName = saved.split(/[\\/]/).pop() || name; await window.desktop?.recordCaptureOutput({ name: outputName, path: saved, operation: 'recording' }); await refreshHistory() }
          message.success(`录制已保存：${saved}`)
        }
        catch (error) { message.error(`保存录制失败：${(error as Error).message}`) }
      })() }
      recorder.start(500); recorderRef.current = recorder; setRecording(true); setRecordingPaused(false)
    } catch (error) { message.error(`无法开始录制：${(error as Error).message}`) }
  }
  const toggleRecordingPause = () => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') { recorder.pause(); setRecordingPaused(true) }
    else if (recorder.state === 'paused') { recorder.resume(); setRecordingPaused(false) }
  }
  const stopRecording = () => { cancelRecordingCountdown(); if (recordingCanvasFrameRef.current !== null) cancelAnimationFrame(recordingCanvasFrameRef.current); recordingCanvasFrameRef.current = null; recorderRef.current?.stop(); recorderRef.current = null; setRecording(false) }
  useEffect(() => {
    if (cropModalIndex === null) return
    const firstFrame = requestAnimationFrame(() => requestAnimationFrame(syncCropMediaFrame))
    const stage = cropStageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(firstFrame)
    const observer = new ResizeObserver(syncCropMediaFrame)
    observer.observe(stage)
    const media = cropVideoRef.current || cropImageRef.current
    if (media) observer.observe(media)
    return () => { cancelAnimationFrame(firstFrame); observer.disconnect() }
  }, [cropModalIndex, cropSize, cropPreviewUrl])
  useEffect(() => { if (captureVideoRef.current) captureVideoRef.current.srcObject = captureStream }, [captureStream])
  const closeImageCrop = () => {
    if (cropPreviewUrl) void window.desktop?.releaseMediaPreview?.(cropPreviewUrl)
    setCropPreviewUrl(''); setCropModalIndex(null); setCropFrameReady(false)
  }
  const getCropContentFrame = () => {
    const media = cropVideoRef.current || cropImageRef.current
    const stage = cropStageRef.current
    if (!media || !stage) return null
    const bounds = media.getBoundingClientRect()
    const naturalWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
    const naturalHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
    if (!naturalWidth || !naturalHeight || !bounds.width || !bounds.height) return null
    // Both <img> and <video> may occupy a larger layout box than the actual
    // object-fit: contain content. Map pointer and overlay to that inner frame.
    const scale = Math.min(bounds.width / naturalWidth, bounds.height / naturalHeight)
    const width = naturalWidth * scale
    const height = naturalHeight * scale
    const left = bounds.left + (bounds.width - width) / 2
    const top = bounds.top + (bounds.height - height) / 2
    const stageBounds = stage.getBoundingClientRect()
    return { left, top, width, height, naturalWidth, naturalHeight, stageLeft: left - stageBounds.left, stageTop: top - stageBounds.top }
  }
  const updateCropFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const frame = getCropContentFrame()
    if (!frame || !cropDragRef.current) return
    const { naturalWidth, naturalHeight } = frame
    const currentX = Math.max(0, Math.min(naturalWidth, (event.clientX - frame.left) * naturalWidth / frame.width))
    const currentY = Math.max(0, Math.min(naturalHeight, (event.clientY - frame.top) * naturalHeight / frame.height))
    const startX = cropDragRef.current.x, startY = cropDragRef.current.y
    const initial = cropDragRef.current.rect
    if (cropDragRef.current.mode === 'move') {
      const x = Math.max(0, Math.min(naturalWidth - initial.width, initial.x + currentX - startX))
      const y = Math.max(0, Math.min(naturalHeight - initial.height, initial.y + currentY - startY))
      setCropRect({ ...initial, x: Math.round(x), y: Math.round(y) })
      return
    }
    if (cropDragRef.current.mode === 'resize') {
      const handle = cropDragRef.current.handle || 'se'
      const right = handle.includes('e'), bottom = handle.includes('s')
      const anchorX = right ? initial.x : initial.x + initial.width
      const anchorY = bottom ? initial.y : initial.y + initial.height
      const maxWidth = right ? naturalWidth - anchorX : anchorX
      const maxHeight = bottom ? naturalHeight - anchorY : anchorY
      let width = Math.max(1, Math.abs(currentX - anchorX))
      let height = Math.max(1, Math.abs(currentY - anchorY))
      if (cropAspect) {
        width = Math.min(Math.max(width, height * cropAspect), maxWidth, maxHeight * cropAspect)
        height = width / cropAspect
      } else {
        width = Math.min(width, maxWidth)
        height = Math.min(height, maxHeight)
      }
      const x = right ? anchorX : anchorX - width
      const y = bottom ? anchorY : anchorY - height
      setCropRect({ x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) })
      return
    }
    let width = Math.abs(currentX - startX), height = Math.abs(currentY - startY)
    if (cropAspect) { if (width / Math.max(height, 1) > cropAspect) height = width / cropAspect; else width = height * cropAspect }
    const x = Math.min(startX, currentX), y = Math.min(startY, currentY)
    setCropRect({ x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(Math.min(width, naturalWidth - x))), height: Math.max(1, Math.round(Math.min(height, naturalHeight - y))) })
  }
  const syncCropMediaFrame = () => {
    const frame = getCropContentFrame()
    if (!frame) return
    const next = { left: frame.stageLeft, top: frame.stageTop, width: frame.width, height: frame.height }
    setCropMediaFrame(previous => Math.abs(previous.left - next.left) < 0.5 && Math.abs(previous.top - next.top) < 0.5 && Math.abs(previous.width - next.width) < 0.5 && Math.abs(previous.height - next.height) < 0.5 ? previous : next)
  }
  const beginCropSelection = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const frame = getCropContentFrame()
    if (!frame) return
    const { naturalWidth, naturalHeight } = frame
    if (event.clientX < frame.left || event.clientX > frame.left + frame.width || event.clientY < frame.top || event.clientY > frame.top + frame.height) return
    const x = Math.max(0, Math.min(naturalWidth, (event.clientX - frame.left) * naturalWidth / frame.width))
    const y = Math.max(0, Math.min(naturalHeight, (event.clientY - frame.top) * naturalHeight / frame.height))
    cropDragRef.current = { x, y, rect: cropRect, mode: 'select' }
    cropStageRef.current?.setPointerCapture(event.pointerId)
    setCropRect({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 })
  }
  const beginCropMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !cropRect.width || !cropRect.height) return
    const frame = getCropContentFrame()
    if (!frame) return
    event.preventDefault()
    event.stopPropagation()
    const x = (event.clientX - frame.left) * frame.naturalWidth / frame.width
    const y = (event.clientY - frame.top) * frame.naturalHeight / frame.height
    cropDragRef.current = { x, y, rect: cropRect, mode: 'move' }
    cropStageRef.current?.setPointerCapture(event.pointerId)
  }
  const beginCropResize = (event: PointerEvent<HTMLSpanElement>, handle: string) => {
    if (event.button !== 0) return
    const frame = getCropContentFrame()
    if (!frame) return
    event.preventDefault()
    event.stopPropagation()
    const x = (event.clientX - frame.left) * frame.naturalWidth / frame.width
    const y = (event.clientY - frame.top) * frame.naturalHeight / frame.height
    cropDragRef.current = { x, y, rect: cropRect, mode: 'resize', handle }
    cropStageRef.current?.setPointerCapture(event.pointerId)
  }
  const changeCropAspect = (aspect: number | null) => {
    setCropAspect(aspect)
    if (!aspect || !cropSize[0] || !cropSize[1]) return
    setCropRect(current => {
      const width = Math.max(1, current.width || cropSize[0])
      const height = Math.max(1, current.height || cropSize[1])
      // Preset ratios fill as much of the source image as possible.
      const nextWidth = Math.min(cropSize[0], cropSize[1] * aspect)
      const nextHeight = nextWidth / aspect
      const centerX = current.x + width / 2
      const centerY = current.y + height / 2
      const x = Math.max(0, Math.min(cropSize[0] - nextWidth, centerX - nextWidth / 2))
      const y = Math.max(0, Math.min(cropSize[1] - nextHeight, centerY - nextHeight / 2))
      return { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(nextWidth)), height: Math.max(1, Math.round(nextHeight)) }
    })
  }
  const addFiles = async (list: FileList | File[]) => {
    const all = Array.from(list)
    const accepted = all.filter(file => extensions.split(',').some(suffix => file.name.toLowerCase().endsWith(suffix)))
    if (all.length !== accepted.length) message.warning(`已跳过 ${all.length - accepted.length} 个不支持的文件`)
    const mapped = accepted.map(file => {
      let path = filePath(file)
      if (!path && window.desktop?.getPathForFile) { try { path = window.desktop.getPathForFile(file) } catch { path = undefined } }
      return { id: crypto.randomUUID(), name: file.name, outputName: `${file.name.replace(/\.[^.]+$/, '')}${isMediaTrim ? '_trim' : (isImageCrop || isVideoFrameCrop) ? '_crop' : ''}`, segments: isMediaTrim ? [{ start: 0, end: 1 }] : undefined, size: file.size, type: file.type, file, path, status: 'ready' as const }
    })
    setFiles(current => [...current, ...mapped])
    void loadTrimDurations(mapped)
    if (category === 'Excel' && accepted.length) {
      const suffix = accepted[0].name.split('.').pop()?.toLowerCase()
      setOutputFormat(tool.title === 'CSV 转换' ? suffix === 'csv' ? 'XLSX' : 'CSV' : suffix === 'json' ? 'XLSX' : 'JSON')
    }
    if (isImageCrop && accepted.length && !files.length) {
      const suffix = accepted[0].name.split('.').pop()?.toLowerCase()
      setOutputFormat(['bmp', 'tif', 'tiff'].includes(suffix || '') ? 'PNG' : suffix === 'jpeg' ? 'JPG' : (suffix || 'png').toUpperCase())
    }
  }
  const applyCropDefaultFormat = (fileName: string) => {
    if (!isImageCrop) return
    const suffix = fileName.split('.').pop()?.toLowerCase()
    setOutputFormat(['bmp', 'tif', 'tiff'].includes(suffix || '') ? 'PNG' : suffix === 'jpeg' ? 'JPG' : (suffix || 'png').toUpperCase())
  }
  const browse = async () => {
    if (window.desktop?.selectFiles) {
      const selected = await window.desktop.selectFiles(extensions)
      if (selected.length) {
        const mapped = selected.map(file => ({ ...file, id: crypto.randomUUID(), outputName: `${file.name.replace(/\.[^.]+$/, '')}${isMediaTrim ? '_trim' : (isImageCrop || isVideoFrameCrop) ? '_crop' : ''}`, segments: isMediaTrim ? [{ start: 0, end: 1 }] : undefined, type: '', status: 'ready' as const }))
        setFiles(current => [...current, ...mapped])
        void loadTrimDurations(mapped)
        if (!files.length && selected[0]) applyCropDefaultFormat(selected[0].name)
      }
    } else fileRef.current?.click()
  }
  const browseFolder = async () => {
    if (!window.desktop?.selectFolderFiles) { message.info('文件夹导入需要在 Electron 桌面模式中使用'); return }
    const selected = await window.desktop.selectFolderFiles(extensions)
    const mapped = selected.map(file => ({ ...file, id: crypto.randomUUID(), outputName: `${file.name.replace(/\.[^.]+$/, '')}${isMediaTrim ? '_trim' : (isImageCrop || isVideoFrameCrop) ? '_crop' : ''}`, segments: isMediaTrim ? [{ start: 0, end: 1 }] : undefined, type: '', status: 'ready' as const }))
    setFiles(current => [...current, ...mapped])
    void loadTrimDurations(mapped)
    if (!files.length && selected[0]) applyCropDefaultFormat(selected[0].name)
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
      if (tool.title === '音频裁剪') return 'media.audio-trim'
      if (tool.title === '视频裁剪') return 'media.video-trim'
      if (tool.title === '音频拼接') return 'media.audio-concat'
      if (tool.title === '视频拼接') return 'media.video-concat'
      if (tool.title === '视频画面裁剪') return 'media.video-crop'
      return 'media.video'
    }
    if (category === '图片') return tool.title === '图片裁剪' ? 'image.crop' : tool.title === '图片缩放' ? 'image.resize' : tool.title === '图片压缩' ? 'image.compress' : tool.title === 'ICO 生成' ? 'image.ico' : 'image.convert'
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
    ...(isMediaConcat ? { outputName: concatOutputName, concatQuality, concatFps, videoSizeBaseIndex: concatBaseIndex, bitrate: concatAudioBitrate, sampleRate: concatSampleRate, channels: concatChannels } : {}),
    ...(isImageCrop || isVideoFrameCrop ? { cropByPath: Object.fromEntries(files.filter(file => file.path && file.crop).map(file => [file.path!, file.crop])) } : {}),
    outputNamesByPath: Object.fromEntries(files.filter(file => file.path && file.outputName?.trim()).map(file => [file.path!, file.outputName!.trim()])),
    ...(isMediaTrim ? { trimSegmentsByPath: Object.fromEntries(files.filter(file => file.path).map(file => [file.path!, (file.segments || []).map(segment => ({ start: segment.start, end: segment.end }))])) } : {}),
    dpi: tool.title === 'PDF 转图片' ? Math.round(72 + (quality / 100) * 228) : undefined,
    resize: { mode: resizeMode, percent: resizePercent, width: resizeWidth, height: resizeHeight },
    ...(targetBytesByPath ? { targetBytesByPath } : {}),
  })
  const trimSegmentError = (file: LocalFile, segmentIndex: number) => {
    const segment = file.segments?.[segmentIndex]
    if (!segment) return ''
    if (segment.start === null || segment.end === null) return segment.start === null && segment.end === null ? '' : '请填写开始和结束时间'
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0) return '时间必须是有效的非负数'
    if (segment.end <= segment.start) return '结束时间必须大于开始时间'
    if (file.duration !== undefined && segment.end > file.duration) return `结束时间超过文件时长（${file.duration.toFixed(3)} 秒）`
    const overlaps = (file.segments || []).some((other, index) => index !== segmentIndex && other.start !== null && other.end !== null && segment.start! < other.end && segment.end! > other.start)
    return overlaps ? '保留片段不能重叠' : ''
  }
  const submitTask = async () => {
    if (isDev) { void doDeveloperAction(tool.title === 'JSON 工具' ? '格式化' : 'Encode'); return }
    if (!files.length) { message.warning('请先添加要转换的文件'); return }
    if ((isImageCrop || isVideoFrameCrop) && files.some(file => !file.crop)) { message.warning(`请先为每个文件${isVideoFrameCrop ? '设置画面裁剪区域' : '设置裁剪区域'}`); return }
    if (!window.desktop?.enqueueTask) { message.error('转换任务需要在 Electron 桌面模式中运行'); return }
    if (files.some(file => !file.path)) { message.error('有文件缺少本地路径，请使用桌面文件选择器重新添加'); return }
    try {
      const operation = operationForFile(files[0])
      if (isMediaConcat && files.length < 2) { message.warning('请至少选择两个文件进行拼接'); return }
      if (category === 'Excel' && new Set(files.map(file => file.name.split('.').pop()?.toLowerCase())).size > 1) { message.warning('同一批次请添加相同输入格式的文件'); return }
      if (category === '音视频' && tool.title === 'GIF 转换') {
        const expected = files[0].name.toLowerCase().endsWith('.gif') ? 'MP4' : 'GIF'
        if (outputFormat !== expected) { message.warning(`该输入文件需要选择 ${expected} 输出格式`); return }
      }
      if (isMediaTrim) {
        for (const file of files) {
          if (file.durationLoading) { message.warning(`正在读取「${file.name}」的文件时长，请稍后再转换`); return }
          if (file.durationError || file.duration === undefined) { message.warning(`无法读取「${file.name}」的文件时长，暂时不能裁剪`); return }
          const segments = file.segments || []
          if (!segments.length) { message.warning(`请为「${file.name}」至少添加一个保留片段`); return }
          if (segments.some(segment => segment.start === null || segment.end === null || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start)) {
            message.warning(`「${file.name}」的片段时间无效，请检查开始和结束秒数`); return
          }
          if (segments.some(segment => Number(segment.end) > file.duration!)) { message.warning(`「${file.name}」的片段结束时间超过文件时长（${file.duration.toFixed(3)} 秒）`); return }
          const sorted = [...segments].sort((a, b) => Number(a.start) - Number(b.start))
          if (sorted.some((segment, index) => index > 0 && Number(segment.start) < Number(sorted[index - 1].end))) {
            message.warning(`「${file.name}」的保留片段不能重叠`); return
          }
        }
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
    if (isImageEdit) {
      if (!files.length) { message.warning('请先添加要编辑的图片'); return }
      await exportEditedImages()
      return
    }
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
  const showQuality = !isMediaTrim && (category === '图片' && tool.title !== '图片缩放' && !isImageEdit || category === '音视频' && tool.title !== 'GIF 转换' || tool.title === 'PDF 转图片')

  const cropResultScale = cropResultPreview ? Math.min(800 / cropResultPreview.crop.width, 560 / cropResultPreview.crop.height, 2) : 1
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
        <section className={`workspace-card${isMediaConcat ? ' media-concat-workspace' : ''}`}><div className="workspace-head"><div><div className="task-title"><span className="task-dot" />{tool.title}</div><p>{tool.desc}</p></div><button className="more-btn">•••</button></div>
          {isSystemTool ? <div className="capture-workspace">
            <div className="capture-controls">
              <div className="capture-control-group">
                <div className="capture-control-label"><span>捕获来源</span><Tooltip title="重新读取可用的屏幕和窗口"><Button type="text" aria-label="刷新来源" icon={<ReloadOutlined />} onClick={() => void refreshCaptureSources()}/></Tooltip></div>
                <Select value={captureSourceId || undefined} onChange={value => { stopCapture(); setCaptureSourceId(value) }} options={captureSources.map(source => ({ value: source.id, label: source.name }))} placeholder="选择显示器或窗口"/>
              </div>
              {tool.title === '屏幕截图' ? <>
                <div className="capture-control-group"><div className="capture-control-label">图片格式</div><Select value={outputFormat === 'JPG' ? 'JPG' : 'PNG'} onChange={setOutputFormat} options={['PNG','JPG'].map(value => ({ value, label: value }))}/></div>
                <div className="capture-control-group capture-name-group"><div className="capture-control-label">文件名称</div><Tooltip title={`${captureFileName}.${outputFormat.toLowerCase()}`}><Input value={captureFileName} onChange={event => setCaptureFileName(event.target.value)} placeholder="ScreenShot_年_月_日_时_分_秒" addonAfter={`.${outputFormat.toLowerCase()}`}/></Tooltip></div>
              </> : <>
                <div className="capture-control-group"><div className="capture-control-label">录制音频</div><Select value={captureAudio} onChange={setCaptureAudio} options={[{value:'none',label:'不录制音频'},{value:'microphone',label:'麦克风'},...(captureSupportsSystemAudio ? [{value:'system',label:'系统声音'},{value:'both',label:'系统声音 + 麦克风'}] : [])]}/></div>
                <div className="capture-control-group"><div className="capture-control-label">输出格式</div><Select value={recordingFormat} onChange={setRecordingFormat} options={[{value:'MP4',label:'MP4'},{value:'WEBM',label:'WEBM'}]}/></div>
                <div className="capture-control-group capture-name-group"><div className="capture-control-label">文件名称</div><Tooltip title={`${captureFileName}.${recordingFormat.toLowerCase()}`}><Input value={captureFileName} onChange={event => setCaptureFileName(event.target.value)} placeholder="ScreenRecording_年_月_日_时_分_秒" addonAfter={`.${recordingFormat.toLowerCase()}`}/></Tooltip></div>
                <div className="capture-control-group"><div className="capture-control-label">帧率</div><Select value={captureFps} onChange={setCaptureFps} options={[24,30,60].map(value => ({value,label:`${value} fps`}))}/></div>
                <div className="capture-control-group"><div className="capture-control-label">分辨率</div><Select value={captureResolution} onChange={setCaptureResolution} options={[{value:'original',label:'原始'},{value:'1080p',label:'最高 1080p'},{value:'720p',label:'最高 720p'}]}/></div>
              </>}
            </div>
            {captureStream ? <div className="capture-preview-wrap" ref={capturePreviewRef}
              onPointerDown={event => {
                const frame = getCaptureContentFrame()
                if (!frame || event.clientX < frame.left || event.clientX > frame.left + frame.width || event.clientY < frame.top || event.clientY > frame.top + frame.height) return
                const point = capturePoint(event.clientX, event.clientY)
                if (!point) return
                const region = captureRegion
                const handleElement = (event.target as HTMLElement).closest('[data-capture-handle]') as HTMLElement | null
                const handle = handleElement?.dataset.captureHandle as CaptureRegionDrag['handle']
                const inside = Boolean(region && point.x >= region.x && point.x <= region.x + region.width && point.y >= region.y && point.y <= region.y + region.height)
                const drag: CaptureRegionDrag = handle && region ? { mode: 'resize', start: point, original: region, handle } : inside && region ? { mode: 'move', start: point, original: region } : { mode: 'draw', start: point, original: null }
                captureRegionStartRef.current = drag
                if (drag.mode === 'draw') setCaptureRegion({ ...point, width: 1, height: 1 })
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={event => {
                const drag = captureRegionStartRef.current, point = capturePoint(event.clientX, event.clientY)
                if (!drag || !point) return
                if (drag.mode === 'draw') {
                  setCaptureRegion({ x: Math.min(drag.start.x, point.x), y: Math.min(drag.start.y, point.y), width: Math.abs(point.x - drag.start.x), height: Math.abs(point.y - drag.start.y) })
                  return
                }
                const original = drag.original
                if (!original) return
                if (drag.mode === 'move') {
                  const video = captureVideoRef.current
                  if (!video) return
                  const x = Math.max(0, Math.min(video.videoWidth - original.width, original.x + point.x - drag.start.x))
                  const y = Math.max(0, Math.min(video.videoHeight - original.height, original.y + point.y - drag.start.y))
                  setCaptureRegion({ ...original, x, y })
                  return
                }
                const video = captureVideoRef.current
                if (!video || !drag.handle) return
                let left = original.x, top = original.y, right = original.x + original.width, bottom = original.y + original.height
                if (drag.handle.includes('w')) left = Math.max(0, Math.min(right - 1, original.x + point.x - drag.start.x))
                if (drag.handle.includes('e')) right = Math.min(video.videoWidth, Math.max(left + 1, original.x + original.width + point.x - drag.start.x))
                if (drag.handle.includes('n')) top = Math.max(0, Math.min(bottom - 1, original.y + point.y - drag.start.y))
                if (drag.handle.includes('s')) bottom = Math.min(video.videoHeight, Math.max(top + 1, original.y + original.height + point.y - drag.start.y))
                setCaptureRegion({ x: left, y: top, width: right - left, height: bottom - top })
              }}
              onPointerUp={() => { captureRegionStartRef.current = null }} onPointerCancel={() => { captureRegionStartRef.current = null }}>
              <video ref={captureVideoRef} autoPlay muted playsInline/>
              {captureRegion && (() => { const frame = getCaptureContentFrame(); return frame ? <div className="capture-region" style={{ left: frame.offsetLeft + captureRegion.x * frame.scale, top: frame.offsetTop + captureRegion.y * frame.scale, width: captureRegion.width * frame.scale, height: captureRegion.height * frame.scale }}><i data-capture-handle="nw"/><i data-capture-handle="ne"/><i data-capture-handle="sw"/><i data-capture-handle="se"/></div> : null })()}
              {recordingCountdown !== null && <div className="capture-countdown" aria-live="assertive">{recordingCountdown}</div>}
            </div> : <div className="capture-empty">选择显示器或窗口并启动预览。首次使用时，系统可能会请求屏幕录制权限。</div>}
            <div className="capture-actions"><Button onClick={() => captureStream ? stopCapture() : void startCapture()}>{captureStream ? '停止预览' : '启动预览'}</Button><Button disabled={!captureRegion} onClick={() => { setCaptureRegion(null); captureRegionStartRef.current = null }}>清除选区</Button>{tool.title === '屏幕截图' ? <><Button type="primary" disabled={!captureStream} onClick={() => void takeScreenshot(false)}>保存截图</Button><Button disabled={!captureStream} onClick={() => void takeScreenshot(true)}>复制到剪贴板</Button></> : recording ? <><Button onClick={toggleRecordingPause}>{recordingPaused ? '继续录制' : '暂停录制'}</Button><Button type="primary" danger onClick={stopRecording}>停止录制</Button></> : recordingCountdown !== null ? <Button danger onClick={cancelRecordingCountdown}>取消倒计时</Button> : <Button type="primary" disabled={!captureStream} onClick={() => void startRecording()}>开始录制</Button>}<Button onClick={() => void window.desktop?.openCaptureSettings()}>系统权限设置</Button></div>
            <div className="capture-hint"><b>操作说明</b><ol><li>选择要捕获的屏幕或窗口，点击「启动预览」。</li><li>在预览画面中按住鼠标左键并拖动空白位置，可新建选区；拖动绿色框内部可移动选区，拖动四角控制点可调整大小。</li><li>点击「保存截图」或「开始录制」使用该范围；录制会先显示 3、2、1 倒计时。文件名称可编辑，扩展名由所选格式自动添加。</li><li>点击「清除选区」即可恢复捕获整个屏幕或窗口；点击「停止预览」会结束当前捕获预览。</li></ol><span>选区只在当前选择的屏幕或窗口范围内生效；没有绿色选区时，将使用完整来源画面。</span></div>
          </div> : isDev ? <div className="dev-workspace"><div className="editor-head"><span>输入内容</span><span className="editor-hint">{tool.title === 'Base64 工具' && base64InputRef.current ? '大型内容已暂存，不会完整显示在输入框中' : '在此粘贴或输入内容'}</span></div><Input.TextArea value={input} onChange={event => { base64InputRef.current = null; setInput(event.target.value) }} onPaste={event => { if (tool.title !== 'Base64 工具') return; const pasted = event.clipboardData.getData('text'); if (pasted.length < 16000) return; event.preventDefault(); base64InputRef.current = pasted; setInput(`已暂存大型 Base64 内容（约 ${(pasted.length * 0.75 / 1024 / 1024).toFixed(1)} MB），可点击“Base64 → 图片”解码`) }} placeholder={tool.title === 'JSON 工具' ? '{\n  "name": "Format Studio",\n  "local": true\n}' : '在此粘贴或输入内容…'} autoSize={{ minRows: 7, maxRows: 12 }} className="code-input"/><input ref={devImageRef} hidden type="file" accept="image/*" onChange={event => { if (event.target.files?.[0]) void selectBase64Image(event.target.files[0]); event.target.value = '' }}/><div className="editor-actions">{tool.title === 'JSON 工具' ? <>{runDev('格式化')}{runDev('压缩')}{runDev('校验')}</> : tool.title === 'URL 工具' ? <>{runDev('Encode')}{runDev('Decode')}</> : tool.title === 'Base64 工具' ? <>{runDev('Encode')}{runDev('Decode')}<Button onClick={() => window.desktop?.selectFiles ? void selectBase64Image() : devImageRef.current?.click()}>选择图片 → Base64</Button><Button onClick={decodeBase64Image}>Base64 → 图片</Button></> : tool.title === 'Hash 工具' ? <>{runDev('MD5')}{runDev('SHA1')}{runDev('SHA256')}</> : tool.title === 'YAML 转换' ? <>{runDev('JSON → YAML')}{runDev('YAML → JSON')}</> : <>{runDev('XML → JSON')}{runDev('JSON → XML')}</>}<Button onClick={() => { base64InputRef.current = null; setInput(''); setResult('') }}>清空</Button></div>{result && <div className={`result-box ${result.startsWith('处理失败') ? 'error' : ''}`}><div className="result-title">输出结果 <span><button onClick={() => { void navigator.clipboard.writeText(result); message.success('已复制') }}>复制</button>{result.startsWith('data:image/') && <button onClick={() => void saveBase64Image()}>保存图片</button>}</span></div>{result.startsWith('data:image/') ? <><img src={result} alt="Base64 解码图片" style={{ maxWidth: 240, maxHeight: 180, display: 'block', marginTop: 8 }}/><pre>{result.slice(0, 100)}…</pre></> : <pre>{tool.title === 'Base64 工具' && result.length > 8000 ? `${result.slice(0, 8000)}…\n\n（内容较长，已仅显示预览；复制按钮可复制完整结果）` : result}</pre>}</div>}</div> : <><div className={`dropzone ${files.length ? 'compact' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files) }} onClick={() => void browse()}><div className="upload-icon"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg></div><b>拖放文件到这里，或 <span>浏览文件</span></b><small>支持 {extensions.replaceAll('.', '').toUpperCase().replaceAll(',', ' · ')}，可一次选择多个文件</small><input ref={fileRef} hidden type="file" multiple accept={extensions} onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }}/></div>
            <div className="file-list-head"><span>待处理文件 <b>{files.length}</b></span><div className="head-actions"><button onClick={() => void browse()}>＋ 添加文件</button><button onClick={() => void browseFolder()}>＋ 添加文件夹</button><button onClick={() => setFiles([])} disabled={!files.length}>清空列表</button></div></div>
            {files.length ? <div className={`file-list ${isMediaTrim ? 'trim-file-list' : ''}`}>{files.map((file, index) => <div className="file-item" key={file.id}><div className="file-row" draggable onDragStart={() => { dragIndex.current = index }} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragIndex.current !== null) moveFile(dragIndex.current, index); dragIndex.current = null }} title={file.detail}><div className={`file-badge ${ext(file.name).toLowerCase()}`}>{ext(file.name).slice(0, 4)}</div><div className="file-meta"><b>{file.name}</b><small>{fmtSize(file.size)} <span>·</span> {ext(file.name)}</small></div>{!isImageEdit && <div className="file-output-name"><Tooltip title={file.outputName ?? ''}><Input aria-label={`${file.name} 的输出文件名`} value={file.outputName ?? ''} onChange={event => setFiles(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, outputName: event.target.value } : item))} placeholder="输出文件名" addonAfter={`.${isMediaTrim ? ext(file.name).toLowerCase() : isVideoFrameCrop ? 'mp4' : outputFormat.toLowerCase()}`} size="small" disabled={file.status !== 'ready'}/></Tooltip></div>}<div className={`file-status ${file.status}`}>{file.status === 'ready' ? '就绪' : file.status === 'queued' ? '排队中' : file.status === 'running' ? '处理中' : file.status === 'done' ? '已完成' : <button onClick={() => { setErrorDetail(file.detail || '未知错误'); setErrorModal(true) }}>查看错误</button>}</div><button className="remove-file" onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>{(isImageCrop || isVideoFrameCrop) && <div className="image-crop-row crop-selection-row"><Button size="small" type="primary" ghost onClick={() => void openImageCrop(file, index)}>{isVideoFrameCrop ? "设置画面裁剪" : "设置裁剪区域"}</Button><span>{file.crop ? `X ${file.crop.x} · Y ${file.crop.y} · ${file.crop.width} × ${file.crop.height} px` : '尚未设置裁剪区域'}</span><Tooltip title="预览裁剪结果"><Button size="small" disabled={!file.crop} icon={<EyeOutlined/>} onClick={() => void openCropResultPreview(file, index)}>预览</Button></Tooltip></div>}{isImageEdit && <div className="image-crop-row"><Button size="small" type="primary" ghost onClick={() => openImageEditor(file)}>{editedImages[file.id] ? editedImages[file.id].exported ? '重新编辑' : '继续编辑' : '打开编辑器'}</Button><span>{editedImages[file.id] ? editedImages[file.id].exported ? '已导出' : '编辑已确认，可批量导出' : '支持撤销和重做'}</span></div>}{isMediaTrim && <div className="trim-segments"><div className="trim-segments-title">保留片段 <small>按时间先后拼接 · 单位：秒</small><small className="trim-duration-hint">{file.durationLoading ? "正在读取文件时长…" : file.duration !== undefined ? `文件时长 ${file.duration.toFixed(3)} 秒` : file.durationError ? "无法读取文件时长" : ""}</small></div>{(file.segments || []).map((segment, segmentIndex) => { const segmentError = trimSegmentError(file, segmentIndex); return <div className={`trim-segment-row${segmentError ? " has-error" : ""}`} key={segmentIndex}><div className="trim-time-range"><InputNumber aria-label="片段开始秒数" min={0} max={file.duration} status={segmentError ? "error" : undefined} step={0.1} precision={3} placeholder="开始" addonAfter="秒" value={segment.start} onChange={value => setFiles(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, segments: (item.segments || []).map((part, partIndex) => partIndex === segmentIndex ? { ...part, start: value } : part) } : item))}/><span>至</span><InputNumber aria-label="片段结束秒数" min={0} max={file.duration} status={segmentError ? "error" : undefined} step={0.1} precision={3} placeholder="结束" addonAfter="秒" value={segment.end} onChange={value => setFiles(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, segments: (item.segments || []).map((part, partIndex) => partIndex === segmentIndex ? { ...part, end: value } : part) } : item))}/></div><Button size="small" className="trim-visual-button" onClick={() => setVisualTrim({ fileIndex: index, segmentIndex })}>可视化选择</Button>{segmentIndex === (file.segments || []).length - 1 ? <Tooltip title="预览裁剪后的效果"><Button type="text" aria-label="预览裁剪后的效果" className="trim-segment-preview-icon" icon={<PlayCircleOutlined/>} onClick={() => void openTrimResultPreview(file, index)}/></Tooltip> : <span className="trim-segment-preview-placeholder" aria-hidden="true"/>}{(file.segments || []).length > 1 && <Tooltip title="删除片段"><button className="trim-segment-remove" aria-label="删除片段" onClick={() => setFiles(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, segments: (item.segments || []).filter((_, partIndex) => partIndex !== segmentIndex) } : item))}>×</button></Tooltip>}{segmentError && <small className="trim-segment-error">{segmentError}</small>}</div> })}<Tooltip title="添加保留片段"><button className="trim-segment-add" aria-label="添加保留片段" onClick={() => setFiles(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, segments: [...(item.segments || []), { start: null, end: null }] } : item))}><PlusCircleOutlined/></button></Tooltip></div>}</div>)}</div> : <div className="empty-queue">文件将显示在这里 <span>⌄</span></div>}
            <div className="options-row">
              {!isMediaTrim && !isVideoFrameCrop && <div className="format-choice"><label>输出格式</label><Select value={outputFormat} onChange={setOutputFormat} options={formatChoices.map(value => ({ value, label: value }))} size="large"/></div>}
              {isMediaConcat ? <div className="concat-controls">
                <label className="concat-name-control">输出文件名<Tooltip title={`${concatOutputName}.${isVideoConcat ? 'mp4' : outputFormat.toLowerCase()}`}><Input size="small" value={concatOutputName} onChange={event => { setConcatNameCustomized(true); setConcatOutputName(event.target.value) }} addonAfter={`.${isVideoConcat ? 'mp4' : outputFormat.toLowerCase()}`}/></Tooltip></label>
                {isVideoConcat ? <><label>画面尺寸基准<Select size="small" value={concatBaseIndex} onChange={setConcatBaseIndex} options={files.map((file, index) => ({ value: index, label: file.name }))}/></label><label>输出帧率<Select size="small" value={concatFps} onChange={setConcatFps} options={[{ value: 0, label: '跟随基准视频' }, { value: 24, label: '24 FPS' }, { value: 30, label: '30 FPS' }, { value: 60, label: '60 FPS' }]}/></label><label>编码质量<Select size="small" value={concatQuality} onChange={setConcatQuality} options={[{ value: 18, label: '高质量' }, { value: 23, label: '标准质量' }, { value: 28, label: '压缩优先' }]}/></label><small className="option-hint">编码参数兼容且尺寸、帧率匹配时直接复制码流；否则统一编码为 MP4/H.264 + AAC。</small></> : <>{outputFormat !== 'WAV' && <label>码率<Select size="small" value={concatAudioBitrate} onChange={setConcatAudioBitrate} options={[128, 192, 320].map(value => ({ value, label: `${value} kbps` }))}/></label>}<label>采样率<Select size="small" value={concatSampleRate} onChange={setConcatSampleRate} options={[44100, 48000].map(value => ({ value, label: `${value} Hz` }))}/></label><label>声道<Select size="small" value={concatChannels} onChange={setConcatChannels} options={[{ value: 'mono', label: '单声道' }, { value: 'stereo', label: '立体声' }]}/></label></>}
              </div> : category === '图片' && tool.title === '图片缩放' ? <div className="quality-control resize-control">
                <label>缩放方式</label><Select size="small" value={resizeMode} onChange={value => setResizeMode(value as typeof resizeMode)} options={[{ value: 'percent', label: '按比例' }, { value: 'width', label: '按宽度' }, { value: 'height', label: '按高度' }]}/>
                {resizeMode === 'percent' ? <><label>缩放比例 {resizePercent}%</label><input type="range" min={1} max={200} value={resizePercent} onChange={event => setResizePercent(Number(event.target.value))}/></> : <><label>目标{resizeMode === 'width' ? '宽度' : '高度'}（像素）</label><InputNumber size="small" min={1} addonAfter="px" value={resizeMode === 'width' ? resizeWidth : resizeHeight} onChange={value => resizeMode === 'width' ? setResizeWidth(Number(value || 1)) : setResizeHeight(Number(value || 1))}/><small className="option-hint">另一边按原图比例自动计算</small></>}
              </div> : category === '音视频' && tool.title === 'GIF 转换' ? <div className="quality-control"><label>帧率 {fps} fps</label><input type="range" min={1} max={30} value={fps} onChange={event => setFps(Number(event.target.value))}/></div> : showQuality && !isMediaConcat && <div className="quality-control"><label>{`${qualityLabel} ${tool.title === 'PDF 转图片' ? Math.round(72 + quality * 2.28) : quality}${tool.title === 'PDF 转图片' ? ' dpi' : '%'}`}</label><input type="range" min={1} max={100} value={quality} onChange={event => setQuality(Number(event.target.value))}/></div>}
              {category === '音视频' && tool.title === 'GIF 转换' && <div className="format-choice gif-controls"><label>输出宽度与截取时长</label><InputNumber size="small" min={64} max={1920} addonAfter="px" placeholder="输出宽度" value={gifWidth} onChange={value => setGifWidth(Number(value || 640))}/><InputNumber size="small" min={0} max={999} addonAfter="秒" placeholder="时长（0 为完整）" value={gifDuration} onChange={value => setGifDuration(Number(value || 0))}/><small className="option-hint">时长设为 0 表示使用完整时长</small></div>}
              <div className="output-choice"><div className="output-choice-label"><label>输出位置</label><Tooltip title="使用源文件所在目录"><button className="output-reset" aria-label="使用源文件所在目录" onClick={() => setOutputDir('与源文件相同')}><RollbackOutlined/></button></Tooltip></div><Tooltip title={outputDir === '与源文件相同' ? '源文件所在目录' : outputDir}><button onClick={() => void outputFolder()}><span>▱</span>{outputDir === '与源文件相同' ? '源文件所在目录' : outputDir}<b>⌄</b></button></Tooltip></div>
            </div>
            <div className="convert-footer"><div className="queue-summary"><span className="summary-icon">▤</span><span><b>{queueCount ? `${queueCount} 个任务排队中` : `${files.length} 个文件`}</b><small>{progressText}{queueCount ? ` · ${progressPercent}%` : ''}</small></span></div><Button type="primary" className="convert-btn" onClick={() => void start()}>{isImageEdit ? '导出图片' : '开始转换'} <span>→</span></Button></div>
          </>}
        </section>
        <section className="history-section" id="history"><div className="section-heading"><div><h2>最近活动</h2><p>查看近期处理的文件与任务状态</p></div><button onClick={async () => { if (window.desktop?.clearHistory) { await window.desktop.clearHistory(); setHistory([]); setHistoryPage(1) } else { setHistory([]); setHistoryPage(1) } }}>清除历史　→</button></div><div className="history-table"><div className="history-head"><span>文件名称</span><span>文件保存路径</span><span>处理时间</span><span>输出格式</span><span>状态</span><span>操作</span></div>{history.length ? history.slice((historyPage - 1) * 10, historyPage * 10).map(entry => {
          const savePath = entry.savePath || (entry.outputs[0] ? entry.outputs[0].replace(/[\\/][^\\/]*$/, '') : entry.inputs[0]?.replace(/[\\/][^\\/]*$/, '')) || '—'
          return <div className="history-row" key={entry.id}><Tooltip title={entry.name}><span className="history-file"><i>▧</i>{entry.name}</span></Tooltip><Tooltip title={savePath}><span className="history-path">{savePath}</span></Tooltip><span>{new Date(entry.completedAt).toLocaleString()}</span><span>{entry.outputFormat || '—'} <small>· {(entry.elapsedMs / 1000).toFixed(1)} 秒</small></span><span className={entry.status === 'done' ? 'success-state' : 'error-state'}>{entry.status === 'done' ? '● 完成' : '● 失败'}</span><span className="history-actions">{entry.status === 'error' ? <Tooltip title="查看错误"><button aria-label="查看错误" onClick={() => { setErrorDetail(entry.detail || entry.error); setErrorModal(true) }}><FileSearchOutlined/></button></Tooltip> : <Tooltip title="打开文件所在文件夹"><button aria-label="打开文件所在文件夹" disabled={!entry.outputs[0]} onClick={() => void openHistoryFolder(entry)}><FolderOpenOutlined/></button></Tooltip>}<Tooltip title="删除这条历史记录"><button className="history-delete" aria-label="删除这条历史记录" onClick={() => void deleteHistoryEntry(entry)}><DeleteOutlined/></button></Tooltip></span></div>
        }) : <div className="history-empty"><span className="history-empty-icon">◷</span><b>还没有转换记录</b><small>完成的任务会出现在这里，方便你快速查看。</small></div>}</div>{history.length > 10 && <Pagination className="history-pagination" current={historyPage} pageSize={10} total={history.length} showSizeChanger={false} onChange={page => setHistoryPage(page)}/>}</section>
        <footer className="app-footer"><span>FORMAT STUDIO <i>·</i> 版本 {__APP_VERSION__}</span><span>为本地工作而设计 <b>✳</b></span></footer>
      </div>
    </main>
    <Modal title={isVideoTrim ? '视频片段可视化选择' : '音频片段可视化选择'} rootClassName="trim-preview-modal" centered open={!!visualTrim} onCancel={closeVisualTrim} width={820} footer={<><Button onClick={closeVisualTrim}>返回</Button><Button type="primary" disabled={previewLoading || !!previewError || previewRange[1] <= previewRange[0]} onClick={confirmPreviewRange}>确认片段</Button></>}>
      {previewLoading && <div className="trim-preview-message">正在读取媒体并生成预览…</div>}
      {previewError && <div className="trim-preview-message error">{previewError}</div>}
      {!previewLoading && !previewError && previewUrl && <div className="trim-preview-content">
        <div className="trim-preview-file">{visualTrim ? files[visualTrim.fileIndex]?.name : ''} <span>总时长 {previewDuration.toFixed(3)} 秒</span></div>
        {isVideoTrim ? <div className="trim-video-player"><video ref={element => { previewMediaRef.current = element }} src={previewUrl} controls preload="metadata" onPlay={animatePreviewPlayhead} onPause={event => { syncPreviewPlayback(event.currentTarget); clipPreviewingRef.current = false; setClipPreviewActive(false); stopPreviewPlayhead() }} onEnded={event => { syncPreviewPlayback(event.currentTarget); clipPreviewingRef.current = false; setClipPreviewActive(false); stopPreviewPlayhead() }} onTimeUpdate={event => { const media = event.currentTarget; syncPreviewPlayback(media); if (clipPreviewingRef.current && media.currentTime >= previewRange[1]) { clipPreviewingRef.current = false; setClipPreviewActive(false); media.pause() } }} onLoadedMetadata={event => { event.currentTarget.currentTime = previewRange[0]; setPreviewTime(previewRange[0])}}/>{!previewHasAudio && <small>此视频没有音轨，预览仅播放画面。</small>}</div> : <><audio ref={element => { previewMediaRef.current = element }} src={previewUrl} controls preload="metadata" onPlay={animatePreviewPlayhead} onPause={event => { syncPreviewPlayback(event.currentTarget); clipPreviewingRef.current = false; setClipPreviewActive(false); stopPreviewPlayhead() }} onEnded={event => { syncPreviewPlayback(event.currentTarget); clipPreviewingRef.current = false; setClipPreviewActive(false); stopPreviewPlayhead() }} onTimeUpdate={event => { const media = event.currentTarget; syncPreviewPlayback(media); if (clipPreviewingRef.current && media.currentTime >= previewRange[1]) { clipPreviewingRef.current = false; setClipPreviewActive(false); media.pause() } }} onLoadedMetadata={event => { event.currentTarget.currentTime = previewRange[0]; setPreviewTime(previewRange[0]) }}/><div ref={previewWaveformRef} className="trim-waveform" role="group" aria-label="音频波形预览">{previewPeaks.map((peak, index) => <i key={index} style={{ height: `${Math.max(4, peak * 100)}%`, opacity: index / previewPeaks.length >= previewRange[0] / previewDuration && index / previewPeaks.length <= previewRange[1] / previewDuration ? 0.9 : 0.28 }}/>) }<span ref={previewPlayheadRef} className="trim-waveform-playhead" role="slider" aria-label="播放位置，可拖动定位" aria-valuemin={0} aria-valuemax={previewDuration} aria-valuenow={previewTime} tabIndex={0} style={{ left: '10px' }} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); previewSeekingRef.current = true; seekPreviewFromPointer(event.clientX) }} onPointerMove={event => { if (previewSeekingRef.current) seekPreviewFromPointer(event.clientX) }} onPointerUp={finishPreviewSeek} onPointerCancel={finishPreviewSeek} onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const media = previewMediaRef.current; if (media) { media.currentTime = Math.min(previewDuration, Math.max(0, media.currentTime + (event.key === 'ArrowRight' ? 1 : -1))); syncPreviewPlayback(media); setPreviewTime(media.currentTime) } }}/></div></>}
        <div className="trim-preview-seek"><span ref={previewElapsedRef}>{previewTime.toFixed(3)} 秒</span><input ref={previewSeekRef} aria-label="播放位置" type="range" min={0} max={previewDuration || 1} step={0.001} value={Math.min(previewTime, previewDuration)} onChange={event => { const time = Number(event.target.value); setPreviewTime(time); if (previewMediaRef.current) { previewMediaRef.current.currentTime = time; syncPreviewPlayback(previewMediaRef.current) } }}/><span>{previewDuration.toFixed(3)} 秒</span></div>
        <div className="trim-preview-range-label"><span>选择保留范围</span><InputNumber aria-label="保留片段开始时间" min={0} max={previewDuration} step={1} precision={3} addonAfter="秒" value={Number(previewRange[0].toFixed(3))} onChange={value => { if (value !== null) updatePreviewRange(0, Number(value)) }}/><span>至</span><InputNumber aria-label="保留片段结束时间" min={0} max={previewDuration} step={1} precision={3} addonAfter="秒" value={Number(previewRange[1].toFixed(3))} onChange={value => { if (value !== null) updatePreviewRange(1, Number(value)) }}/><div className="trim-clip-preview"><Tooltip title="试听片段"><Button type="text" aria-label="试听片段" className="trim-clip-play" icon={clipPreviewActive ? <PauseCircleOutlined/> : <PlayCircleOutlined/>} onClick={() => void toggleClipPreview()}/></Tooltip><span ref={clipPreviewElapsedRef}>0.000 秒</span><div ref={clipPreviewTrackRef} className="trim-clip-track"><span ref={clipPreviewFillRef} className="trim-clip-fill"/><span ref={clipPreviewThumbRef} className="trim-clip-thumb"/><input aria-label="试听片段进度" type="range" min={0} max={Math.max(0.001, previewRange[1] - previewRange[0])} step={0.001} defaultValue={0} onChange={event => { const media = previewMediaRef.current; const offset = Number(event.target.value); const duration = Math.max(0.001, previewRange[1] - previewRange[0]); const ratio = Math.min(1, offset / duration); if (clipPreviewFillRef.current) clipPreviewFillRef.current.style.transform = `scaleX(${ratio})`; if (clipPreviewThumbRef.current && clipPreviewTrackRef.current) clipPreviewThumbRef.current.style.transform = `translateX(${clipPreviewTrackRef.current.clientWidth * ratio}px)`; if (media) { media.currentTime = previewRange[0] + offset; if (clipPreviewElapsedRef.current) clipPreviewElapsedRef.current.textContent = `${offset.toFixed(3)} 秒` } }}/></div><span>{Math.max(0, previewRange[1] - previewRange[0]).toFixed(3)} 秒</span></div></div>
        <div className="trim-range-controls"><label>开始<input aria-label="可视化片段开始" type="range" min={0} max={previewDuration || 1} step={0.001} value={previewRange[0]} onChange={event => updatePreviewRange(0, Number(event.target.value))}/></label><label>结束<input aria-label="可视化片段结束" type="range" min={0} max={previewDuration || 1} step={0.001} value={previewRange[1]} onChange={event => updatePreviewRange(1, Number(event.target.value))}/></label></div>
        <p className="trim-preview-hint">拖动开始和结束滑块选择片段；也可以在播放器中试听或预览，再确认回填到当前行。</p>
      </div>}
    </Modal>
    <Modal title={isVideoTrim ? '预览裁剪后的视频' : '预览裁剪后的音频'} rootClassName="trim-preview-modal" centered open={trimResultPreviewIndex !== null} onCancel={closeTrimResultPreview} footer={<Button onClick={closeTrimResultPreview}>关闭</Button>} width={760}>
      {trimResultPreviewLoading && <div className="trim-preview-message">正在准备片段预览…</div>}
      {trimResultPreviewError && <div className="trim-preview-message error">{trimResultPreviewError}</div>}
      {!trimResultPreviewLoading && trimResultPreviewUrl && <div className="trim-result-preview">
        <div className="trim-preview-file">{trimResultPreviewIndex === null ? '' : files[trimResultPreviewIndex]?.name}<span>拼接预览 · {trimResultPreviewDuration.toFixed(3)} 秒</span></div>
        {isVideoTrim
          ? <video className="trim-result-video" ref={element => { trimResultMediaRef.current = element }} src={trimResultPreviewUrl} preload="metadata" onLoadedMetadata={event => { const media = event.currentTarget; media.currentTime = Number(trimResultSegmentsRef.current[0]?.start || 0); void media.play().then(() => setTrimResultPreviewPlaying(true)).catch(error => message.error((error as Error).message || '视频预览播放失败')) }} onPlay={() => { setTrimResultPreviewPlaying(true); animateTrimResultProgress() }} onPause={() => { setTrimResultPreviewPlaying(false); if (trimResultFrameRef.current !== null) cancelAnimationFrame(trimResultFrameRef.current); trimResultFrameRef.current = null }} onTimeUpdate={event => handleTrimResultTimeUpdate(event.currentTarget)} onEnded={event => handleTrimResultTimeUpdate(event.currentTarget)} />
          : <audio ref={element => { trimResultMediaRef.current = element }} src={trimResultPreviewUrl} preload="metadata" onLoadedMetadata={event => { const media = event.currentTarget; media.currentTime = Number(trimResultSegmentsRef.current[0]?.start || 0); void media.play().then(() => setTrimResultPreviewPlaying(true)).catch(error => message.error((error as Error).message || '音频预览播放失败')) }} onPlay={() => { setTrimResultPreviewPlaying(true); animateTrimResultProgress() }} onPause={() => { setTrimResultPreviewPlaying(false); if (trimResultFrameRef.current !== null) cancelAnimationFrame(trimResultFrameRef.current); trimResultFrameRef.current = null }} onTimeUpdate={event => handleTrimResultTimeUpdate(event.currentTarget)} onEnded={event => handleTrimResultTimeUpdate(event.currentTarget)} />}
        <div className="trim-result-controls"><Tooltip title={trimResultPreviewPlaying ? '暂停预览' : '播放预览'}><Button type="text" aria-label={trimResultPreviewPlaying ? '暂停预览' : '播放预览'} className="trim-clip-play" icon={trimResultPreviewPlaying ? <PauseCircleOutlined/> : <PlayCircleOutlined/>} onClick={() => void toggleTrimResultPlayback()}/></Tooltip><span ref={trimResultElapsedRef}>0.000 秒</span><input ref={trimResultSeekRef} type="range" aria-label="裁剪预览进度" min={0} max={trimResultPreviewDuration || 1} step={0.001} defaultValue={0} onChange={event => seekTrimResultPreview(Number(event.target.value))}/><span>{trimResultPreviewDuration.toFixed(3)} 秒</span></div>
        <p className="trim-preview-hint">按设置的保留片段顺序连续播放；进度条可拖动预览任意位置。</p>
      </div>}
    </Modal>
    <Modal title="裁剪结果预览" rootClassName="crop-result-preview-modal" centered open={cropResultPreview !== null} onCancel={closeCropResultPreview} footer={<Button onClick={closeCropResultPreview}>关闭</Button>} width={900}>
      {cropResultPreview && <div className="crop-result-preview"><div className="crop-result-preview-window" style={{ width: cropResultPreview.crop.width * cropResultScale, height: cropResultPreview.crop.height * cropResultScale }}>{cropResultPreview.video ? <video ref={cropResultVideoRef} src={cropResultPreview.url} playsInline onLoadedMetadata={event => { const video = event.currentTarget; setCropResultPreviewSize([video.videoWidth, video.videoHeight]); setCropResultVideoDuration(video.duration || 0) }} onTimeUpdate={syncCropResultVideoProgress} onPlay={() => { setCropResultVideoPlaying(true); animateCropResultVideoProgress() }} onPause={() => { setCropResultVideoPlaying(false); syncCropResultVideoProgress(); if (cropResultVideoFrameRef.current !== null) cancelAnimationFrame(cropResultVideoFrameRef.current); cropResultVideoFrameRef.current = null }} onEnded={() => { setCropResultVideoPlaying(false); syncCropResultVideoProgress(); if (cropResultVideoFrameRef.current !== null) cancelAnimationFrame(cropResultVideoFrameRef.current); cropResultVideoFrameRef.current = null }} style={{ width: cropResultPreviewSize[0] * cropResultScale, height: cropResultPreviewSize[1] * cropResultScale, left: -cropResultPreview.crop.x * cropResultScale, top: -cropResultPreview.crop.y * cropResultScale }}/> : <img src={cropResultPreview.url} alt="裁剪结果" onLoad={event => setCropResultPreviewSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} style={{ width: cropResultPreviewSize[0] * cropResultScale, height: cropResultPreviewSize[1] * cropResultScale, left: -cropResultPreview.crop.x * cropResultScale, top: -cropResultPreview.crop.y * cropResultScale }}/>}</div>{cropResultPreview.video && <div className="crop-result-video-controls"><Button type="text" aria-label={cropResultVideoPlaying ? '暂停' : '播放'} icon={cropResultVideoPlaying ? <PauseCircleOutlined/> : <PlayCircleOutlined/>} onClick={() => { const video = cropResultVideoRef.current; if (!video) return; if (video.paused) void video.play().catch(error => message.error((error as Error).message || '视频播放失败')); else video.pause() }}/><span ref={cropResultVideoElapsedRef} className="crop-result-video-time">0:00</span><input aria-label="视频预览进度" type="range" min={0} max={cropResultVideoDuration || 1} step={0.05} defaultValue={0} ref={cropResultVideoSeekRef} onChange={event => { const time = Number(event.target.value); if (cropResultVideoRef.current) cropResultVideoRef.current.currentTime = time; syncCropResultVideoProgress() }}/><span className="crop-result-video-time">{`${Math.floor(cropResultVideoDuration / 60)}:${String(Math.floor(cropResultVideoDuration % 60)).padStart(2, '0')}`}</span><Button type="text" aria-label={cropResultVideoMuted ? '取消静音' : '静音'} onClick={() => { const muted = !cropResultVideoMuted; setCropResultVideoMuted(muted); if (cropResultVideoRef.current) cropResultVideoRef.current.muted = muted }}>{cropResultVideoMuted ? '静音' : '音量'}</Button><input aria-label="视频预览音量" type="range" min={0} max={1} step={0.01} value={cropResultVideoVolume} onChange={event => { const volume = Number(event.target.value); setCropResultVideoVolume(volume); setCropResultVideoMuted(volume === 0); if (cropResultVideoRef.current) { cropResultVideoRef.current.volume = volume; cropResultVideoRef.current.muted = volume === 0 } }}/></div>}<span>{cropResultPreview.crop.width} × {cropResultPreview.crop.height} px · {files[cropResultPreview.index]?.name}</span></div>}
    </Modal>
    <Modal title={isVideoFrameCrop ? "视频画面裁剪" : "图片裁剪"} rootClassName="image-crop-modal" centered open={cropModalIndex !== null} afterOpenChange={open => { if (open) requestAnimationFrame(() => requestAnimationFrame(() => { syncCropMediaFrame(); setCropFrameReady(true) })) }} onCancel={closeImageCrop} width={860} footer={<><Button onClick={closeImageCrop}>返回</Button><Button type="primary" disabled={!cropRect.width || !cropRect.height} onClick={() => { if (cropModalIndex === null) return; setFiles(current => current.map((file, index) => index === cropModalIndex ? { ...file, crop: cropRect, outputName: `${file.name.replace(/\.[^.]+$/, '')}_crop` } : file)); closeImageCrop() }}>确认裁剪区域</Button></>}>
      {cropPreviewUrl && <div className="image-crop-content"><div ref={cropStageRef} className="image-crop-stage" onDragStart={event => event.preventDefault()} onPointerDown={beginCropSelection} onPointerMove={updateCropFromPointer} onPointerUp={event => { cropDragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}>{isVideoFrameCrop ? <video ref={cropVideoRef} src={cropPreviewUrl} autoPlay muted loop playsInline onLoadedMetadata={event => { const video = event.currentTarget; setCropSize([video.videoWidth, video.videoHeight]); setCropRect(current => current.width ? current : { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight }); requestAnimationFrame(syncCropMediaFrame) }}/> : <img ref={cropImageRef} src={cropPreviewUrl} alt="裁剪预览" draggable={false} onDragStart={event => event.preventDefault()} onLoad={event => { const image = event.currentTarget; setCropSize([image.naturalWidth, image.naturalHeight]); setCropRect(current => current.width ? current : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }); requestAnimationFrame(syncCropMediaFrame) }}/>}{cropSize[0] > 0 && cropFrameReady && cropMediaFrame.width > 0 && cropMediaFrame.height > 0 && <div className="image-crop-selection" onPointerDown={beginCropMove} style={{ left: cropMediaFrame.left + cropRect.x / cropSize[0] * cropMediaFrame.width, top: cropMediaFrame.top + cropRect.y / cropSize[1] * cropMediaFrame.height, width: cropRect.width / cropSize[0] * cropMediaFrame.width, height: cropRect.height / cropSize[1] * cropMediaFrame.height }}>{['nw', 'ne', 'sw', 'se'].map(handle => <span key={handle} className={'image-crop-handle ' + handle} onPointerDown={event => beginCropResize(event, handle)}/>)}</div>}</div><div className="image-crop-controls"><span>原图 {cropSize[0]} × {cropSize[1]} px</span><Select className="image-crop-aspect-select" size="small" style={{ width: 120, minWidth: 120 }} popupMatchSelectWidth={150} value={cropAspect ?? 0} onChange={value => changeCropAspect(value || null)} options={[{ value: 0, label: '自由比例' }, { value: 1, label: '1:1' }, { value: 3/4, label: '3:4' }, { value: 4/3, label: '4:3' }, { value: 16/9, label: '16:9' }, { value: 9/16, label: '9:16' }]}/>{(['x','y','width','height'] as const).map(key => <label key={key}>{({x:'X',y:'Y',width:'宽度',height:'高度'})[key]}<InputNumber min={key === 'width' || key === 'height' ? 1 : 0} max={key === 'x' || key === 'width' ? cropSize[0] : cropSize[1]} value={cropRect[key]} onChange={value => setCropRect(current => ({ ...current, [key]: Number(value || 0) }))}/></label>)}</div><small>拖动空白区域新建选区；拖动绿色框可移动，拖动四角可缩放。固定比例按裁剪结果的宽:高计算。</small></div>}
    </Modal>
    {imageEditorTarget && <ImageEditor key={imageEditorTarget.id} open={!!imageEditorTarget} path={imageEditorTarget.path} fileName={imageEditorTarget.name} outputFormat={outputFormat} initialActions={editedImages[imageEditorTarget.id]?.actions} onClose={() => setImageEditorTarget(null)} onConfirm={result => { setEditedImages(current => ({ ...current, [imageEditorTarget.id]: { data: result.data, extension: result.extension, actions: result.actions } })) }}/>}
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
    <Modal title="关于 Format Studio" centered open={aboutModal} onCancel={() => setAboutModal(false)} footer={<Button onClick={() => setAboutModal(false)}>关闭</Button>}><div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}><span className="brand-mark">F</span><div><b>Format Conversion Studio</b><div style={{ color: '#929a93', fontSize: 12, marginTop: 4 }}>版本 {__APP_VERSION__}</div></div></div><p style={{ margin: '12px 0 8px', color: '#78827a' }}>本地文件格式转换工具。文件处理均在你的设备上完成。</p><div className="about-links"><p><a href="https://github.com/guzhendekabula/Format_Conversion_Studio" onClick={event => { event.preventDefault(); void window.desktop?.openExternal('https://github.com/guzhendekabula/Format_Conversion_Studio') }}>获取更多细节</a></p><p><a href="https://github.com/guzhendekabula/Format_Conversion_Studio/issues" onClick={event => { event.preventDefault(); void window.desktop?.openExternal('https://github.com/guzhendekabula/Format_Conversion_Studio/issues') }}>使用过程如有问题可于此反馈</a></p></div></Modal>
  </div>
}

export default App
