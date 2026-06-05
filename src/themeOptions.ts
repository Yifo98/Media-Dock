export type Theme = 'graphite' | 'prism' | 'ember'

export type ThemeOption = {
  id: Theme
  zh: string
  en: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'graphite', zh: '石墨', en: 'Graphite' },
  { id: 'prism', zh: '幻光', en: 'Prism' },
  { id: 'ember', zh: '余烬', en: 'Ember' },
]

export function isTheme(value: unknown): value is Theme {
  return THEME_OPTIONS.some((option) => option.id === value)
}

export function getThemeLabel(option: ThemeOption, language: 'zh' | 'en') {
  return language === 'zh' ? option.zh : option.en
}
