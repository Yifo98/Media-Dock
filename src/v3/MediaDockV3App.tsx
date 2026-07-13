import { useEffect, useMemo, useState } from 'react'

import {
  getMediaDockV3Api,
  type Language,
  type MediaTaskSnapshot,
  type ProductSpace,
  type SourceInspection,
  type TaskPlan,
  type WorkspaceSnapshot,
} from './mediaDockApi'
import './MediaDockV3App.css'

const EMPTY_WORKSPACE: WorkspaceSnapshot = Object.freeze({
  contractVersion: 1,
  revision: 0,
  tasks: Object.freeze([]),
  deliverables: Object.freeze([]),
  systemOperations: Object.freeze([]),
})

const messages = {
  'zh-CN': {
    brandLine: '本地媒体工作台',
    spaces: { workbench: '工作台', tasks: '任务中心', deliverables: '成品库', system: '系统中心' },
    inspector: '专业检查器',
    light: '浅色',
    dark: '深色',
    eyebrow: 'MEDIA DOCK 3 · 创作视图',
    title: '让来源抵达成品。',
    subtitle: '添加公开链接或本地媒体，Media Dock 会先理解内容，再为你组织可靠的处理与交付。',
    sourceDock: '来源入口',
    sourceHint: '公开单条链接和本地音视频会在这里进入同一条媒体流程。',
    sourcePlaceholder: '粘贴公开链接，或选择本地音视频…',
    browse: '浏览',
    clear: '清除来源',
    chooseSource: '选择本地媒体',
    inspectSource: '检查来源',
    chooseOutput: '选择成品位置',
    start: '开始处理',
    processing: '正在处理…',
    viewDeliverable: '查看成品',
    inspectReady: '来源已就绪',
    duration: '时长',
    format: '格式',
    recipeTitle: '想得到什么成品？',
    recipeHint: '你只选择结果，Media Dock 会负责底层处理步骤。',
    recipes: {
      'video-compatible': ['兼容性视频', '适合常见播放器和剪辑软件的 MP4。'],
      'audio-compatible': ['通用音频', '转换为清晰、易分享的 M4A。'],
      'keep-original': ['保留原始媒体', '不改变媒体内容，安全交付一份原格式成品。'],
      'network-video': ['通用网络视频', '获取公开链接并交付常用播放器可用的 MP4。'],
    },
    destination: '成品位置',
    destinationHint: '任务会在目标磁盘使用隔离暂存区，验证完成后才显示最终文件。',
    plannedName: '计划交付',
    loadingPlan: '正在准备任务计划…',
    recentActivity: '当前活动',
    noActivity: '还没有任务。添加来源后，处理进度会在这里出现。',
    taskCenterTitle: '任务中心',
    taskCenterSubtitle: '所有任务都从权威快照恢复，不再依赖界面日志猜测状态。',
    deliverablesTitle: '成品库',
    deliverablesSubtitle: 'Media Dock 只保存索引，媒体文件仍由你掌管。',
    noDeliverables: '完成第一个任务后，成品会出现在这里。',
    systemTitle: '系统中心',
    systemSubtitle: '运行环境、认证、存储和诊断会集中在这里。',
    engine: '任务引擎',
    engineValue: '契约 v1 · SQLite 工作区',
    revision: '工作区版本',
    dataBoundary: '数据边界',
    dataBoundaryValue: 'Media Dock Data/v3 · 与 2.1.2 隔离',
    runtime: '本地媒体运行环境',
    runtimeValue: 'FFmpeg + FFprobe · 启动时验证',
    emptyInspector: '选择来源或任务后，这里会显示计划、工具版本和诊断证据。',
    plan: '任务计划',
    steps: '处理步骤',
    problem: '需要处理',
    genericError: '这一步没有完成。请检查下面的信息后重试。',
    stage: { preparing: '准备', acquiring: '获取', processing: '处理', delivering: '交付' },
    state: { queued: '等待中', running: '处理中', 'needs-attention': '需要处理', completed: '已完成', cancelled: '已取消' },
  },
  en: {
    brandLine: 'Local media workspace',
    spaces: { workbench: 'Workbench', tasks: 'Task Center', deliverables: 'Deliverables', system: 'System Center' },
    inspector: 'Expert Inspector',
    light: 'Light',
    dark: 'Dark',
    eyebrow: 'MEDIA DOCK 3 · CREATOR VIEW',
    title: 'Bring every source to shore.',
    subtitle: 'Add a public link or local media. Media Dock understands it first, then organizes dependable processing and delivery.',
    sourceDock: 'Source Dock',
    sourceHint: 'Public single-item links and local media enter one dependable flow here.',
    sourcePlaceholder: 'Paste a public link or choose local media…',
    browse: 'Browse',
    clear: 'Clear source',
    chooseSource: 'Choose local media',
    inspectSource: 'Inspect source',
    chooseOutput: 'Choose deliverable location',
    start: 'Start processing',
    processing: 'Processing…',
    viewDeliverable: 'View deliverable',
    inspectReady: 'Source ready',
    duration: 'Duration',
    format: 'Format',
    recipeTitle: 'What would you like to make?',
    recipeHint: 'Choose the outcome. Media Dock owns the underlying processing steps.',
    recipes: {
      'video-compatible': ['Compatible video', 'An MP4 for common players and editing tools.'],
      'audio-compatible': ['Universal audio', 'A clear, shareable M4A deliverable.'],
      'keep-original': ['Keep original media', 'Deliver the original format without changing its content.'],
      'network-video': ['Universal network video', 'Acquire a public link and deliver a broadly compatible MP4.'],
    },
    destination: 'Deliverable location',
    destinationHint: 'The task stages on the target volume and reveals the final name only after verification.',
    plannedName: 'Planned delivery',
    loadingPlan: 'Preparing Task Plan…',
    recentActivity: 'Current activity',
    noActivity: 'No tasks yet. Activity appears here after you add a Source.',
    taskCenterTitle: 'Task Center',
    taskCenterSubtitle: 'Every task recovers from the authoritative snapshot instead of inferred log state.',
    deliverablesTitle: 'Deliverable Library',
    deliverablesSubtitle: 'Media Dock stores an index. Your media remains yours.',
    noDeliverables: 'Your first completed task will appear here.',
    systemTitle: 'System Center',
    systemSubtitle: 'Runtimes, authentication, storage, and diagnostics live here.',
    engine: 'Task Engine',
    engineValue: 'Contract v1 · SQLite workspace',
    revision: 'Workspace revision',
    dataBoundary: 'Data boundary',
    dataBoundaryValue: 'Media Dock Data/v3 · isolated from 2.1.2',
    runtime: 'Local media runtime',
    runtimeValue: 'FFmpeg + FFprobe · verified at launch',
    emptyInspector: 'Select a Source or task to inspect its plan, runtime versions, and diagnostic evidence.',
    plan: 'Task Plan',
    steps: 'Processing steps',
    problem: 'Needs attention',
    genericError: 'This step did not finish. Review the information below and try again.',
    stage: { preparing: 'Preparing', acquiring: 'Acquiring', processing: 'Processing', delivering: 'Delivering' },
    state: { queued: 'Queued', running: 'Running', 'needs-attention': 'Needs Attention', completed: 'Completed', cancelled: 'Cancelled' },
  },
} as const

