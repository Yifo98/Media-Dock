export type Language = 'zh-CN' | 'en'
export type ProductSpace = 'workbench' | 'tasks' | 'deliverables' | 'system'

export type InspectedLocalSource = Readonly<{
  kind: 'local-file'
  locator: string
  displayName: string
  mediaKind: 'video' | 'audio' | 'unknown'
  durationSeconds: number | null
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

export type InspectedSource = InspectedLocalSource | InspectedNetworkSource

export type DeliverableRecipeOption = Readonly<{
  id: 'video-compatible' | 'audio-compatible' | 'keep-original' | 'network-video'
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
  id: 'verify-input' | 'transcode-audio' | 'acquire-network' | 'deliver'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering'
  runtime?: 'ffmpeg' | 'yt-dlp'
}>

export type TaskPlan = Readonly<{
  planVersion: 1
  source: InspectedSource
  recipe: DeliverableRecipeOption
  outputDirectory: string
  deliveryName: string
  steps: readonly TaskPlanStep[]
  runtimeVersions: Readonly<{ ffmpeg: string; ytDlp?: string }>
}>

export type MediaTaskSnapshot = Readonly<{
  id: string
  state: 'queued' | 'running' | 'needs-attention' | 'completed' | 'cancelled'
  stage: 'preparing' | 'acquiring' | 'processing' | 'delivering' | null
  createdAt: string
  updatedAt: string
  plan: TaskPlan
  problem: ProblemSnapshot | null
}>

export type DeliverableSnapshot = Readonly<{
  id: string
  taskId: string
  path: string
  deliveryName: string
  createdAt: string
}>

export type WorkspaceSnapshot = Readonly<{
  contractVersion: 1
  revision: number
  tasks: readonly MediaTaskSnapshot[]
  deliverables: readonly DeliverableSnapshot[]
  systemOperations: readonly Readonly<{ id: string }>[]
}>

export type PlanTaskInput = Readonly<{
  source: InspectedSource
  recipeId: DeliverableRecipeOption['id']
  outputDirectory: string
  language: Language
}>

export type MediaDockV3Api = Readonly<{
  contractVersion: 1
  getWorkspaceSnapshot(): Promise<WorkspaceSnapshot>
  pickLocalSource(currentPath?: string): Promise<string | null>
  pickOutputDirectory(currentPath?: string): Promise<string | null>
  inspectSource(input: Readonly<{ kind: 'local-file'; path: string }> | Readonly<{ kind: 'network-url'; url: string }>): Promise<SourceInspection>
  planTask(input: PlanTaskInput): Promise<TaskPlan>
  createTask(plan: TaskPlan): Promise<WorkspaceSnapshot>
  runTask(taskId: string): Promise<WorkspaceSnapshot>
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
