const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const action = process.env.MEDIA_DOCK_RENDERER_ACTION
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
    show: false,
    width: 1500,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'renderer-actions-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: `renderer-actions-${action}-${Date.now()}`,
    },
  })

  try {
    await win.loadFile(path.resolve(__dirname, '../../dist/index.html'))
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
