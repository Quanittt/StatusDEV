export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : 'Щось пішло не так'
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {msg}
    </p>
  )
}
