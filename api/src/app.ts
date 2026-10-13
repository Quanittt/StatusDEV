import cors from "@fastify/cors";
import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true, credentials: true });

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { ok: true, db: true };
  });

  return app;
}
