import * as React from 'react'

import { cn } from '@/lib/utils'

const field =
  'w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(field, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(field, 'min-h-20 py-2', className)} {...props} />
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(field, 'h-9', className)} {...props} />
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  )
}
