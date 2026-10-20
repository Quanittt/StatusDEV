import { Link } from 'react-router-dom'

import { THEMES, type ThemeId, useTheme } from '@/lib/theme'

// Плаваюча панель для розробки: перемикає тему на будь-якому екрані. У production не рендериться (див. App.tsx).
export function DevThemeBar() {
  const [theme, setTheme] = useTheme()
  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs opacity-60 shadow-lg transition-opacity hover:opacity-100 focus-within:opacity-100">
      <Link to="/design" className="font-medium text-primary hover:underline">
        Дизайн
      </Link>
      <select
        aria-label="Тема"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeId)}
        className="rounded border border-input bg-background px-1 py-0.5"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}
