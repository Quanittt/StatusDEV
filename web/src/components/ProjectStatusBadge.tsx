import type { ProjectStatus } from '@statusdev/shared'

import { Badge } from '@/components/ui/badge'
import { PROJECT_STATUS_LABEL } from '@/lib/types'

const tone = { active: 'success', paused: 'warning', done: 'primary', archived: 'neutral' } as const

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={tone[status]}>{PROJECT_STATUS_LABEL[status]}</Badge>
}
