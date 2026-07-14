import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { importLatestLegacyAuthenticationPackage } from '../dist-electron/v3/legacyAuthenticationImport.js'
import { createMediaTaskEngine } from '../dist-electron/v3/mediaTaskEngine.js'

test('the newest legacy MediaCookies package is copied into an empty v3 workspace exactly once', async () => {
  const rootDirectory = mkdtempSync(path.join(tmpdir(), 'media-dock-v3-legacy-auth-'))
  const legacyRoot = path.join(rootDirectory, 'cookies')
  const packageDirectory = path.join(legacyRoot, 'package-001')
  const serviceDirectory = path.join(packageDirectory, 'by-service')
  mkdirSync(serviceDirectory, { recursive: true })
  writeFileSync(path.join(serviceDirectory, 'bilibili-b-site.cookies.txt'), '# Netscape HTTP Cookie File\n.bilibili.com\tTRUE\t/\tTRUE\t2147483647\tSESSDATA\tfixture\n')
  writeFileSync(path.join(serviceDirectory, 'domain-example.com.cookies.txt'), '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t2147483647\tSID\tfixture\n')
  const engine = createMediaTaskEngine({
    dataDirectory: path.join(rootDirectory, 'v3'),
    idFactory: () => 'legacy-auth-profile-001',
  })

  try {
    assert.equal(await importLatestLegacyAuthenticationPackage(engine, legacyRoot), true)
    assert.deepEqual(engine.getWorkspaceSnapshot().authenticationProfiles.map((profile) => ({
      displayName: profile.displayName,
      services: profile.services,
    })), [{
      displayName: 'Existing MediaCookies',
      services: ['bilibili-b-site'],
    }])
    assert.equal(await importLatestLegacyAuthenticationPackage(engine, legacyRoot), false)
    assert.equal(engine.getWorkspaceSnapshot().authenticationProfiles.length, 1)
  } finally {
    engine.close()
    rmSync(rootDirectory, { recursive: true, force: true })
  }
})
