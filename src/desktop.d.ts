export {}

declare global {
  interface Window {
    desktop?: {
      selectFiles: (extensions: string) => Promise<{ path: string; name: string; size: number }[]>
      selectDirectory: () => Promise<string | null>
      selectFolderFiles: (extensions: string) => Promise<{ path: string; name: string; size: number }[]>
      readFile: (path: string) => Promise<number[]>
      saveFile: (payload: { name: string; data: number[]; directory?: string; sourcePath?: string }) => Promise<boolean>
      getPathForFile: (file: File) => string
      hashText: (algorithm: string, text: string) => Promise<string>
      enqueueTask: (request: { operation: string; files: { path: string; name: string }[]; options?: Record<string, unknown>; outputDir?: string }) => Promise<{ id: string; position: number }>
      getHistory: () => Promise<HistoryEntry[]>
      clearHistory: () => Promise<boolean>
      deleteHistory: (id: string) => Promise<boolean>
      showItemInFolder: (path: string) => Promise<boolean>
      openExternal: (url: string) => Promise<boolean>
      onJobEvent: (channel: 'jobs:queued' | 'jobs:started' | 'jobs:progress' | 'jobs:file' | 'jobs:done', listener: (payload: JobEvent) => void) => () => void
    }
  }
  interface HistoryEntry {
    id: string; jobId: string; name: string; inputs: string[]; outputs: string[]; operation: string
    inputFormat: string; outputFormat: string; savePath?: string; status: 'done' | 'error'; error: string; detail: string
    startedAt: string; completedAt: string; elapsedMs: number
  }
  interface JobEvent {
    id: string; position?: number; operation?: string; fileCount?: number; percent?: number; current?: number; total?: number
    name?: string; message?: string; status?: 'queued' | 'running' | 'done' | 'error' | 'partial'; path?: string; outputs?: string[]
    error?: string; detail?: string; elapsedMs?: number; files?: HistoryEntry[]; completedAt?: string
  }
}
