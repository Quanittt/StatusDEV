import type { ProjectStatus } from '@statusdev/shared'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ErrorText } from '@/components/ErrorText'
import { ProgressBar } from '@/components/ProgressBar'
import { ProjectStatusBadge } from '@/components/ProjectStatusBadge'
import { Button } from '@/components/ui/button'
import { http } from '@/lib/api'
import { formatDate, timeAgo } from '@/lib/format'
import { PROJECT_STATUS_LABEL, type ProjectListItem } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filter = ProjectStatus | 'all'
const FILTERS: Filter[] = ['all', 'active', 'paused', 'done', 'archived']

export default function ProjectsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => http.get<ProjectListItem[]>('/projects'),
  })

  const all = projects.data ?? []
  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((p) => p.status === f).length)
  const shown = filter === 'all' ? all : all.filter((p) => p.status === filter)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Проєкти</h1>
        <Button asChild>
          <Link to="/projects/new">
            <Plus className="size-4" /> Новий проєкт
          </Link>
        </Button>
      </div>

      <ErrorText error={projects.error} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-secondary/60 px-3 py-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1 text-sm',
                filter === f ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {f === 'all' ? 'Усі' : PROJECT_STATUS_LABEL[f]}{' '}
              <span className="rounded-full bg-accent px-1.5 text-xs">{count(f)}</span>
            </button>
          ))}
        </div>

        {projects.isPending && <p className="p-6 text-sm text-muted-foreground">Завантаження…</p>}
        {projects.data && shown.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {all.length === 0 ? 'Створіть перший проєкт.' : 'Проєктів з таким статусом немає.'}
            </p>
            {all.length === 0 && (
              <Button asChild size="sm">
                <Link to="/projects/new">Новий проєкт</Link>
              </Button>
            )}
          </div>
        )}
        <ul className="divide-y divide-border">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 p-4 hover:bg-accent/40">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/projects/${p.id}`} className="text-base font-semibold text-primary hover:underline">
                  {p.title}
                </Link>
                <ProjectStatusBadge status={p.status} />
              </div>
              {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              <div className="flex items-center gap-3">
                <div className="w-48">
                  <ProgressBar value={p.progress} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {p.milestonesDone}/{p.milestonesTotal} етапів
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Клієнт: {p.clientName}</span>
                {p.deadline && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> до {formatDate(p.deadline)}
                  </span>
                )}
                <span>оновлено {timeAgo(p.updatedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
