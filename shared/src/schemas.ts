import { z } from "zod";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const CreateClientSchema = z.object({
  name: trimmed(200),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: optionalText(50).optional(),
  notes: optionalText(5000).optional(),
});
export const UpdateClientSchema = CreateClientSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "Потрібно передати хоча б одне поле" },
);

export const ProjectStatusSchema = z.enum(["active", "paused", "done", "archived"]);

export const ProjectTemplateSchema = z.enum(["website", "branding", "smm"]);

export const CreateProjectSchema = z.object({
  clientId: z.string().uuid(),
  title: trimmed(200),
  description: optionalText(5000).optional(),
  status: ProjectStatusSchema.optional(),
  deadline: z.coerce.date().nullable().optional(),
  template: ProjectTemplateSchema.optional(),
});
export const UpdateProjectSchema = CreateProjectSchema.omit({
  clientId: true,
  template: true,
})
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Потрібно передати хоча б одне поле",
  });

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const MilestoneStatusSchema = z.enum(["todo", "in_progress", "done"]);

export const CreateMilestoneSchema = z.object({
  title: trimmed(200),
  description: optionalText(5000).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  clientAction: optionalText(1000).optional(),
});
export const UpdateMilestoneSchema = CreateMilestoneSchema.extend({
  status: MilestoneStatusSchema,
})
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Потрібно передати хоча б одне поле",
  });

export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;
export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneSchema>;

export const ReorderMilestonesSchema = z.object({
  ids: z.array(z.string().uuid()),
});
export type ReorderMilestonesInput = z.infer<typeof ReorderMilestonesSchema>;

export const CommentAuthorTypeSchema = z.enum(["owner", "client"]);

export const CreateCommentSchema = z.object({
  body: trimmed(5000),
  milestoneId: z.string().uuid().nullable().optional(),
});

// Коментар з порталу: клієнт без акаунта, тому лише текст (без milestoneId).
export const CreatePortalCommentSchema = z.object({
  body: trimmed(2000),
});
export const PortalTokenSchema = z
  .string()
  .min(20)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export type CreatePortalCommentInput = z.infer<typeof CreatePortalCommentSchema>;
export type CommentAuthorType = z.infer<typeof CommentAuthorTypeSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const FileMetaSchema = z.object({
  name: trimmed(255),
  mimeType: trimmed(255),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  milestoneId: z.string().uuid().nullable().optional(),
});
export const PresignFileSchema = FileMetaSchema;
export const CreateFileSchema = FileMetaSchema.extend({
  storageKey: trimmed(1024),
});

export type PresignFileInput = z.infer<typeof PresignFileSchema>;
export type CreateFileInput = z.infer<typeof CreateFileSchema>;
