import { CreateProjectSchema } from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { createProject } from "../services/projects.js";

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.post("/projects", async (req, reply) => {
    const input = CreateProjectSchema.parse(req.body);
    const created = await createProject(req.user!.id, input);
    return reply.status(201).send(created);
  });
}
