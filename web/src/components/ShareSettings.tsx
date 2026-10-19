import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { ErrorText } from '@/components/ErrorText'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { http } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { ProjectDetails } from '@/lib/types'

// Дата в полі вибору — це день, тому посилання діє до кінця цього дня (UTC).
const endOfDay = (v: string) => new Date(`${v}T23:59:59.000Z`).toISOString()

const minDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Захист посилання: термін дії й пароль. Токен посилання при цьому не змінюється.
export function ShareSettings({ project, onChanged }: { project: ProjectDetails; onChanged: () => void }) {
  const [expires, setExpires] = useState('')
  const [password, setPassword] = useState('')

  const save = useMutation({
    mutationFn: (body: { expiresAt?: string | null; password?: string | null }) =>
      http.patch(`/projects/${project.id}/share`, body),
    onSuccess: () => {
      setExpires('')
      setPassword('')
      onChanged()
    },
  })

  return (
    <div className="flex flex-col gap-3 rounded-md bg-secondary/50 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Захист посилання</p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="share-expires" className="text-sm font-medium">
          Діє до
        </label>
        <p className="text-xs text-muted-foreground">
          {project.shareExpiresAt ? `Зараз: ${formatDate(project.shareExpiresAt)}` : 'Зараз: безстроково'}
        </p>
        <div className="flex gap-2">
          <Input
            id="share-expires"
            type="date"
            min={minDate()}
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!expires || save.isPending}
            onClick={() => save.mutate({ expiresAt: endOfDay(expires) })}
          >
            Зберегти
          </Button>
        </div>
        {project.shareExpiresAt && (
          <Button
            size="sm"
            variant="ghost"
            className="w-fit"
            disabled={save.isPending}
            onClick={() => save.mutate({ expiresAt: null })}
          >
            Зробити безстроковим
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="share-password" className="text-sm font-medium">
          Пароль
        </label>
        <p className="text-xs text-muted-foreground">
          {project.sharePasswordSet ? 'Зараз: пароль встановлено' : 'Зараз: без пароля'}
        </p>
        <div className="flex gap-2">
          <Input
            id="share-password"
            type="text"
            autoComplete="off"
            minLength={6}
            maxLength={100}
            placeholder="Мінімум 6 символів"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={password.length < 6 || save.isPending}
            onClick={() => save.mutate({ password })}
          >
            Задати
          </Button>
        </div>
        {project.sharePasswordSet && (
          <Button
            size="sm"
            variant="ghost"
            className="w-fit"
            disabled={save.isPending}
            onClick={() => save.mutate({ password: null })}
          >
            Зняти пароль
          </Button>
        )}
      </div>
      <ErrorText error={save.error} />
    </div>
  )
}
