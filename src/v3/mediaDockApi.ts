export type Language = 'zh-CN' | 'en'
export type ProductSpace = 'workbench' | 'merge' | 'tasks' | 'system'
export type MediaCookiesResource = 'chrome-store' | 'github'

export type InspectedLocalSource = Readonly<{
  kind: 'local-file'
  locator: string
  displayName: string
  mediaKind: 'video' | 'audio' | 'unknown'
  durationSeconds: number | null
  startTimeSeconds?: number | null
  formatName: string
}>

export type InspectedNetworkSource = Readonly<{
  kind: 'network-url'
  locator: string
  displayName: string
  mediaKind: 'video' | 'audio'
  durationSeconds: number | null
  formatName: string
  sourceId: string
  serviceName: string
}>

export type InspectedLocalAvPairSource = Readonly<{
  kind: 'local-av-pair'
  locator: string
  videoPath: string
  audioPath: string
  displayName: string
  mediaKind: 'video'
  durationSeconds: number | null
  formatName: 'video + audio'
}>

export type InspectedTaskSource = InspectedLocalSource | InspectedLocalAvPairSource | InspectedNetworkSource

export type InspectedNetworkCollectionSource = Readonly<{
  kind: 'network-collection'
  locator: string
  displayName: string
  mediaKind: 'video'
  durationSeconds: null
  formatName: 'collection'
  collectionId: string
  serviceName: string
  groups: readonly Readonly<{
    id: string
    title: string
    entries: readonly Readonly<{
      id: string
      title: string
      subtitle: string
      badge: string
      defaultSelected: boolean
      source: InspectedNetworkSource
    }>[]
  }>[]
}>

export type InspectedSource = InspectedTaskSource | InspectedNetworkCollectionSource

export type DeliverableRecipeOption = Readonly<{
  id: 'video-compatible' | 'audio-compatible' | 'keep-original' | 'network-video' | 'merge-fast' | 'merge-compatible' | 'merge-resolve'
  deliverableKind: 'video' | 'audio' | 'source'
  extension: string
}>

export type ProblemSnapshot = Readonly<{
  code: string
  category: string
  stage: string
  titleKey: string
  summaryKey: string
  actions: readonly Readonly<{ id: string; kind: string }>[]
}>

export type SourceInspection =
  | Readonly<{
      status: 'ready'
      source: InspectedSource
      recipes: readonly DeliverableRecipeOption[]
    }>
  | Readonly<{
      status: 'needs-attention'
      problem: ProblemSnapshot
    }>

export type TaskPlanStep = Readonly<{
  id: 'verify-input' | 'transcode-audio' | 'acquire-network' | 'merge-media' | 'deliver'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering'
  runtime?: 'ffmpeg' | 'yt-dlp'
}>

export type TaskPlan = Readonly<{
  planVersion: 1
  source: InspectedTaskSource
  recipe: DeliverableRecipeOption
  outputDirectory: string
  deliveryName: string
  steps: readonly TaskPlanStep[]
  runtimeVersions: Readonly<{ ffmpeg: string; ytDlp?: string; deno?: string }>
  authenticationProfileId?: string
  videoQuality?: VideoQualityPreference
}>

export type VideoQualityPreference = Readonly<
  { mode: 'best' }
  | { mode: 'max-height'; height: number }
>

export type VideoQualityInspection = Readonly<{
  availableHeights: readonly number[]
  qualityOptions: readonly Readonly<{ height: number; estimatedBytes: number | null }>[]
  authenticationProfileId: string | null
  authenticationProfileDisplayName: string | null
}>

export type RuntimeToolUpdateInfo = Readonly<{
  tool: 'yt-dlp' | 'deno'
  currentVersion: string | null
  latestVersion: string | null
  updateAvailable: boolean
  repairRequired: boolean
  releaseUrl: string | null
  detail: string | null
}>

