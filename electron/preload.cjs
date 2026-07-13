const { contextBridge, ipcRenderer } = require('electron')
const { createMediaDockV3Api } = require('./v3/preloadApi.cjs')

const appApi = {
  getPaths: () => ipcRenderer.invoke('paths:get'),
  listCookieFiles: () => ipcRenderer.invoke('cookies:list'),
  importCookieZip: () => ipcRenderer.invoke('cookies:importZip'),
  getSelfCheck: () => ipcRenderer.invoke('self-check:get'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadLatestUpdate: () => ipcRenderer.invoke('updates:downloadLatest'),
  resolveBilibiliSeason: (sourceUrl) => ipcRenderer.invoke('bilibili:resolveSeason', sourceUrl),
  resolveMediaCollection: (sourceUrl) => ipcRenderer.invoke('collections:resolve', sourceUrl),
  installDenoRuntime: () => ipcRenderer.invoke('runtime:installDeno'),
  checkRuntimeToolUpdates: () => ipcRenderer.invoke('runtime:checkToolUpdates'),
  updateYtDlpRuntime: () => ipcRenderer.invoke('runtime:updateYtDlp'),
  openMediaTools: () => ipcRenderer.invoke('window:openMediaTools'),
  pickDirectory: (currentPath) => ipcRenderer.invoke('dialog:pickDirectory', currentPath),
  pickMediaFile: (currentPath) => ipcRenderer.invoke('dialog:pickMediaFile', currentPath),
  pickMediaFiles: (currentPath) => ipcRenderer.invoke('dialog:pickMediaFiles', currentPath),
  pickSubtitleFile: (currentPath) => ipcRenderer.invoke('dialog:pickSubtitleFile', currentPath),
  exportConfig: (config) => ipcRenderer.invoke('config:export', config),
  importConfig: () => ipcRenderer.invoke('config:import'),
  startDownload: (request) => ipcRenderer.invoke('download:start', request),
  cancelDownload: () => ipcRenderer.invoke('download:cancel'),
  inspectMedia: (inputPath) => ipcRenderer.invoke('media:inspect', inputPath),
  runMediaTool: (request) => ipcRenderer.invoke('media:run', request),
  previewMediaMerge: (request) => ipcRenderer.invoke('media:merge-preview', request),
  runMediaMerge: (request) => ipcRenderer.invoke('media:merge', request),
  cancelMediaTool: () => ipcRenderer.invoke('media:cancel'),
  getSubtitleCleanupConfig: () => ipcRenderer.invoke('subtitle-cleanup:get-config'),
  saveSubtitleCleanupConfig: (config) => ipcRenderer.invoke('subtitle-cleanup:save-config', config),
  listSubtitleCleanupModels: (config) => ipcRenderer.invoke('subtitle-cleanup:list-models', config),
  testSubtitleCleanupConnection: (config) => ipcRenderer.invoke('subtitle-cleanup:test-connection', config),
  runSubtitleCleanup: (request) => ipcRenderer.invoke('subtitle-cleanup:run', request),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
  openExternal: (targetUrl) => ipcRenderer.invoke('shell:openExternal', targetUrl),
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  exportTextLog: (defaultName, content) => ipcRenderer.invoke('logs:exportText', { defaultName, content }),
  onDownloadUpdate: (listener) => {
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on('download:update', wrapped)
    return () => ipcRenderer.removeListener('download:update', wrapped)
  },
  onMediaToolsUpdate: (listener) => {
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on('media-tools:update', wrapped)
    return () => ipcRenderer.removeListener('media-tools:update', wrapped)
  },
  onCollectionLog: (listener) => {
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on('collections:log', wrapped)
    return () => ipcRenderer.removeListener('collections:log', wrapped)
  },
  onRuntimeToolUpdate: (listener) => {
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on('runtime-tools:update', wrapped)
    return () => ipcRenderer.removeListener('runtime-tools:update', wrapped)
  },
}

contextBridge.exposeInMainWorld('ytDlpApi', appApi)
contextBridge.exposeInMainWorld('appApi', appApi)
contextBridge.exposeInMainWorld('mediaDock', createMediaDockV3Api(ipcRenderer))
