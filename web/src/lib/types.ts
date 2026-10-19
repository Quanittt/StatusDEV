import type {
  ActivityType,
  DocumentStatus,
  MilestoneClientResponse,
  MilestoneStatus,
  ProjectStatus,
} from '@statusdev/shared'

export interface Owner {
  id: string
  name: string
  email: string
  plan?: string | null
  brandName: string | null
  brandColor: string | null
  brandLogoUrl: string | null
}

export interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  createdAt: string
}

export interface ProjectListItem {
  id: string
  title: string
  description: string | null
  status: ProjectStatus
  deadline: string | null
  updatedAt: string
  clientId: string
  clientName: string
  milestonesTotal: number
  milestonesDone: number
  progress: number
}

export interface Milestone {
  id: string
  projectId: string
  title: string
  description: string | null
  status: MilestoneStatus
  position: number
  dueDate: string | null
  clientAction: string | null
  completedAt: string | null
  clientResponse: MilestoneClientResponse | null
  clientResponseNote: string | null
  clientRespondedAt: string | null
}

export interface ProjectDetails {
  id: string
  title: string
  description: string | null
  status: ProjectStatus
  deadline: string | null
  updatedAt: string
  clientId: string
  clientName: string | null
  shareToken: string | null
  shareExpiresAt: string | null
  sharePasswordSet: boolean
  milestones: Milestone[]
}

export interface PortalMilestone {
  id: string
  title: string
  status: MilestoneStatus
  dueDate: string | null
  clientAction: string | null
  completedAt: string | null
  clientResponse: MilestoneClientResponse | null
  clientResponseNote: string | null
  clientRespondedAt: string | null
  canRespond: boolean
}

export interface PortalDocument {
  id: string
  title: string
  status: DocumentStatus
  signerName: string | null
  note: string | null
  respondedAt: string | null
  fileName: string
  sizeBytes: number
}

export interface OwnerDocument extends PortalDocument {
  signerIp: string | null
  fileId: string
  createdAt: string
}

export interface FileItem {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface Integrations {
  telegram: { available: boolean; linked: boolean; botUsername: string | null }
  webhook: { url: string | null; secret: string | null }
}

export interface PortalComment {
  id: string
  body: string
  authorType: 'owner' | 'client'
  createdAt: string
}

export interface PortalData {
  title: string
  description: string | null
  status: ProjectStatus
  deadline: string | null
  updatedAt: string
  expiresAt: string | null
  owner: { name: string; color: string | null; logoUrl: string | null }
  documents: PortalDocument[]
  milestones: PortalMilestone[]
  milestonesDone: number
  progress: number
  nextDate: string | null
  comments: PortalComment[]
}

export interface Comment {
  id: string
  body: string
  authorType: 'owner' | 'client'
  milestoneId: string | null
  createdAt: string
}

export interface ActivityEvent {
  id: string
  type: ActivityType
  actorType: 'owner' | 'client' | 'system'
  actorName: string | null
  milestoneId: string | null
  data: Record<string, unknown>
  createdAt: string
}

export interface ProjectTemplateInfo {
  id: string
  label: string
  milestones: { title: string; clientAction?: string }[]
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Активний',
  paused: 'На паузі',
  done: 'Завершений',
  archived: 'В архіві',
}

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: 'Очікує погодження',
  approved: 'Погоджено',
  changes_requested: 'Потрібні правки',
}

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  todo: 'Очікує',
  in_progress: 'В роботі',
  done: 'Готово',
}
