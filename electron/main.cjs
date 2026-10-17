const { app, BrowserWindow, dialog, ipcMain, shell, protocol } = require('electron')
const fs = require('node:fs/promises')
const { createReadStream } = require('node:fs')
const { Readable } = require('node:stream')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { TaskQueue } = require('./services/task-queue.cjs')

protocol.registerSchemesAsPrivileged([{ scheme: 'media-preview', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

const devUrl = !app.isPackaged ? (process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173') : undefined
let taskQueue
const previewFiles = new Map()
function registerMediaPreviewHandler() {
protocol.handle('media-preview', request => {
  const token = new URL(request.url).pathname.slice(1)
  const filePath = previewFiles.get(token)
  if (!filePath) return new Response('Not found', { status: 404 })
  return fs.stat(filePath).then(stat => {
    const range = request.headers.get('range')
    const mime = ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', webm: 'video/webm' })[path.extname(filePath).slice(1).toLowerCase()] || 'application/octet-stream'
    const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' }
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) return new Response(null, { status: 416 })
      const start = Number(match[1] || 0), end = Math.min(Number(match[2] || stat.size - 1), stat.size - 1)
      if (start > end || start >= stat.size) return new Response(null, { status: 416 })
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
      headers['Content-Length'] = String(end - start + 1)
      return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), { status: 206, headers })
    }
    headers['Content-Length'] = String(stat.size)
    return new Response(Readable.toWeb(createReadStream(filePath)), { status: 200, headers })
  }).catch(() => new Response('Not found', { status: 404 }))
})
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1120, minHeight: 760,
    title: 'Format Conversion Studio',
    backgroundColor: '#f7f8f6',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('files:select', async (_event, extensions) => {
  const ext = Array.isArray(extensions) ? extensions.map(x => String(x).replace(/^\./, '')).filter(Boolean) : []
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: ext.length ? [{ name: 'Supported files', extensions: ext }, { name: 'All files', extensions: ['*'] }] : [] })
  if (result.canceled) return []
  return Promise.all(result.filePaths.map(async filePath => ({ path: filePath, name: path.basename(filePath), size: (await fs.stat(filePath)).size })))
})
ipcMain.handle('directory:select', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})
ipcMain.handle('folder:select', async (_event, extensions) => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled) return []
  const allowed = new Set((Array.isArray(extensions) ? extensions : []).map(x => `.${String(x).replace(/^\./, '').toLowerCase()}`))
  const found = []
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (!allowed.size || allowed.has(path.extname(entry.name).toLowerCase())) found.push({ path: full, name: entry.name, size: (await fs.stat(full)).size })
    }
  }
  await walk(result.filePaths[0])
  return found
})
ipcMain.handle('files:read', async (_event, filePath) => Array.from(await fs.readFile(filePath)))
ipcMain.handle('media:register-preview', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('文件路径无效')
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) throw new Error('预览目标不是文件')
  const token = crypto.randomUUID()
  previewFiles.set(token, filePath)
  return `media-preview://source/${token}`
})
ipcMain.handle('media:analyze', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('文件路径无效')
  const ffmpeg = require('ffmpeg-static')
  const probe = await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-i', filePath], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', () => {
      const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
      if (!match) return reject(new Error('无法读取媒体时长'))
      resolve({ duration: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]), hasAudio: /Audio:/.test(stderr) })
    })
  })
  let peaks = []
  if (probe.hasAudio) {
    peaks = await new Promise((resolve, reject) => {
      const bins = new Float32Array(640)
      const child = spawn(ffmpeg, ['-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', '1000', '-f', 's16le', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let sampleIndex = 0, carry = Buffer.alloc(0), stderr = ''
      child.stdout.on('data', chunk => {
        const data = carry.length ? Buffer.concat([carry, chunk]) : chunk
        const usable = data.length - (data.length % 2)
        for (let offset = 0; offset < usable; offset += 2) {
          const bin = Math.min(639, Math.floor((sampleIndex / 1000) / probe.duration * 640))
          bins[bin] = Math.max(bins[bin], Math.abs(data.readInt16LE(offset)) / 32768)
          sampleIndex += 1
        }
        carry = usable < data.length ? data.subarray(usable) : Buffer.alloc(0)
      })
      child.stderr.on('data', chunk => { stderr += chunk.toString() })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve(Array.from(bins)) : reject(new Error(stderr || '生成波形失败')))
    })
  }
  return { duration: probe.duration, hasAudio: probe.hasAudio, peaks }
})
ipcMain.handle('utility:hash', async (_event, { algorithm, text }) => {
  if (!['md5', 'sha1', 'sha256'].includes(String(algorithm).toLowerCase())) throw new Error('不支持的摘要算法')
  return crypto.createHash(String(algorithm).toLowerCase()).update(String(text), 'utf8').digest('hex')
})
ipcMain.handle('jobs:enqueue', (_event, request) => taskQueue.enqueue(request))
ipcMain.handle('jobs:history', () => taskQueue.readHistory())
ipcMain.handle('jobs:clear-history', async () => { await taskQueue.writeHistory([]); return true })
ipcMain.handle('jobs:delete-history', async (_event, id) => { await taskQueue.deleteHistory(String(id)); return true })
ipcMain.handle('files:show-in-folder', (_event, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('文件路径无效')
  // Open the containing directory directly. This is more reliable on Windows
  // than asking Explorer to reveal/select a specific output file.
  return fs.stat(path.dirname(filePath)).then(stat => {
    if (!stat.isDirectory()) throw new Error('目标文件夹不存在')
    return shell.openPath(path.dirname(filePath)).then(error => {
      if (error) throw new Error(error)
      return true
    })
  })
})
ipcMain.handle('shell:open-external', async (_event, value) => {
  const url = new URL(String(value))
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('只允许打开 HTTP 或 HTTPS 链接')
  await shell.openExternal(url.toString())
  return true
})
ipcMain.handle('files:save', async (_event, { name, data, directory, sourcePath }) => {
  let targetDirectory = directory
  if (!targetDirectory && sourcePath) targetDirectory = path.dirname(sourcePath)
  if (!targetDirectory) {
    const result = await dialog.showSaveDialog({ defaultPath: name })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, Buffer.from(data))
    return true
  }
  await fs.mkdir(targetDirectory, { recursive: true })
  await fs.writeFile(path.join(targetDirectory, name), Buffer.from(data))
  return true
})
app.whenReady().then(() => { registerMediaPreviewHandler(); taskQueue = new TaskQueue(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
