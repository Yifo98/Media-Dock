const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const action = process.env.MEDIA_DOCK_RENDERER_ACTION
const screenshotPath = process.env.MEDIA_DOCK_RENDERER_SCREENSHOT
const screenshotWidth = Number(process.env.MEDIA_DOCK_RENDERER_WIDTH ?? 1280)
const screenshotHeight = Number(process.env.MEDIA_DOCK_RENDERER_HEIGHT ?? 800)
const labels = {
  openPath: ['打开 cookies 目录', 'Open cookies folder'],
  pickDirectory: ['选择目录', 'Browse'],
  pickDirectoryCancel: ['选择目录', 'Browse'],
  showItemInFolder: ['打开所在文件夹', 'Show in folder'],
  mediaPickDirectory: ['选择输出目录', 'Choose output folder'],
  mediaOpenPath: ['打开输出目录', 'Open output folder'],
}

async function waitFor(win, expression, timeoutMs = 8000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await win.webContents.executeJavaScript(expression, true)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

app.commandLine.appendSwitch('disable-gpu')
app.whenReady().then(async () => {
  if (action === 'v3ProductionPreload') {
    ipcMain.handle('media-dock:v3:get-workspace', () => ({
      contractVersion: 1,
      revision: 0,
      taskBatches: [],
      tasks: [],
      deliverables: [],
      authenticationProfiles: [],
      systemOperations: [],
    }))
  }
  const win = new BrowserWindow({
    show: Boolean(screenshotPath),
    width: screenshotPath ? screenshotWidth : 1500,
    height: screenshotPath ? screenshotHeight : 1000,
    webPreferences: {
      preload: action === 'v3ProductionPreload'
        ? path.resolve(__dirname, '../../electron/preload.cjs')
        : path.join(__dirname, 'renderer-actions-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: action === 'v3ProductionPreload',
      partition: `renderer-actions-${action}-${Date.now()}`,
    },
  })

  try {
    await win.loadFile(
      path.resolve(__dirname, '../../dist/index.html'),
      action === 'v3Workbench' || action === 'v3WorkspaceNavigation' || action === 'v3TaskScrolling' || action === 'v3LocalFlow' || action === 'v3MergeFlow' || action === 'v3MediaCookiesGuide' || action === 'v3NetworkFlow' || action === 'v3SlowInspection' || action === 'v3MultipleLinksFlow' || action === 'v3PreflightMismatch' || action === 'v3QualitySelection' || action === 'v3CollectionFlow' || action === 'v3CollectionGrouping' || action === 'v3TaskVisibility' || action === 'v3ClearHistory' || action === 'v3DeliverableReveal' || action === 'v3RuntimeCheck' || action === 'v3SupportDiagnostics' || action === 'v3EnglishCollection' || action === 'v3CollectionProblem' || action === 'v3LanguagePersistence' || action === 'v3AuthProfile' || action === 'v3ProductionPreload' ? { hash: 'v3' } : undefined,
    )
    if (action === 'v3ProductionPreload') {
      const rendered = await waitFor(
        win,
        `document.body.innerText.includes('处理工作台') && !document.body.innerText.includes('Renderer error') && ['pickLocalSources', 'inspectVideoQualities', 'revealDeliverable', 'checkRuntimeUpdates', 'exportSupportDiagnostics'].every((key) => typeof window.mediaDock?.[key] === 'function')`,
      )
      if (!rendered) throw new Error('Production preload did not expose the Media Dock 3 contract')
      console.log('[GREEN] the production preload exposes the Media Dock 3 sandbox contract.')
      app.exit(0)
      return
    }
    if (action === 'v3Workbench') {
      const workbenchReady = await waitFor(
        win,
        `Boolean(document.querySelector('.md3-source-dock')) && document.body.innerText.includes('添加链接')`,
      )
      if (!workbenchReady) throw new Error('Media Dock 3 Workbench did not render Source Dock')
      const typographyReady = await waitFor(
        win,
        `document.body.innerText.includes('处理工作台')
          && document.querySelectorAll('.md3-space-map button').length === 4
          && Number.parseFloat(getComputedStyle(document.querySelector('.md3-workspace-header h1')).fontSize) <= 32
          && document.querySelector('.md3-language-toggle')?.textContent.trim() === '中/EN'
          && getComputedStyle(document.querySelector('.md3-language-toggle')).whiteSpace === 'nowrap'
          && getComputedStyle(document.querySelector('.md3-inspector-toggle > span')).transform !== 'none'
          && getComputedStyle(document.querySelector('.md3-workspace-header')).boxShadow !== 'none'`,
      )
      if (!typographyReady) throw new Error('Workbench typography did not use the refined hierarchy')
      const primaryActions = await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.md3-primary-action'))
          .filter((button) => button.offsetParent !== null)
          .map((button) => button.textContent.trim())
      `, true)
      const linkOnlyFlowReady = await win.webContents.executeJavaScript(`
        (() => {
          const readiness = document.querySelector('.md3-auth-readiness')
          const source = document.querySelector('.md3-source-dock')
          return Boolean(readiness)
            && readiness.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING
            && readiness.innerText.includes('尚未导入')
            && !document.querySelector('.md3-source-field .md3-inline-action')
            && !document.body.innerText.includes('文件库')
        })()
      `, true)
      if (primaryActions.length !== 1 || !primaryActions[0].startsWith('请先输入链接') || !linkOnlyFlowReady) {
        console.error(`[RED] expected one contextual primary action, got: ${primaryActions.join(' | ')}`)
        app.exit(1)
        return
      }
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        const screenshot = await win.webContents.capturePage()
        fs.writeFileSync(screenshotPath, screenshot.toPNG())
      }
      console.log('[GREEN] Media Dock 3 Workbench opens with Source Dock and one contextual primary action.')
      app.exit(0)
      return
    }
    if (action === 'v3WorkspaceNavigation') {
      const pinnedNavigation = await win.webContents.executeJavaScript(`
        (() => {
          const header = document.querySelector('.md3-workspace-header')
          const style = getComputedStyle(header)
          return style.position === 'sticky' && style.top === '0px'
        })()
      `, true)
      if (!pinnedNavigation) throw new Error('Shared workspace navigation is not pinned to the top of the workspace')
      const spaces = [
        ['音画合并', '合并音画'],
        ['任务', '任务'],
        ['设置', '设置'],
        ['处理', '处理工作台'],
      ]
      for (const [index, [navigationLabel, pageTitle]] of spaces.entries()) {
        const navigationReady = await waitFor(
          win,
          `Array.from(document.querySelectorAll('.md3-space-map button strong')).some((label) => label.textContent.trim() === ${JSON.stringify(navigationLabel)})`,
        )
        if (!navigationReady) throw new Error(`Shared workspace navigation disappeared before opening ${navigationLabel}`)
        await win.webContents.executeJavaScript(`
          Array.from(document.querySelectorAll('.md3-space-map button'))
            .find((button) => button.querySelector('strong')?.textContent.trim() === ${JSON.stringify(navigationLabel)})
            .click()
        `, true)
        const spaceReady = await waitFor(
          win,
          `document.querySelector('.md3-workspace-header h1')?.textContent.trim() === ${JSON.stringify(pageTitle)} && document.querySelectorAll('.md3-space-map button').length === 4 && document.querySelector('.md3-space-map button[aria-current="page"] strong')?.textContent.trim() === ${JSON.stringify(navigationLabel)}`,
        )
        if (!spaceReady) throw new Error(`Workspace header did not remain consistent for ${navigationLabel}`)
        if (screenshotPath) {
          await new Promise((resolve) => setTimeout(resolve, 120))
          const parsed = path.parse(screenshotPath)
          const capturePath = path.join(parsed.dir, `${parsed.name}-${String(index + 1).padStart(2, '0')}-${navigationLabel}${parsed.ext || '.png'}`)
          fs.mkdirSync(path.dirname(capturePath), { recursive: true })
          fs.writeFileSync(capturePath, (await win.webContents.capturePage()).toPNG())
        }
      }
      console.log('[GREEN] all four focused product spaces retain one shared workspace header and navigation.')
      app.exit(0)
      return
    }
    if (action === 'v3TaskScrolling') {
      const workbenchFocused = await waitFor(win, `!document.querySelector('.md3-current-activity') && !document.querySelector('.md3-task-list')`)
      if (!workbenchFocused) throw new Error('Workbench still duplicates task history')
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        const parsed = path.parse(screenshotPath)
        const workbenchPath = path.join(parsed.dir, `${parsed.name}-01-workbench${parsed.ext || '.png'}`)
        fs.mkdirSync(path.dirname(workbenchPath), { recursive: true })
        fs.writeFileSync(workbenchPath, (await win.webContents.capturePage()).toPNG())
      }
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.md3-space-map button'))
          .find((button) => button.querySelector('strong')?.textContent.trim() === '任务')
          .click()
      `, true)
      const taskCenterReady = await waitFor(win, `document.querySelectorAll('.md3-task-list article').length === 30`)
      if (!taskCenterReady) throw new Error('Task Center did not render the full task history')
      const taskCenterScrollable = await win.webContents.executeJavaScript(`
        (async () => {
          const main = document.querySelector('.md3-main')
          const header = document.querySelector('.md3-workspace-header')
          main.style.height = '560px'
          main.style.maxHeight = '560px'
          const headerTop = header.getBoundingClientRect().top
          main.scrollTop = Math.min(400, main.scrollHeight - main.clientHeight)
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          return main.scrollHeight > main.clientHeight && main.scrollTop > 0 && Math.abs(header.getBoundingClientRect().top - headerTop) <= 2
        })()
      `, true)
      if (!taskCenterScrollable) throw new Error('Task Center cannot scroll while keeping workspace navigation pinned')
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        const parsed = path.parse(screenshotPath)
        const taskCenterPath = path.join(parsed.dir, `${parsed.name}-02-task-center${parsed.ext || '.png'}`)
        fs.mkdirSync(path.dirname(taskCenterPath), { recursive: true })
        fs.writeFileSync(taskCenterPath, (await win.webContents.capturePage()).toPNG())
      }
      console.log('[GREEN] Workbench stays focused while Task Center exposes the full scrollable task history.')
      app.exit(0)
      return
    }
    if (action === 'v3MergeFlow') {
      async function clickMergePrimary(label) {
        const ready = await waitFor(win, `document.querySelector('.md3-merge-primary')?.textContent.trim().startsWith(${JSON.stringify(label)}) && !document.querySelector('.md3-merge-primary').disabled`)
        if (!ready) throw new Error(`Merge primary action did not reach: ${label}`)
        await win.webContents.executeJavaScript(`document.querySelector('.md3-merge-primary').click()`, true)
      }
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-rail nav button')).find((button) => button.textContent.trim() === '音画合并').click()`, true)
      const mergeReady = await waitFor(win, `document.body.innerText.includes('把 IDM 等工具下载的独立视频轨与音频轨合成一个成品') && document.querySelectorAll('.md3-merge-presets label').length === 3`)
      if (!mergeReady) throw new Error('Merge workspace or three delivery presets did not render')
      await clickMergePrimary('添加音画文件')
      const pairingReady = await waitFor(win, `document.body.innerText.includes('已按时长与时间轴匹配') && document.body.innerText.includes('1 组')`)
      if (!pairingReady) throw new Error('Selected tracks were not paired by media timing')
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG())
      }
      await clickMergePrimary('选择保存位置')
      await clickMergePrimary('开始合并')
      await clickMergePrimary('查看成品')
      const delivered = await waitFor(win, `document.querySelector('.md3-workspace-header h1')?.textContent.trim() === '任务' && document.body.innerText.includes('IDM-video - 音画合并.mp4') && document.body.innerText.includes('打开所在位置')`)
      if (!delivered) throw new Error('Merged task did not reach Task Center with its file location')
      console.log('[GREEN] Media Dock 3 merges separate local video and audio through the normal task journey.')
      app.exit(0)
      return
    }
    if (action === 'v3MediaCookiesGuide') {
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-rail nav button')).find((button) => button.textContent.trim() === '设置').click()`, true)
      const guideReady = await waitFor(win, `document.body.innerText.includes('安装 MediaCookies 浏览器扩展') && document.body.innerText.includes('Chrome 商店安装') && document.body.innerText.includes('GitHub 获取与说明')`)
      if (!guideReady) throw new Error('MediaCookies installation and export guidance did not render')
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG())
      }
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-authentication-links button')).forEach((button) => button.click())`, true)
      const linksOpened = await waitFor(win, `(async () => (await window.appApi.getOpenedExternalUrls()).length === 2)()`)
      if (!linksOpened) throw new Error('MediaCookies external guidance links were not opened')
      const urls = await win.webContents.executeJavaScript(`window.appApi.getOpenedExternalUrls()`, true)
      if (!urls.includes('https://chromewebstore.google.com/detail/xf-mediacookies/pkpnjlcfhkgiapclmidlhfgjklhifcek') || !urls.includes('https://github.com/Yifo98/MediaCookies')) throw new Error(`Unexpected MediaCookies links: ${urls.join(' | ')}`)
      console.log('[GREEN] Settings explains the local Cookie handoff and opens both official MediaCookies destinations.')
      app.exit(0)
      return
    }
    if (action === 'v3LocalFlow') {
      const readinessReady = await waitFor(win, `document.querySelector('.md3-auth-readiness button')?.textContent.includes('设置') && document.body.innerText.includes('公开内容仍可识别')`)
      if (!readinessReady) throw new Error('Missing sign-in readiness did not explain the public-mode fallback')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-auth-readiness button').click()`, true)
      const settingsReady = await waitFor(win, `document.querySelector('#md3-authentication-settings') && document.querySelector('.md3-workspace-header h1')?.textContent.trim() === '设置'`)
      if (!settingsReady) throw new Error('Sign-in guidance did not route to the MediaCookies settings section')
      console.log('[GREEN] Media Dock 3 starts with sign-in readiness and routes missing users to MediaCookies guidance.')
      app.exit(0)
      return
    }
    if (action === 'v3NetworkFlow') {
      async function clickPrimary(label) {
        const ready = await waitFor(
          win,
          `Array.from(document.querySelectorAll('.md3-primary-action')).some((button) => button.textContent.trim().startsWith(${JSON.stringify(label)}) && !button.disabled)`,
        )
        if (!ready) throw new Error(`Primary action did not reach: ${label}`)
        await win.webContents.executeJavaScript(`
          Array.from(document.querySelectorAll('.md3-primary-action'))
            .find((button) => button.textContent.trim().startsWith(${JSON.stringify(label)}))
            .click()
        `, true)
      }

      const inputReady = await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      if (!inputReady) throw new Error('Source Dock input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://media.example/watch?v=42')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      await clickPrimary('识别内容')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-destination-picker').click()`, true)
      await clickPrimary('开始处理')
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-space-map button')).find((button) => button.querySelector('strong')?.textContent.trim() === '任务').click()`, true)
      const delivered = await waitFor(win, `document.body.innerText.includes('山海 Episode 42 - 视频.mp4') && document.body.innerText.includes('打开所在位置')`)
      if (!delivered) throw new Error('Completed network task did not expose its Deliverable in Task Center')
      console.log('[GREEN] Media Dock 3 advances a pasted public link through a completed network-media journey.')
      app.exit(0)
      return
    }
    if (action === 'v3SlowInspection') {
      const inputReady = await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      if (!inputReady) throw new Error('Source Dock input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://www.youtube.com/watch?v=slow&list=large-playlist')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      const identifyReady = await waitFor(win, `document.querySelector('.md3-primary-action')?.innerText.includes('识别内容') && !document.querySelector('.md3-primary-action')?.disabled`)
      if (!identifyReady) throw new Error('Source Dock did not become ready to identify the slow link')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const feedbackReady = await waitFor(
        win,
        `Boolean(document.querySelector('.md3-inspection-loading'))
          && document.querySelector('.md3-inspection-loading')?.innerText.includes('15–60 秒')
          && document.querySelector('.md3-primary-action')?.disabled
          && document.querySelector('.md3-primary-action')?.innerText.includes('正在识别链接')`,
      )
      if (!feedbackReady) throw new Error('Slow Source Inspection did not show an honest loading estimate')
      const elapsedReady = await waitFor(win, `document.querySelector('.md3-inspection-loading')?.innerText.includes('已等待 1 秒')`, 1500)
      if (!elapsedReady) throw new Error('Slow Source Inspection did not update elapsed time')
      if (screenshotPath) {
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG())
      }
      const completed = await waitFor(win, `!document.querySelector('.md3-inspection-loading') && Boolean(document.querySelector('.md3-source-summary'))`)
      if (!completed) throw new Error('Source Inspection feedback did not resolve into the identified source')
      console.log('[GREEN] Media Dock 3 shows an elapsed timer and honest time range while Source Inspection is running.')
      app.exit(0)
      return
    }
    if (action === 'v3MultipleLinksFlow') {
      const modeReady = await waitFor(win, `document.querySelectorAll('.md3-link-mode button').length === 2`)
      if (!modeReady) throw new Error('Link mode switch did not render')
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-link-mode button')).find((button) => button.textContent.includes('多单链接')).click()`, true)
      const fillMultipleLink = async (index, value) => {
        const inputReady = await waitFor(win, `document.querySelectorAll('.md3-multi-link-list input').length > ${index}`)
        if (!inputReady) throw new Error(`Multiple link input ${index + 1} did not render`)
        await win.webContents.executeJavaScript(`
          (() => {
            const input = document.querySelectorAll('.md3-multi-link-list input')[${index}]
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
            setter.call(input, ${JSON.stringify(value)})
            input.dispatchEvent(new Event('input', { bubbles: true }))
          })()
        `, true)
      }
      await fillMultipleLink(0, 'https://media.example/watch?v=1')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-add-link').click()`, true)
      await fillMultipleLink(1, 'https://media.example/watch?v=2')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-add-link').click()`, true)
      await fillMultipleLink(2, 'https://media.example/watch?v=3')
      const identifyReady = await waitFor(win, `document.querySelector('.md3-primary-action')?.textContent.includes('识别全部链接') && !document.querySelector('.md3-primary-action').disabled`)
      if (!identifyReady) throw new Error('Multiple links were not ready for inspection')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const batchReady = await waitFor(win, `document.body.innerText.includes('独立链接') && document.querySelectorAll('.md3-collection-entry').length === 3 && document.querySelectorAll('.md3-collection-entry input:checked').length === 0`)
      if (!batchReady) throw new Error('Independent links were not represented as three unselected tasks')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-collection-group-action').click()`, true)
      const selected = await waitFor(win, `document.querySelectorAll('.md3-collection-entry input:checked').length === 3`)
      if (!selected) throw new Error('Independent links could not be selected as one batch')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-destination-picker').click()`, true)
      const startReady = await waitFor(win, `document.querySelector('.md3-primary-action')?.textContent.includes('开始处理 3 项') && !document.querySelector('.md3-primary-action').disabled`)
      if (!startReady) throw new Error('Independent link batch did not become ready to process')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const completed = await waitFor(win, `document.querySelectorAll('.md3-collection-entry.is-downloaded').length === 3 && document.querySelectorAll('.md3-collection-entry input:checked').length === 0`)
      if (!completed) throw new Error('Independent link batch did not complete as separate tasks')
      console.log('[GREEN] Media Dock 3 identifies and runs multiple unrelated links as one user-curated independent Task Batch.')
      app.exit(0)
      return
    }
    if (action === 'v3PreflightMismatch') {
      async function clickPrimary(label) {
        const ready = await waitFor(
          win,
          `document.querySelector('.md3-primary-action')?.textContent.trim().startsWith(${JSON.stringify(label)}) && !document.querySelector('.md3-primary-action').disabled`,
        )
        if (!ready) throw new Error(`Primary action did not reach: ${label}`)
        await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      }

      await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://media.example/watch?v=42')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      await clickPrimary('识别内容')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-destination-picker').click()`, true)
      await clickPrimary('开始处理')
      const blocked = await waitFor(
        win,
        `document.body.innerText.includes('登录资料在任务准备后发生变化') && document.querySelector('.md3-primary-action')?.textContent.trim().startsWith('开始处理')`,
      )
      if (!blocked) throw new Error('Changed Cookie state did not block task creation')
      console.log('[GREEN] Media Dock 3 blocks queue creation when the Cookie preflight no longer matches the Task Plan.')
      app.exit(0)
      return
    }
    if (action === 'v3QualitySelection') {
      const inputReady = await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      if (!inputReady) throw new Error('Source Dock input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://media.example/watch?v=42')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const qualitiesReady = await waitFor(
        win,
        `Boolean(document.querySelector('.md3-quality-select')) && document.body.innerText.includes('2160p') && document.body.innerText.includes('My MediaCookies')`,
      )
      if (!qualitiesReady) throw new Error('Authenticated video qualities did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const select = document.querySelector('.md3-quality-select')
          select.value = '1080'
          select.dispatchEvent(new Event('change', { bubbles: true }))
        })()
      `, true)
      const outputReady = await waitFor(win, `document.querySelector('.md3-primary-action')?.textContent.trim().startsWith('请先选择保存位置')`)
      if (!outputReady) throw new Error('Output action did not become available after quality selection')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-destination-picker').click()`, true)
      const planned = await waitFor(win, `document.body.innerText.includes('山海 Episode 42 - 视频.mp4')`)
      if (!planned) throw new Error('Selected 1080p ceiling was not accepted by task planning')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const preflightReady = await waitFor(win, `document.body.innerText.includes('Cookie 检测通过') && document.body.innerText.includes('最高 1080p')`)
      if (!preflightReady) throw new Error('Selected 1080p ceiling was not confirmed by the pre-download check')
      console.log('[GREEN] Media Dock 3 detects authenticated qualities, plans, and preflights the selected video ceiling.')
      app.exit(0)
      return
    }
    if (action === 'v3TaskVisibility') {
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-rail nav button')).find((button) => button.textContent.trim() === '任务').click()`, true)
      const visible = await waitFor(
        win,
        `Boolean(document.querySelector('.md3-task-download-progress')) && document.body.innerText.includes('视频流') && document.body.innerText.includes('42.5%') && document.body.innerText.includes('4.2MiB/s') && document.body.innerText.includes('My MediaCookies') && document.body.innerText.includes('1080p')`,
      )
      if (!visible) throw new Error('Task progress, authentication profile, or quality ceiling was not visible')
      console.log('[GREEN] Media Dock 3 shows exact download progress, authentication use, and quality ceiling.')
      app.exit(0)
      return
    }
    if (action === 'v3ClearHistory') {
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-rail nav button')).find((button) => button.textContent.trim() === '任务').click()`, true)
      const clearReady = await waitFor(win, `Boolean(document.querySelector('.md3-history-clear'))
        && document.querySelector('.md3-history-toolbar')?.innerText.includes('不会删除已下载到本地的视频文件')
        && document.querySelector('.md3-history-toolbar')?.innerText.includes('手动前往文件夹删除')
        && Number.parseFloat(getComputedStyle(document.querySelector('.md3-history-toolbar strong')).fontSize) >= 12
        && Number.parseFloat(getComputedStyle(document.querySelector('.md3-history-toolbar > div')).rowGap) >= 7`)
      if (!clearReady) throw new Error('Task history clear action did not render')
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG())
      }
      await win.webContents.executeJavaScript(`document.querySelector('.md3-history-clear').click()`, true)
      const confirmationReady = await waitFor(win, `document.querySelector('.md3-history-clear')?.textContent.includes('再次')`)
      if (!confirmationReady) throw new Error('Task history clear action did not require confirmation')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-history-clear').click()`, true)
      const cleared = await waitFor(win, `!document.querySelector('.md3-task-list') && document.body.innerText.includes('还没有任务')`)
      if (!cleared) throw new Error('Task history did not clear from the rendered workspace')
      console.log('[GREEN] Media Dock 3 clears terminal history after confirmation without exposing file deletion.')
      app.exit(0)
      return
    }
    if (action === 'v3DeliverableReveal') {
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-rail nav button')).find((button) => button.textContent.trim() === '任务').click()`, true)
      const actionReady = await waitFor(win, `Array.from(document.querySelectorAll('.md3-task-list button')).some((button) => button.textContent.trim() === '打开所在位置')`)
      if (!actionReady) throw new Error('Reveal action did not render in Task Center')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-task-list button').click()`, true)
      const confirmed = await waitFor(win, `document.querySelector('.md3-task-list button')?.textContent.trim() === '已打开'`)
      if (!confirmed) throw new Error('Reveal action did not confirm the completed file location')
      console.log('[GREEN] Media Dock 3 reveals a completed Deliverable from its Task Center row.')
      app.exit(0)
      return
    }
    if (action === 'v3RuntimeCheck') {
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-rail nav button')).find((button) => button.textContent.trim() === '设置').click()`, true)
      const checkReady = await waitFor(win, `Array.from(document.querySelectorAll('.md3-system-list button')).some((button) => button.textContent.trim() === '检查更新')`)
      if (!checkReady) throw new Error('Runtime update check did not render')
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-system-list button')).find((button) => button.textContent.trim() === '检查更新').click()`, true)
      const checked = await waitFor(win, `document.body.innerText.includes('yt-dlp 2026.07.04 → 2026.08.01') && document.body.innerText.includes('Deno 2.9.2')`)
      if (!checked) throw new Error('Runtime update results did not render')
      console.log('[GREEN] Media Dock 3 checks yt-dlp and Deno updates on demand.')
      app.exit(0)
      return
    }
    if (action === 'v3SupportDiagnostics') {
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.md3-rail nav button')).find((button) => button.textContent.trim() === '设置').click()`, true)
      const disclosureReady = await waitFor(
        win,
        `Boolean(document.querySelector('.md3-support-diagnostics'))
          && document.querySelector('.md3-support-diagnostics')?.innerText.includes('系统与版本')
          && document.querySelector('.md3-support-diagnostics')?.innerText.includes('不会包含 Cookie')
          && Array.from(document.querySelectorAll('.md3-support-diagnostics button')).some((button) => button.textContent.trim() === '导出支持日志')`,
      )
      if (!disclosureReady) throw new Error('Support diagnostics did not disclose included and excluded information')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-support-diagnostics button').click()`, true)
      const exported = await waitFor(win, `document.querySelector('.md3-support-diagnostics')?.innerText.includes('支持日志已保存')`)
      if (!exported) throw new Error('Support diagnostics export did not confirm the saved file')
      if (screenshotPath) {
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG())
      }
      console.log('[GREEN] Media Dock 3 discloses and exports a sanitized support log from Settings.')
      app.exit(0)
      return
    }
    if (action === 'v3CollectionFlow') {
      async function clickPrimary(label) {
        const ready = await waitFor(
          win,
          `Array.from(document.querySelectorAll('.md3-primary-action')).some((button) => button.textContent.trim().startsWith(${JSON.stringify(label)}) && !button.disabled)`,
        )
        if (!ready) throw new Error(`Primary action did not reach: ${label}`)
        await win.webContents.executeJavaScript(`
          Array.from(document.querySelectorAll('.md3-primary-action'))
            .find((button) => button.textContent.trim().startsWith(${JSON.stringify(label)}))
            .click()
        `, true)
      }

      const inputReady = await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      if (!inputReady) throw new Error('Media input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://www.bilibili.com/bangumi/play/ep3537964')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      await clickPrimary('识别内容')
      const collectionReady = await waitFor(
        win,
        `document.body.innerText.includes('山海之间') && document.querySelectorAll('.md3-collection-entry').length === 2 && document.querySelectorAll('.md3-collection-entry input:checked').length === 0`,
      )
      if (!collectionReady) throw new Error('Bilibili season did not wait for an explicit episode selection')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.md3-collection-group-action'))
          .find((button) => button.closest('.md3-collection-group')?.innerText.includes('正片'))
          .click()
      `, true)
      const mainEpisodesSelected = await waitFor(win, `document.querySelectorAll('.md3-collection-entry input:checked').length === 2`)
      if (!mainEpisodesSelected) throw new Error('Main episode group did not select after the user requested it')
      const qualityPreviewReady = await waitFor(
        win,
        `Boolean(document.querySelector('.md3-quality-preview')) && document.body.innerText.includes('2160p') && document.body.innerText.includes('My MediaCookies') && document.body.innerText.includes('已选 2 集预计')`,
      )
      if (!qualityPreviewReady) throw new Error('Collection quality and estimated size were not visible immediately after inspection')
      if (screenshotPath) {
        await win.webContents.executeJavaScript(`document.querySelector('.md3-quality-preview').scrollIntoView({ block: 'center' })`, true)
        await new Promise((resolve) => setTimeout(resolve, 250))
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG())
      }
      const concurrencyReady = await waitFor(win, `document.querySelectorAll('.md3-concurrency-option').length === 3`)
      if (!concurrencyReady) throw new Error('Collection concurrency control did not render three choices')
      await win.webContents.executeJavaScript(`
        document.querySelector('.md3-concurrency-option[data-concurrency="3"]').click()
      `, true)
      const concurrencySelected = await waitFor(win, `document.querySelector('.md3-concurrency-option[data-concurrency="3"]')?.getAttribute('aria-pressed') === 'true'`)
      if (!concurrencySelected) throw new Error('Collection concurrency choice did not switch to three tasks')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-destination-picker').click()`, true)
      await clickPrimary('开始处理 2 项')
      const preflightVisible = await waitFor(win, `document.body.innerText.includes('Cookie 检测通过') && document.body.innerText.includes('首批 2 集') && document.body.innerText.includes('2160p')`)
      if (!preflightVisible) throw new Error('Fresh Cookie and quality preflight result was not shown')
      const resetForNextDownload = await waitFor(win, `document.querySelectorAll('.md3-collection-entry input:checked').length === 0 && document.querySelectorAll('.md3-collection-entry.is-downloaded').length === 2 && document.body.innerText.includes('已下载')`)
      if (!resetForNextDownload) throw new Error('Completed collection entries did not reset for a later download')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-collection-entry input').click()`, true)
      const repeatReady = await waitFor(win, `document.querySelector('.md3-primary-action')?.textContent.includes('开始处理 1 项') && !document.querySelector('.md3-primary-action').disabled`)
      if (!repeatReady) throw new Error('A completed collection entry could not be selected for an intentional re-download')
      console.log('[GREEN] Media Dock 3 resolves a Bilibili season and runs selected episodes as one Task Batch.')
      app.exit(0)
      return
    }
    if (action === 'v3CollectionGrouping') {
      const inputReady = await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      if (!inputReady) throw new Error('Media input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://www.bilibili.com/bangumi/play/ep3537964')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      const identifyReady = await waitFor(win, `Array.from(document.querySelectorAll('.md3-primary-action')).some((button) => button.textContent.trim().startsWith('识别内容') && !button.disabled)`)
      if (!identifyReady) throw new Error('Identify action did not become available')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const grouped = await waitFor(
        win,
        `document.querySelectorAll('.md3-collection-group').length === 3 && document.querySelectorAll('.md3-collection-entry').length === 2 && document.querySelectorAll('.md3-collection-entry input:checked').length === 0 && document.body.innerText.includes('已选 0 / 5 项') && document.body.innerText.includes('PV 与花絮') && document.body.innerText.includes('音乐')`,
      )
      if (!grouped) throw new Error('Collection groups did not open with every entry unselected')
      if (screenshotPath) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
        fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG())
      }
      const pinnedHeader = await win.webContents.executeJavaScript(`
        (() => {
          const header = document.querySelector('.md3-collection-group > header')
          const style = getComputedStyle(header)
          return style.position === 'sticky' && style.top === '0px'
        })()
      `, true)
      if (!pinnedHeader) throw new Error('Collection group controls are not pinned inside the episode scroller')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.md3-collection-group-toggle'))
          .find((button) => button.textContent.includes('PV 与花絮'))
          .click()
      `, true)
      const extrasOpened = await waitFor(win, `document.querySelectorAll('.md3-collection-entry').length === 4`)
      if (!extrasOpened) throw new Error('PV section did not expand independently')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.md3-collection-group-action'))
          .find((button) => button.closest('.md3-collection-group')?.innerText.includes('PV 与花絮'))
          .click()
      `, true)
      const extrasSelected = await waitFor(win, `document.querySelectorAll('.md3-collection-entry input:checked').length === 2`)
      if (!extrasSelected) throw new Error('PV section selection did not select only that section')
      const sampleFollowedSelection = await waitFor(win, `Array.from(document.querySelectorAll('.md3-quality-select option')).some((option) => option.textContent.trim().startsWith('1440p'))`)
      if (!sampleFollowedSelection) throw new Error('Quality probe did not follow the first remaining selected group entry')
      console.log('[GREEN] Media Dock 3 groups collection entries into collapsible sections with section-level selection.')
      app.exit(0)
      return
    }
    if (action === 'v3LanguagePersistence') {
      const languageToggleReady = await waitFor(
        win,
        `document.querySelector('.md3-language-toggle')?.textContent.trim() === '中/EN'`,
      )
      if (!languageToggleReady) throw new Error('Language toggle did not start in Simplified Chinese')
      await win.webContents.executeJavaScript(`
        document.querySelector('.md3-language-toggle').click()
      `, true)
      const switched = await waitFor(win, `document.body.innerText.includes('Processing workspace')`)
      if (!switched) throw new Error('Explicit English selection did not update the UI')
      const reloadFinished = new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
      win.webContents.reload()
      await reloadFinished
      const remembered = await waitFor(win, `document.body.innerText.includes('Processing workspace')`)
      if (!remembered) throw new Error('Explicit language selection was not remembered after reload')
      console.log('[GREEN] Media Dock 3 remembers an explicit language choice.')
      app.exit(0)
      return
    }
    if (action === 'v3CollectionProblem') {
      const inputReady = await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      if (!inputReady) throw new Error('Media input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://www.bilibili.com/bangumi/play/ep3537964')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      const identifyReady = await waitFor(win, `Array.from(document.querySelectorAll('.md3-primary-action')).some((button) => button.textContent.trim().startsWith('识别内容') && !button.disabled)`)
      if (!identifyReady) throw new Error('Identify action did not become available')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const explained = await waitFor(
        win,
        `document.body.innerText.includes('无法读取剧集列表') && document.body.innerText.includes('请检查链接是否为 B 站剧集') && Array.from(document.querySelectorAll('.md3-problem button')).some((button) => button.textContent.trim() === '更换链接或文件')`,
      )
      if (!explained) throw new Error('Collection Problem did not show localized guidance and recovery')
      console.log('[GREEN] Media Dock 3 explains collection inspection failure in product language.')
      app.exit(0)
      return
    }
    if (action === 'v3EnglishCollection') {
      const languageToggleReady = await waitFor(win, `document.querySelector('.md3-language-toggle')?.textContent.trim() === '中/EN'`)
      if (!languageToggleReady) throw new Error('Language toggle did not render')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-language-toggle').click()`, true)
      const inputReady = await waitFor(win, `Boolean(document.querySelector('.md3-source-field input'))`)
      if (!inputReady) throw new Error('Media input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.md3-source-field input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://www.bilibili.com/bangumi/play/ep3537964')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      const identifyReady = await waitFor(win, `Array.from(document.querySelectorAll('.md3-primary-action')).some((button) => button.textContent.trim().startsWith('Identify content') && !button.disabled)`)
      if (!identifyReady) throw new Error('English identify action did not become available')
      await win.webContents.executeJavaScript(`document.querySelector('.md3-primary-action').click()`, true)
      const localized = await waitFor(win, `document.body.innerText.includes('Main episodes') && !document.body.innerText.includes('正片')`)
      if (!localized) throw new Error('Product-owned collection group name was not localized')
      console.log('[GREEN] Media Dock 3 localizes collection group names in English.')
      app.exit(0)
      return
    }
    if (action === 'v3AuthProfile') {
      const systemReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('.md3-rail nav button')).some((button) => button.textContent.trim() === '设置')`,
      )
      if (!systemReady) throw new Error('System Center navigation did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.md3-rail nav button'))
          .find((button) => button.textContent.trim() === '设置')
          .click()
      `, true)
      const importReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === '导入 MediaCookies ZIP')`,
      )
      if (!importReady) throw new Error('Authentication Profile import action did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent.trim() === '导入 MediaCookies ZIP')
          .click()
      `, true)
      const imported = await waitFor(
        win,
        `document.body.innerText.includes('My MediaCookies') && document.body.innerText.includes('youtube')`,
      )
      if (!imported) throw new Error('Imported Authentication Profile did not appear in System Center')
      console.log('[GREEN] Media Dock 3 imports a secret-free Authentication Profile into System Center.')
      app.exit(0)
      return
    }
    if (action === 'runtimeProgressSync') {
      const midpointVisible = await waitFor(
        win,
        `document.querySelector('.runtime-progress small')?.textContent.trim() === '5.5%'`,
      )
      if (!midpointVisible) throw new Error('Install progress did not reach the 5.5% fixture midpoint')
      const midpointLog = await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.log-line'))
          .map((line) => line.textContent)
          .find((line) => line.includes('SYNC_PROGRESS')) ?? ''
      `, true)
      if (!midpointLog.includes('(5.5%)')) {
        console.error(`[RED] install bar showed 5.5% while the runtime log showed: ${midpointLog}`)
        app.exit(1)
        return
      }
      const completed = await waitFor(
        win,
        `document.querySelector('.runtime-progress small')?.textContent.trim() === '100.0%'`,
      )
      if (!completed) throw new Error('Install progress did not reach 100%')
      const finalLines = await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.log-line'))
          .map((line) => line.textContent)
          .filter((line) => line.includes('SYNC_PROGRESS'))
      `, true)
      if (finalLines.length !== 1 || !finalLines[0].includes('(100.0%)')) {
        console.error(`[RED] live runtime progress was not updated in place: ${finalLines.join(' | ')}`)
        app.exit(2)
        return
      }
      console.log('[GREEN] runtime log progress stays exact and updates in place with the install bar.')
      app.exit(0)
      return
    }
    if (action === 'runtimeProgressDedup') {
      const completed = await waitFor(
        win,
        `Array.from(document.querySelectorAll('.log-line')).some((line) => line.textContent.includes('DEDUP_PROGRESS (100.0%)'))`,
      )
      if (!completed) throw new Error('Runtime progress burst did not reach the renderer')
      const lines = await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.log-line'))
          .map((line) => line.textContent)
          .filter((line) => line.includes('DEDUP_PROGRESS'))
      `, true)
      if (lines.length !== 1 || !lines[0].includes('(100.0%)')) {
        console.error(`[RED] progress burst produced ${lines.length} log lines: ${lines.join(' | ')}`)
        app.exit(1)
        return
      }
      console.log('[GREEN] runtime progress bursts update one exact log line in place.')
      app.exit(0)
      return
    }
    if (action === 'runtimeRepairFailure') {
      const checkLabels = ['检查更新', 'Check updates']
      const repairLabels = ['修复 yt-dlp', 'Repair yt-dlp']
      const checkReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(checkLabels)}.includes(button.textContent.trim()))`,
      )
      if (!checkReady) throw new Error('Runtime update check button did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(checkLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
      const repairReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(repairLabels)}.includes(button.textContent.trim()))`,
      )
      if (!repairReady) throw new Error('Repair action did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(repairLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
      const failureExplained = await waitFor(
        win,
        `document.body.innerText.includes('原文件未修改') || document.body.innerText.includes('existing file was not changed')`,
        1200,
      )
      if (!failureExplained) {
        console.error('[RED] failed repair did not explain that the existing runtime was unchanged.')
        app.exit(1)
        return
      }
      const reloadFinished = new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
      win.webContents.reload()
      await reloadFinished
      const repairStillRequired = await waitFor(
        win,
        `document.body.innerText.includes('BROKEN')`,
      )
      if (!repairStillRequired) {
        console.error('[RED] failed repair was not reported as still required after restart.')
        app.exit(2)
        return
      }
      console.log('[GREEN] failed repair remains required and clearly reports no file change.')
      app.exit(0)
      return
    }
    if (action === 'unrunnableDeno') {
      const loaded = await waitFor(
        win,
        `document.body.innerText.includes('version probe failed')`,
      )
      if (!loaded) throw new Error('Unrunnable Deno self-check did not render')
      const result = await win.webContents.executeJavaScript(`({
        optimized: document.body.innerText.includes('YouTube 已优化') || document.body.innerText.includes('YouTube optimized'),
        basic: document.body.innerText.includes('基础模式') || document.body.innerText.includes('Basic mode')
      })`, true)
      if (result.optimized || !result.basic) {
        console.error('[RED] an unrunnable Deno path was presented as YouTube optimized.')
        app.exit(1)
        return
      }
      console.log('[GREEN] an unrunnable Deno path stays in basic mode.')
      app.exit(0)
      return
    }
    if (action === 'downloadPreflightFailure') {
      const startLabels = ['开始', 'Start']
      const inputReady = await waitFor(win, `Boolean(document.querySelector('.link-row__input'))`)
      if (!inputReady) throw new Error('Download URL input did not render')
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.link-row__input')
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'https://example.com/media')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `, true)
      const startReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(startLabels)}.includes(button.textContent.trim()) && !button.disabled)`,
      )
      if (!startReady) throw new Error('Start download button did not become available')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(startLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
      const rejected = await waitFor(
        win,
        `document.body.innerText.includes('yt-dlp is damaged or cannot report its version')`,
        1200,
      )
      if (!rejected) throw new Error('Download preflight failure did not reach the renderer')
      await waitFor(
        win,
        `/0$/.test(document.querySelector('.progress-shell--overview .progress-meta span')?.textContent?.trim() ?? '')`,
        500,
      )
      const pendingText = await win.webContents.executeJavaScript(
        `document.querySelector('.progress-shell--overview .progress-meta span')?.textContent?.trim()`,
        true,
      )
      if (!/0$/.test(pendingText ?? '')) {
        console.error(`[RED] rejected download left a ghost queue: ${pendingText}.`)
        app.exit(1)
        return
      }
      console.log('[GREEN] rejected download left the queue empty.')
      app.exit(0)
      return
    }
    if (action === 'runtimeInstallMutex') {
      const checkLabels = ['检查更新', 'Check updates']
      const repairLabels = ['修复 yt-dlp', 'Repair yt-dlp']
      const denoLabels = ['更新 Deno', 'Update Deno']
      const checkReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(checkLabels)}.includes(button.textContent.trim()))`,
      )
      if (!checkReady) throw new Error('Runtime update check button did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(checkLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
      const actionsReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(repairLabels)}.includes(button.textContent.trim())) && Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(denoLabels)}.includes(button.textContent.trim()))`,
      )
      if (!actionsReady) throw new Error('Both runtime install actions did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(repairLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
      const repairRunning = await waitFor(
        win,
        `document.body.innerText.includes('正在验证下载内核') || document.body.innerText.includes('Verifying download core')`,
        1000,
      )
      if (!repairRunning) throw new Error('yt-dlp repair did not start')
      const denoDisabled = await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(denoLabels)}.includes(button.textContent.trim()))
          .disabled
      `, true)
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(denoLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
      await new Promise((resolve) => setTimeout(resolve, 150))
      const counts = await win.webContents.executeJavaScript('window.appApi.getRuntimeInvocationCounts()', true)
      if (!denoDisabled || counts.denoInstallCalls !== 0) {
        console.error(`[RED] Deno install remained available during yt-dlp repair; calls=${counts.denoInstallCalls}.`)
        app.exit(1)
        return
      }
      console.log('[GREEN] runtime install actions are mutually exclusive.')
      app.exit(0)
      return
    }
    if (action === 'ytDlpRepair') {
      const checkLabels = ['检查更新', 'Check updates']
      const repairLabels = ['修复 yt-dlp', 'Repair yt-dlp']
      const checkReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(checkLabels)}.includes(button.textContent.trim()))`,
      )
      if (!checkReady) throw new Error('Runtime update check button did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(checkLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)

      const repairReady = await waitFor(
        win,
        `document.body.innerText.includes('BROKEN') && Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(repairLabels)}.includes(button.textContent.trim()))`,
      )
      if (!repairReady) {
        console.error('[RED] damaged yt-dlp did not expose a repair action.')
        app.exit(1)
        return
      }
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(repairLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
      const verifyingVisible = await waitFor(
        win,
        `document.body.innerText.includes('正在验证下载内核') || document.body.innerText.includes('Verifying download core')`,
        1000,
      )
      if (!verifyingVisible) {
        console.error('[RED] repair verification stage was not visible.')
        app.exit(2)
        return
      }
      console.log('[GREEN] damaged yt-dlp exposed repair and verification UI.')
      app.exit(0)
      return
    }

    const targetLabels = labels[action]
    if (!targetLabels) throw new Error(`Unknown renderer action: ${action}`)
    if (action === 'mediaPickDirectory' || action === 'mediaOpenPath') {
      const workspaceLabels = ['媒体工具', 'Media tools']
      const workspaceReady = await waitFor(
        win,
        `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(workspaceLabels)}.includes(button.textContent.trim()))`,
      )
      if (!workspaceReady) throw new Error('Media tools workspace button did not render')
      await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('button'))
          .find((button) => ${JSON.stringify(workspaceLabels)}.includes(button.textContent.trim()))
          .click()
      `, true)
    }
    const ready = await waitFor(
      win,
      `Array.from(document.querySelectorAll('button')).some((button) => ${JSON.stringify(targetLabels)}.includes(button.textContent.trim()))`,
    )
    if (!ready) {
      const bodyText = await win.webContents.executeJavaScript(`document.body.innerText.slice(0, 3000)`, true)
      throw new Error(`Action button did not render: ${action}\n${bodyText}`)
    }

    await win.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('button'))
        .find((button) => ${JSON.stringify(targetLabels)}.includes(button.textContent.trim()))
        .click()
    `, true)

    if (action === 'pickDirectoryCancel') {
      await new Promise((resolve) => setTimeout(resolve, 250))
      const survived = await win.webContents.executeJavaScript(
        `!document.body.innerText.includes('Renderer error') && document.body.innerText.includes('下载面板')`,
        true,
      )
      if (!survived) {
        console.error('[RED] cancelling the directory dialog replaced the rendered app.')
        app.exit(1)
        return
      }
      console.log('[GREEN] cancelling the directory dialog left the rendered app unchanged.')
      app.exit(0)
      return
    }

    const fatal = await waitFor(win, `document.body.innerText.includes('Renderer error')`, 1200)
    if (fatal) {
      console.error(`[RED] ${action} replaced the renderer with the fatal error page.`)
      app.exit(1)
      return
    }

    const recovered = await waitFor(
      win,
      `!document.body.innerText.includes('Renderer error') && document.body.innerText.includes('[ui]') && (document.body.innerText.includes('无法打开') || document.body.innerText.includes('无法选择') || document.body.innerText.includes('无法在目录') || document.body.innerText.includes('Unable to open') || document.body.innerText.includes('Unable to choose') || document.body.innerText.includes('Unable to show'))`,
      1200,
    )
    if (!recovered) {
      console.error(`[RED] ${action} did not expose a recoverable in-app error and log entry.`)
      app.exit(2)
      return
    }

    console.log(`[GREEN] ${action} stayed recoverable and the renderer remained usable.`)
    app.exit(0)
  } catch (error) {
    console.error('[HARNESS ERROR]', error)
    app.exit(3)
  }
})
