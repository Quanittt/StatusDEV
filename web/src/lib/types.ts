import type { MilestoneStatus, ProjectStatus } from '@statusdev/shared'

export interface Owner {
  id: string
  name: string
  email: string
  plan?: string | null
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
  milestones: Milestone[]
}

export interface Comment {
  id: string
  body: string
  authorType: 'owner' | 'client'
  milestoneId: string | null
  createdAt: string
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Активний',
  paused: 'На паузі',
  done: 'Завершений',
  archived: 'В архіві',
}

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  todo: 'Очікує',
  in_progress: 'В роботі',
  done: 'Готово',
}
