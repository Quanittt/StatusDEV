import type { MilestoneStatus } from '@statusdev/shared'
import { Check, Circle, CircleDot } from 'lucide-react'

// Статус етапу показуємо і кольором, і словом з іконкою (колір видно не всім).
export const MILESTONE_STYLE: Record<MilestoneStatus, { icon: typeof Circle; cls: string }> = {
  todo: { icon: Circle, cls: 'bg-secondary text-secondary-foreground' },
  in_progress: { icon: CircleDot, cls: 'bg-info-bg text-info-fg' },
  done: { icon: Check, cls: 'bg-ok-bg text-ok-fg' },
}
