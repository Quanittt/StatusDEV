import cors from "@fastify/cors";
import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { env } from "./env.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { requireOwnerPlugin } from "./plugins/require-owner.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  registerErrorHandler(app);
  app.register(cors, { origin: env.WEB_URL, credentials: true });
  app.register(requireOwnerPlugin);

  // Парсер тіла відключений тільки всередині цього плагіна (encapsulation).
  app.register(authRoutes);
  app.register(meRoutes);

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { ok: true, db: true };
  });

  return app;
}
