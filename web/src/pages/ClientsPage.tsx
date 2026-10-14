import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Phone, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ErrorText } from '@/components/ErrorText'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/input'
import { http } from '@/lib/api'
import type { Client } from '@/lib/types'

const empty = { name: '', email: '', phone: '', notes: '' }

export default function ClientsPage() {
  const qc = useQueryClient()
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => http.get<Client[]>('/clients') })
  const [form, setForm] = useState(empty)

  const create = useMutation({
    mutationFn: () =>
      http.post('/clients', {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null,
      }),
    onSuccess: async () => {
      setForm(empty)
      await qc.invalidateQueries({ queryKey: ['clients'] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => http.delete(`/clients/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Клієнти</h1>
        <ErrorText error={clients.error ?? remove.error} />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {clients.isPending && <p className="p-6 text-sm text-muted-foreground">Завантаження…</p>}
          {clients.data?.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">Клієнтів ще немає.</p>
          )}
          <ul className="divide-y divide-border">
            {clients.data?.map((c) => (
              <li key={c.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                    {c.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3.5" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3.5" /> {c.phone}
                      </span>
                    )}
                  </div>
                  {c.notes && <p className="mt-1 text-sm">{c.notes}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Видалити клієнта"
                  onClick={() => confirm(`Видалити клієнта «${c.name}»?`) && remove.mutate(c.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Новий клієнт</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <Field label="Ім’я / компанія">
              <Input required value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Телефон">
              <Input value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Нотатки">
              <Textarea value={form.notes} onChange={set('notes')} />
            </Field>
            <ErrorText error={create.error} />
            <Button type="submit" disabled={create.isPending}>
              Додати клієнта
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
