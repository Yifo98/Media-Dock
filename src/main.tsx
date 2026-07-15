import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MediaToolsView from './MediaToolsView'
import MediaDockV3App from './v3/MediaDockV3App'
import './index.css'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderFatalError(message: string) {
  const root = document.getElementById('root')
  if (!root) {
    return
  }

  root.innerHTML = `
    <div style="min-height:100vh;padding:32px;background:#07101b;color:#f6f8fb;font-family:Segoe UI,Arial,sans-serif;">
      <div style="max-width:960px;margin:0 auto;padding:24px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(255,255,255,.04);">
        <div style="letter-spacing:.18em;font-size:12px;color:#ffb15f;">MEDIA DOCK</div>
        <h1 style="margin:12px 0 8px;">Renderer error</h1>
        <p style="margin:0 0 16px;color:#b9c7d6;">The UI crashed before it could render.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#03070d;padding:16px;border-radius:14px;">${escapeHtml(message)}</pre>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px;">
          <button id="media-dock-export-crash-diagnostics" type="button" style="border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:10px 16px;background:#d9f4ff;color:#07101b;font-weight:700;cursor:pointer;">Export support log</button>
          <button id="media-dock-reload-renderer" type="button" style="border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:10px 16px;background:transparent;color:#f6f8fb;font-weight:700;cursor:pointer;">Reload interface</button>
          <span id="media-dock-crash-action-status" role="status" style="color:#b9c7d6;font-size:13px;"></span>
        </div>
      </div>
    </div>
  `

  const status = document.getElementById('media-dock-crash-action-status')
  const reloadButton = document.getElementById('media-dock-reload-renderer')
  const exportButton = document.getElementById('media-dock-export-crash-diagnostics') as HTMLButtonElement | null
  reloadButton?.addEventListener('click', () => window.location.reload())
  if (!window.mediaDock?.exportSupportDiagnostics) {
    if (exportButton) exportButton.disabled = true
    if (status) status.textContent = 'Diagnostic export is unavailable because the preload bridge did not start.'
    return
  }
  exportButton?.addEventListener('click', async () => {
    exportButton.disabled = true
    if (status) status.textContent = 'Preparing a privacy-safe support log…'
    try {
      const language = window.localStorage.getItem('media-dock-v3-language') === 'en' ? 'en' : 'zh-CN'
      const filePath = await window.mediaDock.exportSupportDiagnostics({ language, recentError: message })
      if (status) status.textContent = filePath ? 'Support log saved.' : 'Export cancelled.'
    } catch {
      if (status) status.textContent = 'The support log could not be exported.'
    } finally {
      exportButton.disabled = false
    }
  })
}

window.addEventListener('error', (event) => {
  renderFatalError(event.error?.stack || event.message || 'Unknown error')
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason)
  renderFatalError(reason)
})

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root was not found.')
}

const route = window.location.hash
document.documentElement.dataset.product = route === '#v3' ? 'v3' : 'legacy'

createRoot(root).render(
  <StrictMode>
    {route === '#v3' ? <MediaDockV3App /> : route === '#media-tools' ? <MediaToolsView /> : <App />}
  </StrictMode>,
)
