import { CreateClientSchema, UpdateClientSchema } from "@statusdev/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { clients, projects } from "../db/schema.js";
import { ConflictError, NotFoundError } from "../errors.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export async function clientRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/clients", async (req) => {
    return db
      .select()
      .from(clients)
      .where(eq(clients.ownerId, req.user!.id))
      .orderBy(desc(clients.createdAt));
  });

  app.post("/clients", async (req, reply) => {
    const input = CreateClientSchema.parse(req.body);
    const [created] = await db
      .insert(clients)
      .values({ ...input, ownerId: req.user!.id })
      .returning();
    return reply.status(201).send(created);
  });

  app.patch("/clients/:id", async (req) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = UpdateClientSchema.parse(req.body);
    const [updated] = await db
      .update(clients)
      .set(input)
      .where(and(eq(clients.id, id), eq(clients.ownerId, req.user!.id)))
      .returning();
    if (!updated) throw new NotFoundError("Клієнта не знайдено");
    return updated;
  });

  app.delete("/clients/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const ownerId = req.user!.id;

    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.ownerId, ownerId)));
    if (!client) throw new NotFoundError("Клієнта не знайдено");

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.clientId, id))
      .limit(1);
    if (project) {
      throw new ConflictError("Не можна видалити клієнта, у якого є проєкти");
    }

    await db.delete(clients).where(eq(clients.id, id));
    return reply.status(204).send();
  });
}
