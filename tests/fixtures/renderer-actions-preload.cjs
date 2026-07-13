const { contextBridge } = require('electron')

const action = process.env.MEDIA_DOCK_RENDERER_ACTION
const noopSubscription = () => () => {}
const reject = (message) => async () => {
  throw new Error(message)
}
let runtimeToolListener = null
let denoInstallCalls = 0

const appApi = {
  getPaths: async () => ({
    ytDlpPath: 'yt-dlp.exe',
    ytDlpVersion: 'test',
    ffmpegPath: 'ffmpeg.exe',
    ffprobePath: 'ffprobe.exe',
    denoPath: 'deno.exe',
    denoVersion: action === 'unrunnableDeno' ? null : 'test',
    defaultDownloadDir: 'I:\\Downloads',
    envName: 'diagnostic',
    cookiesDir: 'I:\\Media Dock Data\\cookies',
  }),
  listCookieFiles: async () => [],
  importCookieZip: async () => null,
  getSelfCheck: async () => ({
    items: action === 'ytDlpRepair' || action === 'runtimeInstallMutex' || action === 'runtimeRepairFailure'
      ? [{ key: 'yt-dlp', label: 'download-core', ok: false, health: 'invalid', detail: 'I:\\tools\\yt-dlp.exe (version probe failed)' }]
      : action === 'unrunnableDeno'
        ? [{ key: 'deno', label: 'Deno', ok: false, health: 'invalid', detail: 'I:\\tools\\deno.exe (version probe failed)' }]
      : [],
    toolsSource: 'bundled',
  }),
  checkForUpdates: async () => null,
  downloadLatestUpdate: async () => null,
  resolveBilibiliSeason: async () => null,
  resolveMediaCollection: async () => null,
  installDenoRuntime: async () => {
    if (action !== 'runtimeInstallMutex') return null
    denoInstallCalls += 1
    runtimeToolListener?.({ tool: 'deno', stage: 'downloading', message: '正在下载 Deno 2.9.2...', percent: 10 })
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { tool: 'deno', path: 'I:\\tools\\deno.exe', version: '2.9.2' }
  },
  checkRuntimeToolUpdates: async () => action === 'ytDlpRepair' || action === 'runtimeInstallMutex' || action === 'runtimeRepairFailure'
    ? {
        ytDlp: { tool: 'yt-dlp', currentVersion: null, latestVersion: '2026.07.04', updateAvailable: true, repairRequired: true, releaseUrl: null, detail: 'I:\\tools\\yt-dlp.exe' },
        deno: action === 'runtimeInstallMutex'
          ? { tool: 'deno', currentVersion: '2.3.3', latestVersion: '2.9.2', updateAvailable: true, repairRequired: false, releaseUrl: null, detail: 'deno.exe' }
          : { tool: 'deno', currentVersion: '2.9.1', latestVersion: '2.9.1', updateAvailable: false, repairRequired: false, releaseUrl: null, detail: 'deno.exe' },
      }
    : null,
  updateYtDlpRuntime: async () => {
    if (action !== 'ytDlpRepair' && action !== 'runtimeInstallMutex' && action !== 'runtimeRepairFailure') return null
    runtimeToolListener?.({ tool: 'yt-dlp', stage: 'verifying', message: '正在验证下载内核...', percent: null })
    if (action === 'runtimeRepairFailure') {
      const message = 'yt-dlp asset download failed for github.com: fetch failed · ECONNRESET'
      runtimeToolListener?.({ tool: 'yt-dlp', stage: 'error', message, percent: null })
      throw new Error(message)
    }
    await new Promise((resolve) => setTimeout(resolve, action === 'runtimeInstallMutex' ? 600 : 350))
    runtimeToolListener?.({ tool: 'yt-dlp', stage: 'installing', message: '正在安装下载内核...', percent: null })
    return { tool: 'yt-dlp', path: 'I:\\tools\\yt-dlp.exe', version: '2026.07.04' }
  },
  getRuntimeInvocationCounts: async () => ({ denoInstallCalls }),
  openMediaTools: async () => null,
  pickDirectory: action === 'pickDirectory' || action === 'mediaPickDirectory'
    ? reject('simulated Windows directory dialog failure')
    : async () => null,
  pickMediaFile: async () => null,
  pickMediaFiles: async () => [],
  pickSubtitleFile: async () => null,
  exportConfig: async () => null,
  importConfig: async () => null,
  startDownload: action === 'downloadPreflightFailure'
    ? reject('yt-dlp is damaged or cannot report its version. Use Repair yt-dlp before downloading.')
    : async () => null,
  cancelDownload: async () => null,
  inspectMedia: async () => null,
  runMediaTool: async () => null,
  previewMediaMerge: async () => null,
  runMediaMerge: async () => null,
  cancelMediaTool: async () => null,
  getSubtitleCleanupConfig: async () => ({
    baseUrl: '',
    apiKey: '',
    model: '',
    prompt: '',
    thinkingMode: 'default',
    customPresets: [],
    providerProfiles: {},
  }),
  saveSubtitleCleanupConfig: async () => null,
  listSubtitleCleanupModels: async () => [],
  testSubtitleCleanupConnection: async () => null,
  runSubtitleCleanup: async () => null,
  openPath: action === 'openPath' || action === 'mediaOpenPath'
    ? reject("Error invoking remote method 'shell:openPath': Error: Only local filesystem paths can be opened.")
    : async () => null,
  showItemInFolder: action === 'showItemInFolder'
    ? reject('simulated Windows show item failure')
    : async () => null,
  openExternal: async () => null,
  copyText: async () => null,
  exportTextLog: async () => null,
  onDownloadUpdate: (listener) => {
    if (action !== 'showItemInFolder') return noopSubscription()
    const timer = setTimeout(() => {
      listener({
        type: 'job',
        job: {
          jobId: 'renderer-action-job',
          url: 'https://example.com/media',
          title: 'Renderer action fixture',
          status: 'running',
          percent: 50,
          downloaded: '1 MiB',
          total: '2 MiB',
          speed: '1 MiB/s',
          eta: '00:01',
          outputPath: 'I:\\Downloads\\fixture.mp4',
          index: 1,
          totalJobs: 1,
        },
      })
    }, 50)
    return () => clearTimeout(timer)
  },
  onMediaToolsUpdate: noopSubscription,
  onCollectionLog: noopSubscription,
  onRuntimeToolUpdate: (listener) => {
    runtimeToolListener = listener
    const timers = []
    if (action === 'runtimeProgressDedup') {
      timers.push(setTimeout(() => {
          for (const percent of [0, 1, 2, 9, 10, 11, 19, 20, 20, 100]) {
            listener({ tool: 'deno', stage: 'downloading', message: 'DEDUP_PROGRESS', percent })
          }
        }, 50))
    }
    if (action === 'runtimeProgressSync') {
      for (const [delay, percent] of [[50, 0], [150, 5.5], [600, 12.3], [900, 100]]) {
        timers.push(setTimeout(() => {
          listener({ tool: 'yt-dlp', stage: 'downloading', message: 'SYNC_PROGRESS', percent })
        }, delay))
      }
    }
    return () => {
      for (const timer of timers) clearTimeout(timer)
      if (runtimeToolListener === listener) runtimeToolListener = null
    }
  },
}

