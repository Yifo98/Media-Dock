const { contextBridge } = require('electron')

const action = process.env.MEDIA_DOCK_RENDERER_ACTION
const noopSubscription = () => () => {}
const reject = (message) => async () => {
  throw new Error(message)
}
let runtimeToolListener = null

const appApi = {
  getPaths: async () => ({
    ytDlpPath: 'yt-dlp.exe',
    ytDlpVersion: 'test',
    ffmpegPath: 'ffmpeg.exe',
    ffprobePath: 'ffprobe.exe',
    denoPath: 'deno.exe',
    denoVersion: 'test',
    defaultDownloadDir: 'I:\\Downloads',
    envName: 'diagnostic',
    cookiesDir: 'I:\\Media Dock Data\\cookies',
  }),
  listCookieFiles: async () => [],
  importCookieZip: async () => null,
  getSelfCheck: async () => ({
    items: action === 'ytDlpRepair'
      ? [{ key: 'yt-dlp', label: 'download-core', ok: false, health: 'invalid', detail: 'I:\\tools\\yt-dlp.exe (version probe failed)' }]
      : [],
    toolsSource: 'bundled',
  }),
  checkForUpdates: async () => null,
  downloadLatestUpdate: async () => null,
  resolveBilibiliSeason: async () => null,
  resolveMediaCollection: async () => null,
  installDenoRuntime: async () => null,
  checkRuntimeToolUpdates: async () => action === 'ytDlpRepair'
    ? {
        ytDlp: { tool: 'yt-dlp', currentVersion: null, latestVersion: '2026.07.04', updateAvailable: true, repairRequired: true, releaseUrl: null, detail: 'I:\\tools\\yt-dlp.exe' },
        deno: { tool: 'deno', currentVersion: '2.9.1', latestVersion: '2.9.1', updateAvailable: false, repairRequired: false, releaseUrl: null, detail: 'deno.exe' },
      }
    : null,
  updateYtDlpRuntime: async () => {
    if (action !== 'ytDlpRepair') return null
    runtimeToolListener?.({ tool: 'yt-dlp', stage: 'verifying', message: '正在验证下载内核...', percent: null })
    await new Promise((resolve) => setTimeout(resolve, 350))
    runtimeToolListener?.({ tool: 'yt-dlp', stage: 'installing', message: '正在安装下载内核...', percent: null })
    return { tool: 'yt-dlp', path: 'I:\\tools\\yt-dlp.exe', version: '2026.07.04' }
  },
  openMediaTools: async () => null,
  pickDirectory: action === 'pickDirectory' || action === 'mediaPickDirectory'
    ? reject('simulated Windows directory dialog failure')
    : async () => null,
  pickMediaFile: async () => null,
  pickMediaFiles: async () => [],
  pickSubtitleFile: async () => null,
  exportConfig: async () => null,
  importConfig: async () => null,
  startDownload: async () => null,
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
    return () => {
      if (runtimeToolListener === listener) runtimeToolListener = null
    }
  },
}

contextBridge.exposeInMainWorld('appApi', appApi)
contextBridge.exposeInMainWorld('ytDlpApi', appApi)
