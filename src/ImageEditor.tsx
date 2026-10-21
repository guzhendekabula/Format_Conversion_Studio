import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button, Input, InputNumber, message, Modal, Select, Tooltip } from 'antd'
import { CheckOutlined, RedoOutlined, RotateLeftOutlined, RotateRightOutlined, UndoOutlined } from '@ant-design/icons'

type Point = { x: number; y: number }
export type ImageEditAction =
  | { type: 'crop'; x: number; y: number; width: number; height: number }
  | { type: 'rotate'; degrees: number }
  | { type: 'text'; text: string; x: number; y: number; size: number; color: string }
  | { type: 'brush' | 'mosaic'; points: Point[]; size: number; color?: string }
type Props = { open: boolean; path: string; fileName: string; outputFormat: string; initialActions?: ImageEditAction[]; onClose: () => void; onConfirm: (result: { data: number[]; extension: string; actions: ImageEditAction[] }) => void }
type Tool = 'crop' | 'rotate' | 'text' | 'brush' | 'mosaic'
type CropDrag = { mode: 'new' | 'move' | 'resize'; start: Point; original: { x: number; y: number; width: number; height: number }; handle?: 'nw' | 'ne' | 'sw' | 'se' }
type TextDrag = { mode: 'move' | 'resize'; start: Point; original: Extract<ImageEditAction, { type: 'text' }>; handle?: 'nw' | 'ne' | 'sw' | 'se'; historyRecorded?: boolean }

function paintAction(canvas: HTMLCanvasElement, action: ImageEditAction) {
  const context = canvas.getContext('2d')
  if (!context) return
  if (action.type === 'crop') {
    const next = document.createElement('canvas')
    next.width = action.width; next.height = action.height
    next.getContext('2d')?.drawImage(canvas, action.x, action.y, action.width, action.height, 0, 0, action.width, action.height)
    canvas.width = next.width; canvas.height = next.height
    canvas.getContext('2d')?.drawImage(next, 0, 0)
  } else if (action.type === 'rotate') {
    const next = document.createElement('canvas')
    const radians = action.degrees * Math.PI / 180
    const rawCos = Math.cos(radians), rawSin = Math.sin(radians)
    const cos = Math.abs(rawCos) < 1e-10 ? 0 : rawCos, sin = Math.abs(rawSin) < 1e-10 ? 0 : rawSin
    next.width = Math.max(1, Math.ceil(Math.abs(canvas.width * cos) + Math.abs(canvas.height * sin)))
    next.height = Math.max(1, Math.ceil(Math.abs(canvas.width * sin) + Math.abs(canvas.height * cos)))
    const nextContext = next.getContext('2d')
    if (!nextContext) return
    nextContext.translate(next.width / 2, next.height / 2)
    nextContext.rotate(radians)
    nextContext.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
    canvas.width = next.width; canvas.height = next.height
    canvas.getContext('2d')?.drawImage(next, 0, 0)
  } else if (action.type === 'text') {
    context.save(); context.font = `600 ${action.size}px system-ui, sans-serif`; context.fillStyle = action.color
    context.textBaseline = 'top'; context.fillText(action.text, action.x, action.y); context.restore()
  } else if (action.points.length) {
    if (action.type === 'brush') {
      context.save(); context.strokeStyle = action.color || '#e53935'; context.fillStyle = action.color || '#e53935'
      context.lineWidth = action.size; context.lineCap = 'round'; context.lineJoin = 'round'
      context.beginPath(); context.moveTo(action.points[0].x, action.points[0].y)
      if (action.points.length === 1) { context.arc(action.points[0].x, action.points[0].y, action.size / 2, 0, Math.PI * 2); context.fill() }
      else { for (const point of action.points.slice(1)) context.lineTo(point.x, point.y); context.stroke() }
      context.restore()
    } else {
      const pixelated = document.createElement('canvas')
      pixelated.width = Math.max(1, Math.ceil(canvas.width / action.size)); pixelated.height = Math.max(1, Math.ceil(canvas.height / action.size))
      const pixelContext = pixelated.getContext('2d')
      if (!pixelContext) return
      pixelContext.imageSmoothingEnabled = true; pixelContext.drawImage(canvas, 0, 0, pixelated.width, pixelated.height)
      const mosaic = document.createElement('canvas'); mosaic.width = canvas.width; mosaic.height = canvas.height
      const mosaicContext = mosaic.getContext('2d')
      if (!mosaicContext) return
      mosaicContext.imageSmoothingEnabled = false; mosaicContext.drawImage(pixelated, 0, 0, canvas.width, canvas.height)
      const mask = document.createElement('canvas'); mask.width = canvas.width; mask.height = canvas.height
      const maskContext = mask.getContext('2d')
      if (!maskContext) return
      maskContext.strokeStyle = '#fff'; maskContext.fillStyle = '#fff'; maskContext.lineWidth = action.size * 2
      maskContext.lineCap = 'round'; maskContext.lineJoin = 'round'; maskContext.beginPath()
      maskContext.moveTo(action.points[0].x, action.points[0].y)
      if (action.points.length === 1) maskContext.arc(action.points[0].x, action.points[0].y, action.size, 0, Math.PI * 2)
      else for (const point of action.points.slice(1)) maskContext.lineTo(point.x, point.y)
      maskContext.stroke()
      mosaicContext.globalCompositeOperation = 'destination-in'; mosaicContext.drawImage(mask, 0, 0)
      context.drawImage(mosaic, 0, 0)
    }
  }
}

