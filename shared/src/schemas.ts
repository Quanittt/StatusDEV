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

export const ProjectTemplateSchema = z.enum([
  "website",
  "landing",
  "mobile_app",
  "branding",
  "smm",
]);

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

export const UpdateProfileSchema = z
  .object({
    brandName: z.string().trim().min(1).max(100).nullable(),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Колір має бути у форматі #RRGGBB")
      .nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Потрібно передати хоча б одне поле",
  });
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const MemberRoleSchema = z.enum(["pm", "junior"]);
export const AddMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: MemberRoleSchema,
});
export const SendMessageSchema = z.object({ body: trimmed(2000) });

export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type AddMemberInput = z.infer<typeof AddMemberSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const MilestoneClientResponseSchema = z.enum([
  "approved",
  "changes_requested",
]);
export type MilestoneClientResponse = z.infer<
  typeof MilestoneClientResponseSchema
>;

// Відповідь клієнта на етап з порталу. До правок клієнт має описати, що саме змінити.
export const PortalMilestoneResponseSchema = z
  .object({
    response: MilestoneClientResponseSchema,
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => v.response !== "changes_requested" || !!v.note, {
    message: "Опишіть, які правки потрібні",
    path: ["note"],
  });
export type PortalMilestoneResponseInput = z.infer<
  typeof PortalMilestoneResponseSchema
>;

export const ActivityTypeSchema = z.enum([
  "project_created",
  "project_status_changed",
  "milestone_created",
  "milestone_status_changed",
  "milestone_due_changed",
  "milestone_deleted",
  "milestone_client_response",
  "comment_added",
  "file_added",
  "file_deleted",
  "share_link_created",
  "share_link_revoked",
  "share_settings_changed",
  "document_requested",
  "document_signed",
  "document_changes_requested",
  "document_deleted",
]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.date().optional(),
});

// Захист посилання на портал: термін дії і пароль. Поле не передано = не змінювати.
export const SHARE_PASSWORD_MIN = 6;
export const ShareSettingsSchema = z.object({
  expiresAt: z.coerce.date().nullable().optional(),
  password: z.string().min(SHARE_PASSWORD_MIN).max(100).nullable().optional(),
});
export type ShareSettingsInput = z.infer<typeof ShareSettingsSchema>;

export const PortalUnlockSchema = z.object({
  password: z.string().min(1).max(100),
});

// Логотип бренду: лише растрові зображення (SVG може нести скрипти).
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_LOGO_SIZE_BYTES = 1024 * 1024;
export const PresignLogoSchema = z.object({
  mimeType: z.enum(LOGO_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_LOGO_SIZE_BYTES),
});
export const SetLogoSchema = z.object({ storageKey: trimmed(1024) });
export type PresignLogoInput = z.infer<typeof PresignLogoSchema>;

// Документи на погодження (договір, ТЗ): файл проєкту + запит на підпис клієнтом.
export const DocumentStatusSchema = z.enum([
  "pending",
  "approved",
  "changes_requested",
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const CreateDocumentSchema = z.object({
  fileId: z.string().uuid(),
  title: trimmed(200),
});
export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;

// Підпис = повне ім'я, яке вводить клієнт. Правки потребують опису.
export const PortalDocumentResponseSchema = z.discriminatedUnion("response", [
  z.object({
    response: z.literal("approved"),
    signerName: trimmed(200),
  }),
  z.object({
    response: z.literal("changes_requested"),
    note: trimmed(1000),
  }),
]);
export type PortalDocumentResponseInput = z.infer<
  typeof PortalDocumentResponseSchema
>;

// Інтеграції власника: вебхук і Telegram.
export const WebhookSettingsSchema = z.object({
  url: z.string().trim().url().max(2000).nullable(),
});
export type WebhookSettingsInput = z.infer<typeof WebhookSettingsSchema>;
