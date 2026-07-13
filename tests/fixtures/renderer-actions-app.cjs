const { app, BrowserWindow } = require('electron')
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

async function waitFor(win, expression, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await win.webContents.executeJavaScript(expression, true)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

app.commandLine.appendSwitch('disable-gpu')
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: Boolean(screenshotPath),
    width: screenshotPath ? screenshotWidth : 1500,
    height: screenshotPath ? screenshotHeight : 1000,
    webPreferences: {
      preload: path.join(__dirname, 'renderer-actions-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: `renderer-actions-${action}-${Date.now()}`,
    },
  })

  try {
    await win.loadFile(
      path.resolve(__dirname, '../../dist/index.html'),
      action === 'v3Workbench' || action === 'v3LocalFlow' ? { hash: 'v3' } : undefined,
    )
    if (action === 'v3Workbench') {
      const workbenchReady = await waitFor(
        win,
        `Boolean(document.querySelector('.md3-source-dock')) && document.body.innerText.includes('来源入口')`,
      )
      if (!workbenchReady) throw new Error('Media Dock 3 Workbench did not render Source Dock')
      const primaryActions = await win.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.md3-primary-action'))
          .filter((button) => button.offsetParent !== null)
          .map((button) => button.textContent.trim())
      `, true)
      if (primaryActions.length !== 1 || !primaryActions[0].startsWith('选择本地媒体')) {
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
    if (action === 'v3LocalFlow') {
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

      await clickPrimary('选择本地媒体')
      await clickPrimary('检查来源')
      await clickPrimary('选择成品位置')
      await clickPrimary('开始处理')
      await clickPrimary('查看成品')
      const delivered = await waitFor(
        win,
        `document.body.innerText.includes('成品库') && document.body.innerText.includes('field-note - 音频.m4a')`,
      )
      if (!delivered) throw new Error('Completed Deliverable did not appear in Deliverable Library')
      console.log('[GREEN] Media Dock 3 advances one primary action through a completed local-media journey.')
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
