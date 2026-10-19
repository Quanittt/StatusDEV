import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { useState } from 'react'

import { ErrorText } from '@/components/ErrorText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { http } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { portalHeaders } from '@/lib/portal-access'
import { DOCUMENT_STATUS_LABEL, type PortalDocument } from '@/lib/types'

const TONE = { pending: 'warning', approved: 'success', changes_requested: 'neutral' } as const

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`

// Документ на погодження: клієнт відкриває файл, потім «підписує» його іменем або просить правки.
function DocumentCard({ token, doc }: { token: string; doc: PortalDocument }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'idle' | 'sign' | 'changes'>('idle')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const headers = portalHeaders(token)

  const open = useMutation({
    mutationFn: () => http.get<{ url: string }>(`/portal/${token}/documents/${doc.id}/download`, headers),
    onSuccess: ({ url }) => window.open(url, '_blank', 'noopener'),
  })

  const respond = useMutation({
    mutationFn: (body: object) => http.post(`/portal/${token}/documents/${doc.id}/response`, body, headers),
    onSuccess: async () => {
      setMode('idle')
      await qc.invalidateQueries({ queryKey: ['portal', token] })
    },
  })

  const final = doc.status === 'approved'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{doc.title}</p>
          <p className="truncate text-sm text-muted-foreground">
            {doc.fileName} · {formatSize(doc.sizeBytes)}
          </p>
        </div>
        <Badge tone={TONE[doc.status]}>{DOCUMENT_STATUS_LABEL[doc.status]}</Badge>
      </div>

      {final && (
        <p className="text-sm text-success">
          ✓ Погоджено: {doc.signerName}, {formatDate(doc.respondedAt)}
        </p>
      )}
      {doc.status === 'changes_requested' && doc.note && (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">Ваші правки: {doc.note}</p>
      )}

      <Button variant="outline" size="lg" disabled={open.isPending} onClick={() => open.mutate()}>
        {open.isPending ? 'Відкриваю…' : 'Переглянути документ'}
      </Button>
      <ErrorText error={open.error} />

      {!final && mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={() => setMode('sign')}>
            Погодити
          </Button>
          <Button size="lg" variant="outline" onClick={() => setMode('changes')}>
            Є зауваження
          </Button>
        </div>
      )}

      {mode === 'sign' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            respond.mutate({ response: 'approved', signerName: name })
          }}
        >
          <Input
            required
            autoFocus
            maxLength={200}
            autoComplete="name"
            aria-label="Ваше повне ім’я"
            placeholder="Ваше повне ім’я"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Натискаючи «Підписати», ви погоджуєте цей документ. Ім’я, дата й адреса вашого пристрою збережуться як підтвердження.
          </p>
          <ErrorText error={respond.error} />
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={respond.isPending || !name.trim()}>
              Підписати
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setMode('idle')}>
              Скасувати
            </Button>
          </div>
        </form>
      )}

      {mode === 'changes' && (
        <form
          className="flex flex-col gap-2"
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
            <Button type="button" size="lg" variant="ghost" onClick={() => setMode('idle')}>
              Скасувати
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

export function PortalDocuments({ token, documents }: { token: string; documents: PortalDocument[] }) {
  if (documents.length === 0) return null
  return (
    <section className="flex flex-col gap-3" aria-label="Документи">
      <h2 className="text-lg font-semibold">Документи</h2>
      {documents.map((d) => (
        <DocumentCard key={d.id} token={token} doc={d} />
      ))}
    </section>
  )
}
