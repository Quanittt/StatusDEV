import { useSyncExternalStore } from 'react'

// Варіанти дизайну для розробки: перемикаються атрибутом data-theme на <html>,
// самі кольори лежать у index.css. Працює лише в dev (див. main.tsx і App.tsx).
export const THEMES = [
  { id: 'warm', label: 'Тепла (поточна)', dots: ['#f7f0e1', '#8a4b25', '#3a2a20'] },
  { id: 'neutral', label: 'Нейтральна shadcn', dots: ['#ffffff', '#171717', '#171717'] },
  { id: 'ocean', label: 'Океан', dots: ['#f3f6fb', '#1d4ed8', '#0f2a4a'] },
  { id: 'forest', label: 'Ліс', dots: ['#f2f6ef', '#2f6b3a', '#1f3a26'] },
  { id: 'dark', label: 'Темна', dots: ['#14161a', '#e8a35c', '#0e1013'] },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

const KEY = 'statusdev-theme'

function isTheme(v: string | null): v is ThemeId {
  return THEMES.some((t) => t.id === v)
}

export function getStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY)
    return isTheme(v) ? v : 'warm'
  } catch {
    return 'warm'
  }
}

const listeners = new Set<() => void>()
let current: ThemeId | null = null

export function applyTheme(id: ThemeId) {
  const root = document.documentElement
  if (id === 'warm') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', id)
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Приватний режим: тема діє до перезавантаження.
  }
  current = id
  listeners.forEach((l) => l())
}

// Спільний стан: перемикач у панелі й сторінка /design бачать один вибір.
export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => (current ??= getStoredTheme()),
  )
  return [theme, applyTheme] as const
}
