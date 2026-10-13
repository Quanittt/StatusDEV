import { CreateCommentSchema } from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createOwnerComment, listComments } from "../services/comments.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export async function commentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/projects/:id/comments", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    return listComments(id, req.user!.id);
  });

  app.post("/projects/:id/comments", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = CreateCommentSchema.parse(req.body);
    const created = await createOwnerComment(id, req.user!.id, input);
    return reply.status(201).send(created);
  });
}
