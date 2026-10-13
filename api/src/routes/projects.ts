import {
  CreateProjectSchema,
  ProjectStatusSchema,
  UpdateProjectSchema,
} from "@statusdev/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  archiveProject,
  createProject,
  getProjectDetailsForOwner,
  listProjectsForOwner,
  updateProject,
} from "../services/projects.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/projects", async (req) => {
    const { status } = z
      .object({ status: ProjectStatusSchema.optional() })
      .parse(req.query);
    return listProjectsForOwner(req.user!.id, status);
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
