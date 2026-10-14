import { cn } from '@/lib/utils'

const tones = {
  neutral: 'border-border text-muted-foreground',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  primary: 'border-primary/30 bg-primary/10 text-primary',
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
