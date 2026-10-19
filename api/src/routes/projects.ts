import {
  CreateMilestoneSchema,
  ReorderMilestonesSchema,
  ActivityQuerySchema,
  CreateProjectSchema,
  ProjectStatusSchema,
  ShareSettingsSchema,
  UpdateProjectSchema,
} from "@statusdev/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  archiveProject,
  createMilestone,
  createProject,
  getProjectDetailsForOwner,
  listProjectsForOwner,
  reorderMilestones,
  updateProject,
} from "../services/projects.js";
import { listActivity } from "../services/activity.js";
import { PROJECT_TEMPLATES } from "../services/milestone-templates.js";
import {
  createShareLink,
  revokeShareLink,
  updateShareSettings,
} from "../services/portal.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/projects", async (req) => {
    const { status } = z
      .object({ status: ProjectStatusSchema.optional() })
      .parse(req.query);
    return listProjectsForOwner(req.user!.id, status);
  });

  // Готові набори етапів для форми створення проєкту.
  app.get("/project-templates", async () =>
    Object.entries(PROJECT_TEMPLATES).map(([id, t]) => ({
      id,
      label: t.label,
      milestones: t.milestones,
    })),
  );

  app.get("/projects/:id/activity", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const query = ActivityQuerySchema.parse(req.query);
    return listActivity(id, req.user!.id, query);
  });

  app.get("/projects/:id", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    return getProjectDetailsForOwner(id, req.user!.id);
  });

  app.post("/projects", async (req, reply) => {
    const input = CreateProjectSchema.parse(req.body);
    const created = await createProject(req.user!.id, input);
    return reply.status(201).send(created);
  });

  app.post("/projects/:id/milestones", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = CreateMilestoneSchema.parse(req.body);
    const created = await createMilestone(id, req.user!.id, input);
    return reply.status(201).send(created);
  });

  app.put("/projects/:id/milestones/order", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const { ids } = ReorderMilestonesSchema.parse(req.body);
    return reorderMilestones(id, req.user!.id, ids);
  });

  // Посилання для клієнта: повторний POST створює нове і вимикає старе.
  // Необов'язкове тіло задає термін дії й пароль.
  app.post("/projects/:id/share", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const settings = ShareSettingsSchema.parse(req.body ?? {});
    return reply
      .status(201)
      .send(await createShareLink(id, req.user!.id, settings));
  });

  // Зміна терміну й пароля чинного посилання без заміни самого токена.
  app.patch("/projects/:id/share", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const settings = ShareSettingsSchema.parse(req.body);
    return updateShareSettings(id, req.user!.id, settings);
  });

  app.delete("/projects/:id/share", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    await revokeShareLink(id, req.user!.id);
    return reply.status(204).send();
  });

  app.patch("/projects/:id", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = UpdateProjectSchema.parse(req.body);
    return updateProject(id, req.user!.id, input);
  });

  app.delete("/projects/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    await archiveProject(id, req.user!.id);
    return reply.status(204).send();
  });
}
