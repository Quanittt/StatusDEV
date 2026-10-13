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

export const CreateProjectSchema = z.object({
  clientId: z.string().uuid(),
  title: trimmed(200),
  description: optionalText(5000).optional(),
  status: ProjectStatusSchema.optional(),
  deadline: z.coerce.date().nullable().optional(),
});
export const UpdateProjectSchema = CreateProjectSchema.omit({ clientId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Потрібно передати хоча б одне поле",
  });

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
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
