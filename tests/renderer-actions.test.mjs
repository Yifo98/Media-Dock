import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const fixturePath = fileURLToPath(new URL('./fixtures/renderer-actions-app.cjs', import.meta.url))

function runRendererAction(action) {
  return spawnSync(electronPath, [fixturePath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MEDIA_DOCK_RENDERER_ACTION: action,
    },
    timeout: 20000,
  })
}

function assertRendererAction(action) {
  const result = runRendererAction(action)
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

  assert.equal(result.status, 0, output)
  assert.match(output, /\[GREEN\]/)
}

for (const action of ['openPath', 'pickDirectory', 'pickDirectoryCancel', 'showItemInFolder', 'mediaPickDirectory', 'mediaOpenPath']) {
  test(`${action} failure remains recoverable in the rendered app`, () => {
    assertRendererAction(action)
  })
}

test('damaged yt-dlp exposes a repair action and verification stage', () => {
  assertRendererAction('ytDlpRepair')
})

test('runtime install actions stay mutually exclusive', () => {
  assertRendererAction('runtimeInstallMutex')
})

test('runtime progress bursts update one exact log line in place', () => {
  assertRendererAction('runtimeProgressDedup')
})

test('runtime progress log stays exact and updates in place with the install bar', () => {
  assertRendererAction('runtimeProgressSync')
})

test('download preflight failure leaves the queue empty', () => {
  assertRendererAction('downloadPreflightFailure')
})

test('an unrunnable Deno path does not claim YouTube optimization', () => {
  assertRendererAction('unrunnableDeno')
})

test('failed runtime repair remains required and explains that no file changed', () => {
  assertRendererAction('runtimeRepairFailure')
})

test('3.0 Workbench opens with Source Dock and one contextual primary action', () => {
  assertRendererAction('v3Workbench')
})

test('3.0 keeps one shared workspace navigation across the four focused product spaces', () => {
  assertRendererAction('v3WorkspaceNavigation')
})

test('3.0 keeps task history out of the Workbench and scrollable in Task Center', () => {
  assertRendererAction('v3TaskScrolling')
})

test('3.0 Workbench starts with sign-in readiness and accepts links only', () => {
  assertRendererAction('v3LocalFlow')
})

test('3.0 merges separate local video and audio with three delivery presets through the task engine', () => {
  assertRendererAction('v3MergeFlow')
})

test('3.0 Settings explains MediaCookies handoff and opens the Chrome Store and GitHub destinations', () => {
  assertRendererAction('v3MediaCookiesGuide')
})

test('3.0 Workbench advances a pasted public link through a completed network-media journey', () => {
  assertRendererAction('v3NetworkFlow')
})

test('3.0 shows honest elapsed-time feedback while Source Inspection is still running', () => {
  assertRendererAction('v3SlowInspection')
})

test('3.0 batches multiple unrelated links without treating them as one collection', () => {
  assertRendererAction('v3MultipleLinksFlow')
})

test('3.0 blocks queue creation when the Cookie preflight no longer matches the Task Plan', () => {
  assertRendererAction('v3PreflightMismatch')
})

test('3.0 Workbench resolves a Bilibili season, selects episodes, and runs one independent Task Batch', () => {
  assertRendererAction('v3CollectionFlow')
})

test('3.0 groups a large collection into collapsible sections with section-level selection', () => {
  assertRendererAction('v3CollectionGrouping')
})

test('3.0 detects authenticated video qualities, plans, and preflights the selected ceiling', () => {
  assertRendererAction('v3QualitySelection')
})

test('3.0 shows exact download progress and whether a MediaCookies profile is in use', () => {
  assertRendererAction('v3TaskVisibility')
})

test('3.0 clears terminal task history without deleting delivered files', () => {
  assertRendererAction('v3ClearHistory')
})

test('3.0 reveals a completed deliverable from its Task Center row', () => {
  assertRendererAction('v3DeliverableReveal')
})

test('3.0 checks yt-dlp and Deno updates from Settings on demand', () => {
  assertRendererAction('v3RuntimeCheck')
})

test('3.0 discloses and exports a sanitized support log from Settings', () => {
  assertRendererAction('v3SupportDiagnostics')
})

test('3.0 remembers an explicit language choice without consulting the system language', () => {
  assertRendererAction('v3LanguagePersistence')
})

test('3.0 explains a collection inspection failure in product language with a recovery action', () => {
  assertRendererAction('v3CollectionProblem')
})

test('3.0 localizes product-owned collection group names in English', () => {
  assertRendererAction('v3EnglishCollection')
})

test('the production preload exposes the Media Dock 3 contract inside the Electron sandbox', () => {
  assertRendererAction('v3ProductionPreload')
})

test('3.0 System Center imports and presents a secret-free Authentication Profile', () => {
  assertRendererAction('v3AuthProfile')
})

test('3.0 release showcase renders the English Workbench and Authentication Profile success', () => {
  assertRendererAction('v3EnglishWorkbench')
  assertRendererAction('v3EnglishAuthProfile')
})
