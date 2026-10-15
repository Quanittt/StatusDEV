import cors from "@fastify/cors";
import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { env } from "./env.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { requireOwnerPlugin } from "./plugins/require-owner.js";
import { authRoutes } from "./routes/auth.js";
import { clientRoutes } from "./routes/clients.js";
import { commentRoutes } from "./routes/comments.js";
import { meRoutes } from "./routes/me.js";
import { milestoneRoutes } from "./routes/milestones.js";
import { portalRoutes } from "./routes/portal.js";
import { projectRoutes } from "./routes/projects.js";

// Секретний токен порталу не повинен потрапляти в логи.
const redactToken = (url: string) =>
  url.replace(/^(\/(?:portal|p)\/)[^/?#]+/, "$1[token]");

export function buildApp({ logger = true }: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: logger
      ? {
          serializers: {
            req(req) {
              return {
                method: req.method,
                url: redactToken(req.url ?? ""),
                host: req.headers.host,
                remoteAddress: req.ip,
              };
            },
          },
        }
      : false,
  });

  registerErrorHandler(app);
  app.register(cors, {
    origin: env.WEB_URL,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.register(requireOwnerPlugin);

  // Парсер тіла відключений тільки всередині цього плагіна (encapsulation).
  app.register(authRoutes);
  app.register(meRoutes);
  app.register(clientRoutes);
  app.register(projectRoutes);
  app.register(milestoneRoutes);
  app.register(commentRoutes);
  app.register(portalRoutes);

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { ok: true, db: true };
  });

  return app;
}