contextBridge.exposeInMainWorld('appApi', appApi)
contextBridge.exposeInMainWorld('ytDlpApi', appApi)

let v3Workspace = {
  contractVersion: 1,
  revision: 0,
  tasks: [],
  deliverables: [],
  systemOperations: [],
}
let v3WorkspaceListener = null

const mediaDockApi = {
  contractVersion: 1,
  getWorkspaceSnapshot: async () => v3Workspace,
  pickLocalSource: async () => action === 'v3LocalFlow' ? 'I:\\素材\\field-note.wav' : null,
  pickOutputDirectory: async () => action === 'v3LocalFlow' ? 'I:\\成品' : null,
  inspectSource: async ({ path }) => action === 'v3LocalFlow'
    ? {
        status: 'ready',
        source: {
          kind: 'local-file',
          locator: path,
          displayName: 'field-note.wav',
          mediaKind: 'audio',
          durationSeconds: 5,
          formatName: 'wav',
        },
        recipes: [
          { id: 'audio-compatible', deliverableKind: 'audio', extension: 'm4a' },
          { id: 'keep-original', deliverableKind: 'source', extension: 'wav' },
        ],
      }
    : null,
  planTask: async ({ source, outputDirectory }) => ({
    planVersion: 1,
    source,
    recipe: { id: 'audio-compatible', deliverableKind: 'audio', extension: 'm4a' },
    outputDirectory,
    deliveryName: 'field-note - 音频.m4a',
    steps: [
      { id: 'verify-input', stage: 'preparing' },
      { id: 'transcode-audio', stage: 'processing', runtime: 'ffmpeg' },
      { id: 'deliver', stage: 'delivering' },
    ],
    runtimeVersions: { ffmpeg: 'fixture-ffmpeg' },
  }),
  createTask: async (plan) => {
    v3Workspace = {
      ...v3Workspace,
      revision: 1,
      tasks: [{
        id: 'task-v3-fixture',
        state: 'queued',
        stage: null,
        createdAt: '2026-07-13T06:00:00.000Z',
        updatedAt: '2026-07-13T06:00:00.000Z',
        plan,
        problem: null,
      }],
    }
    v3WorkspaceListener?.(v3Workspace)
    return v3Workspace
  },
  runTask: async () => {
    v3Workspace = {
      ...v3Workspace,
      revision: 2,
      tasks: v3Workspace.tasks.map((task) => ({ ...task, state: 'running', stage: 'processing' })),
    }
    v3WorkspaceListener?.(v3Workspace)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const task = v3Workspace.tasks[0]
    const deliveryPath = 'I:\\成品\\field-note - 音频.m4a'
    v3Workspace = {
      ...v3Workspace,
      revision: 3,
      tasks: [{ ...task, state: 'completed', stage: 'delivering', updatedAt: '2026-07-13T06:00:03.000Z' }],
      deliverables: [{
        id: 'deliverable-v3-fixture',
        taskId: task.id,
        path: deliveryPath,
        deliveryName: 'field-note - 音频.m4a',
        createdAt: '2026-07-13T06:00:03.000Z',
      }],
    }
    v3WorkspaceListener?.(v3Workspace)
    return v3Workspace
  },
  onWorkspaceChanged: (listener) => {
    v3WorkspaceListener = listener
    return () => {
      if (v3WorkspaceListener === listener) v3WorkspaceListener = null
    }
  },
}

contextBridge.exposeInMainWorld('mediaDock', mediaDockApi)
