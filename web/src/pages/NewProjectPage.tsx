import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorText } from '@/components/ErrorText'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { http } from '@/lib/api'
import { dateInputToApi } from '@/lib/format'
import type { Client, ProjectTemplateInfo } from '@/lib/types'

export default function NewProjectPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => http.get<Client[]>('/clients') })
  const templates = useQuery({
    queryKey: ['project-templates'],
    queryFn: () => http.get<ProjectTemplateInfo[]>('/project-templates'),
    staleTime: Infinity,
  })
  const [form, setForm] = useState({ clientId: '', title: '', description: '', deadline: '', template: '' })

  const create = useMutation({
    mutationFn: () =>
      http.post<{ id: string }>('/projects', {
        clientId: form.clientId,
        title: form.title,
        description: form.description || null,
        deadline: dateInputToApi(form.deadline),
        template: form.template || undefined,
      }),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${p.id}`)
    },
  })

  const selectedTemplate = templates.data?.find((t) => t.id === form.template)

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value })

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Новий проєкт</h1>
      <Card>
        <CardContent className="pt-6">
          {clients.data?.length === 0 ? (
            <p className="text-sm">
              Спершу додайте клієнта на сторінці{' '}
              <Link to="/clients" className="font-medium text-primary hover:underline">
                Клієнти
              </Link>
              .
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate()
              }}
            >
              <Field label="Клієнт">
                <Select required value={form.clientId} onChange={set('clientId')}>
                  <option value="">Оберіть клієнта…</option>
                  {clients.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Назва">
                <Input required maxLength={200} value={form.title} onChange={set('title')} />
              </Field>
              <Field label="Опис">
                <Textarea value={form.description} onChange={set('description')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Дедлайн">
                  <Input type="date" value={form.deadline} onChange={set('deadline')} />
                </Field>
                <Field label="Шаблон етапів">
                  <Select value={form.template} onChange={set('template')}>
                    <option value="">Без шаблону</option>
                    {templates.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {selectedTemplate && (
                <div className="rounded-md bg-secondary/60 p-3 text-sm">
                  <p className="mb-1 font-medium">Етапи шаблону «{selectedTemplate.label}»:</p>
                  <ol className="list-decimal pl-5 text-muted-foreground">
                    {selectedTemplate.milestones.map((m) => (
                      <li key={m.title}>{m.title}</li>
                    ))}
                  </ol>
                </div>
              )}
              <ErrorText error={create.error} />
              <div className="flex gap-2">
                <Button type="submit" disabled={create.isPending}>
                  Створити проєкт
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/">Скасувати</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
