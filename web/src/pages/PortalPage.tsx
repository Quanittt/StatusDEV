import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { ErrorText } from '@/components/ErrorText'
import { MilestonePill } from '@/components/MilestonePill'
import { PortalDocuments } from '@/components/PortalDocuments'
import { PortalPasswordGate } from '@/components/PortalPasswordGate'
import { ProgressBar } from '@/components/ProgressBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { ApiError, http } from '@/lib/api'
import { safeBrandColor, textOn } from '@/lib/color'
import { formatDate, timeAgo } from '@/lib/format'
import { portalHeaders } from '@/lib/portal-access'
import type { PortalData, PortalMilestone } from '@/lib/types'
import { PROJECT_STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'

// Портал клієнта: без входу, спершу для телефону (375 px). Текст ≥ 16 px, кнопки ≥ 44 px.
function Shell({
  color,
  name,
  logoUrl,
  children,
}: {
  color?: string | null
  name?: string
  logoUrl?: string | null
  children: React.ReactNode
}) {
  const bg = safeBrandColor(color)
  return (
    <div className="min-h-screen">
      <header style={{ backgroundColor: bg, color: textOn(bg) }} className="px-6 py-4">
        <div className="mx-auto flex max-w-md items-center gap-3 text-base font-semibold">
          {logoUrl && <img src={logoUrl} alt="" className="h-8 max-w-24 rounded object-contain" />}
          {name ?? 'StatusDEV'}
        </div>
      </header>
      <main className="mx-auto flex max-w-md flex-col gap-5 px-6 pb-10 pt-6 text-base">{children}</main>
    </div>
  )
}

// Клієнт приймає етап або просить правки. Відповідь можна змінити, поки власник не оновив етап.
function MilestoneResponse({ token, m }: { token: string; m: PortalMilestone }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')

  const respond = useMutation({
    mutationFn: (v: { response: 'approved' | 'changes_requested'; note?: string }) =>
      http.post(`/portal/${token}/milestones/${m.id}/response`, v, portalHeaders(token)),
    onSuccess: async () => {
      setEditing(false)
      setAsking(false)
      setNote('')
      await qc.invalidateQueries({ queryKey: ['portal', token] })
    },
  })

  const answered = m.clientResponse !== null && !editing

  if (answered) {
    return (
      <div className="flex w-full flex-col gap-1">
        <p className={cn('text-sm font-medium', m.clientResponse === 'approved' ? 'text-success' : 'text-warning')}>
          {m.clientResponse === 'approved' ? '✓ Ви прийняли цей етап' : 'Ви попросили правки'}
        </p>
        {m.clientResponse === 'changes_requested' && m.clientResponseNote && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.clientResponseNote}</p>
        )}
        <button
          type="button"
          className="min-h-11 self-start text-sm text-primary underline"
          onClick={() => setEditing(true)}
        >
          Змінити відповідь
        </button>
      </div>
    )
  }

  if (asking) {
    return (
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          respond.mutate({ response: 'changes_requested', note })
        }}
      >
        <Textarea
          required
          autoFocus
          maxLength={1000}
          aria-label="Які правки потрібні"
          placeholder="Опишіть, що змінити"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <ErrorText error={respond.error} />
        <div className="flex gap-2">
          <Button type="submit" size="lg" disabled={respond.isPending || !note.trim()}>
            Надіслати правки
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={() => setAsking(false)}>
            Скасувати
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={respond.isPending} onClick={() => respond.mutate({ response: 'approved' })}>
          Прийнято
        </Button>
        <Button size="lg" variant="outline" disabled={respond.isPending} onClick={() => setAsking(true)}>
          Потрібні правки
        </Button>
      </div>
      <ErrorText error={respond.error} />
    </div>
  )
}

