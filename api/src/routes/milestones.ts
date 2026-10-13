import { UpdateMilestoneSchema } from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deleteMilestone, updateMilestone } from "../services/projects.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export async function milestoneRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.patch("/milestones/:id", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = UpdateMilestoneSchema.parse(req.body);
    return updateMilestone(id, req.user!.id, input);
  });

  app.delete("/milestones/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    await deleteMilestone(id, req.user!.id);
    return reply.status(204).send();
  });
}
