import { useMutation } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useState } from 'react'

import { ErrorText } from '@/components/ErrorText'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { http } from '@/lib/api'
import { setPortalAccess } from '@/lib/portal-access'

// Екран пароля: показується, коли власник захистив посилання. Токен доступу живе лише у вкладці.
export function PortalPasswordGate({ token, onUnlocked }: { token: string; onUnlocked: () => void }) {
  const [password, setPassword] = useState('')

  const unlock = useMutation({
    mutationFn: () => http.post<{ accessToken: string | null }>(`/portal/${token}/unlock`, { password }),
    onSuccess: ({ accessToken }) => {
      setPortalAccess(token, accessToken)
      onUnlocked()
    },
  })

  return (
    <form
      className="flex flex-col items-center gap-4 pt-8 text-center"
      onSubmit={(e) => {
        e.preventDefault()
        unlock.mutate()
      }}
    >
      <span className="grid size-16 place-items-center rounded-full bg-secondary">
        <Lock className="size-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold">Проєкт захищено паролем</h1>
      <p className="text-muted-foreground">Введіть пароль, який вам надіслав виконавець.</p>
      <Input
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        aria-label="Пароль"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="max-w-xs"
      />
      <ErrorText error={unlock.error} />
      <Button type="submit" size="lg" disabled={unlock.isPending || !password}>
        {unlock.isPending ? 'Перевіряю…' : 'Відкрити'}
      </Button>
    </form>
  )
}
