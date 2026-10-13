import { CreateProjectSchema, ProjectStatusSchema } from "@statusdev/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  createProject,
  getProjectDetailsForOwner,
  listProjectsForOwner,
} from "../services/projects.js";

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/projects", async (req) => {
    const { status } = z
      .object({ status: ProjectStatusSchema.optional() })
      .parse(req.query);
    return listProjectsForOwner(req.user!.id, status);
  });

  app.get("/projects/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return getProjectDetailsForOwner(id, req.user!.id);
  });

  app.post("/projects", async (req, reply) => {
    const input = CreateProjectSchema.parse(req.body);
    const created = await createProject(req.user!.id, input);
    return reply.status(201).send(created);
  });
}
