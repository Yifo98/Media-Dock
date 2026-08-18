export const STARTUP_SPLASH_MIN_VISIBLE_MS = 650
export const STARTUP_SPLASH_FADE_OUT_MS = 220
export const STARTUP_SPLASH_COMPLETE_HOLD_MS = 180
export const STARTUP_SPLASH_TOTAL_STEPS = 7

export type StartupProgressSnapshot = Readonly<{
  completed: number
  total: number
  percent: number
  message: string
}>

export function normalizeStartupProgress(
  completed: number,
  total: number,
  message: string,
): StartupProgressSnapshot {
  const safeTotal = Number.isFinite(total) ? Math.max(1, Math.trunc(total)) : 1
  const finiteCompleted = Number.isFinite(completed) ? Math.trunc(completed) : 0
  const safeCompleted = Math.min(safeTotal, Math.max(0, finiteCompleted))
  return {
    completed: safeCompleted,
    total: safeTotal,
    percent: Math.round((safeCompleted / safeTotal) * 100),
    message: message.trim() || '正在准备应用…',
  }
}

export function createStartupSplashProgressScript(
  completed: number,
  total: number,
  message: string,
): string {
  const progress = JSON.stringify(normalizeStartupProgress(completed, total, message))
    .replace(/</gu, '\\u003c')
  return `(() => {
    const next = ${progress};
    const status = document.getElementById('startup-status');
    const percent = document.getElementById('startup-percent');
    const count = document.getElementById('startup-count');
    const progressbar = document.getElementById('startup-progress');
    const fill = document.getElementById('startup-progress-fill');
    if (status) status.textContent = next.message;
    if (percent) percent.textContent = next.percent + '%';
    if (count) count.textContent = next.completed + ' / ' + next.total;
    if (progressbar) {
      progressbar.setAttribute('aria-valuemax', String(next.total));
      progressbar.setAttribute('aria-valuenow', String(next.completed));
      progressbar.setAttribute('aria-valuetext', next.percent + '%，' + next.message);
    }
    if (fill) fill.style.width = next.percent + '%';
    return next;
  })()`
}

function safeIconDataUrl(iconDataUrl: string | null): string | null {
  if (!iconDataUrl) return null
  return /^data:image\/png;base64,[a-z0-9+/=]+$/iu.test(iconDataUrl) ? iconDataUrl : null
}

export function createStartupSplashDocument(iconDataUrl: string | null): string {
  const icon = safeIconDataUrl(iconDataUrl)
  const visual = icon
    ? `<img class="brand-icon" src="${icon}" alt="" />`
    : '<span class="brand-fallback" aria-hidden="true">泊</span>'

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
  <title>Media Dock 正在启动</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
    body { display: grid; place-items: center; opacity: 0; animation: appear 260ms ease-out forwards; transition: opacity 220ms ease, transform 220ms ease; }
    body.leaving { opacity: 0; transform: scale(.975); }
    .surface {
      position: relative;
      width: 404px;
      min-height: 244px;
      display: grid;
      justify-items: center;
      align-content: center;
      padding: 28px 34px 24px;
      overflow: hidden;
      border: 1px solid rgba(56, 74, 80, .12);
      border-radius: 28px;
      color: #202a2e;
      background: linear-gradient(145deg, rgba(250, 248, 244, .985), rgba(239, 244, 242, .985));
      box-shadow: 0 22px 64px rgba(31, 45, 50, .22), inset 0 1px 0 rgba(255, 255, 255, .86);
    }
    .surface::before {
      content: "";
      position: absolute;
      inset: -110px auto auto -90px;
      width: 260px;
      height: 260px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(60, 176, 195, .16), transparent 68%);
      animation: drift 3.2s ease-in-out infinite alternate;
    }
    .mark { position: relative; width: 82px; height: 82px; display: grid; place-items: center; margin-bottom: 17px; }
    .mark::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 27px;
      background: conic-gradient(from 30deg, #48bbca, rgba(72, 187, 202, .08) 34%, #79c8aa 72%, #48bbca);
      animation: berth 2.1s linear infinite;
      filter: drop-shadow(0 8px 16px rgba(52, 151, 164, .2));
    }
    .mark::after { content: ""; position: absolute; inset: 4px; border-radius: 24px; background: #f7f8f4; }
    .brand-icon, .brand-fallback { position: relative; z-index: 1; width: 66px; height: 66px; border-radius: 21px; }
    .brand-icon { display: block; object-fit: contain; }
    .brand-fallback { display: grid; place-items: center; color: #2e9db0; background: white; font-size: 30px; font-weight: 800; }
    .eyebrow { margin: 0 0 7px; color: #329bad; font-size: 11px; font-weight: 800; letter-spacing: .24em; }
    h1 { margin: 0; font-size: 24px; font-weight: 780; letter-spacing: -.03em; }
    .status { min-height: 17px; margin: 8px 0 10px; color: #718087; font-size: 12px; }
    .progress-meta { width: 214px; display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; color: #4d646b; }
    .progress-percent { color: #2f9eaf; font-size: 12px; font-variant-numeric: tabular-nums; font-weight: 800; }
    .progress-count { font-size: 10px; font-variant-numeric: tabular-nums; font-weight: 700; letter-spacing: .04em; }
    .progress { width: 214px; height: 3px; overflow: hidden; border-radius: 999px; background: rgba(47, 111, 119, .1); }
    .progress span { display: block; width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #42adbd, #84c9ae); transition: width 180ms ease-out; }
    .signature { position: absolute; right: 22px; bottom: 17px; color: rgba(53, 105, 114, .55); font-size: 8px; font-weight: 800; letter-spacing: .19em; }
    @keyframes appear { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
    @keyframes berth { to { transform: rotate(360deg); } }
    @keyframes drift { to { transform: translate(22px, 18px); } }
    @media (prefers-reduced-motion: reduce) {
      body, .surface::before, .mark::before { animation: none; }
      body { opacity: 1; }
      .progress span { transition: none; }
    }
  </style>
</head>
<body>
  <main class="surface" role="status" aria-live="polite" aria-label="Media Dock 正在启动">
    <div class="mark">${visual}</div>
    <p class="eyebrow">MEDIA DOCK · 泊 / QIDU</p>
    <h1>正在准备工作区</h1>
    <p id="startup-status" class="status">正在准备应用数据…</p>
    <div class="progress-meta" aria-hidden="true">
      <strong id="startup-percent" class="progress-percent">0%</strong>
      <span id="startup-count" class="progress-count">0 / ${STARTUP_SPLASH_TOTAL_STEPS}</span>
    </div>
    <div
      id="startup-progress"
      class="progress"
      role="progressbar"
      aria-label="Media Dock 启动进度"
      aria-valuemin="0"
      aria-valuemax="${STARTUP_SPLASH_TOTAL_STEPS}"
      aria-valuenow="0"
      aria-valuetext="0%，正在准备应用数据"
    ><span id="startup-progress-fill"></span></div>
    <span class="signature">A QIDU UTILITY</span>
  </main>
</body>
</html>`
}
