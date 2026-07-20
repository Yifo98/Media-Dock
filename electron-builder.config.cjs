const fs = require('node:fs')
const path = require('node:path')

const signedRelease = process.env.MEDIA_DOCK_SIGNED_RELEASE === '1'

function collectRuntimeSignExclusions(rootDirectory, relativeDirectory = '') {
  if (!fs.existsSync(rootDirectory)) return []

  const exclusions = []
  for (const entry of fs.readdirSync(rootDirectory, { withFileTypes: true })) {
    const childRelativePath = path.join(relativeDirectory, entry.name)
    const childPath = path.join(rootDirectory, entry.name)
    if (entry.isDirectory()) {
      exclusions.push(...collectRuntimeSignExclusions(childPath, childRelativePath))
    } else if (entry.isFile() && /\.(?:exe|dll)$/iu.test(entry.name)) {
      exclusions.push(`!${path.join('tools', childRelativePath)}`)
    }
  }
  return exclusions
}

const runtimeSignExclusions = [
  '!yt-dlp.exe',
  '!deno.exe',
  '!ffmpeg.exe',
  '!ffprobe.exe',
  ...collectRuntimeSignExclusions(path.join(__dirname, 'tools')),
]

if (process.env.WIN_CSC_LINK && !process.env.CSC_LINK) {
  process.env.CSC_LINK = process.env.WIN_CSC_LINK
}
if (process.env.WIN_CSC_KEY_PASSWORD && !process.env.CSC_KEY_PASSWORD) {
  process.env.CSC_KEY_PASSWORD = process.env.WIN_CSC_KEY_PASSWORD
}

const windowsTrustedSigningEnvironment = {
  publisherName: process.env.MEDIA_DOCK_AZURE_PUBLISHER_NAME,
  endpoint: process.env.AZURE_TRUSTED_SIGNING_ENDPOINT,
  codeSigningAccountName: process.env.AZURE_TRUSTED_SIGNING_ACCOUNT,
  certificateProfileName: process.env.AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE,
}
const trustedSigningValues = Object.values(windowsTrustedSigningEnvironment)
const trustedSigningConfigured = trustedSigningValues.every(Boolean)
const trustedSigningPartiallyConfigured = trustedSigningValues.some(Boolean) && !trustedSigningConfigured

if (trustedSigningPartiallyConfigured) {
  throw new Error('Azure Trusted Signing configuration is incomplete.')
}

const windowsPfxConfigured = Boolean(process.env.WIN_CSC_LINK || process.env.CSC_LINK)
const appleSigningConfigured = Boolean(process.env.CSC_NAME || process.env.CSC_LINK)
const appleNotarizationConfigured = Boolean(
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)
  || (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
  || (process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE),
)

if (!signedRelease && (trustedSigningConfigured || windowsPfxConfigured || appleSigningConfigured || appleNotarizationConfigured)) {
  throw new Error('Signing credentials are present, but MEDIA_DOCK_SIGNED_RELEASE=1 was not set.')
}

if (signedRelease && process.platform === 'win32' && !trustedSigningConfigured && !windowsPfxConfigured) {
  throw new Error('A signed Windows release requires Azure Trusted Signing or WIN_CSC_LINK/CSC_LINK.')
}

if (signedRelease && process.platform === 'darwin' && (!appleSigningConfigured || !appleNotarizationConfigured)) {
  throw new Error('A signed macOS release requires a Developer ID identity and notarization credentials.')
}

const previewLabel = signedRelease ? '' : '-Unsigned-Developer-Preview'

module.exports = {
  appId: 'com.yifo.mediadock',
  productName: 'Media Dock',
  copyright: 'Copyright © 2026 Yifo',
  asar: true,
  npmRebuild: false,
  afterPack: './scripts/after-pack.cjs',
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: [
    'dist/**',
    'dist-electron/**',
    'electron/preload.cjs',
    'electron/v3/preloadApi.cjs',
    'package.json',
  ],
  extraResources: [
    {
      from: 'tools',
      to: 'tools',
      filter: ['**/*'],
    },
    {
      from: 'build/icon.png',
      to: 'icon.png',
    },
  ],
  win: {
    icon: 'build/icon.ico',
    executableName: 'Media Dock',
    target: 'zip',
    artifactName: `Media-Dock-\${version}${previewLabel}-\${arch}-win.\${ext}`,
    requestedExecutionLevel: 'asInvoker',
    signAndEditExecutable: true,
    // Every staged third-party EXE/DLL under tools is excluded by its path
    // suffix. The final ZIP must match the pre-build manifest byte-for-byte so
    // an existing vendor signature is never replaced by the Media Dock one.
    signExts: runtimeSignExclusions,
    forceCodeSigning: signedRelease,
    ...(trustedSigningConfigured
      ? {
          azureSignOptions: {
            ...windowsTrustedSigningEnvironment,
            fileDigest: 'SHA256',
            timestampDigest: 'SHA256',
          },
        }
      : signedRelease
        ? {
            signtoolOptions: {
              signingHashAlgorithms: ['sha256'],
              rfc3161TimeStampServer: 'http://timestamp.digicert.com',
            },
          }
        : {}),
  },
  mac: {
    icon: 'build/icon.icns',
    category: 'public.app-category.video',
    target: 'zip',
    artifactName: `Media-Dock-\${version}${previewLabel}-\${arch}-mac.\${ext}`,
    // Hardened library validation requires a real Developer ID Team ID.
    // Unsigned previews use a complete ad-hoc signature without claiming it.
    hardenedRuntime: signedRelease,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    gatekeeperAssess: false,
    strictVerify: true,
    forceCodeSigning: signedRelease,
    notarize: signedRelease,
    // Apple Silicon still requires a structurally valid signature even when
    // the preview has no Developer ID trust. Let electron-builder own the
    // bundle signature, while preserving the independently verified runtime
    // signatures created by build-mac-share.sh. Re-signing those binaries with
    // hardened-runtime flags prevents FFmpeg from loading its ad-hoc dylibs.
    ...(signedRelease ? {} : {
      identity: '-',
      signIgnore: '/Contents/Resources/tools/',
    }),
  },
}
