import { toNodeHandler } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import { auth } from "../auth.js";

// Better Auth сам читає тіло запиту, тому Fastify не має його розбирати.
export async function authRoutes(app: FastifyInstance) {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_req, _payload, done) => done(null));

  const handler = toNodeHandler(auth);

  app.all("/api/auth/*", async (req, reply) => {
    // hijack() віддає відповідь Better Auth напряму, і заголовки, які вже поставив
    // @fastify/cors (Access-Control-Allow-Origin тощо), самі туди не потрапляють.
    // Без цього браузер на іншому origin блокує вхід і реєстрацію ("Failed to fetch").
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value);
    }
    reply.hijack();
    await handler(req.raw, reply.raw);
  });
}
