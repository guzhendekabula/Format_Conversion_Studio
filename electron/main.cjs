const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { TaskQueue } = require('./services/task-queue.cjs')

const devUrl = !app.isPackaged ? (process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173') : undefined
let taskQueue
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
  shell.showItemInFolder(filePath)
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
app.whenReady().then(() => { taskQueue = new TaskQueue(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
