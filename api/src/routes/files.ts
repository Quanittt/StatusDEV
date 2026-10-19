import { CreateFileSchema, PresignFileSchema } from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createUploadUrl,
  deleteFile,
  getDownloadUrl,
  listFiles,
  registerFile,
} from "../services/files.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export async function fileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/projects/:id/files", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    return listFiles(id, req.user!.id);
  });

  // Крок 1: браузер просить адресу, куди можна покласти файл.
  app.post("/projects/:id/files/presign", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = PresignFileSchema.parse(req.body);
    return createUploadUrl(id, req.user!.id, input);
  });

  // Крок 2: після PUT у R2 браузер повідомляє API, і той записує рядок у files.
  app.post("/projects/:id/files", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = CreateFileSchema.parse(req.body);
    const created = await registerFile(id, req.user!.id, input);
    return reply.status(201).send(created);
  });

  app.get("/files/:id/download", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    return getDownloadUrl(id, req.user!.id);
  });

  app.delete("/files/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    await deleteFile(id, req.user!.id);
    return reply.status(204).send();
  });
}
