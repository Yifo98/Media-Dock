const { writeFile } = require('node:fs/promises')
const path = require('node:path')

const signedRelease = process.env.MEDIA_DOCK_SIGNED_RELEASE === '1'
const buildLabel = signedRelease ? 'Signed Release' : 'Unsigned Developer Preview'

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') {
    const launcherPath = path.join(context.appOutDir, 'Launch Media Dock.bat')
    const readmePath = path.join(context.appOutDir, 'README-windows.txt')
    await writeFile(launcherPath, [
      '@echo off',
      'setlocal',
      'cd /d "%~dp0"',
      'set "MEDIA_DOCK_PORTABLE_ROOT=%~dp0"',
      'start "" "%~dp0Media Dock.exe"',
      '',
    ].join('\r\n'), 'utf8')
    await writeFile(readmePath, [
      'Media Dock for Windows',
      `Build type: ${buildLabel}`,
      '',
      'Run "Media Dock.exe" directly after extracting the complete ZIP.',
      '"Launch Media Dock.bat" remains available as an optional compatibility launcher.',
      'Portable data is stored in the sibling "Media Dock Data" directory.',
      '',
      ...(signedRelease ? [] : [
        'This developer preview is not Authenticode signed.',
        'Windows Smart App Control or enterprise policy may block it before launch.',
        'It is intended for controlled internal testing, not general public distribution.',
      ]),
      '',
    ].join('\r\n'), 'utf8')
    return
  }

}
