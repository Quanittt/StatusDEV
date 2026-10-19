import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { ErrorText } from '@/components/ErrorText'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { http } from '@/lib/api'
import { useMe } from '@/lib/auth'
import { safeBrandColor } from '@/lib/color'
import type { Integrations, Owner } from '@/lib/types'
import { uploadLogo } from '@/lib/upload'
import { LOGO_MIME_TYPES, MAX_LOGO_SIZE_BYTES } from '@statusdev/shared'

// Бренд, який бачить клієнт у порталі: назва, колір, логотип.
function BrandCard({ me }: { me: Owner }) {
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(me.brandName ?? '')
  const [color, setColor] = useState(safeBrandColor(me.brandColor))
  const [saved, setSaved] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] })

  const save = useMutation({
    mutationFn: () => http.patch('/me', { brandName: name.trim() || null, brandColor: color }),
    onSuccess: async () => {
      await refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
        throw new Error('Логотип має бути PNG, JPEG або WebP')
      }
      if (file.size > MAX_LOGO_SIZE_BYTES) throw new Error('Логотип завеликий: максимум 1 МБ')
      await uploadLogo(file)
    },
    onSuccess: refresh,
    onSettled: () => {
      if (fileInput.current) fileInput.current.value = ''
    },
  })

  const remove = useMutation({ mutationFn: () => http.delete('/me/logo'), onSuccess: refresh })

  const logo = me.brandLogoUrl

  return (
    <Card>
      <CardHeader>
        <CardTitle>Бренд у порталі клієнта</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Назва">
            <Input maxLength={100} placeholder={me.name} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Колір">
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="p-1" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="Логотип" className="h-12 max-w-32 rounded border border-border bg-white object-contain p-1" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded border border-dashed border-border text-xs text-muted-foreground">
              Немає
            </span>
          )}
          <div className="flex flex-col gap-1">
            <input
              ref={fileInput}
              type="file"
              accept={LOGO_MIME_TYPES.join(',')}
              aria-label="Файл логотипу"
              className="text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload.mutate(file)
              }}
            />
            <span className="text-xs text-muted-foreground">PNG, JPEG або WebP до 1 МБ</span>
          </div>
          {logo && (
            <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <span className="text-destructive">Видалити</span>
            </Button>
          )}
        </div>
        <ErrorText error={save.error ?? upload.error ?? remove.error} />
        <div className="flex items-center gap-3">
          <Button className="w-fit" disabled={save.isPending} onClick={() => save.mutate()}>
            Зберегти
          </Button>
          {saved && <span className="text-sm text-success">Збережено</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function TelegramCard({ data, onChanged }: { data: Integrations['telegram']; onChanged: () => void }) {
  const [link, setLink] = useState<{ code: string; deepLink: string | null } | null>(null)

  const createLink = useMutation({
    mutationFn: () => http.post<{ code: string; deepLink: string | null }>('/me/integrations/telegram/link'),
    onSuccess: (res) => {
      setLink(res)
      // Поки користувач натискає /start у боті, перевіряємо, чи чат прив'язано.
      const timer = setInterval(onChanged, 3000)
      setTimeout(() => clearInterval(timer), 120_000)
    },
  })
  const unlink = useMutation({ mutationFn: () => http.delete('/me/integrations/telegram'), onSuccess: onChanged })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!data.available && (
          <p className="text-muted-foreground">
            Бот не налаштований на сервері. Задайте <code>TELEGRAM_BOT_TOKEN</code> в <code>api/.env</code> і перезапустіть API.
          </p>
        )}
        {data.available && data.linked && (
          <>
            <p className="text-success">✓ Підключено: сповіщення про коментарі, відповіді й дедлайни приходять у Telegram.</p>
            <Button size="sm" variant="outline" className="w-fit" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
              Відключити
            </Button>
          </>
        )}
        {data.available && !data.linked && (
          <>
            <p className="text-muted-foreground">Отримуйте сповіщення в Telegram замість пошти.</p>
            {link ? (
              <div className="flex flex-col gap-2">
                {link.deepLink ? (
                  <Button asChild className="w-fit">
                    <a href={link.deepLink} target="_blank" rel="noreferrer">
                      Відкрити бота
                    </a>
                  </Button>
                ) : (
                  <p>
                    Надішліть боту команду <code>/start {link.code}</code>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Код діє 15 хвилин. Натисніть «Start» у боті, і ця сторінка оновиться.</p>
              </div>
            ) : (
              <Button className="w-fit" disabled={createLink.isPending} onClick={() => createLink.mutate()}>
                Підключити Telegram
              </Button>
            )}
          </>
        )}
        <ErrorText error={createLink.error ?? unlink.error} />
      </CardContent>
    </Card>
  )
}

function WebhookCard({ data, onChanged }: { data: Integrations['webhook']; onChanged: () => void }) {
  const [url, setUrl] = useState(data.url ?? '')

  const save = useMutation({
    mutationFn: (value: string | null) => http.put('/me/integrations/webhook', { url: value }),
    onSuccess: onChanged,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Вебхук</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          StatusDEV надсилатиме POST із JSON про події (коментарі клієнтів, відповіді, дедлайни) на вашу адресу. Кожен запит
          підписано заголовком <code>X-StatusDEV-Signature</code>.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(url.trim() || null)
          }}
        >
          <Input type="url" placeholder="https://example.com/hooks/statusdev" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" disabled={save.isPending}>
            {data.url && !url.trim() ? 'Вимкнути' : 'Зберегти'}
          </Button>
        </form>
        {data.secret && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Секрет для перевірки підпису</span>
            <Input readOnly value={data.secret} onFocus={(e) => e.currentTarget.select()} aria-label="Секрет вебхука" />
          </div>
        )}
        <ErrorText error={save.error} />
      </CardContent>
    </Card>
  )
}

function TestCard({ onDone }: { onDone: () => void }) {
  const test = useMutation({
    mutationFn: () => http.post<{ telegram: string; webhook: string }>('/me/integrations/test'),
    onSuccess: onDone,
  })
  const label: Record<string, string> = { ok: 'надіслано', not_configured: 'не підключено' }
  const show = (v: string) => label[v] ?? v

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="w-fit" disabled={test.isPending} onClick={() => test.mutate()}>
        Надіслати тестове сповіщення
      </Button>
      {test.data && (
        <ul className="text-sm text-muted-foreground">
          <li>Telegram: {show(test.data.telegram)}</li>
          <li>Вебхук: {show(test.data.webhook)}</li>
        </ul>
      )}
      <ErrorText error={test.error} />
    </div>
  )
}

export default function SettingsPage() {
  const me = useMe()
  const qc = useQueryClient()
  const integrations = useQuery({
    queryKey: ['integrations'],
    queryFn: () => http.get<Integrations>('/me/integrations'),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['integrations'] })

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Налаштування</h1>
      {me.data && <BrandCard me={me.data} />}
      <ErrorText error={integrations.error} />
      {integrations.data && (
        <>
          <h2 className="-mb-2 text-lg font-semibold">Сповіщення</h2>
          <TelegramCard data={integrations.data.telegram} onChanged={refresh} />
          <WebhookCard key={integrations.data.webhook.url ?? ''} data={integrations.data.webhook} onChanged={refresh} />
          <TestCard onDone={refresh} />
        </>
      )}
    </div>
  )
}
