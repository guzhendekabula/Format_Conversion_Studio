const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  selectFiles: (extensions) => ipcRenderer.invoke('files:select', String(extensions || '').split(',').map(x => x.replace(/^\./, ''))),
  selectDirectory: () => ipcRenderer.invoke('directory:select'),
  selectFolderFiles: (extensions) => ipcRenderer.invoke('folder:select', String(extensions || '').split(',').map(x => x.replace(/^\./, ''))),
  readFile: (filePath) => ipcRenderer.invoke('files:read', filePath),
  saveFile: (payload) => ipcRenderer.invoke('files:save', payload),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  hashText: (algorithm, text) => ipcRenderer.invoke('utility:hash', { algorithm, text }),
  enqueueTask: (request) => ipcRenderer.invoke('jobs:enqueue', request),
  getHistory: () => ipcRenderer.invoke('jobs:history'),
  clearHistory: () => ipcRenderer.invoke('jobs:clear-history'),
  deleteHistory: (id) => ipcRenderer.invoke('jobs:delete-history', id),
  showItemInFolder: (filePath) => ipcRenderer.invoke('files:show-in-folder', filePath),
  onJobEvent: (channel, listener) => {
    const allowed = new Set(['jobs:queued', 'jobs:started', 'jobs:progress', 'jobs:file', 'jobs:done'])
    if (!allowed.has(channel)) throw new Error('Invalid event channel')
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
})
