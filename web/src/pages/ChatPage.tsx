import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ErrorText } from '@/components/ErrorText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { http } from '@/lib/api'
import { useMe } from '@/lib/auth'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

type ChatRole = 'owner' | 'pm' | 'junior'

interface ChatProject {
  id: string
  title: string
  role: ChatRole
}
interface Contact {
  userId: string
  name: string
  role: ChatRole
}
interface Member {
  userId: string
  name: string
  email: string
  role: 'pm' | 'junior'
}
interface Message {
  id: string
  senderId: string
  body: string
  createdAt: string
}

const ROLE_LABEL: Record<ChatRole, string> = { owner: 'Власник', pm: 'PM', junior: 'Junior' }

// Кого власник додає в проєкт. Чат дозволений лише owner↔PM і PM↔junior, тому джун бачить тільки PM.
function TeamPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'pm' | 'junior'>('pm')

  const members = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => http.get<Member[]>(`/projects/${projectId}/members`),
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['members', projectId] })
    qc.invalidateQueries({ queryKey: ['contacts', projectId] })
  }
  const add = useMutation({
    mutationFn: () => http.post(`/projects/${projectId}/members`, { email, role }),
    onSuccess: () => {
      setEmail('')
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (userId: string) => http.delete(`/projects/${projectId}/members/${userId}`),
    onSuccess: refresh,
  })

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold">Команда проєкту</h2>
      {members.data?.length === 0 && <p className="text-muted-foreground">Ще нікого немає.</p>}
      <ul className="flex flex-col gap-2">
        {members.data?.map((m) => (
          <li key={m.userId} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.name}</p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            </div>
            <Badge tone="neutral">{ROLE_LABEL[m.role]}</Badge>
            <button
              type="button"
              aria-label={`Прибрати ${m.name}`}
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-destructive"
              onClick={() => remove.mutate(m.userId)}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <Input
          required
          type="email"
          placeholder="Email зареєстрованого користувача"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select value={role} onChange={(e) => setRole(e.target.value as 'pm' | 'junior')}>
          <option value="pm">PM</option>
          <option value="junior">Junior</option>
        </Select>
        <ErrorText error={add.error ?? remove.error} />
        <Button type="submit" size="sm" className="w-fit" disabled={add.isPending}>
          Додати
        </Button>
      </form>
    </section>
  )
}

function Thread({ projectId, contact, meId }: { projectId: string; contact: Contact; meId: string }) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const key = ['messages', projectId, contact.userId]

  // Опитування раз на 3 секунди: без WebSocket, але нові повідомлення з'являються майже одразу.
  const messages = useQuery({
    queryKey: key,
    queryFn: () => http.get<Message[]>(`/projects/${projectId}/chat/${contact.userId}/messages?limit=100`),
    refetchInterval: 3000,
  })
  const send = useMutation({
    mutationFn: () => http.post(`/projects/${projectId}/chat/${contact.userId}/messages`, { body }),
    onSuccess: () => {
      setBody('')
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const count = messages.data?.length ?? 0
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [count, contact.userId])

  return (
    <section className="flex h-[70vh] min-h-96 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3">
        <h2 className="font-semibold">{contact.name}</h2>
        <Badge tone="neutral">{ROLE_LABEL[contact.role]}</Badge>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.isError && <ErrorText error={messages.error} />}
        {messages.data?.length === 0 && (
          <p className="m-auto text-sm text-muted-foreground">Повідомлень ще немає. Напишіть першим.</p>
        )}
        {messages.data?.map((m) => {
          const mine = m.senderId === meId
          return (
            <div key={m.id} className={cn('flex max-w-[80%] flex-col', mine ? 'items-end self-end' : 'items-start')}>
              <p
                className={cn(
                  'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                  mine ? 'bg-primary text-primary-foreground' : 'bg-secondary',
                )}
              >
                {m.body}
              </p>
              <span className="mt-0.5 text-xs text-muted-foreground">{timeAgo(m.createdAt)}</span>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      <form
        className="flex flex-col gap-2 border-t border-border bg-secondary/40 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim()) send.mutate()
        }}
      >
        <ErrorText error={send.error} />
        <div className="flex gap-2">
          <Input
            required
            maxLength={2000}
            placeholder="Повідомлення…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" disabled={send.isPending} aria-label="Надіслати">
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </section>
  )
}

export default function ChatPage() {
  const me = useMe()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [contactId, setContactId] = useState<string | null>(null)

  const projects = useQuery({ queryKey: ['chat-projects'], queryFn: () => http.get<ChatProject[]>('/chat/projects') })
  const current = projects.data?.find((p) => p.id === projectId) ?? projects.data?.[0]

  const contacts = useQuery({
    queryKey: ['contacts', current?.id],
    queryFn: () => http.get<Contact[]>(`/projects/${current!.id}/chat/contacts`),
    enabled: !!current,
  })
  const contact = contacts.data?.find((c) => c.userId === contactId) ?? contacts.data?.[0]

  if (projects.isPending) return <p className="text-sm text-muted-foreground">Завантаження…</p>
  if (projects.isError) return <ErrorText error={projects.error} />
  if (!current) {
    return <p className="text-sm text-muted-foreground">Спершу створіть проєкт або попросіть власника додати вас у команду.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Чат</h1>
        <div className="w-64">
          <Select
            aria-label="Проєкт"
            value={current.id}
            onChange={(e) => {
              setContactId(null)
              navigate(`/chat/${e.target.value}`)
            }}
          >
            {projects.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({ROLE_LABEL[p.role]})
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <h2 className="border-b border-border bg-secondary/60 px-4 py-3 text-sm font-semibold">Співрозмовники</h2>
            {contacts.data?.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {current.role === 'owner' ? 'Додайте PM у команду проєкту.' : 'Поки немає з ким говорити.'}
              </p>
            )}
            <ul className="divide-y divide-border">
              {contacts.data?.map((c) => (
                <li key={c.userId}>
                  <button
                    type="button"
                    onClick={() => setContactId(c.userId)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-secondary',
                      contact?.userId === c.userId && 'bg-secondary font-medium',
                    )}
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <Badge tone="neutral">{ROLE_LABEL[c.role]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {current.role === 'owner' && <TeamPanel projectId={current.id} />}
        </aside>

        {contact && me.data ? (
          <Thread projectId={current.id} contact={contact} meId={me.data.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Оберіть співрозмовника.</p>
        )}
      </div>
    </div>
  )
}
