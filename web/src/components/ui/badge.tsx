import { cn } from '@/lib/utils'

const tones = {
  neutral: 'border-border text-muted-foreground',
  success: 'border-success/40 bg-success-bg text-success',
  warning: 'border-warning/40 bg-warning-bg text-warning',
  primary: 'border-primary/30 bg-primary-bg text-primary',
} as const

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: keyof typeof tones
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
