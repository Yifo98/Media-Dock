const WINDOWS_PROHIBITED_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
const TRAILING_SPACES_OR_DOTS = /[ .]+$/u

export function sanitizeDeliveryFileName(fileName: string): string {
  const normalized = fileName.normalize('NFC')
  const withoutProhibitedCharacters = [...normalized]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || WINDOWS_PROHIBITED_CHARACTERS.has(character) ? '_' : character
    })
    .join('')
  const withoutUnsafeEnding = withoutProhibitedCharacters.replace(TRAILING_SPACES_OR_DOTS, '')
  return withoutUnsafeEnding || 'Media Dock Deliverable'
}
