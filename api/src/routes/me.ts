import type { FastifyInstance } from "fastify";

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.requireOwner }, async (req) => req.user);
}
