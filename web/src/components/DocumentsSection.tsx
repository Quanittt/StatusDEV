import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { ErrorText } from '@/components/ErrorText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { http } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { DOCUMENT_STATUS_LABEL, type OwnerDocument } from '@/lib/types'
import { uploadProjectFile } from '@/lib/upload'
import { MAX_FILE_SIZE_BYTES } from '@statusdev/shared'

const TONE = { pending: 'warning', approved: 'success', changes_requested: 'neutral' } as const

// Договір чи ТЗ: власник завантажує файл, клієнт погоджує його в порталі іменем.
export function DocumentsSection({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const key = ['documents', projectId]

  const docs = useQuery({ queryKey: key, queryFn: () => http.get<OwnerDocument[]>(`/projects/${projectId}/documents`) })

  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Оберіть файл')
      if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('Файл завеликий: максимум 25 МБ')
      const uploaded = await uploadProjectFile(projectId, file)
      return http.post(`/projects/${projectId}/documents`, { fileId: uploaded.id, title })
    },
    onSuccess: () => {
      setFile(null)
      setTitle('')
      if (input.current) input.current.value = ''
      qc.invalidateQueries({ queryKey: key })
      onChanged()
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => http.delete(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      onChanged()
    },
  })

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="border-b border-border bg-secondary/60 px-4 py-3 font-semibold">Документи на погодження</h2>
      {docs.data?.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Документів ще немає. Завантажте договір чи ТЗ, і клієнт погодить його в порталі.
        </p>
      )}
      <ul className="divide-y divide-border">
        {docs.data?.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 p-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="flex-1 font-medium">{d.title}</span>
              <Badge tone={TONE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</Badge>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Скасувати запит на погодження"
                onClick={() => confirm(`Скасувати запит «${d.title}»? Файл залишиться в проєкті.`) && remove.mutate(d.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">{d.fileName}</span>
            {d.status === 'approved' && (
              <span className="text-success">
                ✓ Погодив(ла) {d.signerName} · {formatDate(d.respondedAt)}
                {d.signerIp ? ` · IP ${d.signerIp}` : ''}
              </span>
            )}
            {d.status === 'changes_requested' && d.note && (
              <span className="rounded-md bg-warning-bg px-3 py-1.5 text-warning">
                <b>Правки:</b> {d.note}
              </span>
            )}
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 border-t border-border bg-secondary/40 p-4 sm:grid-cols-[1fr_1fr]"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <Input required placeholder="Назва (напр. Договір)" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          ref={input}
          required
          type="file"
          aria-label="Файл документа"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="sm:col-span-2">
          <ErrorText error={create.error ?? remove.error ?? docs.error} />
        </div>
        <Button type="submit" size="sm" className="w-fit" disabled={create.isPending}>
          {create.isPending ? 'Завантажую…' : 'Надіслати на погодження'}
        </Button>
      </form>
    </section>
  )
}
