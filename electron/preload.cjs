const { contextBridge, ipcRenderer } = require('electron')

// Sandboxed Electron preloads cannot require local files. Keep this tiny bridge
// self-contained and cover it with the production-preload renderer test.
const MEDIA_DOCK_V3_CHANNELS = Object.freeze({
  getWorkspace: 'media-dock:v3:get-workspace',
  pickLocalSource: 'media-dock:v3:pick-local-source',
  pickLocalSources: 'media-dock:v3:pick-local-sources',
  pickOutputDirectory: 'media-dock:v3:pick-output-directory',
  importAuthenticationProfile: 'media-dock:v3:import-authentication-profile',
  openAuthenticationProfilesDirectory: 'media-dock:v3:open-authentication-profiles-directory',
  openMediaCookiesResource: 'media-dock:v3:open-mediacookies-resource',
  inspectSource: 'media-dock:v3:inspect-source',
  inspectVideoQualities: 'media-dock:v3:inspect-video-qualities',
  planTask: 'media-dock:v3:plan-task',
  createTask: 'media-dock:v3:create-task',
  createTaskBatch: 'media-dock:v3:create-task-batch',
  runTask: 'media-dock:v3:run-task',
  runTaskBatch: 'media-dock:v3:run-task-batch',
  cancelTask: 'media-dock:v3:cancel-task',
  clearTaskHistory: 'media-dock:v3:clear-task-history',
  revealDeliverable: 'media-dock:v3:reveal-deliverable',
  checkRuntimeUpdates: 'media-dock:v3:check-runtime-updates',
  exportSupportDiagnostics: 'media-dock:v3:export-support-diagnostics',
  workspaceChanged: 'media-dock:v3:workspace-changed',
})

function createMediaDockV3Api(renderer) {
  return Object.freeze({
    contractVersion: 1,
    getWorkspaceSnapshot: () => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.getWorkspace),
    pickLocalSource: (currentPath) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickLocalSource, currentPath),
    pickLocalSources: (currentPath) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickLocalSources, currentPath),
    pickOutputDirectory: (currentPath) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickOutputDirectory, currentPath),
    importAuthenticationProfile: () => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.importAuthenticationProfile),
    openAuthenticationProfilesDirectory: () => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.openAuthenticationProfilesDirectory),
    openMediaCookiesResource: (resource) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.openMediaCookiesResource, resource),
    inspectSource: (input) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.inspectSource, input),
    inspectVideoQualities: (source) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.inspectVideoQualities, source),
    planTask: (input) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.planTask, input),
    createTask: (plan) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.createTask, plan),
    createTaskBatch: (plans, schedulingProfile) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.createTaskBatch, { plans, schedulingProfile }),
    runTask: (taskId) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.runTask, taskId),
    runTaskBatch: (batchId) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.runTaskBatch, batchId),
    cancelTask: (taskId) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.cancelTask, taskId),
    clearTaskHistory: () => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.clearTaskHistory),
    revealDeliverable: (deliverableId) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.revealDeliverable, deliverableId),
    checkRuntimeUpdates: () => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.checkRuntimeUpdates),
    exportSupportDiagnostics: (input) => renderer.invoke(MEDIA_DOCK_V3_CHANNELS.exportSupportDiagnostics, input),
    onWorkspaceChanged: (listener) => {
      const wrapped = (_event, snapshot) => listener(snapshot)
      renderer.on(MEDIA_DOCK_V3_CHANNELS.workspaceChanged, wrapped)
      return () => renderer.removeListener(MEDIA_DOCK_V3_CHANNELS.workspaceChanged, wrapped)
    },
  })
}

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
