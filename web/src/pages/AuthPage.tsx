import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { ErrorText } from '@/components/ErrorText'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { http } from '@/lib/api'
import { useMe } from '@/lib/auth'

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup'
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  const submit = useMutation({
    mutationFn: () =>
      isSignup
        ? http.post('/api/auth/sign-up/email', form)
        : http.post('/api/auth/sign-in/email', { email: form.email, password: form.password }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/', { replace: true })
    },
  })

  if (me.data) return <Navigate to="/" replace />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-header text-xl font-semibold text-header-foreground">
            S
          </span>
          <h1 className="text-xl font-semibold">
            {isSignup ? 'Створити акаунт StatusDEV' : 'Увійти в StatusDEV'}
          </h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                submit.mutate()
              }}
            >
              {isSignup && (
                <Field label="Ім’я">
                  <Input required value={form.name} onChange={set('name')} autoComplete="name" />
                </Field>
              )}
              <Field label="Email">
                <Input required type="email" value={form.email} onChange={set('email')} autoComplete="email" />
              </Field>
              <Field label="Пароль" hint={isSignup ? 'Щонайменше 8 символів' : undefined}>
                <Input
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={set('password')}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                />
              </Field>
              <ErrorText error={submit.error} />
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending ? 'Зачекайте…' : isSignup ? 'Зареєструватись' : 'Увійти'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 rounded-lg border border-border p-4 text-center text-sm">
          {isSignup ? 'Вже є акаунт? ' : 'Вперше тут? '}
          <Link to={isSignup ? '/login' : '/signup'} className="font-medium text-primary hover:underline">
            {isSignup ? 'Увійти' : 'Створити акаунт'}
          </Link>
        </p>
      </div>
    </div>
  )
}
