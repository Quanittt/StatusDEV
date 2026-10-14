import type { MilestoneStatus, ProjectStatus } from '@statusdev/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, Check, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ErrorText } from '@/components/ErrorText'
import { ProgressBar } from '@/components/ProgressBar'
import { ProjectStatusBadge } from '@/components/ProjectStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { http } from '@/lib/api'
import { dateInputToApi, formatDate, timeAgo } from '@/lib/format'
import { MILESTONE_STYLE } from '@/lib/milestone-style'
import {
  MILESTONE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  type Comment,
  type Milestone,
  type ProjectDetails,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const NEXT: Record<MilestoneStatus, MilestoneStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
}

// Посилання для клієнта: створити, скопіювати, оновити (старе перестає працювати) або вимкнути.
function ShareBlock({ project, onChanged }: { project: ProjectDetails; onChanged: () => void }) {
  const [copied, setCopied] = useState(false)
  const create = useMutation({ mutationFn: () => http.post(`/projects/${project.id}/share`), onSuccess: onChanged })
  const revoke = useMutation({ mutationFn: () => http.delete(`/projects/${project.id}/share`), onSuccess: onChanged })
  const link = project.shareToken ? `${window.location.origin}/p/${project.shareToken}` : null

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступний (не https або заборона): користувач скопіює вручну з поля
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Посилання для клієнта</p>
      {link ? (
        <>
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Посилання для клієнта" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Скопійовано' : 'Копіювати'}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Відкрити
              </a>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={create.isPending}
              onClick={() => confirm('Створити нове посилання? Старе одразу перестане працювати.') && create.mutate()}
            >
              Нове посилання
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() => confirm('Вимкнути посилання? Клієнт більше не зможе його відкрити.') && revoke.mutate()}
            >
              <span className="text-destructive">Вимкнути</span>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">Клієнт відкриє його без реєстрації й побачить етапи та що потрібно від нього.</p>
          <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate()}>
            Створити посилання
          </Button>
        </>
      )}
      <ErrorText error={create.error ?? revoke.error} />
    </div>
  )
}

