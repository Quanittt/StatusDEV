export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-success transition-all"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  )
}
