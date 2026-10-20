import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { MilestonePill } from '@/components/MilestonePill'
import { ProgressBar } from '@/components/ProgressBar'
import { ProjectStatusBadge } from '@/components/ProjectStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { safeBrandColor, textOn } from '@/lib/color'
import { THEMES, useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

// Лише для розробки (маршрут є тільки в dev): порівняння варіантів теми й брендів на прикладах.
const BRANDS = [
  { name: 'Студія Тест', color: '#7c3aed' },
  { name: 'Сонячна студія', color: '#facc15' },
  { name: 'MONO', color: '#111827' },
  { name: 'Eco Dev', color: '#15803d' },
  { name: 'Без бренду', color: '' },
]

const TOKENS = [
  'background', 'card', 'primary', 'secondary', 'accent', 'muted-foreground', 'border',
  'header', 'destructive', 'success', 'warning', 'info-bg', 'ok-bg', 'action-bg',
] as const

const SCREENS = [
  ['/login', 'Вхід'],
  ['/', 'Проєкти'],
  ['/clients', 'Клієнти'],
  ['/chat', 'Чат'],
  ['/settings', 'Налаштування'],
] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function PortalPreview({ brand }: { brand: { name: string; color: string } }) {
  const bg = safeBrandColor(brand.color)
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <header style={{ backgroundColor: bg, color: textOn(bg) }} className="px-6 py-4 text-base font-semibold">
        {brand.name === 'Без бренду' ? 'StatusDEV' : brand.name}
      </header>
      <div className="flex flex-col gap-4 px-6 pb-6 pt-5 text-base">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-semibold">Сайт для кав'ярні</h3>
          <p className="text-sm text-muted-foreground">Оновлено 2 год тому</p>
        </div>
        <div className="flex flex-col gap-2">
          <ProgressBar value={0.4} />
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            2 з 5 етапів
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4" /> наступна дата: 22 жовт.
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-action-bg p-4 text-action-fg">
          <h4 className="text-xs font-semibold uppercase tracking-wide">Потрібно від вас</h4>
          <p className="font-medium">
            Переглянути й затвердити дизайн
            <span className="block text-sm font-normal opacity-80">Етап: Прототип і дизайн</span>
          </p>
        </div>
        {[
          ['done', 'Бриф і вимоги', null],
          ['in_progress', 'Прототип і дизайн', 'до 22 жовт.'],
          ['todo', 'Верстка і розробка', 'до 5 лист.'],
        ].map(([status, title, due]) => (
          <div key={title} className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card p-3">
            <MilestonePill status={status as 'todo' | 'in_progress' | 'done'} />
            <p className={cn('font-medium', status === 'done' && 'text-muted-foreground')}>{title}</p>
            {due && <p className="text-sm text-muted-foreground">{due}</p>}
            {status === 'in_progress' && (
              <div className="flex flex-wrap gap-2">
                <Button size="lg">Прийнято</Button>
                <Button size="lg" variant="outline">Потрібні правки</Button>
              </div>
            )}
          </div>
        ))}
        <div className="rounded-lg bg-primary-bg p-3">
          <p className="mb-1 text-sm text-muted-foreground">Ви · 5 год тому</p>
          <p>Дякую! Подивлюсь завтра зранку.</p>
        </div>
      </div>
    </div>
  )
}

function OwnerPreview() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="flex h-12 items-center gap-3 bg-header px-4 text-header-foreground">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">S</span>
        <span className="font-semibold text-white">StatusDEV</span>
        <span className="rounded-md bg-white/15 px-3 py-1 text-sm text-white">Проєкти</span>
        <span className="text-sm text-header-foreground/80">Клієнти</span>
        <span className="text-sm text-header-foreground/80">Чат</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Проєкти</h3>
          <Button size="sm">+ Новий проєкт</Button>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {[
            ['Сайт для кав\'ярні', 'active', 0.4, '2/5'],
            ['Мобільний застосунок для зали', 'paused', 0, '0/6'],
            ['Логотип і брендбук', 'done', 1, '4/4'],
            ['Редизайн блогу', 'archived', 1, '5/5'],
          ].map(([title, status, progress, count]) => (
            <li key={title as string} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-primary">{title}</span>
                <ProjectStatusBadge status={status as 'active' | 'paused' | 'done' | 'archived'} />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-48"><ProgressBar value={progress as number} /></div>
                <span className="text-xs text-muted-foreground">{count} етапів</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function DesignPage() {
  const [theme, setTheme] = useTheme()
  const [brand, setBrand] = useState(BRANDS[0])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Варіанти дизайну</h1>
        <p className="text-sm text-muted-foreground">
          Сторінка є лише в dev. Тема зберігається в браузері й діє на весь застосунок, тож після вибору можна пройтись
          реальними екранами з демо-даними (<code>npm run db:seed</code>).
        </p>
      </div>

      <Section title="Тема">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={cn(
                'flex flex-col gap-2 rounded-lg border bg-card p-3 text-left text-sm',
                theme === t.id ? 'border-primary ring-2 ring-ring' : 'border-border hover:bg-accent',
              )}
            >
              <span className="flex gap-1">
                {t.dots.map((c, i) => (
                  <span key={i} className="size-6 rounded-full border border-black/10" style={{ background: c }} />
                ))}
              </span>
              <span className="font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Бренд фрілансера у порталі">
        <div className="flex flex-wrap gap-2">
          {BRANDS.map((b) => (
            <button
              key={b.name}
              onClick={() => setBrand(b)}
              aria-pressed={brand.name === b.name}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
                brand.name === b.name ? 'border-primary bg-primary-bg font-medium' : 'border-border bg-card hover:bg-accent',
              )}
            >
              <span className="size-4 rounded-full border border-black/10" style={{ background: safeBrandColor(b.color) }} />
              {b.name}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Колір тексту в шапці рахується автоматично (білий або темний за контрастом WCAG): подивіться на жовтий і чорний.
        </p>
      </Section>

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <Section title="Портал клієнта (телефон)">
          <PortalPreview brand={brand} />
        </Section>
        <Section title="Кабінет власника">
          <OwnerPreview />
        </Section>
      </div>

      <Section title="Компоненти">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Основна</Button>
            <Button variant="secondary">Другорядна</Button>
            <Button variant="outline">Контурна</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Видалити</Button>
            <Button disabled>Недоступна</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">sm</Button>
            <Button>default</Button>
            <Button size="lg">lg</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>neutral</Badge>
            <Badge tone="success">success</Badge>
            <Badge tone="warning">warning</Badge>
            <Badge tone="primary">primary</Badge>
            <MilestonePill status="todo" />
            <MilestonePill status="in_progress" />
            <MilestonePill status="done" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Поле вводу" />
            <Textarea placeholder="Багаторядкове поле" />
          </div>
          <div className="flex flex-col gap-2">
            {[0, 0.4, 1].map((v) => (
              <ProgressBar key={v} value={v} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Палітра">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {TOKENS.map((t) => (
            <div key={t} className="flex flex-col gap-1 text-xs">
              <span className="h-12 rounded-md border border-border" style={{ background: `var(--${t})` }} />
              <code>{t}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Реальні екрани">
        <div className="flex flex-wrap gap-2">
          {SCREENS.map(([to, label]) => (
            <Button key={to} asChild variant="outline">
              <Link to={to}>{label}</Link>
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Вхід: <code>t1@example.com</code> / <code>12345678</code> (ще t2–t5 з іншими брендами). Посилання на портали
          друкує <code>npm run db:seed</code>.
        </p>
      </Section>
    </div>
  )
}
