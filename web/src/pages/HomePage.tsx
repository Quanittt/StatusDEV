import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { http } from '@/lib/api'

interface Health {
  ok: boolean
  db: boolean
}

export default function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => http.get<Health>('/health') })

  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>StatusDEV</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p data-testid="health" className="text-sm text-muted-foreground">
            {health.isPending && 'Перевіряю API…'}
            {health.isError && `API недоступне: ${health.error.message}`}
            {health.data && `API працює, база ${health.data.db ? 'підключена' : 'недоступна'}`}
          </p>
          <Button variant="outline" onClick={() => health.refetch()} disabled={health.isFetching}>
            Перевірити ще раз
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