function DockMark() {
  return (
    <svg className="md3-mark" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="md3-mark-gradient" x1="36" y1="7" x2="50" y2="55" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8edce7" />
          <stop offset="1" stopColor="#a78bd8" />
        </linearGradient>
      </defs>
      <path d="M29 10C17 11 9 20 9 32c0 13 8 22 20 23" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <path d="M36 10c11 2 19 11 19 22 0 9-5 17-13 21" fill="none" stroke="url(#md3-mark-gradient)" strokeWidth="10" strokeLinecap="round" />
      <rect x="25.5" y="25.5" width="13" height="13" rx="3.5" transform="rotate(45 32 32)" fill="#f5d89b" />
    </svg>
  )
}

function SpaceGlyph({ space }: { space: ProductSpace }) {
  const paths: Record<ProductSpace, string> = {
    workbench: 'M4 6.5h16M6.5 4v5M17.5 4v5M6 12h12v8H6z',
    tasks: 'M6 5h12v4H6zM6 11h12v4H6zM6 17h8v3H6z',
    deliverables: 'M4 8h6l2 2h8v10H4zM8 4h8v4H8z',
    system: 'M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[space]} /></svg>
}

function formatDuration(seconds: number | null, language: Language) {
  if (seconds === null) return '—'
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.round(seconds % 60)
  return language === 'zh-CN' ? `${minutes}分 ${remaining}秒` : `${minutes}m ${remaining}s`
}

function taskStateLabel(task: MediaTaskSnapshot, language: Language) {
  const copy = messages[language]
  if (task.state === 'running' && task.stage) return copy.stage[task.stage]
  return copy.state[task.state]
}

export default function MediaDockV3App() {
  const api = useMemo(() => getMediaDockV3Api(), [])
  const [language, setLanguage] = useState<Language>('zh-CN')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activeSpace, setActiveSpace] = useState<ProductSpace>('workbench')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE)
  const [sourcePath, setSourcePath] = useState('')
  const [inspection, setInspection] = useState<SourceInspection | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)
  const [outputDirectory, setOutputDirectory] = useState('')
  const [plan, setPlan] = useState<TaskPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const copy = messages[language]

  useEffect(() => {
    document.documentElement.dataset.product = 'v3'
    document.documentElement.dataset.md3Theme = theme
    document.documentElement.lang = language === 'zh-CN' ? 'zh-CN' : 'en'
  }, [language, theme])

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
  const activeTask = activeTaskId ? workspace.tasks.find((task) => task.id === activeTaskId) ?? null : null

  useEffect(() => {
    let active = true
    if (!readyInspection || !selectedRecipe || !outputDirectory) {
      setPlan(null)
      setPlanLoading(false)
      return () => {
        active = false
      }
    }

    setPlanLoading(true)
    setPlan(null)
    void api.planTask({
      source: readyInspection.source,
      recipeId: selectedRecipe as TaskPlan['recipe']['id'],
      outputDirectory,
      language,
    }).then((nextPlan) => {
      if (active) setPlan(nextPlan)
    }).catch((error: unknown) => {
      if (active) setErrorMessage(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (active) setPlanLoading(false)
    })

    return () => {
      active = false
    }
  }, [api, language, outputDirectory, readyInspection, selectedRecipe])

  function resetSource(nextPath = '') {
    setSourcePath(nextPath)
    setInspection(null)
    setSelectedRecipe(null)
    setPlan(null)
    setActiveTaskId(null)
    setErrorMessage(null)
  }

  async function chooseSource() {
    setErrorMessage(null)
    const selected = await api.pickLocalSource(sourcePath || undefined)
    if (selected) resetSource(selected)
  }

  async function inspectSource() {
    if (!sourcePath.trim()) return
    setBusy(true)
    setErrorMessage(null)
    try {
      const sourceValue = sourcePath.trim()
      const nextInspection = await api.inspectSource(/^https?:\/\//iu.test(sourceValue)
        ? { kind: 'network-url', url: sourceValue }
        : { kind: 'local-file', path: sourceValue })
      setInspection(nextInspection)
      setSelectedRecipe(nextInspection.status === 'ready' ? nextInspection.recipes[0]?.id ?? null : null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function chooseOutput() {
    setErrorMessage(null)
    const selected = await api.pickOutputDirectory(outputDirectory || undefined)
    if (selected) setOutputDirectory(selected)
  }

  async function startTask() {
    if (!plan) return
    setBusy(true)
    setErrorMessage(null)
    try {
      const created = await api.createTask(plan)
      setWorkspace(created)
      const task = [...created.tasks].reverse().find((candidate) => candidate.plan.deliveryName === plan.deliveryName)
      if (!task) throw new Error('The created Media Task was not returned in the workspace snapshot.')
      setActiveTaskId(task.id)
      const completed = await api.runTask(task.id)
      setWorkspace(completed)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function runPrimaryAction() {
    if (!sourcePath) return await chooseSource()
    if (!readyInspection) return await inspectSource()
    if (!outputDirectory) return await chooseOutput()
    if (activeTask?.state === 'completed') {
      setActiveSpace('deliverables')
      return
    }
    return await startTask()
  }

  const primaryLabel = !sourcePath
    ? copy.chooseSource
    : !readyInspection
      ? copy.inspectSource
      : !outputDirectory
        ? copy.chooseOutput
        : activeTask?.state === 'completed'
          ? copy.viewDeliverable
          : busy || activeTask?.state === 'running'
            ? copy.processing
            : copy.start

  const primaryDisabled = busy || planLoading || (Boolean(readyInspection && outputDirectory) && !plan && activeTask?.state !== 'completed')

  function renderWorkbench() {
    return (
      <div className="md3-workbench">
        <header className="md3-hero">
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <span>{copy.subtitle}</span>
        </header>

        <section className="md3-source-dock" aria-labelledby="md3-source-title">
          <div className="md3-section-heading">
            <div><span>01</span><div><h2 id="md3-source-title">{copy.sourceDock}</h2><p>{copy.sourceHint}</p></div></div>
            {sourcePath && <button className="md3-quiet-button" onClick={() => resetSource()} aria-label={copy.clear}>×</button>}
          </div>

          <div className="md3-source-field">
            <span className="md3-source-orbit" aria-hidden="true" />
            <input
              value={sourcePath}
              onChange={(event) => resetSource(event.target.value)}
              placeholder={copy.sourcePlaceholder}
              aria-label={copy.sourceDock}
            />
            <button className="md3-inline-action" onClick={() => void chooseSource()}>{copy.browse}</button>
          </div>

          {inspection?.status === 'needs-attention' && (
            <div className="md3-problem" role="status">
              <strong>{copy.problem} · {inspection.problem.code}</strong>
              <span>{copy.genericError}</span>
            </div>
          )}

          {readyInspection && (
            <div className="md3-source-summary">
              <div><i aria-hidden="true" /><span><strong>{copy.inspectReady}</strong><small>{readyInspection.source.displayName}</small></span></div>
              <dl>
                <div><dt>{copy.duration}</dt><dd>{formatDuration(readyInspection.source.durationSeconds, language)}</dd></div>
                <div><dt>{copy.format}</dt><dd>{readyInspection.source.formatName}</dd></div>
              </dl>
            </div>
          )}

          {readyInspection && (
            <div className="md3-compose-grid">
              <section className="md3-recipe-section" aria-labelledby="md3-recipe-title">
                <div className="md3-subheading"><span>02</span><div><h3 id="md3-recipe-title">{copy.recipeTitle}</h3><p>{copy.recipeHint}</p></div></div>
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
              </section>

              <section className="md3-destination-section" aria-labelledby="md3-destination-title">
                <div className="md3-subheading"><span>03</span><div><h3 id="md3-destination-title">{copy.destination}</h3><p>{copy.destinationHint}</p></div></div>
                <button className="md3-destination-picker" onClick={() => void chooseOutput()}>
                  <span>{outputDirectory || copy.chooseOutput}</span><b aria-hidden="true">↗</b>
                </button>
                {(planLoading || plan) && (
                  <div className="md3-plan-preview">
                    <span>{copy.plannedName}</span>
                    <strong>{planLoading ? copy.loadingPlan : plan?.deliveryName}</strong>
                  </div>
                )}
              </section>
            </div>
          )}

          {errorMessage && <div className="md3-error" role="alert"><strong>{copy.genericError}</strong><span>{errorMessage}</span></div>}

          <div className="md3-action-row">
            <div className="md3-flow-steps" aria-hidden="true"><span className="is-active" /> <span className={readyInspection ? 'is-active' : ''} /> <span className={activeTask ? 'is-active' : ''} /> <span className={activeTask?.state === 'completed' ? 'is-active' : ''} /></div>
            <button className="md3-primary-action" disabled={primaryDisabled} onClick={() => void runPrimaryAction()}>{primaryLabel}<span aria-hidden="true">→</span></button>
          </div>
        </section>

        <section className="md3-current-activity">
          <div className="md3-section-title-row"><h2>{copy.recentActivity}</h2><span>REV {workspace.revision}</span></div>
          {workspace.tasks.length === 0 ? <p className="md3-empty-line">{copy.noActivity}</p> : <TaskList tasks={workspace.tasks.slice(-3).reverse()} language={language} />}
        </section>
      </div>
    )
  }

  function renderSpace() {
    if (activeSpace === 'workbench') return renderWorkbench()
    if (activeSpace === 'tasks') {
      return <SpacePage title={copy.taskCenterTitle} subtitle={copy.taskCenterSubtitle}>{workspace.tasks.length === 0 ? <p className="md3-empty-line">{copy.noActivity}</p> : <TaskList tasks={[...workspace.tasks].reverse()} language={language} />}</SpacePage>
    }
    if (activeSpace === 'deliverables') {
      return <SpacePage title={copy.deliverablesTitle} subtitle={copy.deliverablesSubtitle}>{workspace.deliverables.length === 0 ? <p className="md3-empty-line">{copy.noDeliverables}</p> : <div className="md3-deliverable-list">{[...workspace.deliverables].reverse().map((item) => <article key={item.id}><span>◆</span><div><strong>{item.deliveryName}</strong><small title={item.path}>{item.path}</small></div><time>{new Date(item.createdAt).toLocaleString(language)}</time></article>)}</div>}</SpacePage>
    }
    return (
      <SpacePage title={copy.systemTitle} subtitle={copy.systemSubtitle}>
        <div className="md3-system-list">
          <article><span>01</span><div><strong>{copy.engine}</strong><small>{copy.engineValue}</small></div><b>{copy.revision} {workspace.revision}</b></article>
          <article><span>02</span><div><strong>{copy.dataBoundary}</strong><small>{copy.dataBoundaryValue}</small></div><b>LOCAL</b></article>
          <article><span>03</span><div><strong>{copy.runtime}</strong><small>{copy.runtimeValue}</small></div><b>READY</b></article>
        </div>
      </SpacePage>
    )
  }

  return (
    <div className="md3-shell">
      <aside className="md3-rail">
        <div className="md3-brand"><DockMark /><div><strong>Media Dock</strong><span>{copy.brandLine}</span></div></div>
        <nav aria-label={language === 'zh-CN' ? '产品空间' : 'Product spaces'}>
          {(Object.keys(copy.spaces) as ProductSpace[]).map((space) => (
            <button key={space} className={activeSpace === space ? 'is-active' : ''} onClick={() => setActiveSpace(space)}><SpaceGlyph space={space} /><span>{copy.spaces[space]}</span></button>
          ))}
        </nav>
        <div className="md3-rail-footer">
          <button onClick={() => setInspectorOpen((open) => !open)} aria-pressed={inspectorOpen}><span>⌁</span>{copy.inspector}</button>
          <div><button onClick={() => setLanguage((current) => current === 'zh-CN' ? 'en' : 'zh-CN')}>{language === 'zh-CN' ? '中 / EN' : 'EN / 中'}</button><button onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}>{theme === 'light' ? copy.dark : copy.light}</button></div>
        </div>
      </aside>

      <main className="md3-main">{renderSpace()}</main>

      {inspectorOpen && (
        <aside className="md3-inspector" aria-label={copy.inspector}>
          <header><div><span>CONTEXT</span><h2>{copy.inspector}</h2></div><button onClick={() => setInspectorOpen(false)} aria-label="Close">×</button></header>
          {!readyInspection && !activeTask ? <p>{copy.emptyInspector}</p> : (
            <div className="md3-inspector-content">
              {readyInspection && <section><span>SOURCE</span><strong>{readyInspection.source.displayName}</strong><small title={readyInspection.source.locator}>{readyInspection.source.locator}</small></section>}
              {plan && <section><span>{copy.plan.toUpperCase()}</span><strong>{plan.deliveryName}</strong><small>{plan.outputDirectory}</small><h3>{copy.steps}</h3><ol>{plan.steps.map((step) => <li key={step.id}><i />{copy.stage[step.stage]}</li>)}</ol><code>{plan.runtimeVersions.ytDlp ? `yt-dlp · ${plan.runtimeVersions.ytDlp} / ` : ''}FFmpeg · {plan.runtimeVersions.ffmpeg}</code></section>}
              {activeTask?.problem && <section className="is-problem"><span>{copy.problem.toUpperCase()}</span><strong>{activeTask.problem.code}</strong></section>}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

function SpacePage({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="md3-space-page"><header><p>MEDIA DOCK 3</p><h1>{title}</h1><span>{subtitle}</span></header><section>{children}</section></div>
}

function TaskList({ tasks, language }: { tasks: readonly MediaTaskSnapshot[]; language: Language }) {
  return <div className="md3-task-list">{tasks.map((task) => <article key={task.id}><div className={`md3-task-state is-${task.state}`}><i /><span>{taskStateLabel(task, language)}</span></div><div className="md3-task-copy"><strong>{task.plan.deliveryName}</strong><small title={task.plan.source.locator}>{task.plan.source.displayName}</small></div><time>{new Date(task.updatedAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div>
}
