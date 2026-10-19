import { CreateDocumentSchema } from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDocument,
  deleteDocument,
  listDocuments,
} from "../services/documents.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export async function documentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/projects/:id/documents", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    return listDocuments(id, req.user!.id);
  });

  app.post("/projects/:id/documents", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = CreateDocumentSchema.parse(req.body);
    return reply.status(201).send(await createDocument(id, req.user!.id, input));
  });

  app.delete("/documents/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    await deleteDocument(id, req.user!.id);
    return reply.status(204).send();
  });
}
