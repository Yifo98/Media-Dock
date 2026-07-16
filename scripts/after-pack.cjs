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
        'Unsigned does not mean Defender detected malware; Windows cannot verify the publisher identity for this build.',
        'The missing signature does not limit Media Dock features after Windows permits the app to start.',
        'Windows Smart App Control or enterprise policy may still block it before launch.',
        'A batch launcher does not bypass this policy; every child EXE and DLL is still evaluated.',
        '',
        'Privacy and safety:',
        '- Tasks, authentication profiles, caches, and indexes stay in the local Media Dock Data directory.',
        '- Media Dock has no automatic telemetry and does not upload passwords, Cookie values, task databases, media files, or support logs to the developer.',
        '- During a user-requested authenticated task, yt-dlp sends only the matching Cookie to the corresponding source website.',
        '- Support logs are created only on user request and redact credentials, URL queries, user paths, task titles, and media paths.',
        '- Download only from https://github.com/Yifo98/Media-Dock/releases and verify SHA256SUMS.txt before running.',
        '- Keep Microsoft Defender enabled and scan the ZIP or extracted directory.',
        '',
        'If Windows blocks the app:',
        '- Open Windows Security > Protection history first. If Defender reports malware or a potentially unwanted app, stop and report it; do not allow it.',
        '- SmartScreen warning: after verifying the official source and SHA-256, choose More info > Run anyway only if Windows offers it.',
        '- Smart App Control block: there is no per-app allow option. Prefer waiting for a signed build or using a controlled test device.',
        '- Turning off Smart App Control changes protection for the entire device, not only Media Dock. Do so only by your own informed choice.',
        '- Do not use registry, ExecutionPolicy Bypass, antivirus-disable, or enterprise-policy workarounds.',
        '- Full guidance: https://github.com/Yifo98/Media-Dock/blob/main/docs/release/windows-security-and-privacy.md',
        'It is intended for controlled internal testing, not general public distribution.',
      ]),
      '',
    ].join('\r\n'), 'utf8')
    return
  }

}
