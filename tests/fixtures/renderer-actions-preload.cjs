const { contextBridge } = require('electron')

const action = process.env.MEDIA_DOCK_RENDERER_ACTION
const noopSubscription = () => () => {}
const reject = (message) => async () => {
  throw new Error(message)
}
let runtimeToolListener = null
let denoInstallCalls = 0
const openedExternalUrls = []

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
  openExternal: async (url) => { openedExternalUrls.push(url) },
  getOpenedExternalUrls: async () => [...openedExternalUrls],
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

const scrollingTasks = Array.from({ length: 12 }, (_, index) => ({
  id: `task-scroll-${index + 1}`,
  state: 'completed',
  stage: 'delivering',
  createdAt: `2026-07-13T${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 10).padStart(2, '0')}:00.000Z`,
  updatedAt: `2026-07-13T${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 10 + 1).padStart(2, '0')}:00.000Z`,
  problem: null,
  plan: {
    planVersion: 1,
    source: { kind: 'network-url', locator: `https://media.example/watch?v=${index + 1}`, displayName: `山海 Episode ${index + 1}`, mediaKind: 'video', durationSeconds: 42, formatName: 'webm', sourceId: String(index + 1), serviceName: 'FixtureTV' },
    recipe: { id: 'network-video', deliverableKind: 'video', extension: 'mp4' },
    outputDirectory: 'I:\\成品',
    deliveryName: `山海 Episode ${index + 1} - 视频.mp4`,
    steps: [{ id: 'verify-input', stage: 'preparing' }, { id: 'acquire-network', stage: 'acquiring', runtime: 'yt-dlp' }, { id: 'deliver', stage: 'delivering' }],
    runtimeVersions: { ffmpeg: 'fixture', ytDlp: '2026.07.04' },
    videoQuality: { mode: 'max-height', height: 1080 },
  },
}))

let v3Workspace = {
  contractVersion: 1,
  revision: 0,
  taskBatches: action === 'v3CollectionFlow'
    ? [{ id: 'batch-z-existing', schedulingProfile: 'safe', createdAt: '2026-07-13T07:00:00.000Z', taskIds: [] }]
    : [],
  tasks: action === 'v3TaskScrolling' ? scrollingTasks : action === 'v3TaskVisibility' || action === 'v3ClearHistory' || action === 'v3DeliverableReveal' ? [{
    id: 'task-visible', state: action === 'v3ClearHistory' || action === 'v3DeliverableReveal' ? 'completed' : 'running', stage: action === 'v3ClearHistory' || action === 'v3DeliverableReveal' ? 'delivering' : 'acquiring', createdAt: '2026-07-13T10:00:00.000Z', updatedAt: '2026-07-13T10:01:00.000Z', problem: null,
    ...(action === 'v3TaskVisibility' ? { progress: { mediaKind: 'video', percent: 42.5, downloaded: '34.0MiB', total: '80.0MiB', speed: '4.2MiB/s', eta: '00:11' } } : {}),
    plan: {
      planVersion: 1,
      source: { kind: 'network-url', locator: 'https://media.example/watch?v=42', displayName: '山海 Episode 42', mediaKind: 'video', durationSeconds: 42, formatName: 'webm', sourceId: '42', serviceName: 'FixtureTV' },
      recipe: { id: 'network-video', deliverableKind: 'video', extension: 'mp4' },
      outputDirectory: 'I:\\成品', deliveryName: '山海 Episode 42 - 视频.mp4',
      steps: [{ id: 'verify-input', stage: 'preparing' }, { id: 'acquire-network', stage: 'acquiring', runtime: 'yt-dlp' }, { id: 'deliver', stage: 'delivering' }],
      runtimeVersions: { ffmpeg: 'fixture', ytDlp: '2026.07.04' }, authenticationProfileId: 'auth-profile-fixture', videoQuality: { mode: 'max-height', height: 1080 },
    },
  }] : [],
  deliverables: action === 'v3DeliverableReveal' || action === 'v3ClearHistory' ? [{ id: 'deliverable-visible', taskId: 'task-visible', path: 'I:\\成品\\山海.mp4', deliveryName: '山海.mp4', createdAt: '2026-07-13T10:00:00.000Z' }] : [],
  authenticationProfiles: action === 'v3TaskVisibility' || action === 'v3ClearHistory' ? [{ id: 'auth-profile-fixture', displayName: 'My MediaCookies', services: ['fixturetv'], health: 'ready', createdAt: '2026-07-13T09:00:00.000Z' }] : [],
  systemOperations: [],
}
let v3WorkspaceListener = null
let v3QualityInspectionCalls = 0
let v3LocalPickerCalls = 0

