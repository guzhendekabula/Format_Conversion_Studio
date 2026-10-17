const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const { app } = require('electron')

const SOURCE_ROOT = path.resolve(__dirname, '../..')

function uniqueOutput(directory, stem, extension) {
  const base = path.join(directory, `${stem}${extension}`)
  return fs.access(base).then(async () => {
    for (let n = 2; ; n += 1) {
      const candidate = path.join(directory, `${stem} (${n})${extension}`)
      try { await fs.access(candidate) } catch { return candidate }
    }
  }).catch(() => base)
}

function outputStem(input, options, extension) {
  const fallback = path.basename(input, path.extname(input))
  const requested = String(options.outputNamesByPath?.[input] || options.outputName || '').trim()
  if (!requested) return fallback
  let stem = path.basename(requested).replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[\\/]/g, '_').replace(/[. ]+$/g, '')
  const suffix = `.${extension}`
  if (stem.toLowerCase().endsWith(suffix.toLowerCase())) stem = stem.slice(0, -suffix.length).replace(/[. ]+$/g, '')
  return stem || fallback
}

function ffmpegPath() {
  if (app.isPackaged) return require('ffmpeg-static')
  return require('ffmpeg-static')
}

function workerPath() {
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? 'format-worker.exe' : 'format-worker'
    return path.join(process.resourcesPath, 'engines', 'python', 'format-worker', exe)
  }
  return path.join(SOURCE_ROOT, 'conversion-engines', 'python', 'worker.py')
}

function pythonPath() {
  if (process.env.FCS_PYTHON) return process.env.FCS_PYTHON
  const venvPython = path.join(SOURCE_ROOT, 'conversion-engines', 'python', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  return fs.access(venvPython).then(() => venvPython).catch(() => process.platform === 'win32' ? 'python' : 'python3')
}

function popplerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'engines', 'poppler', process.platform)
    : path.join(SOURCE_ROOT, 'conversion-engines', 'poppler', 'dist', process.platform)
}

function runProcess(command, args, input, onProgress, durationMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stdout = '', stderr = '', latestProgress = 0
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (stdout.length > 500_000) stdout = stdout.slice(-250_000)
      if (durationMs) {
        const match = stdout.match(/out_time_(?:us|ms)=(\d+)/g)?.at(-1)?.match(/=(\d+)/)
        if (match) {
          const value = Math.min(99, Math.floor(Number(match[1]) / (durationMs * (stdout.includes('out_time_us=') ? 1000 : 1)) * 100))
          if (value > latestProgress) { latestProgress = value; onProgress?.(value) }
        }
      }
    })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-500_000) })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr.trim() || `进程退出，代码 ${code}`)))
    if (input) child.stdin.end(input)
    else child.stdin.end()
  })
}

async function getDuration(filePath) {
  const bin = ffmpegPath()
  try {
    const result = await runProcess(bin, ['-hide_banner', '-i', filePath], null, null)
    return parseDuration(result.stderr)
  } catch (error) {
    return parseDuration(error.message)
  }
}

async function inspectMedia(filePath) {
  let details = ''
  try { await runProcess(ffmpegPath(), ['-hide_banner', '-i', filePath], null, null) }
  catch (error) { details = error.message || '' }
  const durationMs = parseDuration(details)
  if (!durationMs) throw new Error('无法读取媒体时长，请确认文件可正常播放')
  return { durationMs, hasAudio: /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:/i.test(details) || /Stream #\d+:\d+.*Audio:/i.test(details) }
}

function trimSegmentsFor(input, options, durationMs) {
  const raw = options.trimSegmentsByPath?.[input]
  if (!Array.isArray(raw) || !raw.length) throw new Error('请至少添加一个有效的保留片段')
  const segments = raw.map(segment => ({ start: Number(segment.start), end: Number(segment.end) }))
  if (segments.some(segment => !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start)) {
    throw new Error('片段时间无效：开始时间须大于等于 0，结束时间须晚于开始时间')
  }
  segments.sort((a, b) => a.start - b.start)
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index].start < segments[index - 1].end) throw new Error('保留片段不能重叠')
  }
  const duration = durationMs / 1000
  if (segments.some(segment => segment.end > duration + 0.01)) throw new Error(`片段结束时间超过文件时长（${duration.toFixed(3)} 秒）`)
  return segments
}