export type RuntimeUpdateSnapshot = Readonly<{
  ytDlp: RuntimeToolUpdateInfo
  deno: RuntimeToolUpdateInfo
}>

export type MediaTaskSnapshot = Readonly<{
  id: string
  state: 'queued' | 'running' | 'needs-attention' | 'completed' | 'cancelled'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering' | null
  createdAt: string
  updatedAt: string
  plan: TaskPlan
  problem: ProblemSnapshot | null
  progress?: Readonly<{
    mediaKind: 'video' | 'audio' | 'media'
    percent: number
    downloaded: string
    total: string
    speed: string
    eta: string
  }>
}>

export type SchedulingProfile = 'safe' | 'balanced' | 'fast'

export type TaskBatchSnapshot = Readonly<{
  id: string
  schedulingProfile: SchedulingProfile
  createdAt: string
  taskIds: readonly string[]
}>

export type DeliverableSnapshot = Readonly<{
  id: string
  taskId: string
  path: string
  deliveryName: string
  createdAt: string
}>

export type AuthenticationProfileSnapshot = Readonly<{
  id: string
  displayName: string
  services: readonly string[]
  health: 'ready'
  createdAt: string
}>

export type WorkspaceSnapshot = Readonly<{
  contractVersion: 1
  revision: number
  taskBatches: readonly TaskBatchSnapshot[]
  tasks: readonly MediaTaskSnapshot[]
  deliverables: readonly DeliverableSnapshot[]
  authenticationProfiles: readonly AuthenticationProfileSnapshot[]
  systemOperations: readonly Readonly<{ id: string }>[]
}>

export type PlanTaskInput = Readonly<{
  source: InspectedTaskSource
  recipeId: DeliverableRecipeOption['id']
  outputDirectory: string
  language: Language
  videoQuality?: VideoQualityPreference
}>

export type MediaDockV3Api = Readonly<{
  contractVersion: 1
  getWorkspaceSnapshot(): Promise<WorkspaceSnapshot>
  pickLocalSource(currentPath?: string): Promise<string | null>
  pickLocalSources(currentPath?: string): Promise<readonly string[]>
  pickOutputDirectory(currentPath?: string): Promise<string | null>
  importAuthenticationProfile(): Promise<WorkspaceSnapshot | null>
  openMediaCookiesResource(resource: MediaCookiesResource): Promise<void>
  inspectSource(input: Readonly<{ kind: 'local-file'; path: string }> | Readonly<{ kind: 'network-url'; url: string }>): Promise<SourceInspection>
  inspectVideoQualities(source: InspectedNetworkSource): Promise<VideoQualityInspection>
  planTask(input: PlanTaskInput): Promise<TaskPlan>
  createTask(plan: TaskPlan): Promise<WorkspaceSnapshot>
  createTaskBatch(plans: readonly TaskPlan[], schedulingProfile: SchedulingProfile): Promise<WorkspaceSnapshot>
  runTask(taskId: string): Promise<WorkspaceSnapshot>
  runTaskBatch(batchId: string): Promise<WorkspaceSnapshot>
  cancelTask(taskId: string): Promise<WorkspaceSnapshot>
  clearTaskHistory(): Promise<WorkspaceSnapshot>
  revealDeliverable(deliverableId: string): Promise<void>
  checkRuntimeUpdates(): Promise<RuntimeUpdateSnapshot>
  exportSupportDiagnostics(input: Readonly<{ language: Language; recentError?: string }>): Promise<string | null>
  onWorkspaceChanged(listener: (snapshot: WorkspaceSnapshot) => void): () => void
}>

declare global {
  interface Window {
    mediaDock: MediaDockV3Api
  }
}

export function getMediaDockV3Api(): MediaDockV3Api {
  if (!window.mediaDock || window.mediaDock.contractVersion !== 1) {
    throw new Error('Media Dock 3 requires preload contract version 1.')
  }
  return window.mediaDock
}
