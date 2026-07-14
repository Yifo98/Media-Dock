import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getMediaDockV3Api,
  type InspectedLocalAvPairSource,
  type InspectedLocalSource,
  type InspectedNetworkCollectionSource,
  type InspectedNetworkSource,
  type Language,
  type MediaTaskSnapshot,
  type ProductSpace,
  type RuntimeUpdateSnapshot,
  type SourceInspection,
  type TaskPlan,
  type VideoQualityInspection,
  type WorkspaceSnapshot,
} from './mediaDockApi'
import { mediaDockMessages as messages } from './messages'
import { matchLocalAvSources } from './localAvPairing'
import './MediaDockV3App.css'

const EMPTY_WORKSPACE: WorkspaceSnapshot = Object.freeze({
  contractVersion: 1,
  revision: 0,
  taskBatches: Object.freeze([]),
  tasks: Object.freeze([]),
  deliverables: Object.freeze([]),
  authenticationProfiles: Object.freeze([]),
  systemOperations: Object.freeze([]),
})

const LANGUAGE_STORAGE_KEY = 'media-dock-v3-language'
const MERGE_RECIPE_IDS = ['merge-fast', 'merge-compatible', 'merge-resolve'] as const

function readStoredLanguage(): Language {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

function DockMark() {
  return <img className="md3-mark" src="./brand-icon.png" alt="" aria-hidden="true" />
}

function SpaceGlyph({ space }: { space: ProductSpace }) {
  const paths: Record<ProductSpace, string> = {
    workbench: 'M4 6.5h16M6.5 4v5M17.5 4v5M6 12h12v8H6z',
    merge: 'M5 6h5l2 3h7v5h-5l-2 3H5zM7 3v6M17 11v6',
    tasks: 'M6 5h12v4H6zM6 11h12v4H6zM6 17h8v3H6z',
    system: 'M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[space]} /></svg>
}

function formatDuration(seconds: number | null, language: Language) {
  if (seconds === null) return '—'
  const roundedSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(roundedSeconds / 60)
  const remaining = roundedSeconds % 60
  return language === 'zh-CN' ? `${minutes}分 ${remaining}秒` : `${minutes}m ${remaining}s`
}

function formatEstimatedBytes(bytes: number, language: Language) {
  const units = [
    { threshold: 1_000_000_000, divisor: 1_000_000_000, label: 'GB' },
    { threshold: 1_000_000, divisor: 1_000_000, label: 'MB' },
    { threshold: 1_000, divisor: 1_000, label: 'KB' },
  ]
  const unit = units.find((candidate) => bytes >= candidate.threshold) ?? { threshold: 0, divisor: 1, label: 'B' }
  const value = bytes / unit.divisor
  return `${new Intl.NumberFormat(language === 'zh-CN' ? 'zh-CN' : 'en', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value)} ${unit.label}`
}

function formatTimeDifference(seconds: number, language: Language) {
  const rounded = Math.round(seconds * 10) / 10
  return language === 'zh-CN' ? `${rounded} 秒` : `${rounded}s`
}

function taskStateLabel(task: MediaTaskSnapshot, language: Language) {
  const copy = messages[language]
  if (task.state === 'running' && task.stage) return copy.stage[task.stage]
  return copy.state[task.state]
}

export default function MediaDockV3App() {
  const api = useMemo(() => getMediaDockV3Api(), [])
  const [language, setLanguage] = useState<Language>(readStoredLanguage)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activeSpace, setActiveSpace] = useState<ProductSpace>('workbench')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE)
  const [linkMode, setLinkMode] = useState<'collection' | 'multiple'>('collection')
  const [sourcePath, setSourcePath] = useState('')
  const [multipleLinks, setMultipleLinks] = useState<readonly string[]>([''])
  const [inspection, setInspection] = useState<SourceInspection | null>(null)
  const [inspectionStartedAt, setInspectionStartedAt] = useState<number | null>(null)
  const [inspectionElapsedSeconds, setInspectionElapsedSeconds] = useState(0)
  const inspectionInFlightRef = useRef(false)
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)
  const [videoQuality, setVideoQuality] = useState<'best' | number>('best')
  const [qualityInspection, setQualityInspection] = useState<VideoQualityInspection | null>(null)
  const [downloadPreflight, setDownloadPreflight] = useState<string | null>(null)
  const [preflightProblem, setPreflightProblem] = useState<string | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [qualityUnavailable, setQualityUnavailable] = useState(false)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [concurrentTasks, setConcurrentTasks] = useState<1 | 2 | 3>(2)
  const [outputDirectory, setOutputDirectory] = useState('')
  const [plans, setPlans] = useState<readonly TaskPlan[]>([])
  const [planLoading, setPlanLoading] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [selectedEntryIds, setSelectedEntryIds] = useState<ReadonlySet<string>>(() => new Set())
  const [expandedCollectionGroupIds, setExpandedCollectionGroupIds] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [revealingDeliverableId, setRevealingDeliverableId] = useState<string | null>(null)
  const [revealedDeliverableId, setRevealedDeliverableId] = useState<string | null>(null)
  const [runtimeChecking, setRuntimeChecking] = useState(false)
  const [runtimeUpdates, setRuntimeUpdates] = useState<RuntimeUpdateSnapshot | null>(null)
  const [supportLogExporting, setSupportLogExporting] = useState(false)
  const [supportLogExported, setSupportLogExported] = useState(false)
  const [historyClearing, setHistoryClearing] = useState(false)
  const [historyClearConfirming, setHistoryClearConfirming] = useState(false)
  const [mergeSources, setMergeSources] = useState<readonly InspectedLocalSource[]>([])
  const [mergeRecipeId, setMergeRecipeId] = useState<(typeof MERGE_RECIPE_IDS)[number]>('merge-compatible')
  const [mergeOutputDirectory, setMergeOutputDirectory] = useState('')
  const [mergePlans, setMergePlans] = useState<readonly TaskPlan[]>([])
  const [mergePlanLoading, setMergePlanLoading] = useState(false)
  const [mergeBusy, setMergeBusy] = useState(false)
  const [mergeActiveTaskIds, setMergeActiveTaskIds] = useState<readonly string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const copy = messages[language]
  const inspectionRunning = inspectionStartedAt !== null

  useEffect(() => {
    document.documentElement.dataset.product = 'v3'
    document.documentElement.dataset.md3Theme = theme
    document.documentElement.lang = language === 'zh-CN' ? 'zh-CN' : 'en'
  }, [language, theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      // Keep the explicit in-memory choice when persistent storage is unavailable.
    }
  }, [language])

  useEffect(() => {
    if (inspectionStartedAt === null) return
    const updateElapsedTime = () => {
      setInspectionElapsedSeconds(Math.max(0, Math.floor((Date.now() - inspectionStartedAt) / 1_000)))
    }
    updateElapsedTime()
    const timer = window.setInterval(updateElapsedTime, 1_000)
    return () => window.clearInterval(timer)
  }, [inspectionStartedAt])

  useEffect(() => {
    let mounted = true
    void api.getWorkspaceSnapshot()
      .then((snapshot) => {
        if (mounted) setWorkspace(snapshot)
      })
      .catch((error: unknown) => {
        if (mounted) setErrorMessage(error instanceof Error ? error.message : String(error))
      })
    const unsubscribe = api.onWorkspaceChanged((snapshot) => {
      if (mounted) setWorkspace(snapshot)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [api])

  const readyInspection = inspection?.status === 'ready' ? inspection : null
  const collectionSource: InspectedNetworkCollectionSource | null = readyInspection?.source.kind === 'network-collection'
    ? readyInspection.source
    : null
  const collectionEntries = useMemo(
    () => collectionSource?.groups.flatMap((group) => group.entries) ?? [],
    [collectionSource],
  )
  const selectedEntries = collectionEntries.filter((entry) => selectedEntryIds.has(entry.source.locator))
  const completedSourceLocators = useMemo(() => new Set(workspace.tasks
    .filter((task) => task.state === 'completed')
    .map((task) => task.plan.source.locator)), [workspace.tasks])
  const validMultipleLinks = [...new Set(multipleLinks.map((link) => link.trim()).filter(Boolean))]
  const hasLinkInput = linkMode === 'collection' ? Boolean(sourcePath.trim()) : validMultipleLinks.length > 0
  const inspectionEstimate = linkMode === 'multiple'
    ? copy.inspectionEstimateMultiple
    : /(?:[?&]list=|\/playlist(?:\/|\?|$)|\/bangumi\/|\/cheese\/|\/medialist\/)/i.test(sourcePath)
      ? copy.inspectionEstimateCollection
      : copy.inspectionEstimateSingle
  const qualityProbeSource = readyInspection?.source.kind === 'network-url'
    ? readyInspection.source
    : collectionSource
      ? collectionSource.groups.find((group) => group.id === 'main')?.entries.find((entry) => selectedEntryIds.has(entry.source.locator))?.source
        ?? selectedEntries[0]?.source
        ?? null
      : null
  const authenticationProfileFingerprint = workspace.authenticationProfiles
    .map((profile) => `${profile.id}:${profile.createdAt}`)
    .join('|')
  const selectedQualityOption = qualityInspection?.qualityOptions.find((option) =>
    videoQuality === 'best' ? option.height === qualityInspection.availableHeights[0] : option.height === videoQuality) ?? null
  const qualityEstimatedBytes = useMemo(() => {
    if (!selectedQualityOption?.estimatedBytes) return null
    if (!collectionSource) return selectedQualityOption.estimatedBytes
    const probeDuration = qualityProbeSource?.durationSeconds
    const selectedDuration = selectedEntries.reduce((total, entry) => total + (entry.source.durationSeconds ?? 0), 0)
    if (probeDuration && probeDuration > 0 && selectedDuration > 0) {
      return Math.round(selectedQualityOption.estimatedBytes * selectedDuration / probeDuration)
    }
    return Math.round(selectedQualityOption.estimatedBytes * Math.max(1, selectedEntries.length))
  }, [collectionSource, qualityProbeSource, selectedEntries, selectedQualityOption])
  const plan = plans[0] ?? null
  const activeTask = activeTaskId ? workspace.tasks.find((task) => task.id === activeTaskId) ?? null : null
  const activeBatch = activeBatchId ? workspace.taskBatches.find((batch) => batch.id === activeBatchId) ?? null : null
  const activeBatchTasks = activeBatch
    ? activeBatch.taskIds.map((taskId) => workspace.tasks.find((task) => task.id === taskId)).filter((task): task is MediaTaskSnapshot => Boolean(task))
    : []
  const workCompleted = activeTask?.state === 'completed'
    || (activeBatchTasks.length > 0 && activeBatchTasks.every((task) => task.state === 'completed'))
  const workRunning = activeTask?.state === 'running' || activeBatchTasks.some((task) => task.state === 'running' || task.state === 'queued')
  const problemTask = activeTask?.problem ? activeTask : activeBatchTasks.find((task) => task.problem)
  const terminalTaskCount = workspace.tasks.filter((task) =>
    task.state === 'completed' || task.state === 'cancelled' || task.state === 'needs-attention').length
  const mergePairing = useMemo(() => matchLocalAvSources(mergeSources), [mergeSources])
  const mergePairSources = useMemo<readonly InspectedLocalAvPairSource[]>(() => mergePairing.pairs.map((pair) => Object.freeze({
    kind: 'local-av-pair',
    locator: pair.video.locator,
    videoPath: pair.video.locator,
    audioPath: pair.audio.locator,
    displayName: pair.video.displayName,
    mediaKind: 'video',
    durationSeconds: pair.video.durationSeconds,
    formatName: 'video + audio',
  })), [mergePairing.pairs])
  const mergeActiveTasks = mergeActiveTaskIds
    .map((taskId) => workspace.tasks.find((task) => task.id === taskId))
    .filter((task): task is MediaTaskSnapshot => Boolean(task))
  const mergeWorkRunning = mergeActiveTasks.some((task) => task.state === 'running' || task.state === 'queued')
  const mergeWorkCompleted = mergeActiveTasks.length > 0 && mergeActiveTasks.every((task) => task.state === 'completed')

  useEffect(() => {
    let active = true
    if (!qualityProbeSource) {
      setQualityInspection(null)
      setQualityLoading(false)
      setQualityUnavailable(false)
      return () => {
        active = false
      }
    }

    setVideoQuality('best')
    setQualityInspection(null)
    setDownloadPreflight(null)
    setPreflightProblem(null)
    setQualityUnavailable(false)
    setQualityLoading(true)
    void api.inspectVideoQualities(qualityProbeSource)
      .then((result) => {
        if (active) setQualityInspection(result)
      })
      .catch(() => {
        if (active) setQualityUnavailable(true)
      })
      .finally(() => {
        if (active) setQualityLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, authenticationProfileFingerprint, qualityProbeSource])

  useEffect(() => {
    let active = true
    if (!readyInspection || !selectedRecipe || !outputDirectory) {
      setPlans([])
      setPlanLoading(false)
      return () => {
        active = false
      }
    }

    setPlanLoading(true)
    setPlans([])
    const taskSources = readyInspection.source.kind === 'network-collection'
      ? readyInspection.source.groups
          .flatMap((group) => group.entries)
          .filter((entry) => selectedEntryIds.has(entry.source.locator))
          .map((entry) => entry.source)
      : [readyInspection.source]
    if (taskSources.length === 0) {
      setPlanLoading(false)
      return () => {
        active = false
      }
    }
    void Promise.all(taskSources.map((source) => api.planTask({
      source,
      recipeId: selectedRecipe as TaskPlan['recipe']['id'],
      outputDirectory,
      language,
      ...(source.kind === 'network-url'
        ? { videoQuality: videoQuality === 'best' ? { mode: 'best' as const } : { mode: 'max-height' as const, height: videoQuality } }
        : {}),
    }))).then((nextPlans) => {
      if (active) setPlans(nextPlans)
    }).catch((error: unknown) => {
      if (active) setErrorMessage(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (active) setPlanLoading(false)
    })

    return () => {
      active = false
    }
  }, [api, language, outputDirectory, readyInspection, selectedEntryIds, selectedRecipe, videoQuality])

  useEffect(() => {
    let active = true
    if (mergePairSources.length === 0 || !mergeOutputDirectory) {
      setMergePlans([])
      setMergePlanLoading(false)
      return () => { active = false }
    }
    setMergePlans([])
    setMergePlanLoading(true)
    void Promise.all(mergePairSources.map((source) => api.planTask({
      source,
      recipeId: mergeRecipeId,
      outputDirectory: mergeOutputDirectory,
      language,
    }))).then((nextPlans) => {
      if (active) setMergePlans(nextPlans)
    }).catch((error: unknown) => {
      if (active) setErrorMessage(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (active) setMergePlanLoading(false)
    })
    return () => { active = false }
  }, [api, language, mergeOutputDirectory, mergePairSources, mergeRecipeId])

  function clearPreparedSource() {
    setInspection(null)
    setSelectedRecipe(null)
    setVideoQuality('best')
    setQualityInspection(null)
    setDownloadPreflight(null)
    setPreflightProblem(null)
    setQualityLoading(false)
    setQualityUnavailable(false)
    setPlans([])
    setActiveTaskId(null)
    setActiveBatchId(null)
    setSelectedEntryIds(new Set())
    setExpandedCollectionGroupIds(new Set())
    setErrorMessage(null)
  }

  function resetSource(nextPath = '') {
    setSourcePath(nextPath)
    clearPreparedSource()
  }

  function updateMultipleLink(index: number, value: string) {
    setMultipleLinks((current) => current.map((link, linkIndex) => linkIndex === index ? value : link))
    clearPreparedSource()
  }

  function changeLinkMode(nextMode: 'collection' | 'multiple') {
    setLinkMode(nextMode)
    setSourcePath('')
    setMultipleLinks([''])
    clearPreparedSource()
  }

  async function inspectSource() {
    if (!hasLinkInput || inspectionInFlightRef.current) return
    inspectionInFlightRef.current = true
    setInspectionStartedAt(Date.now())
    setInspectionElapsedSeconds(0)
    setBusy(true)
    setErrorMessage(null)
    try {
      let nextInspection: SourceInspection
      if (linkMode === 'multiple') {
        const inspectedLinks = await Promise.all(validMultipleLinks.map((url) => api.inspectSource({ kind: 'network-url', url })))
        const readyLinks = inspectedLinks.filter((result): result is Extract<SourceInspection, { status: 'ready' }> =>
          result.status === 'ready' && result.source.kind === 'network-url')
        if (readyLinks.length !== validMultipleLinks.length) throw new Error(copy.collectionProblem.summary)
        const networkSources = readyLinks.map((result) => result.source).filter((source): source is InspectedNetworkSource => source.kind === 'network-url')
        const firstReady = readyLinks[0]
        if (!firstReady || networkSources.length === 0) throw new Error(copy.collectionProblem.summary)
        const multipleSource: InspectedNetworkCollectionSource = {
          kind: 'network-collection',
          locator: validMultipleLinks.join('\n'),
          displayName: copy.independentLinksTitle,
          mediaKind: 'video',
          durationSeconds: null,
          formatName: 'collection',
          collectionId: 'independent-links',
          serviceName: [...new Set(networkSources.map((source) => source.serviceName))].join(' + '),
          groups: [{
            id: 'independent-links',
            title: copy.independentLinksGroup,
            entries: networkSources.map((source, index) => ({
              id: source.sourceId || `independent-link-${index + 1}`,
              title: source.displayName,
              subtitle: source.serviceName,
              badge: '',
              defaultSelected: false,
              source,
            })),
          }],
        }
        nextInspection = { status: 'ready', source: multipleSource, recipes: firstReady.recipes }
      } else {
        nextInspection = await api.inspectSource({ kind: 'network-url', url: sourcePath.trim() })
      }
      setInspection(nextInspection)
      setSelectedRecipe(nextInspection.status === 'ready' ? nextInspection.recipes[0]?.id ?? null : null)
      setVideoQuality('best')
      setQualityInspection(null)
      setQualityUnavailable(false)
      if (nextInspection.status === 'ready' && nextInspection.source.kind === 'network-collection') {
        setSelectedEntryIds(new Set())
        const preferredGroup = nextInspection.source.groups.find((group) => group.id === 'main') ?? nextInspection.source.groups[0]
        setExpandedCollectionGroupIds(new Set(preferredGroup ? [preferredGroup.id] : []))
      } else {
        setSelectedEntryIds(new Set())
        setExpandedCollectionGroupIds(new Set())
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      inspectionInFlightRef.current = false
      setInspectionStartedAt(null)
      setInspectionElapsedSeconds(0)
      setBusy(false)
    }
  }

  async function chooseOutput() {
    setErrorMessage(null)
    const selected = await api.pickOutputDirectory(outputDirectory || undefined)
    if (selected) setOutputDirectory(selected)
  }

  async function importAuthenticationProfile() {
    setBusy(true)
    setErrorMessage(null)
    try {
      const snapshot = await api.importAuthenticationProfile()
      if (snapshot) setWorkspace(snapshot)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function openMediaCookiesPage(resource: 'chrome-store' | 'github') {
    setErrorMessage(null)
    try {
      await api.openMediaCookiesResource(resource)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function showAuthenticationSettings() {
    setActiveSpace('system')
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById('md3-authentication-settings')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      })
    })
  }

  async function chooseMergeSources() {
    setErrorMessage(null)
    const selected = await api.pickLocalSources(mergeSources[0]?.locator)
    if (selected.length === 0) return
    try {
      const results = await Promise.all(selected.map((sourcePath) => api.inspectSource({ kind: 'local-file', path: sourcePath })))
      const sources = results
        .filter((result): result is Extract<SourceInspection, { status: 'ready' }> => result.status === 'ready')
        .map((result) => result.source)
        .filter((source): source is InspectedLocalSource => source.kind === 'local-file')
      if (sources.length === 0) throw new Error(copy.mergeNoMedia)
      setMergeSources(sources)
      setMergeActiveTaskIds([])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function chooseMergeOutput() {
    setErrorMessage(null)
    const selected = await api.pickOutputDirectory(mergeOutputDirectory || undefined)
    if (selected) {
      setMergeOutputDirectory(selected)
      setMergeActiveTaskIds([])
    }
  }

  async function startMerge() {
    if (mergePlans.length === 0) return
    if (mergeWorkRunning) {
      setActiveSpace('tasks')
      return
    }
    if (mergeWorkCompleted) {
      setActiveSpace('tasks')
      return
    }
    setMergeBusy(true)
    setErrorMessage(null)
    try {
      if (mergePlans.length > 1) {
        const knownBatchIds = new Set(workspace.taskBatches.map((batch) => batch.id))
        const created = await api.createTaskBatch(mergePlans, 'safe')
        setWorkspace(created)
        const batch = created.taskBatches.find((candidate) => !knownBatchIds.has(candidate.id))
        if (!batch) throw new Error(copy.createdBatchMissing)
        setMergeActiveTaskIds(batch.taskIds)
        setWorkspace(await api.runTaskBatch(batch.id))
      } else {
        const knownTaskIds = new Set(workspace.tasks.map((task) => task.id))
        const created = await api.createTask(mergePlans[0])
        setWorkspace(created)
        const task = created.tasks.find((candidate) => !knownTaskIds.has(candidate.id))
        if (!task) throw new Error(copy.createdTaskMissing)
        setMergeActiveTaskIds([task.id])
        setWorkspace(await api.runTask(task.id))
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setMergeBusy(false)
    }
  }

  async function revealDeliverable(deliverableId: string) {
    setRevealingDeliverableId(deliverableId)
    setErrorMessage(null)
    try {
      await api.revealDeliverable(deliverableId)
      setRevealedDeliverableId(deliverableId)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setRevealingDeliverableId(null)
    }
  }

  async function checkRuntimeUpdates() {
    setRuntimeChecking(true)
    setErrorMessage(null)
    try {
      setRuntimeUpdates(await api.checkRuntimeUpdates())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setRuntimeChecking(false)
    }
  }

  async function exportSupportDiagnostics() {
    setSupportLogExporting(true)
    setSupportLogExported(false)
    try {
      const filePath = await api.exportSupportDiagnostics({
        language,
        ...(errorMessage ? { recentError: errorMessage } : {}),
      })
      setSupportLogExported(Boolean(filePath))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSupportLogExporting(false)
    }
  }

  async function clearTaskHistory() {
    if (!historyClearConfirming) {
      setHistoryClearConfirming(true)
      return
    }
    setHistoryClearing(true)
    setErrorMessage(null)
    try {
      setWorkspace(await api.clearTaskHistory())
      setHistoryClearConfirming(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setHistoryClearing(false)
    }
  }

  function toggleCollectionEntry(entryId: string) {
    setDownloadPreflight(null)
    setPreflightProblem(null)
    setSelectedEntryIds((current) => {
      const next = new Set(current)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  function toggleAllCollectionEntries() {
    setDownloadPreflight(null)
    setPreflightProblem(null)
    setSelectedEntryIds((current) => current.size === collectionEntries.length
      ? new Set()
      : new Set(collectionEntries.map((entry) => entry.source.locator)))
  }

  function toggleCollectionGroup(groupId: string) {
    setExpandedCollectionGroupIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function toggleCollectionGroupEntries(entryIds: readonly string[]) {
    setDownloadPreflight(null)
    setPreflightProblem(null)
    setSelectedEntryIds((current) => {
      const next = new Set(current)
      const allSelected = entryIds.every((entryId) => next.has(entryId))
      for (const entryId of entryIds) {
        if (allSelected) next.delete(entryId)
        else next.add(entryId)
      }
      return next
    })
  }

  async function startWork() {
    if (plans.length === 0) return
    setBusy(true)
    setErrorMessage(null)
    setPreflightProblem(null)
    try {
      const networkPlans = plans.filter((candidate): candidate is TaskPlan & Readonly<{ source: InspectedNetworkSource }> => candidate.source.kind === 'network-url')
      if (networkPlans.length > 0) {
        setPreflightLoading(true)
        const plansToCheck = networkPlans.slice(0, collectionSource ? concurrentTasks : 1)
        let latestInspections: readonly VideoQualityInspection[]
        try {
          latestInspections = await Promise.all(plansToCheck.map((candidate) => api.inspectVideoQualities(candidate.source)))
        } catch (error) {
          setPreflightProblem(copy.preflightUnavailable)
          throw error
        }
        const authenticationChanged = latestInspections.some((inspectionResult, index) =>
          inspectionResult.authenticationProfileId !== (plansToCheck[index]?.authenticationProfileId ?? null))
        if (authenticationChanged) {
          setPreflightProblem(copy.preflightAuthenticationChanged)
          throw new Error(copy.preflightAuthenticationChanged)
        }
        if (latestInspections.some((inspectionResult) => inspectionResult.availableHeights.length === 0)) {
          setPreflightProblem(copy.preflightNoQuality)
          throw new Error(copy.preflightNoQuality)
        }
        if (videoQuality !== 'best' && latestInspections.some((inspectionResult) =>
          !inspectionResult.availableHeights.some((height) => height <= videoQuality))) {
          const problem = copy.preflightQualityChanged(videoQuality)
          setPreflightProblem(problem)
          throw new Error(problem)
        }
        const firstInspection = latestInspections[0]
        if (!firstInspection) throw new Error(copy.preflightNoQuality)
        const maximumHeights = latestInspections.map((inspectionResult) => inspectionResult.availableHeights[0] ?? 0)
        const lowestMaximumHeight = Math.min(...maximumHeights)
        const highestMaximumHeight = Math.max(...maximumHeights)
        const profileNames = [...new Set(latestInspections
          .map((inspectionResult) => inspectionResult.authenticationProfileDisplayName)
          .filter((name): name is string => Boolean(name)))]
        const allAuthenticated = latestInspections.every((inspectionResult) => inspectionResult.authenticationProfileId !== null)
        const allGuest = latestInspections.every((inspectionResult) => inspectionResult.authenticationProfileId === null)
        const preflightQuality = copy.preflightQualitySummary(videoQuality, lowestMaximumHeight, highestMaximumHeight)
        const preflightSummary = allAuthenticated
          ? plansToCheck.length === 1
            ? copy.preflightProfileReady(profileNames[0] ?? copy.authenticationProfileFallback, preflightQuality)
            : copy.preflightBatchProfileReady(profileNames.join(' + ') || copy.authenticationProfileFallback, plansToCheck.length, preflightQuality)
          : allGuest
            ? plansToCheck.length === 1
              ? copy.preflightGuestReady(preflightQuality)
              : copy.preflightBatchGuestReady(plansToCheck.length, preflightQuality)
            : copy.preflightMixedReady(plansToCheck.length, preflightQuality)
        setQualityInspection(firstInspection)
        setQualityUnavailable(false)
        setDownloadPreflight(preflightSummary)
        setPreflightLoading(false)
      }
      if (collectionSource) {
        const knownBatchIds = new Set(workspace.taskBatches.map((batch) => batch.id))
        const schedulingProfile = concurrentTasks === 1 ? 'safe' : concurrentTasks === 2 ? 'balanced' : 'fast'
        const created = await api.createTaskBatch(plans, schedulingProfile)
        setWorkspace(created)
        const batch = created.taskBatches.find((candidate) => !knownBatchIds.has(candidate.id))
        if (!batch) throw new Error(copy.createdBatchMissing)
        setActiveBatchId(batch.id)
        const completed = await api.runTaskBatch(batch.id)
        setWorkspace(completed)
        setSelectedEntryIds(new Set())
        setActiveBatchId(null)
        setPlans([])
        return
      }
      const currentPlan = plans[0]
      const knownTaskIds = new Set(workspace.tasks.map((task) => task.id))
      const created = await api.createTask(currentPlan)
      setWorkspace(created)
      const task = created.tasks.find((candidate) => !knownTaskIds.has(candidate.id))
      if (!task) throw new Error(copy.createdTaskMissing)
      setActiveTaskId(task.id)
      const completed = await api.runTask(task.id)
      setWorkspace(completed)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setPreflightLoading(false)
      setBusy(false)
    }
  }

  async function runPrimaryAction() {
    if (!hasLinkInput) return
    if (!readyInspection) return await inspectSource()
    if (!outputDirectory) return
    if (workRunning) {
      setActiveSpace('tasks')
      return
    }
    if (workCompleted) {
      setActiveSpace('tasks')
      return
    }
    return await startWork()
  }

  const primaryLabel = inspectionRunning
    ? copy.inspectingSource
    : !hasLinkInput
    ? copy.enterLink
    : !readyInspection
      ? linkMode === 'multiple' ? copy.inspectAllLinks : copy.inspectSource
      : !outputDirectory
        ? copy.chooseOutputFirst
        : workCompleted
          ? copy.viewTask
          : workRunning
            ? copy.viewTask
            : busy
              ? preflightLoading ? copy.preflightChecking : copy.processing
              : collectionSource
                ? copy.startCollection(selectedEntries.length)
                : copy.start

  const primaryDisabled = inspectionRunning
    || (busy && !workRunning)
    || !hasLinkInput
    || planLoading
    || Boolean(readyInspection && !outputDirectory)
    || Boolean(collectionSource && selectedEntries.length === 0)
    || (Boolean(readyInspection && outputDirectory) && plans.length === 0 && !workCompleted)

  function renderWorkbench() {
    const authenticationProfile = workspace.authenticationProfiles[0] ?? null
    return (
      <div className="md3-workbench">
        <section className={`md3-auth-readiness${authenticationProfile ? ' is-ready' : ' is-missing'}`} aria-labelledby="md3-auth-readiness-title">
          <div className="md3-subheading">
            <span>01</span>
            <div>
              <h3 id="md3-auth-readiness-title">{copy.authenticationReadiness}</h3>
              <p>{authenticationProfile ? copy.authenticationReadyHint(authenticationProfile.displayName) : copy.authenticationMissingHint}</p>
            </div>
          </div>
          <div className="md3-auth-readiness-state"><i aria-hidden="true" /><strong>{authenticationProfile ? copy.authenticationReady : copy.authenticationMissing}</strong></div>
          {!authenticationProfile && <button type="button" onClick={showAuthenticationSettings}>{copy.authenticationSettings}</button>}
        </section>

        <section className="md3-source-dock" aria-labelledby="md3-source-title">
          <div className="md3-section-heading">
            <div><span>02</span><div><h2 id="md3-source-title">{copy.sourceDock}</h2><p>{copy.sourceHint}</p></div></div>
            {hasLinkInput && <button className="md3-quiet-button" disabled={inspectionRunning} onClick={() => { setSourcePath(''); setMultipleLinks(['']); clearPreparedSource() }} aria-label={copy.clear}>×</button>}
          </div>

          <div className="md3-link-mode" role="group" aria-label={copy.linkModeTitle}>
            <button type="button" disabled={inspectionRunning} className={linkMode === 'collection' ? 'is-selected' : ''} aria-pressed={linkMode === 'collection'} onClick={() => changeLinkMode('collection')}><strong>{copy.collectionMode}</strong><span>{copy.collectionModeHint}</span></button>
            <button type="button" disabled={inspectionRunning} className={linkMode === 'multiple' ? 'is-selected' : ''} aria-pressed={linkMode === 'multiple'} onClick={() => changeLinkMode('multiple')}><strong>{copy.multipleLinksMode}</strong><span>{copy.multipleLinksModeHint}</span></button>
          </div>

          {linkMode === 'collection' ? (
            <div className="md3-source-field">
              <span className="md3-source-orbit" aria-hidden="true" />
              <input
                value={sourcePath}
                disabled={inspectionRunning}
                onChange={(event) => resetSource(event.target.value)}
                placeholder={copy.sourcePlaceholder}
                aria-label={copy.sourceDock}
              />
            </div>
          ) : (
            <div className="md3-multi-link-list">
              {multipleLinks.map((link, index) => (
                <div className="md3-source-field" key={`multiple-link-${index}`}>
                  <span className="md3-source-orbit" aria-hidden="true" />
                  <input value={link} disabled={inspectionRunning} onChange={(event) => updateMultipleLink(index, event.target.value)} placeholder={copy.sourcePlaceholder} aria-label={`${copy.sourceDock} ${index + 1}`} />
                  {multipleLinks.length > 1 && <button type="button" disabled={inspectionRunning} className="md3-remove-link" aria-label={copy.removeLink} onClick={() => { setMultipleLinks((current) => current.filter((_, linkIndex) => linkIndex !== index)); clearPreparedSource() }}>×</button>}
                </div>
              ))}
              <button type="button" disabled={inspectionRunning} className="md3-add-link" onClick={() => { setMultipleLinks((current) => [...current, '']); clearPreparedSource() }}>＋ {copy.addAnotherLink}</button>
            </div>
          )}

          {inspectionRunning && (
            <div className="md3-inspection-loading" role="status" aria-live="polite">
              <span className="md3-inspection-spinner" aria-hidden="true"><i /></span>
              <span className="md3-inspection-copy">
                <strong>{copy.inspectingSource}</strong>
                <span>{inspectionEstimate}</span>
                {inspectionElapsedSeconds >= 30 && <small>{copy.inspectionLongWait}</small>}
              </span>
              <time>{copy.inspectionElapsed(inspectionElapsedSeconds)}</time>
              <span className="md3-inspection-track" aria-hidden="true"><i /></span>
            </div>
          )}

          {inspection?.status === 'needs-attention' && (
            <div className="md3-problem" role="status">
              <strong>{inspection.problem.code === 'source.collection.inspect-failed' ? copy.collectionProblem.title : copy.problem}</strong>
              <span>{inspection.problem.code === 'source.collection.inspect-failed' ? copy.collectionProblem.summary : copy.genericError}</span>
              <small>{inspection.problem.code}</small>
              <button type="button" onClick={() => resetSource()}>{inspection.problem.code === 'source.collection.inspect-failed' ? copy.collectionProblem.action : copy.clear}</button>
            </div>
          )}

          {readyInspection && (
            <div className="md3-source-summary">
              <div><i aria-hidden="true" /><span><strong>{copy.inspectReady}</strong><small>{readyInspection.source.displayName}</small></span></div>
              <dl>
                {collectionSource
                  ? <><div><dt>{collectionSource.collectionId === 'independent-links' ? copy.links : copy.episodes}</dt><dd>{collectionSource.collectionId === 'independent-links' ? copy.linkCount(collectionEntries.length) : copy.episodeCount(collectionEntries.length)}</dd></div><div><dt>{copy.format}</dt><dd>{collectionSource.serviceName}</dd></div></>
                  : <><div><dt>{copy.duration}</dt><dd>{formatDuration(readyInspection.source.durationSeconds, language)}</dd></div><div><dt>{copy.format}</dt><dd>{readyInspection.source.formatName}</dd></div></>}
              </dl>
            </div>
          )}

          {collectionSource && (
            <section className="md3-collection" aria-labelledby="md3-collection-title">
              <div className="md3-collection-heading">
                <div><h3 id="md3-collection-title">{copy.selectEpisodes}</h3><p>{copy.selectedEpisodes(selectedEntries.length, collectionEntries.length)}</p></div>
                <button type="button" onClick={toggleAllCollectionEntries}>
                  {selectedEntries.length === collectionEntries.length ? copy.clearSelection : copy.selectAll}
                </button>
              </div>
              <div className="md3-collection-groups">
                {collectionSource.groups.map((group) => {
                  const groupTitle = group.id === 'independent-links'
                    ? copy.independentLinksGroup
                    : group.id === 'main'
                    ? copy.collectionGroups.main
                    : group.id === 'course'
                      ? copy.collectionGroups.course
                      : group.id === 'youtube-playlist'
                        ? copy.collectionGroups.youtubePlaylist
                        : group.title
                  const groupEntryIds = group.entries.map((entry) => entry.source.locator)
                  const groupSelectedCount = groupEntryIds.filter((entryId) => selectedEntryIds.has(entryId)).length
                  const groupExpanded = expandedCollectionGroupIds.has(group.id)
                  return (
                    <section key={group.id} className="md3-collection-group">
                      <header>
                        <button
                          type="button"
                          className="md3-collection-group-toggle"
                          aria-expanded={groupExpanded}
                          onClick={() => toggleCollectionGroup(group.id)}
                        >
                          <strong>{groupTitle}</strong>
                          <span>{copy.groupSelection(groupSelectedCount, group.entries.length)} · {groupExpanded ? copy.collapseGroup : copy.expandGroup}</span>
                        </button>
                        <button
                          type="button"
                          className="md3-collection-group-action"
                          onClick={() => toggleCollectionGroupEntries(groupEntryIds)}
                        >
                          {groupSelectedCount === group.entries.length ? copy.clearGroup : copy.selectGroup}
                        </button>
                      </header>
                      {groupExpanded && (
                        <div className="md3-collection-list">
                          {group.entries.map((entry) => {
                            const downloaded = completedSourceLocators.has(entry.source.locator)
                            return (
                            <label key={`${group.id}-${entry.id}`} className={`md3-collection-entry${downloaded ? ' is-downloaded' : ''}`}>
                              <input type="checkbox" checked={selectedEntryIds.has(entry.source.locator)} onChange={() => toggleCollectionEntry(entry.source.locator)} />
                              <span><strong>{entry.title}</strong><small>{entry.subtitle || entry.source.displayName}</small></span>
                              {(downloaded || entry.badge) && <em>{downloaded ? copy.downloaded : entry.badge}</em>}
                              <time>{formatDuration(entry.source.durationSeconds, language)}</time>
                            </label>
                          )})}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </section>
          )}

          {readyInspection && (
            <div className="md3-compose-grid">
              <section className="md3-recipe-section" aria-labelledby="md3-recipe-title">
                <div className="md3-subheading"><span>03</span><div><h3 id="md3-recipe-title">{copy.recipeTitle}</h3><p>{copy.recipeHint}</p></div></div>
                <div className="md3-recipe-list">
                  {readyInspection.recipes.map((recipe) => {
                    const recipeCopy = copy.recipes[recipe.id]
                    return (
                      <label key={recipe.id} className={selectedRecipe === recipe.id ? 'is-selected' : ''}>
                        <input type="radio" name="recipe" checked={selectedRecipe === recipe.id} onChange={() => setSelectedRecipe(recipe.id)} />
                        <span><strong>{recipeCopy[0]}</strong><small>{recipeCopy[1]}</small></span>
                        <em>{recipe.extension.toUpperCase()}</em>
                      </label>
                    )
                  })}
                </div>
                {(readyInspection.source.kind === 'network-url' || readyInspection.source.kind === 'network-collection') && (
                  <>
                    <div className="md3-quality-control">
                      <div>
                        <strong>{copy.qualityTitle}</strong>
                        <small>{qualityLoading
                          ? copy.qualityLoading
                          : qualityInspection?.authenticationProfileDisplayName
                            ? copy.qualityWithProfile(qualityInspection.authenticationProfileDisplayName)
                            : qualityUnavailable
                              ? copy.qualityUnavailable
                              : copy.qualityGuest}</small>
                      </div>
                      <select
                        className="md3-quality-select"
                        value={String(videoQuality)}
                        disabled={qualityLoading}
                        aria-label={copy.qualityTitle}
                        onChange={(event) => {
                          setDownloadPreflight(null)
                          setPreflightProblem(null)
                          setVideoQuality(event.target.value === 'best' ? 'best' : Number(event.target.value))
                        }}
                      >
                        <option value="best">{copy.qualityBest}</option>
                        {qualityInspection?.qualityOptions.map((option) => (
                          <option key={option.height} value={option.height}>
                            {option.estimatedBytes
                              ? copy.qualityOptionSize(option.height, formatEstimatedBytes(option.estimatedBytes, language), Boolean(collectionSource))
                              : `${option.height}p`}
                          </option>
                        ))}
                      </select>
                      {!qualityLoading && qualityInspection && (
                        <div className="md3-quality-preview" aria-live="polite">
                          <div>
                            <span>{copy.qualityAvailable}</span>
                            <div>{qualityInspection.availableHeights.map((height) => <b key={height}>{height}p</b>)}</div>
                          </div>
                          <strong>{qualityEstimatedBytes && selectedQualityOption
                            ? collectionSource
                              ? copy.qualityEstimateCollection(selectedEntries.length, formatEstimatedBytes(qualityEstimatedBytes, language))
                              : copy.qualityEstimateSingle(selectedQualityOption.height, formatEstimatedBytes(qualityEstimatedBytes, language))
                            : copy.qualityEstimateUnavailable}</strong>
                          <small>{copy.qualityEstimateNote}</small>
                        </div>
                      )}
                    </div>
                    {collectionSource && (
                      <div className="md3-batch-control">
                        <div><strong>{copy.concurrencyTitle}</strong><small>{copy.concurrencyHint(concurrentTasks)}</small></div>
                        <div className="md3-concurrency-options" role="group" aria-label={copy.concurrencyTitle}>
                          {([1, 2, 3] as const).map((count) => (
                            <button
                              key={count}
                              type="button"
                              className={`md3-concurrency-option${concurrentTasks === count ? ' is-selected' : ''}`}
                              data-concurrency={count}
                              aria-pressed={concurrentTasks === count}
                              aria-label={copy.concurrencyOption(count)}
                              onClick={() => {
                                setDownloadPreflight(null)
                                setPreflightProblem(null)
                                setConcurrentTasks(count)
                              }}
                            >
                              <strong>{count}</strong>
                              <span>{copy.concurrencyTone(count)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {downloadPreflight && (
                      <div className="md3-preflight-result" role="status">
                        <i aria-hidden="true" />
                        <span>{downloadPreflight}</span>
                      </div>
                    )}
                    {preflightProblem && (
                      <div className="md3-preflight-result is-problem" role="alert">
                        <i aria-hidden="true" />
                        <span>{preflightProblem}</span>
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className="md3-destination-section" aria-labelledby="md3-destination-title">
                <div className="md3-subheading"><span>04</span><div><h3 id="md3-destination-title">{copy.destination}</h3><p>{copy.destinationHint}</p></div></div>
                <button className="md3-destination-picker" onClick={() => void chooseOutput()}>
                  <span>{outputDirectory || copy.chooseOutput}</span><b aria-hidden="true">↗</b>
                </button>
                {(planLoading || plan) && (
                  <div className="md3-plan-preview">
                    <span>{copy.plannedName}</span>
                    <strong>{planLoading ? copy.loadingPlan : plans.length > 1 ? copy.plannedFiles(plans.length) : plan?.deliveryName}</strong>
                  </div>
                )}
              </section>
            </div>
          )}

          {errorMessage && <div className="md3-error" role="alert"><strong>{copy.genericError}</strong><span>{copy.errorGuidance}</span><details><summary>{copy.technicalDetails}</summary><code>{errorMessage}</code></details></div>}

          <div className="md3-action-row">
            <div className="md3-flow-steps" aria-hidden="true"><span className="is-active" /> <span className={readyInspection ? 'is-active' : ''} /> <span className={activeTask || activeBatch ? 'is-active' : ''} /> <span className={workCompleted ? 'is-active' : ''} /></div>
            <button className={`md3-primary-action${inspectionRunning ? ' is-inspecting' : ''}`} disabled={primaryDisabled} onClick={() => void runPrimaryAction()}>{primaryLabel}<span aria-hidden="true">{inspectionRunning ? '•••' : '→'}</span></button>
          </div>
        </section>

      </div>
    )
  }

  async function runMergePrimaryAction() {
    if (mergePairSources.length === 0) return await chooseMergeSources()
    if (!mergeOutputDirectory) return await chooseMergeOutput()
    return await startMerge()
  }

  function renderMergeWorkbench() {
    const mergePrimaryLabel = mergePairSources.length === 0
      ? mergeSources.length > 0 ? copy.mergeReplaceFiles : copy.mergeAddFiles
      : !mergeOutputDirectory
          ? copy.chooseOutput
          : mergeWorkCompleted
            ? copy.mergeViewFile
            : mergeWorkRunning
              ? copy.mergeViewTask
              : mergeBusy
                ? copy.mergeProcessing
                : copy.mergeStart(mergePairSources.length)
    return (
      <SpacePage>
        <div className="md3-merge-workflow">
          <section className="md3-merge-import" aria-labelledby="md3-merge-import-title">
            <div className="md3-subheading"><span>01</span><div><h3 id="md3-merge-import-title">{copy.mergeAddTitle}</h3><p>{copy.mergeAddHint}</p></div></div>
            <button type="button" onClick={() => void chooseMergeSources()}>{mergeSources.length > 0 ? copy.mergeReplaceFiles : copy.mergeAddFiles}</button>
          </section>

          {mergePairing.pairs.length > 0 && (
            <section className="md3-merge-pairs" aria-label={copy.mergeMatchedPairs(mergePairing.pairs.length)}>
              <header><strong>{copy.mergeMatchedPairs(mergePairing.pairs.length)}</strong><span>{copy.mergeTimingVerified}</span></header>
              {mergePairing.pairs.map((pair) => {
                const durationDifference = formatTimeDifference(pair.durationDifferenceSeconds, language)
                const startDifference = pair.startTimeDifferenceSeconds === null ? null : formatTimeDifference(pair.startTimeDifferenceSeconds, language)
                return (
                  <article key={`${pair.video.locator}:${pair.audio.locator}`}>
                    <span>V+A</span>
                    <div><strong>{pair.video.displayName}</strong><small>{pair.audio.displayName}</small><em>{copy.mergePairVerified(durationDifference, startDifference)}</em></div>
                    <b>{formatDuration(pair.video.durationSeconds, language)}</b>
                  </article>
                )
              })}
            </section>
          )}

          {mergePairing.unmatched.length > 0 && <div className="md3-merge-unmatched" role="status">{copy.mergeUnmatched(mergePairing.unmatched.length)}</div>}

          <section className="md3-merge-presets">
            <div className="md3-subheading"><span>02</span><div><h3>{copy.mergePresetTitle}</h3><p>{copy.mergePresetHint}</p></div></div>
            <div className="md3-recipe-list">
              {MERGE_RECIPE_IDS.map((recipeId) => {
                const recipeCopy = copy.recipes[recipeId]
                const extension = recipeId === 'merge-fast' ? 'MKV' : recipeId === 'merge-resolve' ? 'MOV' : 'MP4'
                return (
                  <label key={recipeId} className={mergeRecipeId === recipeId ? 'is-selected' : ''}>
                    <input type="radio" name="merge-recipe" checked={mergeRecipeId === recipeId} onChange={() => { setMergeRecipeId(recipeId); setMergeActiveTaskIds([]) }} />
                    <span><strong>{recipeCopy[0]}</strong><small>{recipeCopy[1]}</small></span><em>{extension}</em>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="md3-merge-destination">
            <div className="md3-subheading"><span>03</span><div><h3>{copy.mergeDestinationTitle}</h3><p>{copy.mergeDestinationHint}</p></div></div>
            <button className="md3-destination-picker" onClick={() => void chooseMergeOutput()}><span>{mergeOutputDirectory || copy.chooseOutput}</span><b aria-hidden="true">↗</b></button>
            {(mergePlanLoading || mergePlans.length > 0) && <div className="md3-plan-preview"><span>{copy.plannedName}</span><strong>{mergePlanLoading ? copy.loadingPlan : mergePlans.length > 1 ? copy.plannedFiles(mergePlans.length) : mergePlans[0]?.deliveryName}</strong></div>}
          </section>

          {errorMessage && <div className="md3-error" role="alert"><strong>{copy.genericError}</strong><span>{copy.errorGuidance}</span><details><summary>{copy.technicalDetails}</summary><code>{errorMessage}</code></details></div>}
          <div className="md3-action-row"><div className="md3-flow-steps" aria-hidden="true"><span className={mergePairSources.length > 0 ? 'is-active' : ''} /><span className={mergeOutputDirectory ? 'is-active' : ''} /><span className={mergeActiveTasks.length > 0 ? 'is-active' : ''} /><span className={mergeWorkCompleted ? 'is-active' : ''} /></div><button className="md3-primary-action md3-merge-primary" disabled={mergeBusy || mergePlanLoading || Boolean(mergePairSources.length > 0 && mergeOutputDirectory && mergePlans.length !== mergePairSources.length)} onClick={() => void runMergePrimaryAction()}>{mergePrimaryLabel}<span aria-hidden="true">→</span></button></div>
          {mergeActiveTasks.length > 0 && <TaskList tasks={mergeActiveTasks} authenticationProfiles={workspace.authenticationProfiles} deliverables={workspace.deliverables} language={language} revealingDeliverableId={revealingDeliverableId} revealedDeliverableId={revealedDeliverableId} onRevealDeliverable={revealDeliverable} />}
        </div>
      </SpacePage>
    )
  }

  function renderSpace() {
    if (activeSpace === 'workbench') return renderWorkbench()
    if (activeSpace === 'merge') return renderMergeWorkbench()
    if (activeSpace === 'tasks') {
      return <SpacePage><div className="md3-history-toolbar"><div><strong>{copy.clearHistoryWarning}</strong><span>{copy.clearHistoryHint}</span></div><button className="md3-history-clear" disabled={terminalTaskCount === 0 || historyClearing} onClick={() => void clearTaskHistory()}>{historyClearing ? copy.clearingHistory : historyClearConfirming ? copy.confirmClearHistory : copy.clearHistory}</button></div>{workspace.tasks.length === 0 ? <p className="md3-empty-line">{copy.noActivity}</p> : <TaskList tasks={[...workspace.tasks].reverse()} authenticationProfiles={workspace.authenticationProfiles} deliverables={workspace.deliverables} language={language} revealingDeliverableId={revealingDeliverableId} revealedDeliverableId={revealedDeliverableId} onRevealDeliverable={revealDeliverable} />}</SpacePage>
    }
    return (
      <SpacePage>
        <div className="md3-system-list">
          <article><span>01</span><div><strong>{copy.engine}</strong><small>{copy.engineValue}</small></div><b>{copy.revision} {workspace.revision}</b></article>
          <article><span>02</span><div><strong>{copy.dataBoundary}</strong><small>{copy.dataBoundaryValue}</small></div><b>{copy.localBadge.toUpperCase()}</b></article>
          <article><span>03</span><div><strong>{copy.runtime}</strong><small>{copy.runtimeValue}</small>{runtimeUpdates && <div className="md3-runtime-results"><span>yt-dlp {runtimeUpdates.ytDlp.currentVersion ?? copy.notInstalled} → {runtimeUpdates.ytDlp.latestVersion ?? copy.unknownVersion}</span><span>Deno {runtimeUpdates.deno.currentVersion ?? copy.notInstalled}{runtimeUpdates.deno.latestVersion && runtimeUpdates.deno.latestVersion !== runtimeUpdates.deno.currentVersion ? ` → ${runtimeUpdates.deno.latestVersion}` : ''}</span></div>}</div><button className="md3-system-action" disabled={runtimeChecking} onClick={() => void checkRuntimeUpdates()}>{runtimeChecking ? copy.checkingUpdates : copy.checkUpdates}</button></article>
          <article id="md3-authentication-settings" className="md3-authentication-guide"><span>04</span><div><strong>{copy.authentication}</strong><small>{copy.authenticationValue}</small><ol>{copy.mediaCookiesSteps.map((step) => <li key={step}>{step}</li>)}</ol><div className="md3-authentication-links"><button type="button" onClick={() => void openMediaCookiesPage('chrome-store')}>{copy.openChromeStore}</button><button type="button" onClick={() => void openMediaCookiesPage('github')}>{copy.openMediaCookiesGitHub}</button></div></div><button className="md3-system-action" disabled={busy} onClick={() => void importAuthenticationProfile()}>{copy.importAuthentication}</button></article>
          <article className="md3-support-diagnostics"><span>05</span><div><strong>{copy.supportDiagnostics}</strong><small>{copy.supportDiagnosticsValue}</small><div className="md3-diagnostics-disclosure"><span>{copy.supportDiagnosticsIncludes}</span><span>{copy.supportDiagnosticsExcludes}</span>{supportLogExported && <b role="status">{copy.supportDiagnosticsExported}</b>}</div></div><button className="md3-system-action" disabled={supportLogExporting} onClick={() => void exportSupportDiagnostics()}>{supportLogExporting ? copy.exportingSupportDiagnostics : copy.exportSupportDiagnostics}</button></article>
        </div>
        {workspace.authenticationProfiles.length === 0
          ? <p className="md3-empty-line">{copy.noAuthentication}</p>
          : <div className="md3-profile-list">{workspace.authenticationProfiles.map((profile) => <article key={profile.id}><i /><div><strong>{profile.displayName}</strong><small>{profile.services.join(' · ')}</small></div><b>{profile.health.toUpperCase()}</b></article>)}</div>}
      </SpacePage>
    )
  }

  const workspaceHeading = {
    workbench: { title: copy.workbenchTitle, subtitle: copy.subtitle },
    merge: { title: copy.mergeTitle, subtitle: copy.mergeSubtitle },
    tasks: { title: copy.taskCenterTitle, subtitle: copy.taskCenterSubtitle },
    system: { title: copy.systemTitle, subtitle: copy.systemSubtitle },
  }[activeSpace]

  return (
    <div className="md3-shell">
      <aside className="md3-rail">
        <div className="md3-brand"><DockMark /><div><strong>Media Dock</strong><span>{copy.brandLine}</span></div></div>
        <nav aria-label={copy.productSpaces}>
          {(Object.keys(copy.spaces) as ProductSpace[]).map((space) => (
            <button key={space} className={activeSpace === space ? 'is-active' : ''} onClick={() => setActiveSpace(space)}><SpaceGlyph space={space} /><span>{copy.spaces[space]}</span></button>
          ))}
        </nav>
        <div className="md3-rail-footer">
          <button className="md3-inspector-toggle" title={copy.inspector} aria-label={copy.inspector} onClick={() => setInspectorOpen((open) => !open)} aria-pressed={inspectorOpen}><span aria-hidden="true">⌁</span>{copy.inspector}</button>
          <div><button className="md3-language-toggle" onClick={() => setLanguage((current) => current === 'zh-CN' ? 'en' : 'zh-CN')}>中/EN</button><button onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}>{theme === 'light' ? copy.dark : copy.light}</button></div>
        </div>
      </aside>

      <main className="md3-main">
        <div className="md3-workspace-shell">
          <header className="md3-workspace-header">
            <div className="md3-workspace-heading">
              <p>{copy.eyebrow}</p>
              <h1>{workspaceHeading.title}</h1>
              <span>{workspaceHeading.subtitle}</span>
            </div>
            <nav className="md3-space-map" aria-label={copy.productSpaces}>
              {(Object.keys(copy.spaces) as ProductSpace[]).map((space) => (
                <button
                  key={space}
                  type="button"
                  className={space === activeSpace ? 'is-active' : ''}
                  aria-current={space === activeSpace ? 'page' : undefined}
                  onClick={() => setActiveSpace(space)}
                >
                  <SpaceGlyph space={space} />
                  <span><strong>{copy.spaces[space]}</strong><small>{copy.spaceDescriptions[space]}</small></span>
                </button>
              ))}
            </nav>
          </header>
          {renderSpace()}
        </div>
      </main>

      {inspectorOpen && (
        <aside className="md3-inspector" aria-label={copy.inspector}>
          <header><div><span>{copy.inspectorContext}</span><h2>{copy.inspector}</h2></div><button onClick={() => setInspectorOpen(false)} aria-label={copy.close}>×</button></header>
          {!readyInspection && !activeTask && !activeBatch ? <p>{copy.emptyInspector}</p> : (
            <div className="md3-inspector-content">
              {readyInspection && <section><span>{copy.inspectorSource}</span><strong>{readyInspection.source.displayName}</strong><small title={readyInspection.source.locator}>{readyInspection.source.locator}</small></section>}
              {plan && <section><span>{copy.plan.toUpperCase()}</span><strong>{plans.length > 1 ? copy.plannedFiles(plans.length) : plan.deliveryName}</strong><small>{plan.outputDirectory}</small><h3>{copy.steps}</h3><ol>{plan.steps.map((step) => <li key={step.id}><i />{copy.stage[step.stage]}</li>)}</ol><code>{plan.runtimeVersions.ytDlp ? `yt-dlp · ${plan.runtimeVersions.ytDlp} / ` : ''}FFmpeg · {plan.runtimeVersions.ffmpeg}</code></section>}
              {problemTask?.problem && <section className="is-problem"><span>{copy.problem.toUpperCase()}</span><strong>{problemTask.problem.code}</strong></section>}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

function SpacePage({ children }: { children: React.ReactNode }) {
  return <div className="md3-space-page"><section>{children}</section></div>
}

function TaskList({
  tasks,
  authenticationProfiles,
  deliverables,
  language,
  revealingDeliverableId,
  revealedDeliverableId,
  onRevealDeliverable,
}: {
  tasks: readonly MediaTaskSnapshot[]
  authenticationProfiles: WorkspaceSnapshot['authenticationProfiles']
  deliverables: WorkspaceSnapshot['deliverables']
  language: Language
  revealingDeliverableId: string | null
  revealedDeliverableId: string | null
  onRevealDeliverable: (deliverableId: string) => Promise<void>
}) {
  const copy = messages[language]
  return <div className="md3-task-list">{tasks.map((task) => {
    const activeStepIndex = task.stage ? task.plan.steps.findIndex((step) => step.stage === task.stage) : -1
    const completed = task.state === 'completed'
    const profile = task.plan.authenticationProfileId
      ? authenticationProfiles.find((candidate) => candidate.id === task.plan.authenticationProfileId)
      : null
    const deliverable = completed ? deliverables.find((candidate) => candidate.taskId === task.id) ?? null : null
    const downloadProgress = task.state === 'running' ? task.progress : null
    const isKnownProgressValue = (value: string) => !['', '--', 'NA', 'N/A'].includes(value.trim().toUpperCase())
    const progressDetails = downloadProgress ? [
      copy.progressKind[downloadProgress.mediaKind],
      `${downloadProgress.percent.toFixed(1)}%`,
      isKnownProgressValue(downloadProgress.downloaded) && isKnownProgressValue(downloadProgress.total)
        ? `${downloadProgress.downloaded} / ${downloadProgress.total}`
        : isKnownProgressValue(downloadProgress.downloaded) ? downloadProgress.downloaded : null,
      isKnownProgressValue(downloadProgress.speed) ? downloadProgress.speed : null,
      isKnownProgressValue(downloadProgress.eta) ? `${copy.remaining} ${downloadProgress.eta}` : null,
    ].filter((value): value is string => value !== null) : []
    const sourceStatus = task.plan.source.kind === 'local-file'
      ? copy.taskLocalSource
      : task.plan.source.kind === 'local-av-pair'
        ? copy.taskMergedSource
        : profile
          ? copy.taskUsesProfile(profile.displayName)
          : copy.taskGuestMode
    return <article key={task.id}><div className={`md3-task-state is-${task.state}`}><i /><span>{taskStateLabel(task, language)}</span></div><div className="md3-task-copy"><strong>{task.plan.deliveryName}</strong><small title={task.plan.source.locator}>{task.plan.source.displayName}</small><div className="md3-task-meta"><span>{sourceStatus}</span>{task.plan.videoQuality && <span>{task.plan.videoQuality.mode === 'best' ? copy.qualityBest : `${task.plan.videoQuality.height}p`}</span>}</div>{downloadProgress ? <div className="md3-task-download-progress" role="progressbar" aria-label={copy.downloadProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress.percent}><i><span style={{ width: `${downloadProgress.percent}%` }} /></i><small>{progressDetails.join(' · ')}</small></div> : <div className="md3-task-progress" role="progressbar" aria-label={copy.taskProgress} aria-valuemin={0} aria-valuemax={task.plan.steps.length} aria-valuenow={completed ? task.plan.steps.length : Math.max(0, activeStepIndex + 1)}>{task.plan.steps.map((step, index) => <span key={step.id} className={completed || index < activeStepIndex ? 'is-complete' : index === activeStepIndex ? 'is-current' : ''} />)}</div>}</div><div className="md3-task-actions"><time>{new Date(task.updatedAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}</time>{deliverable && <button type="button" disabled={revealingDeliverableId === deliverable.id} onClick={() => void onRevealDeliverable(deliverable.id)}>{revealedDeliverableId === deliverable.id ? copy.revealedInFolder : revealingDeliverableId === deliverable.id ? copy.openingFolder : copy.revealInFolder}</button>}</div></article>
  })}</div>
}
