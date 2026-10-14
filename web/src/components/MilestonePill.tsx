import type { MilestoneStatus } from '@statusdev/shared'

import { MILESTONE_STYLE } from '@/lib/milestone-style'
import { MILESTONE_STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'

export function MilestonePill({ status, className }: { status: MilestoneStatus; className?: string }) {
  const { icon: Icon, cls } = MILESTONE_STYLE[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', cls, className)}>
      <Icon className="size-3.5" /> {MILESTONE_STATUS_LABEL[status]}
    </span>
  )
}
