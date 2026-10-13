import { toNodeHandler } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import { auth } from "../auth.js";

// Better Auth сам читає тіло запиту, тому Fastify не має його розбирати.
export async function authRoutes(app: FastifyInstance) {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_req, _payload, done) => done(null));

  const handler = toNodeHandler(auth);

  app.all("/api/auth/*", async (req, reply) => {
    reply.hijack();
    await handler(req.raw, reply.raw);
  });
}
