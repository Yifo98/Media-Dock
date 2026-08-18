function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function redactUrlQueries(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>]+/giu, (candidate) => {
    try {
      const url = new URL(candidate)
      return url.origin
    } catch {
      return '[network URL redacted]'
    }
  })
}

export function redactDiagnosticText(value: string, homeDirectory: string) {
  let redacted = String(value).slice(0, 8_000)
  redacted = redacted
    .replace(/^\s*(?:cookie|set-cookie|authorization|proxy-authorization)\s*:[^\r\n]*/gimu, '[credential header redacted]')
    .replace(/--cookies(?:-from-browser)?(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/giu, '--authentication-file [redacted]')
  redacted = redactUrlQueries(redacted)
  if (homeDirectory) {
    redacted = redacted.replace(new RegExp(escapeRegExp(homeDirectory), 'giu'), '[home]')
  }
  redacted = redacted
    .replace(/\[home\](?:[\\/][^\s"'<>]+)*/giu, '[local path]')
    .replace(/(?:"\\\\[^"]+"|'\\\\[^']+'|\\\\[^\s"'<>;,]+(?:\\[^\s"'<>;,]+)+)/gu, '[local path]')
    .replace(/(?:"[A-Z]:\\[^"]+"|'[A-Z]:\\[^']+'|\b[A-Z]:\\[^\s,;]+)/giu, '[local path]')
    .replace(/(?<![:/])\/(?:[^\s"'<>;,/]+\/)*[^\s"'<>;,/]+/gu, '[local path]')
    .replace(/(?:\.{0,2}[\\/]|[A-Z0-9._-]+[\\/])+[^\s"'<>;,\\/]+\.(?:3g2|3gp|aac|aiff?|alac|avi|flac|flv|m4a|m4v|mka|mkv|mov|mp3|mp4|mpeg|mpg|oga|ogg|ogv|opus|ts|wav|webm|wma|wmv)\b/giu, '[local path]')
    .replace(/\b[^\s"'<>;,\\/]+\.(?:3g2|3gp|aac|aiff?|alac|avi|flac|flv|m4a|m4v|mka|mkv|mov|mp3|mp4|mpeg|mpg|oga|ogg|ogv|opus|ts|wav|webm|wma|wmv)\b/giu, '[local path]')
    .replace(/["']?\b(?:cookie|cookies|authorization|proxy-authorization|token|access[_-]?token|refresh[_-]?token|password|passwd|secret|sessdata|bili_jct|dedeuserid|buvid3)\b["']?\s*(?:[:=]\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '[credential redacted]')
  return redacted.trim()
}
