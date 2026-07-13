const MEDIA_DOCK_V3_CHANNELS = Object.freeze({
  getWorkspace: 'media-dock:v3:get-workspace',
  pickLocalSource: 'media-dock:v3:pick-local-source',
  pickOutputDirectory: 'media-dock:v3:pick-output-directory',
  importAuthenticationProfile: 'media-dock:v3:import-authentication-profile',
  inspectSource: 'media-dock:v3:inspect-source',
  planTask: 'media-dock:v3:plan-task',
  createTask: 'media-dock:v3:create-task',
  runTask: 'media-dock:v3:run-task',
  workspaceChanged: 'media-dock:v3:workspace-changed',
})

function createMediaDockV3Api(ipcRenderer) {
  return Object.freeze({
    contractVersion: 1,
    getWorkspaceSnapshot: () => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.getWorkspace),
    pickLocalSource: (currentPath) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickLocalSource, currentPath),
    pickOutputDirectory: (currentPath) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.pickOutputDirectory, currentPath),
    importAuthenticationProfile: () => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.importAuthenticationProfile),
    inspectSource: (input) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.inspectSource, input),
    planTask: (input) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.planTask, input),
    createTask: (plan) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.createTask, plan),
    runTask: (taskId) => ipcRenderer.invoke(MEDIA_DOCK_V3_CHANNELS.runTask, taskId),
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