function seconds(value) { return Number(value).toFixed(3) }

function audioCodecArgs(extension) {
  if (extension === 'mp3') return ['-c:a', 'libmp3lame', '-q:a', '2']
  if (extension === 'wav') return ['-c:a', 'pcm_s16le']
  if (extension === 'flac') return ['-c:a', 'flac']
  if (extension === 'ogg') return ['-c:a', 'libvorbis', '-q:a', '5']
  if (extension === 'm4a' || extension === 'aac') return ['-c:a', 'aac', '-b:a', '192k']
  throw new Error(`暂不支持裁剪 ${extension.toUpperCase()} 音频`)
}

function videoCodecArgs(extension, hasAudio) {
  if (extension === 'webm') return ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', ...(hasAudio ? ['-c:a', 'libopus', '-b:a', '128k'] : [])]
  if (extension === 'avi') return ['-c:v', 'mpeg4', '-q:v', '4', ...(hasAudio ? ['-c:a', 'libmp3lame', '-q:a', '3'] : [])]
  if (['mp4', 'mov', 'mkv'].includes(extension)) return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : [])]
  throw new Error(`暂不支持裁剪 ${extension.toUpperCase()} 视频`)
}

async function runMediaTrim(request, progress, isVideo) {
  const input = request.path
  const options = request.options || {}
  const extension = path.extname(input).slice(1).toLowerCase()
  const dir = request.outputDir || path.dirname(input)
  await fs.mkdir(dir, { recursive: true })
  const requestedName = String(options.outputNamesByPath?.[input] || options.outputName || '').trim()
  const outputOptions = requestedName ? options : { ...options, outputName: `${path.basename(input, path.extname(input))}_trim` }
  const output = await uniqueOutput(dir, outputStem(input, outputOptions, extension), `.${extension}`)
  try {
    const media = await inspectMedia(input)
    const segments = trimSegmentsFor(input, options, media.durationMs)
    const filteredDurationMs = segments.reduce((sum, segment) => sum + (segment.end - segment.start) * 1000, 0)
    const filters = []
    segments.forEach((segment, index) => {
      const start = seconds(segment.start), end = seconds(segment.end)
      if (isVideo) filters.push(`[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`)
      else filters.push(`[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`)
      if (isVideo && media.hasAudio) filters.push(`[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`)
    })
    let concatInputs
    if (isVideo && media.hasAudio) concatInputs = segments.map((_, index) => `[v${index}][a${index}]`).join('')
    else concatInputs = segments.map((_, index) => `[${isVideo ? 'v' : 'a'}${index}]`).join('')
    filters.push(`${concatInputs}concat=n=${segments.length}:v=${isVideo ? 1 : 0}:a=${isVideo && media.hasAudio ? 1 : isVideo ? 0 : 1}${isVideo ? '[outv]' : '[outa]'}${isVideo && media.hasAudio ? '[outa]' : ''}`)
    const args = ['-y', '-hide_banner', '-i', input, '-filter_complex', filters.join(';')]
    if (isVideo) args.push('-map', '[outv]')
    if (isVideo && media.hasAudio) args.push('-map', '[outa]')
    else if (!isVideo) args.push('-map', '[outa]')
    args.push(...(isVideo ? videoCodecArgs(extension, media.hasAudio) : audioCodecArgs(extension)), '-progress', 'pipe:1', '-nostats', output)
    await runProcess(ffmpegPath(), args, null, progress, filteredDurationMs)
  } catch (error) {
    await fs.rm(output, { force: true })
    throw error
  }
  progress?.(100)
  return { outputs: [output] }
}

