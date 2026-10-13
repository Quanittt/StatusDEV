import { CreateClientSchema } from "@statusdev/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { clients } from "../db/schema.js";

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
}