function MilestoneRow({ m, onChanged }: { m: Milestone; onChanged: () => void }) {
  const update = useMutation({
    mutationFn: () => http.patch(`/milestones/${m.id}`, { status: NEXT[m.status] }),
    onSuccess: onChanged,
  })
  const remove = useMutation({
    mutationFn: () => http.delete(`/milestones/${m.id}`),
    onSuccess: onChanged,
  })
  const { icon: Icon, cls } = MILESTONE_STYLE[m.status]

  return (
    <li className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => update.mutate()}
          disabled={update.isPending}
          title="Змінити статус етапу"
          className={cn(
            'inline-flex min-h-11 shrink-0 sm:min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
            cls,
          )}
        >
          <Icon className="size-3.5" /> {MILESTONE_STATUS_LABEL[m.status]}
        </button>
        <span className={cn('flex-1 font-medium', m.status === 'done' && 'text-muted-foreground line-through')}>
          {m.title}
        </span>
        {m.dueDate && (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <CalendarDays className="size-3.5" /> {formatDate(m.dueDate)}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label="Видалити етап"
          onClick={() => confirm(`Видалити етап «${m.title}»?`) && remove.mutate()}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
      {m.clientAction && (
        <p className="ml-1 rounded-md bg-action-bg px-3 py-1.5 text-sm text-action-fg">
          <b>Потрібно від клієнта:</b> {m.clientAction}
        </p>
      )}
      <ErrorText error={update.error ?? remove.error} />
    </li>
  )
}

export default function ProjectPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const key = ['project', id]
  const project = useQuery({ queryKey: key, queryFn: () => http.get<ProjectDetails>(`/projects/${id}`) })
  const comments = useQuery({
    queryKey: ['comments', id],
    queryFn: () => http.get<Comment[]>(`/projects/${id}/comments`),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const setStatus = useMutation({
    mutationFn: (status: ProjectStatus) => http.patch(`/projects/${id}`, { status }),
    onSuccess: refresh,
  })

  const [ms, setMs] = useState({ title: '', dueDate: '', clientAction: '' })
  const addMilestone = useMutation({
    mutationFn: () =>
      http.post(`/projects/${id}/milestones`, {
        title: ms.title,
        dueDate: dateInputToApi(ms.dueDate),
        clientAction: ms.clientAction || null,
      }),
    onSuccess: () => {
      setMs({ title: '', dueDate: '', clientAction: '' })
      refresh()
    },
  })

  const [body, setBody] = useState('')
  const addComment = useMutation({
    mutationFn: () => http.post(`/projects/${id}/comments`, { body }),
    onSuccess: () => {
      setBody('')
      qc.invalidateQueries({ queryKey: ['comments', id] })
    },
  })

  if (project.isPending) return <p className="text-sm text-muted-foreground">Завантаження…</p>
  if (project.isError) return <ErrorText error={project.error} />

  const p = project.data
  const done = p.milestones.filter((m) => m.status === 'done').length
  const progress = p.milestones.length ? done / p.milestones.length : 0

  return (
    <div className="flex flex-col gap-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Усі проєкти
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <ProjectStatusBadge status={p.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-6">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-4 py-3">
              <h2 className="font-semibold">Етапи</h2>
              <div className="w-40">
                <ProgressBar value={progress} />
              </div>
              <span className="text-xs text-muted-foreground">
                {done}/{p.milestones.length}
              </span>
            </div>
            {p.milestones.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Етапів ще немає. Додайте перший нижче.
              </p>
            )}
            <ul className="divide-y divide-border">
              {p.milestones.map((m) => (
                <MilestoneRow key={m.id} m={m} onChanged={refresh} />
              ))}
            </ul>
            <form
              className="grid gap-2 border-t border-border bg-secondary/40 p-4 sm:grid-cols-[1fr_9rem]"
              onSubmit={(e) => {
                e.preventDefault()
                addMilestone.mutate()
              }}
            >
              <Input
                required
                placeholder="Назва нового етапу"
                value={ms.title}
                onChange={(e) => setMs({ ...ms, title: e.target.value })}
              />
              <Input type="date" value={ms.dueDate} onChange={(e) => setMs({ ...ms, dueDate: e.target.value })} />
              <Input
                className="sm:col-span-2"
                placeholder="Що потрібно від клієнта (необов’язково)"
                value={ms.clientAction}
                onChange={(e) => setMs({ ...ms, clientAction: e.target.value })}
              />
              <ErrorText error={addMilestone.error} />
              <Button type="submit" size="sm" className="w-fit" disabled={addMilestone.isPending}>
                Додати етап
              </Button>
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <h2 className="border-b border-border bg-secondary/60 px-4 py-3 font-semibold">Коментарі</h2>
            {comments.data?.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">Коментарів ще немає.</p>
            )}
            <ul className="divide-y divide-border">
              {comments.data?.map((c) => (
                <li key={c.id} className="p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge tone={c.authorType === 'owner' ? 'primary' : 'neutral'}>
                      {c.authorType === 'owner' ? 'Ви' : 'Клієнт'}
                    </Badge>
                    {timeAgo(c.createdAt)}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
            <form
              className="flex flex-col gap-2 border-t border-border bg-secondary/40 p-4"
              onSubmit={(e) => {
                e.preventDefault()
                addComment.mutate()
              }}
            >
              <Textarea required placeholder="Написати коментар…" value={body} onChange={(e) => setBody(e.target.value)} />
              <ErrorText error={addComment.error} />
              <Button type="submit" size="sm" className="w-fit" disabled={addComment.isPending}>
                Надіслати
              </Button>
            </form>
          </section>
        </div>

        <aside className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Статус</p>
            <Select value={p.status} onChange={(e) => setStatus.mutate(e.target.value as ProjectStatus)}>
              {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <div className="mt-2">
              <ErrorText error={setStatus.error} />
            </div>
          </div>
          <ShareBlock project={p} onChanged={refresh} />
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Клієнт</p>
            {p.clientName ?? '—'}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Дедлайн</p>
            {formatDate(p.deadline)}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Оновлено</p>
            {timeAgo(p.updatedAt)}
          </div>
          {p.description && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Опис</p>
              <p className="whitespace-pre-wrap">{p.description}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