function parseDuration(text) {
  const match = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
  return match ? (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 : 0
}

async function runFfmpeg(request, progress) {
  const input = request.path
  const operation = request.operation
  const options = request.options || {}
  const target = String(options.format || 'mp3').toLowerCase()
  const ext = operation === 'media.audio-trim' || operation === 'media.video-trim' ? path.extname(input).slice(1).toLowerCase() : target === 'jpeg' ? 'jpg' : target
  const dir = request.outputDir || path.dirname(input)
  await fs.mkdir(dir, { recursive: true })
  const output = await uniqueOutput(dir, outputStem(input, options, ext), `.${ext}`)
  const duration = await getDuration(input)
  let args
  const mp3Quality = Math.max(0, Math.min(9, Math.round((100 - Number(options.quality ?? 90)) / 12)))
  const videoQuality = Math.max(10, Math.min(51, Math.round(10 + (100 - Number(options.quality ?? 78)) * 0.4)))
  if (operation === 'media.extract-audio') args = ['-y', '-hide_banner', '-i', input, '-vn', '-c:a', 'libmp3lame', '-q:a', String(mp3Quality), '-progress', 'pipe:1', '-nostats', output]
  else if (operation === 'media.audio') args = target === 'wav'
    ? ['-y', '-hide_banner', '-i', input, '-vn', '-c:a', 'pcm_s16le', '-progress', 'pipe:1', '-nostats', output]
    : ['-y', '-hide_banner', '-i', input, '-vn', '-c:a', 'libmp3lame', '-q:a', String(mp3Quality), '-progress', 'pipe:1', '-nostats', output]
  else if (operation === 'media.gif-to-video') args = ['-y', '-hide_banner', '-i', input, ...(options.duration ? ['-t', String(options.duration)] : []), '-vf', `fps=${options.fps || 12},scale=${options.width || 640}:-1:flags=lanczos`, '-c:v', 'libx264', '-crf', String(videoQuality), '-pix_fmt', 'yuv420p', '-an', '-progress', 'pipe:1', '-nostats', output]
  else if (operation === 'media.video-to-gif') args = ['-y', '-hide_banner', '-i', input, ...(options.duration ? ['-t', String(options.duration)] : []), '-filter_complex', `[0:v]fps=${options.fps || 10},scale=${options.width || 480}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`, '-loop', '0', '-progress', 'pipe:1', '-nostats', output]
  else if (target === 'webm') args = ['-y', '-hide_banner', '-i', input, '-c:v', 'libvpx-vp9', '-crf', String(Math.max(10, Math.min(63, Math.round(10 + (100 - Number(options.quality ?? 78)) * 0.5)))), '-b:v', '0', '-c:a', 'libopus', '-progress', 'pipe:1', '-nostats', output]
  else if (target === 'avi') args = ['-y', '-hide_banner', '-i', input, '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-progress', 'pipe:1', '-nostats', output]
  else args = ['-y', '-hide_banner', '-i', input, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(videoQuality), '-c:a', 'aac', ...(target === 'mp4' || target === 'mov' ? ['-movflags', '+faststart'] : []), '-progress', 'pipe:1', '-nostats', output]
  try {
    await runProcess(ffmpegPath(), args, null, progress, duration)
  } catch (error) {
    await fs.rm(output, { force: true })
    throw error
  }
  progress?.(100)
  return { outputs: [output] }
}

async function runPython(request, progress) {
  const requestPathFields = [request.path, ...(Array.isArray(request.paths) ? request.paths : [])].filter(Boolean)
  for (const filePath of requestPathFields) {
    try { await fs.access(filePath) }
    catch { throw new Error(`找不到源文件，路径为：${filePath}。请确认文件仍在原位置，或重新添加文件。`) }
  }
  const packaged = app.isPackaged
  const worker = workerPath()
  const python = packaged ? worker : await pythonPath()
  const args = packaged ? [] : [worker]
  const payload = { ...request, popplerPath: popplerPath() }
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', POPPLER_DATADIR: path.join(popplerPath(), 'share-poppler') } })
    let remainder = '', stderr = '', result = null, workerError = null
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      remainder += chunk
      const lines = remainder.split(/\r?\n/); remainder = lines.pop() || ''
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          if (event.event === 'progress') progress?.(event.percent, event.message)
          else if (event.event === 'result') result = event
          else if (event.event === 'error') workerError = new Error(`${event.message}\n${event.detail || ''}`)
        } catch { /* ignore non-JSON worker output */ }
      }
    })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-500_000) })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0 && result) { progress?.(100); resolve(result) }
      else reject(workerError || new Error(stderr.trim() || `Python worker exited with code ${code}`))
    })
    child.stdin.end(`${JSON.stringify(payload)}\n`)
  })
}

async function runEngine(request, progress) {
  if (request.operation === 'media.audio-trim') return runMediaTrim(request, progress, false)
  if (request.operation === 'media.video-trim') return runMediaTrim(request, progress, true)
  return request.operation.startsWith('media.') ? runFfmpeg(request, progress) : runPython(request, progress)
}

module.exports = { runEngine }
