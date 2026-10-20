const { app } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { runEngine } = require('./engine-runner.cjs')

const ALLOWED = new Set([
  'media.extract-audio', 'media.audio', 'media.audio-trim', 'media.video', 'media.video-trim', 'media.gif-to-video', 'media.video-to-gif', 'media.video-concat', 'media.audio-concat', 'media.video-crop',
  'image.convert', 'image.compress', 'image.resize', 'image.ico', 'image.crop',
  'pdf.pdf-to-images', 'pdf.images-to-pdf',
  'excel.xlsx-to-csv', 'excel.csv-to-xlsx', 'excel.xlsx-to-json', 'excel.json-to-xlsx',
  'word.docx-to-txt', 'word.docx-to-md',
])
const MAX_HISTORY = 2000

class TaskQueue {
  constructor() {
    this.pending = []
    this.running = false
    this.historyPath = path.join(app.getPath('userData'), 'history.json')
    this.logPath = path.join(app.getPath('userData'), 'logs', 'conversion.log')
  }

  emit(channel, payload) {
    for (const win of require('electron').BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  async readHistory() {
    try { return JSON.parse(await fs.readFile(this.historyPath, 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }

  async writeHistory(entries) {
    await fs.mkdir(path.dirname(this.historyPath), { recursive: true })
    const temp = `${this.historyPath}.tmp`
    await fs.writeFile(temp, JSON.stringify(entries.slice(0, MAX_HISTORY), null, 2), 'utf8')
    await fs.rename(temp, this.historyPath)
  }

  async deleteHistory(id) {
    const entries = await this.readHistory()
    const filtered = entries.filter(entry => entry.id !== id)
    await this.writeHistory(filtered)
    return filtered
  }

  async log(entry) {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true })
    await fs.appendFile(this.logPath, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  async addHistory(entry) {
    const entries = await this.readHistory()
    entries.unshift(entry)
    await this.writeHistory(entries)
  }

  async recordExternalOutput(name, outputPath, operation, startedAt = Date.now(), inputPath = outputPath, notify = true) {
    const file = { name, path: inputPath }
    const job = { id: randomUUID(), operation, files: [file], outputDir: path.dirname(outputPath) }
    const entry = this.makeEntry(job, [file], [outputPath], null, startedAt)
    await this.addHistory(entry)
    await this.log(entry)
    if (notify) this.emit('jobs:done', { id: job.id, status: 'done', files: [entry], elapsedMs: entry.elapsedMs, completedAt: entry.completedAt })
    return entry
  }

  enqueue(input) {
    if (!input || !ALLOWED.has(input.operation)) throw new Error('未知转换任务')
    const files = Array.isArray(input.files) ? input.files.map(file => ({ ...file, path: typeof file.path === 'string' ? path.normalize(file.path) : file.path })) : []
    if (!files.length || files.some(file => !file.path)) throw new Error('任务文件路径无效')
    const options = { ...(input.options || {}) }
    for (const key of ['outputNamesByPath', 'trimSegmentsByPath', 'targetBytesByPath', 'cropByPath']) {
      if (options[key] && typeof options[key] === 'object') {
        options[key] = Object.fromEntries(Object.entries(options[key]).map(([filePath, value]) => [path.normalize(filePath), value]))
      }
    }
    const id = randomUUID()
    const job = { id, operation: input.operation, files, options, outputDir: input.outputDir || '', createdAt: new Date().toISOString() }
    this.pending.push(job)
    this.emit('jobs:queued', { id, position: this.pending.length + (this.running ? 1 : 0), operation: job.operation, fileCount: files.length })
    void this.process()
    return { id, position: this.pending.length + (this.running ? 1 : 0) }
  }

  async process() {
    if (this.running) return
    this.running = true
    while (this.pending.length) {
      const job = this.pending.shift()
      try { await this.runJob(job) }
      catch (error) { this.emit('jobs:done', { id: job.id, status: 'error', files: [], error: error.message, detail: error.stack || error.message, elapsedMs: 0, completedAt: new Date().toISOString() }) }
    }
    this.running = false
  }

  async runJob(job) {
    const startedAt = Date.now()
    this.emit('jobs:started', { id: job.id, operation: job.operation, fileCount: job.files.length })
    const outcomes = []
    try {
      if (['pdf.images-to-pdf', 'media.video-concat', 'media.audio-concat'].includes(job.operation)) {
        await this.runGrouped(job, outcomes)
      } else {
        for (let index = 0; index < job.files.length; index += 1) {
          const file = job.files[index]
          const fileStarted = Date.now()
          this.emit('jobs:file', { id: job.id, path: file.path, name: file.name, status: 'running' })
          try {
            const result = await runEngine({ operation: job.operation, path: file.path, outputDir: job.outputDir, options: job.options }, (percent, message) => {
              const overall = Math.floor((index + Math.max(0, Math.min(100, percent || 0) / 100)) * 100 / job.files.length)
              this.emit('jobs:progress', { id: job.id, percent: overall, current: index + 1, total: job.files.length, name: file.name, message: message || `${file.name} 处理中` })
            })
            const entry = this.makeEntry(job, [file], result.outputs || [], null, fileStarted)
            outcomes.push(entry)
            await this.addHistory(entry)
            await this.log(entry)
            this.emit('jobs:file', { id: job.id, path: file.path, name: file.name, status: 'done', outputs: result.outputs || [], elapsedMs: entry.elapsedMs })
          } catch (error) {
            const entry = this.makeEntry(job, [file], [], error, fileStarted)
            outcomes.push(entry)
            await this.addHistory(entry)
            await this.log(entry)
            this.emit('jobs:file', { id: job.id, path: file.path, name: file.name, status: 'error', error: error.message, detail: error.stack || error.message, elapsedMs: entry.elapsedMs })
          }
          this.emit('jobs:progress', { id: job.id, percent: Math.floor((index + 1) * 100 / job.files.length), current: index + 1, total: job.files.length, name: file.name, message: `${index + 1}/${job.files.length} 个文件已处理` })
        }
      }
    } catch (error) {
      const entry = this.makeEntry(job, job.files, [], error, startedAt)
      outcomes.push(entry)
      await this.addHistory(entry)
      await this.log(entry)
    }
    const failed = outcomes.filter(item => item.status === 'error').length
    const summary = { id: job.id, status: failed === 0 ? 'done' : failed === outcomes.length ? 'error' : 'partial', files: outcomes, elapsedMs: Date.now() - startedAt, completedAt: new Date().toISOString() }
    this.emit('jobs:done', summary)
  }

  async runGrouped(job, outcomes) {
    const startedAt = Date.now()
    const paths = job.files.map(file => file.path)
    for (const file of job.files) this.emit('jobs:file', { id: job.id, path: file.path, name: file.name, status: 'running' })
    try {
      const result = await runEngine({ operation: job.operation, paths, outputDir: job.outputDir, options: job.options }, (percent, message) => this.emit('jobs:progress', { id: job.id, percent: Math.max(0, Math.min(100, percent || 0)), current: job.files.length, total: job.files.length, message: message || '正在合并文件' }))
      const entry = this.makeEntry(job, job.files, result.outputs || [], null, startedAt)
      outcomes.push(entry); await this.addHistory(entry); await this.log(entry)
      for (const file of job.files) this.emit('jobs:file', { id: job.id, path: file.path, name: file.name, status: 'done', outputs: result.outputs || [], elapsedMs: entry.elapsedMs })
    } catch (error) {
      const entry = this.makeEntry(job, job.files, [], error, startedAt)
      outcomes.push(entry); await this.addHistory(entry); await this.log(entry)
      for (const file of job.files) this.emit('jobs:file', { id: job.id, path: file.path, name: file.name, status: 'error', error: error.message, detail: error.stack || error.message, elapsedMs: entry.elapsedMs })
    }
  }

  makeEntry(job, files, outputs, error, startedAt) {
    return {
      id: randomUUID(), jobId: job.id, name: files.length > 1 ? job.operation === 'media.video-concat' ? `${files.length} 个视频拼接` : job.operation === 'media.audio-concat' ? `${files.length} 个音频拼接` : `${files.length} 张图片` : files[0]?.name || '转换任务',
      inputs: files.map(file => file.path), outputs, operation: job.operation,
      inputFormat: files.map(file => path.extname(file.name || file.path).slice(1).toUpperCase()).filter(Boolean).join(', '),
      outputFormat: outputs.map(file => path.extname(file).slice(1).toUpperCase()).filter(Boolean).join(', '),
      savePath: outputs.length ? path.dirname(outputs[0]) : job.outputDir || path.dirname(files[0]?.path || ''),
      status: error ? 'error' : 'done', error: error?.message || '', detail: error?.stack || '',
      startedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
    }
  }
}

module.exports = { TaskQueue }
