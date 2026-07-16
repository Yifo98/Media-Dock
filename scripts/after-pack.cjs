const { writeFile } = require('node:fs/promises')
const path = require('node:path')

const signedRelease = process.env.MEDIA_DOCK_SIGNED_RELEASE === '1'
const buildLabel = signedRelease ? 'Signed Release' : 'Unsigned Developer Preview'

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') {
    const readmePath = path.join(context.appOutDir, 'README-windows.txt')
    await writeFile(readmePath, [
      'Media Dock for Windows',
      `Build type: ${buildLabel}`,
      '',
      'Run "Media Dock.exe" directly after extracting the complete ZIP.',
      'Portable data is stored in the sibling "Media Dock Data" directory.',
      '',
      ...(signedRelease ? [] : [
        'This developer preview is not Authenticode signed.',
        'Windows Smart App Control or enterprise policy may block it before launch.',
        'A batch launcher does not bypass this policy; every child EXE and DLL is still evaluated.',
        'It is intended for controlled internal testing, not general public distribution.',
      ]),
      '',
    ].join('\r\n'), 'utf8')
    return
  }

}