export default function PortalPage() {
  const { token = '' } = useParams()
  const qc = useQueryClient()
  const [body, setBody] = useState('')

  // Посилання не для пошуковиків.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    // Токен у адресі не повинен потрапляти в Referer.
    const referrer = document.createElement('meta')
    referrer.name = 'referrer'
    referrer.content = 'no-referrer'
    document.head.append(meta, referrer)
    return () => {
      meta.remove()
      referrer.remove()
    }
  }, [])

  const portal = useQuery({
    queryKey: ['portal', token],
    queryFn: () => http.get<PortalData>(`/portal/${token}`, portalHeaders(token)),
  })

  const send = useMutation({
    mutationFn: () => http.post(`/portal/${token}/comments`, { body }, portalHeaders(token)),
    onSuccess: async () => {
      setBody('')
      await qc.invalidateQueries({ queryKey: ['portal', token] })
    },
  })

  if (portal.isPending) {
    return (
      <Shell>
        <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Завантаження">
          <div className="h-8 w-3/4 rounded bg-secondary" />
          <div className="h-3 rounded-full bg-secondary" />
          <div className="h-20 rounded-lg bg-secondary" />
          <div className="h-16 rounded-lg bg-secondary" />
        </div>
      </Shell>
    )
  }

  // Пароль ще не вводили або токен доступу застарів (власник змінив пароль).
  if (portal.error instanceof ApiError && portal.error.code === 'PORTAL_PASSWORD_REQUIRED') {
    return (
      <Shell>
        <PortalPasswordGate token={token} onUnlocked={() => void portal.refetch()} />
      </Shell>
    )
  }

  if (portal.error instanceof ApiError && portal.error.status === 410) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-error-bg text-3xl font-bold text-destructive">!</span>
          <h1 className="text-2xl font-semibold">Термін дії посилання минув</h1>
          <p className="text-muted-foreground">Попросіть власника проєкту надіслати нове посилання.</p>
        </div>
      </Shell>
    )
  }

  if (portal.isError) {
    // 400 (обрізаний токен) і 404 для клієнта однакові: посилання недійсне, повтор не допоможе.
    const gone =
      portal.error instanceof ApiError && (portal.error.status === 404 || portal.error.status === 400)
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-error-bg text-3xl font-bold text-destructive">!</span>
          <h1 className="text-2xl font-semibold">{gone ? 'Посилання застаріло' : 'Не вдалося завантажити'}</h1>
          <p className="text-muted-foreground">
            {gone
              ? 'Попросіть власника проєкту надіслати нове посилання.'
              : 'Перевірте з’єднання й спробуйте ще раз.'}
          </p>
          {!gone && (
            <Button size="lg" onClick={() => portal.refetch()}>
              Спробувати ще раз
            </Button>
          )}
        </div>
      </Shell>
    )
  }

  const p = portal.data
  const actions = p.milestones.filter((m) => m.status !== 'done' && m.clientAction && m.clientResponse !== 'approved')

  return (
    <Shell color={p.owner.color} name={p.owner.name} logoUrl={p.owner.logoUrl}>
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {p.status !== 'active' && <Badge tone={p.status === 'done' ? 'primary' : 'warning'}>{PROJECT_STATUS_LABEL[p.status]}</Badge>}
          <span>Оновлено {timeAgo(p.updatedAt)}</span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <ProgressBar value={p.progress} />
        <p className="text-sm text-muted-foreground">
          {p.milestones.length === 0
            ? 'Етапи ще не додано'
            : `${p.milestonesDone} з ${p.milestones.length} етапів`}
          {p.nextDate && (
            <span className="ml-2 inline-flex items-center gap-1">
              <CalendarDays className="size-4" /> наступна дата: {formatDate(p.nextDate)}
            </span>
          )}
        </p>
      </section>

      {actions.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg bg-action-bg p-4 text-action-fg" aria-label="Потрібно від вас">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Потрібно від вас</h2>
          {actions.map((m) => (
            <p key={m.id} className="font-medium">
              {m.clientAction}
              <span className="block text-sm font-normal opacity-80">Етап: {m.title}</span>
            </p>
          ))}
        </section>
      )}

      <PortalDocuments token={token} documents={p.documents} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Етапи</h2>
        {p.milestones.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-semibold">Етапи ще готуються</p>
            <p className="mt-1 text-muted-foreground">Власник скоро додасть план робіт. Загляньте пізніше.</p>
          </div>
        )}
        {p.milestones.map((m) => (
          <div key={m.id} className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card p-3">
            <MilestonePill status={m.status} />
            <p className={cn('font-medium', m.status === 'done' && 'text-muted-foreground')}>{m.title}</p>
            {m.dueDate && m.status !== 'done' && (
              <p className="text-sm text-muted-foreground">до {formatDate(m.dueDate)}</p>
            )}
            {m.canRespond && <MilestoneResponse token={token} m={m} />}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Коментарі</h2>
        {p.comments.map((c) => (
          <div key={c.id} className={cn('rounded-lg p-3', c.authorType === 'client' ? 'bg-primary-bg' : 'border border-border bg-card')}>
            <p className="mb-1 text-sm text-muted-foreground">
              {c.authorType === 'client' ? 'Ви' : p.owner.name} · {timeAgo(c.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            send.mutate()
          }}
        >
          <Textarea
            required
            maxLength={2000}
            placeholder="Напишіть, що думаєте…"
            aria-label="Ваш коментар"
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              if (send.isSuccess || send.isError) send.reset()
            }}
          />
          <ErrorText error={send.error} />
          <Button type="submit" size="lg" disabled={send.isPending || !body.trim()}>
            {send.isPending ? 'Надсилаю…' : 'Надіслати'}
          </Button>
          {send.isSuccess && <p className="text-sm text-success">Надіслано. Власник побачить ваш коментар.</p>}
        </form>
      </section>

      {p.expiresAt && (
        <p className="text-center text-xs text-muted-foreground">Посилання діє до {formatDate(p.expiresAt)}</p>
      )}
      <p className="text-center text-xs text-muted-foreground">Зроблено на StatusDEV</p>
    </Shell>
  )
}
