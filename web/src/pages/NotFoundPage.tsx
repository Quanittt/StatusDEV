import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold">Сторінку не знайдено</h1>
      <Link to="/" className="text-sm underline">
        На головну
      </Link>
    </main>
  )
}
