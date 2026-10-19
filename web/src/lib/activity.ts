import type { MilestoneStatus, ProjectStatus } from '@statusdev/shared'

import { formatDate } from '@/lib/format'
import { MILESTONE_STATUS_LABEL, PROJECT_STATUS_LABEL, type ActivityEvent } from '@/lib/types'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const milestoneStatus = (v: unknown) => MILESTONE_STATUS_LABEL[v as MilestoneStatus] ?? str(v)
const projectStatus = (v: unknown) => PROJECT_STATUS_LABEL[v as ProjectStatus] ?? str(v)

export function activityActor(e: ActivityEvent): string {
  if (e.actorType === 'client') return 'Клієнт'
  if (e.actorType === 'system') return 'Система'
  return e.actorName ?? 'Власник'
}

// Один рядок історії: що сталося. Хто це зробив і коли, показуємо окремо.
export function describeActivity(e: ActivityEvent): string {
  const d = e.data
  const title = str(d.title)
  switch (e.type) {
    case 'project_created':
      return 'створив(ла) проєкт'
    case 'project_status_changed':
      return `змінив(ла) статус проєкту: ${projectStatus(d.from)} → ${projectStatus(d.to)}`
    case 'milestone_created':
      return `додав(ла) етап «${title}»`
    case 'milestone_status_changed':
      return `етап «${title}»: ${milestoneStatus(d.from)} → ${milestoneStatus(d.to)}`
    case 'milestone_due_changed': {
      const to = typeof d.to === 'string' ? formatDate(d.to) : 'без дати'
      return `етап «${title}»: термін ${to}`
    }
    case 'milestone_deleted':
      return `видалив(ла) етап «${title}»`
    case 'milestone_client_response':
      return d.response === 'approved'
        ? `прийняв(ла) етап «${title}»`
        : `просить правки до етапу «${title}»${str(d.note) ? `: ${str(d.note)}` : ''}`
    case 'comment_added':
      return `залишив(ла) коментар: ${str(d.preview)}`
    case 'file_added':
      return `додав(ла) файл «${str(d.name)}»`
    case 'file_deleted':
      return `видалив(ла) файл «${str(d.name)}»`
    case 'share_link_created':
      return 'створив(ла) посилання для клієнта'
    case 'share_link_revoked':
      return 'вимкнув(ла) посилання для клієнта'
    case 'share_settings_changed':
      return d.passwordSet
        ? 'змінив(ла) захист посилання (є пароль)'
        : 'змінив(ла) захист посилання (без пароля)'
    case 'document_requested':
      return `надіслав(ла) на погодження «${title}»`
    case 'document_signed':
      return `погодив(ла) документ «${title}» як ${str(d.signerName)}`
    case 'document_changes_requested':
      return `просить правки до документа «${title}»${str(d.note) ? `: ${str(d.note)}` : ''}`
    case 'document_deleted':
      return `скасував(ла) запит на погодження «${title}»`
    default:
      return e.type
  }
}
