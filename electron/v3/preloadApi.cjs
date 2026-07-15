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

function createMediaDockV3Api(ipcRenderer) {
  return Object.freeze({
    contractVersion: 1,
    getWorkspaceSnapshot: () => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.getWorkspace),
    pickLocalSource: (currentPath) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickLocalSource, currentPath),
    pickLocalSources: (currentPath) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickLocalSources, currentPath),
    pickOutputDirectory: (currentPath) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickOutputDirectory, currentPath),
    importAuthenticationProfile: () => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.importAuthenticationProfile),
    openAuthenticationProfilesDirectory: () => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.openAuthenticationProfilesDirectory),
    openMediaCookiesResource: (resource) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.openMediaCookiesResource, resource),
    inspectSource: (input) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.inspectSource, input),
    inspectVideoQualities: (source) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.inspectVideoQualities, source),
    planTask: (input) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.planTask, input),
    createTask: (plan) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.createTask, plan),
    createTaskBatch: (plans, schedulingProfile) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.createTaskBatch, { plans, schedulingProfile }),
    runTask: (taskId) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.runTask, taskId),
    runTaskBatch: (batchId) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.runTaskBatch, batchId),
    cancelTask: (taskId) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.cancelTask, taskId),
    clearTaskHistory: () => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.clearTaskHistory),
    revealDeliverable: (deliverableId) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.revealDeliverable, deliverableId),
    checkRuntimeUpdates: () => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.checkRuntimeUpdates),
    exportSupportDiagnostics: (input) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.exportSupportDiagnostics, input),
    onWorkspaceChanged: (listener) => {
      const wrapped = (_event, snapshot) => listener(snapshot)
      ipcRenderer.on(MEDIA_DOCK_V3_CHANNELS.workspaceChanged, wrapped)
      return () => ipcRenderer.removeListener(MEDIA_DOCK_V3_CHANNELS.workspaceChanged, wrapped)
    },
  })
}

module.exports = {
  MEDIA_DOCK_V3_CHANNELS,
  createMediaDockV3Api,
}