const mediaDockApi = {
  contractVersion: 1,
  getWorkspaceSnapshot: async () => v3Workspace,
  pickLocalSource: async () => {
    if (action === 'v3LocalFlow') return 'I:\\素材\\field-note.wav'
    if (action === 'v3MergeFlow') {
      v3LocalPickerCalls += 1
      return v3LocalPickerCalls === 1 ? 'I:\\素材\\IDM-video.mp4' : 'I:\\素材\\IDM-audio.m4a'
    }
    return null
  },
  pickLocalSources: async () => action === 'v3MergeFlow'
    ? ['I:\\素材\\IDM-video.mp4', 'I:\\素材\\IDM-audio.m4a']
    : [],
  pickOutputDirectory: async () => action === 'v3LocalFlow' || action === 'v3MergeFlow' || action === 'v3NetworkFlow' || action === 'v3MultipleLinksFlow' || action === 'v3PreflightMismatch' || action === 'v3QualitySelection' || action === 'v3CollectionFlow' ? 'I:\\成品' : null,
  importAuthenticationProfile: async () => {
    if (action !== 'v3AuthProfile') return null
    v3Workspace = {
      ...v3Workspace,
      revision: v3Workspace.revision + 1,
      authenticationProfiles: [{
        id: 'auth-profile-fixture',
        displayName: 'My MediaCookies',
        services: ['youtube'],
        health: 'ready',
        createdAt: '2026-07-13T08:00:00.000Z',
      }],
    }
    v3WorkspaceListener?.(v3Workspace)
    return v3Workspace
  },
  openMediaCookiesResource: async (resource) => {
    const urls = {
      'chrome-store': 'https://chromewebstore.google.com/detail/xf-mediacookies/pkpnjlcfhkgiapclmidlhfgjklhifcek',
      github: 'https://github.com/Yifo98/MediaCookies',
    }
    openedExternalUrls.push(urls[resource])
  },
  exportSupportDiagnostics: async () => action === 'v3SupportDiagnostics'
    ? 'I:\\Downloads\\media-dock-support-20260714.txt'
    : null,
  inspectSource: async (input) => (action === 'v3SlowInspection' && await new Promise((resolve) => setTimeout(resolve, 1800)), action === 'v3CollectionProblem'
    ? {
        status: 'needs-attention',
        problem: {
          code: 'source.collection.inspect-failed',
          category: 'source',
          stage: 'preparing',
          titleKey: 'problem.collectionInspectionFailed.title',
          summaryKey: 'problem.collectionInspectionFailed.summary',
          actions: [{ id: 'choose-source', kind: 'choose-source' }],
        },
      }
    : action === 'v3MergeFlow'
      ? input.path.includes('video')
        ? {
            status: 'ready',
            source: { kind: 'local-file', locator: input.path, displayName: 'IDM-video.mp4', mediaKind: 'video', durationSeconds: 60, startTimeSeconds: 0, formatName: 'mp4' },
            recipes: [],
          }
        : {
            status: 'ready',
            source: { kind: 'local-file', locator: input.path, displayName: 'IDM-audio.m4a', mediaKind: 'audio', durationSeconds: 60, startTimeSeconds: 0, formatName: 'm4a' },
            recipes: [],
          }
    : action === 'v3LocalFlow'
    ? {
        status: 'ready',
        source: {
          kind: 'local-file',
          locator: input.path,
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
    : action === 'v3NetworkFlow' || action === 'v3SlowInspection' || action === 'v3MultipleLinksFlow' || action === 'v3PreflightMismatch' || action === 'v3QualitySelection'
      ? {
          status: 'ready',
          source: {
            kind: 'network-url',
            locator: input.url,
            displayName: action === 'v3MultipleLinksFlow' ? `独立视频 ${new URL(input.url).searchParams.get('v')}` : '山海 Episode 42',
            mediaKind: 'video',
            durationSeconds: 42.5,
            formatName: 'webm',
            sourceId: action === 'v3MultipleLinksFlow' ? `independent-${new URL(input.url).searchParams.get('v')}` : 'public-episode-42',
            serviceName: 'FixtureTV',
          },
          recipes: [
            { id: 'network-video', deliverableKind: 'video', extension: 'mp4' },
          ],
        }
      : action === 'v3CollectionFlow' || action === 'v3CollectionGrouping' || action === 'v3EnglishCollection'
        ? {
            status: 'ready',
            source: {
              kind: 'network-collection',
              locator: input.url,
              displayName: '山海之间',
              mediaKind: 'video',
              durationSeconds: null,
              formatName: 'collection',
              collectionId: 'season-9',
              serviceName: 'Bilibili',
              groups: [{
                id: 'main',
                title: '正片',
                entries: [
                  {
                    id: '92', title: '92', subtitle: '终点之前', badge: '', defaultSelected: true,
                    source: { kind: 'network-url', locator: 'https://www.bilibili.com/bangumi/play/ep3537964', displayName: '山海之间 · 92 · 终点之前', mediaKind: 'video', durationSeconds: 49, formatName: 'unknown', sourceId: '92', serviceName: 'Bilibili' },
                  },
                  {
                    id: '93', title: '93', subtitle: '新的航线', badge: '会员', defaultSelected: true,
                    source: { kind: 'network-url', locator: 'https://www.bilibili.com/bangumi/play/ep3537965', displayName: '山海之间 · 93 · 新的航线', mediaKind: 'video', durationSeconds: 51, formatName: 'unknown', sourceId: '93', serviceName: 'Bilibili' },
                  },
                ],
              }, {
                id: 'section-pv',
                title: 'PV 与花絮',
                entries: [
                  {
                    id: 'pv-1', title: '新篇预热 PV', subtitle: '正式预告', badge: '预告', defaultSelected: false,
                    source: { kind: 'network-url', locator: 'https://www.bilibili.com/video/BV-pv-1', displayName: '山海之间 · 新篇预热 PV', mediaKind: 'video', durationSeconds: 72, formatName: 'unknown', sourceId: 'pv-1', serviceName: 'Bilibili' },
                  },
                  {
                    id: 'extra-1', title: '制作花絮', subtitle: '幕后记录', badge: '花絮', defaultSelected: false,
                    source: { kind: 'network-url', locator: 'https://www.bilibili.com/video/BV-extra-1', displayName: '山海之间 · 制作花絮', mediaKind: 'video', durationSeconds: 180, formatName: 'unknown', sourceId: 'extra-1', serviceName: 'Bilibili' },
                  },
                ],
              }, {
                id: 'section-music',
                title: '音乐',
                entries: [{
                  id: 'music-1', title: '片尾曲', subtitle: '完整音源', badge: '音乐', defaultSelected: false,
                  source: { kind: 'network-url', locator: 'https://www.bilibili.com/video/BV-music-1', displayName: '山海之间 · 片尾曲', mediaKind: 'video', durationSeconds: 240, formatName: 'unknown', sourceId: 'music-1', serviceName: 'Bilibili' },
                }],
              }],
            },
            recipes: [{ id: 'network-video', deliverableKind: 'video', extension: 'mp4' }],
          }
      : null),
  inspectVideoQualities: async (source) => {
    v3QualityInspectionCalls += 1
    return {
      availableHeights: action === 'v3CollectionGrouping' && source.sourceId === 'pv-1' ? [1440, 1080, 720] : [2160, 1080, 720],
      qualityOptions: action === 'v3CollectionGrouping' && source.sourceId === 'pv-1'
        ? [{ height: 1440, estimatedBytes: 60000000 }, { height: 1080, estimatedBytes: 40000000 }, { height: 720, estimatedBytes: 20000000 }]
        : [{ height: 2160, estimatedBytes: 80000000 }, { height: 1080, estimatedBytes: 40000000 }, { height: 720, estimatedBytes: 20000000 }],
      authenticationProfileId: action === 'v3PreflightMismatch' && v3QualityInspectionCalls > 1 ? null : 'auth-profile-fixture',
      authenticationProfileDisplayName: action === 'v3PreflightMismatch' && v3QualityInspectionCalls > 1 ? null : 'My MediaCookies',
    }
  },
  planTask: async ({ source, recipeId, outputDirectory, videoQuality }) => {
    if (action === 'v3QualitySelection' && (videoQuality?.mode !== 'max-height' || videoQuality.height !== 1080)) {
      throw new Error('Expected the 1080p video quality ceiling')
    }
    return ({
    planVersion: 1,
    source,
    recipe: source.kind === 'local-av-pair'
      ? { id: recipeId, deliverableKind: 'video', extension: recipeId === 'merge-fast' ? 'mkv' : recipeId === 'merge-resolve' ? 'mov' : 'mp4' }
      : source.kind === 'network-url'
      ? { id: 'network-video', deliverableKind: 'video', extension: 'mp4' }
      : { id: 'audio-compatible', deliverableKind: 'audio', extension: 'm4a' },
    outputDirectory,
    deliveryName: source.kind === 'local-av-pair' ? `IDM-video - 音画合并.${recipeId === 'merge-fast' ? 'mkv' : recipeId === 'merge-resolve' ? 'mov' : 'mp4'}` : source.kind === 'network-url' ? `${source.displayName} - 视频.mp4` : 'field-note - 音频.m4a',
    steps: source.kind === 'local-av-pair'
      ? [
          { id: 'verify-input', stage: 'preparing' },
          { id: 'merge-media', stage: 'processing', runtime: 'ffmpeg' },
          { id: 'deliver', stage: 'delivering' },
        ]
      : source.kind === 'network-url'
      ? [
          { id: 'verify-input', stage: 'preparing' },
          { id: 'acquire-network', stage: 'acquiring', runtime: 'yt-dlp' },
          { id: 'deliver', stage: 'delivering' },
        ]
      : [
          { id: 'verify-input', stage: 'preparing' },
          { id: 'transcode-audio', stage: 'processing', runtime: 'ffmpeg' },
          { id: 'deliver', stage: 'delivering' },
        ],
    runtimeVersions: source.kind === 'network-url'
      ? { ffmpeg: 'fixture-ffmpeg', ytDlp: '2026.07.04-fixture' }
      : { ffmpeg: 'fixture-ffmpeg' },
    ...(source.kind === 'network-url' ? { videoQuality: videoQuality ?? { mode: 'best' } } : {}),
    ...(source.kind === 'network-url' ? { authenticationProfileId: 'auth-profile-fixture' } : {}),
  })},
  revealDeliverable: async (deliverableId) => {
    if (action === 'v3DeliverableReveal' && deliverableId !== 'deliverable-visible') throw new Error('Wrong Deliverable id')
  },
  checkRuntimeUpdates: async () => ({
    ytDlp: { tool: 'yt-dlp', currentVersion: '2026.07.04', latestVersion: action === 'v3RuntimeCheck' ? '2026.08.01' : '2026.07.04', updateAvailable: action === 'v3RuntimeCheck', repairRequired: false, releaseUrl: null, detail: 'yt-dlp' },
    deno: { tool: 'deno', currentVersion: '2.9.2', latestVersion: '2.9.2', updateAvailable: false, repairRequired: false, releaseUrl: null, detail: 'deno' },
  }),
  createTask: async (plan) => {
    if (action === 'v3PreflightMismatch') throw new Error('Cookie preflight was bypassed and an invalid task reached the queue')
    if (action === 'v3QualitySelection' && v3QualityInspectionCalls < 2) throw new Error('Selected quality was not checked again before queue creation')
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
  createTaskBatch: async (plans, schedulingProfile) => {
    if (action === 'v3CollectionFlow') {
      if (schedulingProfile !== 'fast') throw new Error(`Expected three concurrent tasks, received ${schedulingProfile}`)
      if (v3QualityInspectionCalls < 3) throw new Error('Expected a fresh Cookie and quality inspection for every task in the first concurrent batch')
    }
    const createdAt = '2026-07-13T07:00:00.000Z'
    const tasks = plans.map((plan, index) => ({
      id: `task-v3-collection-${index + 1}`,
      state: 'queued',
      stage: null,
      createdAt,
      updatedAt: createdAt,
      plan,
      problem: null,
    }))
    v3Workspace = {
      ...v3Workspace,
      revision: v3Workspace.revision + 1,
      taskBatches: [
        { id: 'batch-v3-collection', schedulingProfile, createdAt, taskIds: tasks.map((task) => task.id) },
        ...v3Workspace.taskBatches,
      ],
      tasks,
    }
    v3WorkspaceListener?.(v3Workspace)
    return v3Workspace
  },
  runTask: async () => {
    v3Workspace = {
      ...v3Workspace,
      revision: 2,
      tasks: v3Workspace.tasks.map((task) => ({ ...task, state: 'running', stage: task.plan.source.kind === 'network-url' ? 'acquiring' : 'processing' })),
    }
    v3WorkspaceListener?.(v3Workspace)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const task = v3Workspace.tasks[0]
    const deliveryPath = `I:\\成品\\${task.plan.deliveryName}`
    v3Workspace = {
      ...v3Workspace,
      revision: 3,
      tasks: [{ ...task, state: 'completed', stage: 'delivering', updatedAt: '2026-07-13T06:00:03.000Z' }],
      deliverables: [{
        id: 'deliverable-v3-fixture',
        taskId: task.id,
        path: deliveryPath,
        deliveryName: task.plan.deliveryName,
        createdAt: '2026-07-13T06:00:03.000Z',
      }],
    }
    v3WorkspaceListener?.(v3Workspace)
    return v3Workspace
  },
  runTaskBatch: async (batchId) => {
    if (action === 'v3CollectionFlow' && batchId !== 'batch-v3-collection') {
      throw new Error(`Expected the newly created batch, received ${batchId}`)
    }
    v3Workspace = {
      ...v3Workspace,
      revision: v3Workspace.revision + 1,
      tasks: v3Workspace.tasks.map((task) => ({ ...task, state: 'completed', stage: 'delivering' })),
      deliverables: v3Workspace.tasks.map((task, index) => ({
        id: `deliverable-v3-collection-${index + 1}`,
        taskId: task.id,
        path: `I:\\成品\\${task.plan.deliveryName}`,
        deliveryName: task.plan.deliveryName,
        createdAt: '2026-07-13T07:00:03.000Z',
      })),
    }
    v3WorkspaceListener?.(v3Workspace)
    return v3Workspace
  },
  cancelTask: async (taskId) => {
    v3Workspace = {
      ...v3Workspace,
      revision: v3Workspace.revision + 1,
      tasks: v3Workspace.tasks.map((task) => task.id === taskId ? { ...task, state: 'cancelled', stage: null } : task),
    }
    v3WorkspaceListener?.(v3Workspace)
    return v3Workspace
  },
  clearTaskHistory: async () => {
    v3Workspace = { ...v3Workspace, revision: v3Workspace.revision + 1, tasks: [], taskBatches: [], deliverables: [] }
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