export default function ImageEditor({ open, path, fileName, outputFormat, initialActions, onClose, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<HTMLImageElement | null>(null)
  const activeActionRef = useRef<ImageEditAction | null>(null)
  const cropDragRef = useRef<CropDrag | null>(null)
  const textDragRef = useRef<TextDrag | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [actions, setActions] = useState<ImageEditAction[]>([])
  const [pastActions, setPastActions] = useState<ImageEditAction[][]>([])
  const [redoActions, setRedoActions] = useState<ImageEditAction[][]>([])
  const [tool, setTool] = useState<Tool>('crop')
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [canvasSize, setCanvasSize] = useState<[number, number]>([0, 0])
  const [text, setText] = useState('')
  const [textPlacementPending, setTextPlacementPending] = useState(false)
  const [textSize, setTextSize] = useState(48)
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null)
  const [color, setColor] = useState('#e53935')
  const [brushSize, setBrushSize] = useState(12)
  const [mosaicSize, setMosaicSize] = useState(18)
  const [rotationAngle, setRotationAngle] = useState(0)
  const [saving, setSaving] = useState(false)

  const renderActions = useCallback((list: ImageEditAction[]) => {
    const image = sourceRef.current, canvas = canvasRef.current
    if (!image || !canvas || !image.naturalWidth) return
    const rendered = document.createElement('canvas')
    rendered.width = image.naturalWidth; rendered.height = image.naturalHeight
    rendered.getContext('2d')?.drawImage(image, 0, 0)
    for (const action of list) paintAction(rendered, action)
    canvas.width = rendered.width; canvas.height = rendered.height
    canvas.getContext('2d')?.drawImage(rendered, 0, 0)
    setCanvasSize([rendered.width, rendered.height])
  }, [])

  useEffect(() => {
    if (!open || !path || !window.desktop?.readFile) return
    let cancelled = false
    let objectUrl = ''
    setPreviewUrl('')
    const mimeByExtension: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' }
    const read = window.desktop.readFile(path)
    void read.then(bytes => {
      const extension = fileName.split('.').pop()?.toLowerCase() || ''
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeByExtension[extension] || 'application/octet-stream' }))
      if (cancelled) URL.revokeObjectURL(objectUrl)
      else setPreviewUrl(objectUrl)
    }).catch(error => message.error(`无法打开图片：${(error as Error).message}`))
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [open, path, fileName])

  useEffect(() => {
    if (!previewUrl) return
    const image = new Image()
    image.onload = () => { const restoredActions = initialActions || []; sourceRef.current = image; setActions(restoredActions); setPastActions(restoredActions.map((_, index) => restoredActions.slice(0, index))); setRedoActions([]); setCropRect(null); renderActions(restoredActions) }
    image.onerror = () => message.error('图片预览读取失败')
    image.src = previewUrl
    return () => { image.onload = null; if (sourceRef.current === image) sourceRef.current = null }
  }, [previewUrl, initialActions, renderActions])

  useEffect(() => { if (sourceRef.current) renderActions(actions) }, [actions, renderActions])

  const commit = (action: ImageEditAction) => {
    setPastActions(current => [...current.slice(-39), actions])
    setActions(current => [...current.slice(-39), action])
    setRedoActions([])
  }
  const getTextBounds = (action: Extract<ImageEditAction, { type: 'text' }>) => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return { x: action.x, y: action.y, width: Math.max(action.size, action.text.length * action.size * 0.6), height: action.size * 1.25 }
    context.save(); context.font = `600 ${action.size}px system-ui, sans-serif`
    const width = context.measureText(action.text).width
    context.restore()
    return { x: action.x, y: action.y, width, height: action.size * 1.25 }
  }
  const updateTextAction = (index: number, patch: Partial<Extract<ImageEditAction, { type: 'text' }>>, recordHistory = true) => {
    if (recordHistory) setPastActions(current => [...current.slice(-39), actions])
    setActions(current => current.map((action, actionIndex) => actionIndex === index && action.type === 'text' ? { ...action, ...patch } : action))
    setRedoActions([])
  }
  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!, bounds = canvas.getBoundingClientRect()
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height)) }
  }
  const pointFromClient = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current!, bounds = canvas.getBoundingClientRect()
    return { x: Math.max(0, Math.min(canvas.width, (clientX - bounds.left) * canvas.width / bounds.width)), y: Math.max(0, Math.min(canvas.height, (clientY - bounds.top) * canvas.height / bounds.height)) }
  }
  const selectedAction = selectedTextIndex === null ? undefined : actions[selectedTextIndex]
  const selectedText = selectedAction?.type === 'text' ? selectedAction : null
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !canvasRef.current) return
    if (tool === 'rotate') return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    if (tool === 'crop') {
      const bounds = event.currentTarget.getBoundingClientRect()
      const tolerance = Math.max(8, 10 * event.currentTarget.width / Math.max(1, bounds.width))
      let drag: CropDrag = { mode: 'new', start: point, original: { x: point.x, y: point.y, width: 0, height: 0 } }
      if (cropRect) {
        const corners: Array<{ handle: CropDrag['handle']; x: number; y: number }> = [
          { handle: 'nw', x: cropRect.x, y: cropRect.y }, { handle: 'ne', x: cropRect.x + cropRect.width, y: cropRect.y },
          { handle: 'sw', x: cropRect.x, y: cropRect.y + cropRect.height }, { handle: 'se', x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
        ]
        const corner = corners.find(item => Math.abs(point.x - item.x) <= tolerance && Math.abs(point.y - item.y) <= tolerance)
        if (corner) drag = { mode: 'resize', start: point, original: cropRect, handle: corner.handle }
        else if (point.x >= cropRect.x && point.x <= cropRect.x + cropRect.width && point.y >= cropRect.y && point.y <= cropRect.y + cropRect.height) drag = { mode: 'move', start: point, original: cropRect }
      }
      cropDragRef.current = drag
      if (drag.mode === 'new') setCropRect({ x: point.x, y: point.y, width: 0, height: 0 })
      return
    }
    if (tool === 'text') {
      const hitIndex = actions.map((action, index) => ({ action, index })).reverse().find(({ action }) => {
        if (action.type !== 'text') return false
        const bounds = getTextBounds(action)
        return point.x >= bounds.x - 5 && point.x <= bounds.x + bounds.width + 5 && point.y >= bounds.y - 5 && point.y <= bounds.y + bounds.height + 5
      })?.index
      if (hitIndex !== undefined) { setSelectedTextIndex(hitIndex); return }
      if (!textPlacementPending) { setSelectedTextIndex(null); return }
      setSelectedTextIndex(null)
      if (!text.trim()) { message.info('先输入要添加的文字'); return }
      commit({ type: 'text', text: text.trim(), x: point.x, y: point.y, size: textSize, color }); setSelectedTextIndex(Math.min(actions.length, 39)); setTextPlacementPending(false); return
    }
    const action: ImageEditAction = tool === 'brush' ? { type: 'brush', points: [point], size: brushSize, color } : { type: 'mosaic', points: [point], size: mosaicSize }
    activeActionRef.current = action
    paintAction(canvasRef.current, action)
  }
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    if (tool === 'crop' && cropDragRef.current) {
      const drag = cropDragRef.current, original = drag.original
      if (drag.mode === 'new') {
        setCropRect({ x: Math.min(drag.start.x, point.x), y: Math.min(drag.start.y, point.y), width: Math.abs(point.x - drag.start.x), height: Math.abs(point.y - drag.start.y) })
      } else if (drag.mode === 'move') {
        const x = Math.max(0, Math.min(canvasRef.current!.width - original.width, original.x + point.x - drag.start.x))
        const y = Math.max(0, Math.min(canvasRef.current!.height - original.height, original.y + point.y - drag.start.y))
        setCropRect({ ...original, x, y })
      } else {
        const right = drag.handle?.includes('e') ? Math.max(original.x + 1, Math.min(canvasRef.current!.width, original.x + original.width + point.x - drag.start.x)) : original.x + original.width
        const left = drag.handle?.includes('w') ? Math.max(0, Math.min(original.x + original.width - 1, original.x + point.x - drag.start.x)) : original.x
        const bottom = drag.handle?.includes('s') ? Math.max(original.y + 1, Math.min(canvasRef.current!.height, original.y + original.height + point.y - drag.start.y)) : original.y + original.height
        const top = drag.handle?.includes('n') ? Math.max(0, Math.min(original.y + original.height - 1, original.y + point.y - drag.start.y)) : original.y
        setCropRect({ x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
      }
    } else if (activeActionRef.current && (activeActionRef.current.type === 'brush' || activeActionRef.current.type === 'mosaic')) {
      activeActionRef.current.points.push(point)
      paintAction(canvasRef.current!, activeActionRef.current)
    }
  }
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    cropDragRef.current = null
    if (activeActionRef.current) { commit(activeActionRef.current); activeActionRef.current = null }
  }
  const beginTextTransform = (event: PointerEvent<HTMLElement>, mode: TextDrag['mode'], handle?: TextDrag['handle']) => {
    if (selectedTextIndex === null || !selectedText) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    textDragRef.current = { mode, start: pointFromClient(event.clientX, event.clientY), original: selectedText, handle }
  }
  const moveTextTransform = (event: PointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current
    if (!drag || selectedTextIndex === null) return
    if (!drag.historyRecorded) { setPastActions(current => [...current.slice(-39), actions]); setRedoActions([]); drag.historyRecorded = true }
    const point = pointFromClient(event.clientX, event.clientY), original = drag.original
    if (drag.mode === 'move') {
      const dx = point.x - drag.start.x, dy = point.y - drag.start.y
      updateTextAction(selectedTextIndex, { x: Math.max(0, Math.min(canvasRef.current!.width - getTextBounds(original).width, original.x + dx)), y: Math.max(0, Math.min(canvasRef.current!.height - getTextBounds(original).height, original.y + dy)) }, false)
    } else {
      const horizontalSign = drag.handle?.includes('w') ? -1 : 1
      const verticalSign = drag.handle?.includes('n') ? -1 : 1
      const deltaX = (point.x - drag.start.x) * horizontalSign
      const deltaY = (point.y - drag.start.y) * verticalSign
      const bounds = getTextBounds(original)
      const scaleX = bounds.width > 0 ? (bounds.width + deltaX) / bounds.width : 1
      const scaleY = (original.size * 1.25 + deltaY) / (original.size * 1.25)
      const nextSize = Math.max(8, Math.min(400, Math.round(original.size * Math.max(0.1, (scaleX + scaleY) / 2))))
      updateTextAction(selectedTextIndex, { size: nextSize }, false)
    }
  }
  const applyCrop = () => {
    if (!cropRect || cropRect.width < 1 || cropRect.height < 1) return
    commit({ type: 'crop', x: Math.round(cropRect.x), y: Math.round(cropRect.y), width: Math.max(1, Math.round(cropRect.width)), height: Math.max(1, Math.round(cropRect.height)) })
    setCropRect(null)
  }
  const clearCrop = () => { cropDragRef.current = null; setCropRect(null) }
  const undo = () => {
    if (!pastActions.length) return
    setRedoActions(current => [actions, ...current])
    setActions(pastActions[pastActions.length - 1])
    setPastActions(pastActions.slice(0, -1))
    setSelectedTextIndex(null)
  }
  const redo = () => {
    if (!redoActions.length) return
    setPastActions(current => [...current.slice(-39), actions])
    setActions(redoActions[0])
    setRedoActions(redoActions.slice(1))
    setSelectedTextIndex(null)
  }
  const confirmEdits = async () => {
    const canvas = canvasRef.current
    if (!canvas) { message.error('图片画布尚未准备好'); return }
    setSaving(true)
    try {
      const finalActions = rotationAngle ? [...actions.slice(-39), { type: 'rotate' as const, degrees: rotationAngle }] : actions
      if (rotationAngle) { setPastActions(current => [...current.slice(-39), actions]); setActions(finalActions); setRedoActions([]); setRotationAngle(0); renderActions(finalActions) }
      const format = outputFormat.toUpperCase(), mime = format === 'JPG' || format === 'JPEG' ? 'image/jpeg' : format === 'WEBP' ? 'image/webp' : 'image/png'
      const outputCanvas = document.createElement('canvas'); outputCanvas.width = canvas.width; outputCanvas.height = canvas.height
      const context = outputCanvas.getContext('2d')!
      if (mime === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, outputCanvas.width, outputCanvas.height) }
      context.drawImage(canvas, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => outputCanvas.toBlob(value => value ? resolve(value) : reject(new Error('图片编码失败')), mime, 0.92))
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
      const suffix = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]
      onConfirm({ data: bytes, extension: suffix, actions: finalActions })
      message.success('编辑结果已确认，可继续编辑其他图片或批量导出')
      onClose()
    } catch (error) { message.error(`确认图片失败：${(error as Error).message}`) }
    finally { setSaving(false) }
  }
  const applyRotation = () => {
    if (!rotationAngle) return
    commit({ type: 'rotate', degrees: rotationAngle })
    setRotationAngle(0)
  }
  const rotateBy = (degrees: number) => { commit({ type: 'rotate', degrees }); setRotationAngle(0) }
  const previewSize = (value: number, maximum: number) => Math.max(3, Math.round(value / maximum * 46))
  const overlayStyle = cropRect && canvasSize[0] ? { left: `${cropRect.x / canvasSize[0] * 100}%`, top: `${cropRect.y / canvasSize[1] * 100}%`, width: `${cropRect.width / canvasSize[0] * 100}%`, height: `${cropRect.height / canvasSize[1] * 100}%` } : undefined
  const selectedTextBounds = selectedText ? getTextBounds(selectedText) : null
  const textOverlayStyle = selectedTextBounds && canvasSize[0] ? { left: `${selectedTextBounds.x / canvasSize[0] * 100}%`, top: `${selectedTextBounds.y / canvasSize[1] * 100}%`, width: `${selectedTextBounds.width / canvasSize[0] * 100}%`, height: `${selectedTextBounds.height / canvasSize[1] * 100}%` } : undefined

  return <Modal title={`图片编辑 · ${fileName}`} open={open} onCancel={onClose} width={1080} centered destroyOnClose footer={<div className="image-editor-footer"><span>{canvasSize[0]} × {canvasSize[1]} px · {actions.length} 个图层 · {pastActions.length} 个可撤销操作</span><div><Tooltip title="撤销"><Button aria-label="撤销" icon={<UndoOutlined/>} disabled={!pastActions.length} onClick={undo}/></Tooltip><Tooltip title="重做"><Button aria-label="重做" icon={<RedoOutlined/>} disabled={!redoActions.length} onClick={redo}/></Tooltip><Button onClick={onClose}>取消</Button><Button type="primary" loading={saving} onClick={() => void confirmEdits()}>确定</Button></div></div>}>
    <div className="image-editor">
      <div className="image-editor-toolbar">
        <Select value={tool} onChange={value => { setTool(value); clearCrop(); if (value !== 'rotate') setRotationAngle(0); if (value !== 'text') setSelectedTextIndex(null) }} options={[{value:'crop',label:'裁剪'},{value:'rotate',label:'旋转'},{value:'text',label:'文字'},{value:'brush',label:'画笔'},{value:'mosaic',label:'马赛克'}]}/>
        {tool === 'rotate' && <><Tooltip title="向左旋转 90°"><Button icon={<RotateLeftOutlined/>} onClick={() => rotateBy(-90)}/></Tooltip><Tooltip title="向右旋转 90°"><Button icon={<RotateRightOutlined/>} onClick={() => rotateBy(90)}/></Tooltip><div className="image-editor-rotation"><span className="image-editor-rotation-label">旋转 {rotationAngle}°</span><input aria-label="旋转角度" type="range" min={-360} max={360} value={rotationAngle} onChange={event => setRotationAngle(Number(event.target.value))}/><InputNumber aria-label="旋转角度数值" min={-360} max={360} step={1} addonAfter="°" value={rotationAngle} onChange={value => setRotationAngle(Number(value || 0))}/><Button onClick={applyRotation} disabled={!rotationAngle}>应用</Button></div></>}
        {tool === 'text' && <><div className="image-editor-text-entry"><Input value={selectedText?.text ?? text} onChange={event => { if (selectedTextIndex !== null && selectedText) updateTextAction(selectedTextIndex, { text: event.target.value }); else { setText(event.target.value); setTextPlacementPending(Boolean(event.target.value.trim())) } }} placeholder="输入文字后点击图片放置"/><Tooltip title="确认当前文字并清空输入；需要添加新文字时重新输入"><Button aria-label="确认文字" icon={<CheckOutlined/>} disabled={!text.trim() && !selectedText} onClick={() => { setText(''); setTextPlacementPending(false); setSelectedTextIndex(null) }}/></Tooltip></div><InputNumber min={8} max={400} addonAfter="px" value={selectedText?.size ?? textSize} onChange={value => selectedTextIndex !== null && selectedText ? updateTextAction(selectedTextIndex, { size: Number(value || 48) }) : setTextSize(Number(value || 48))}/><input aria-label="文字颜色" type="color" value={selectedText?.color ?? color} onChange={event => selectedTextIndex !== null && selectedText ? updateTextAction(selectedTextIndex, { color: event.target.value }) : setColor(event.target.value)}/></>}
        {tool === 'brush' && <><label className="image-editor-size-control">粗细<input aria-label="画笔粗细滑杆" type="range" min={1} max={100} value={brushSize} onChange={event => setBrushSize(Number(event.target.value))}/></label><InputNumber aria-label="画笔粗细数值" min={1} max={100} step={1} addonAfter="px" value={brushSize} onChange={value => setBrushSize(Number(value || 1))}/><div className="image-editor-size-preview" aria-label={`画笔预览，实际粗细 ${brushSize} 像素，按一半比例显示`} title={`实际 ${brushSize}px · 预览 ${brushSize / 2}px`}><span className="brush-size-sample" style={{ height: `${brushSize * 0.5}px`, backgroundColor: color }}/></div><input aria-label="画笔颜色" type="color" value={color} onChange={event => setColor(event.target.value)}/></>}
        {tool === 'mosaic' && <><label className="image-editor-size-control">颗粒 {mosaicSize}px<input aria-label="马赛克颗粒大小" type="range" min={4} max={120} value={mosaicSize} onChange={event => setMosaicSize(Number(event.target.value))}/></label><div className="image-editor-size-preview mosaic-size-preview" aria-label={`马赛克预览，颗粒 ${mosaicSize} 像素`} title={`马赛克颗粒 ${mosaicSize}px`}><span style={{ backgroundSize: `${previewSize(mosaicSize, 120)}px ${previewSize(mosaicSize, 120)}px` }}/></div></>}
        {tool === 'crop' && <><Button type="primary" disabled={!cropRect || cropRect.width < 1 || cropRect.height < 1} onClick={applyCrop}>应用裁剪</Button><Button disabled={!cropRect} onClick={clearCrop}>清除框</Button></>}
        <span className="image-editor-tool-hint">{tool === 'crop' ? '拖动画出新范围；拖动框可移动，拖动四角可缩放' : tool === 'rotate' ? '滑杆实时预览旋转；点击“应用”记录到操作历史' : tool === 'text' ? (selectedText ? '已选中文字：可修改内容、颜色和字号；拖动文字移动，拖动四角缩放；点击确认结束编辑' : textPlacementPending ? '点击图片放置一次；放置后点击输入框旁的确认按钮结束并清空文字' : '输入文字后点击图片放置；要添加下一段文字，请先确认当前文字并重新输入') : tool === 'brush' ? '在图片上拖动绘制' : '在图片上涂抹马赛克'}</span>
      </div>
      <div className="image-editor-stage"><div className="image-editor-canvas-wrap"><canvas ref={canvasRef} style={{ transform: rotationAngle ? `rotate(${rotationAngle}deg)` : undefined }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}/>{tool === 'crop' && cropRect && <div className="image-editor-crop-overlay" style={overlayStyle}>{(['nw','ne','sw','se'] as const).map(handle => <i key={handle} className={`image-editor-crop-handle ${handle}`}/>)}</div>}{tool === 'text' && selectedText && textOverlayStyle && <div className="image-editor-text-selection" style={textOverlayStyle} onPointerDown={event => beginTextTransform(event, 'move')} onPointerMove={moveTextTransform} onPointerUp={event => { textDragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { textDragRef.current = null }}>{(['nw','ne','sw','se'] as const).map(handle => <i key={handle} className={`image-editor-text-handle ${handle}`} onPointerDown={event => beginTextTransform(event, 'resize', handle)}/>)}</div>}</div></div>
    </div>
  </Modal>
}
