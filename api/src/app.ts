import cors from "@fastify/cors";
import Fastify, { type FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { docsEnabled, env } from "./env.js";
import { docsRoutes } from "./routes/docs.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { requireOwnerPlugin } from "./plugins/require-owner.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { clientRoutes } from "./routes/clients.js";
import { commentRoutes } from "./routes/comments.js";
import { documentRoutes } from "./routes/documents.js";
import { fileRoutes } from "./routes/files.js";
import { integrationRoutes } from "./routes/integrations.js";
import { meRoutes } from "./routes/me.js";
import { milestoneRoutes } from "./routes/milestones.js";
import { portalRoutes } from "./routes/portal.js";
import { projectRoutes } from "./routes/projects.js";

declare module "fastify" {
  interface FastifyInstance {
    routeTable: { method: string; url: string }[];
  }
}

// Секретний токен порталу не повинен потрапляти в логи.
const redactToken = (url: string) =>
  url.replace(/^(\/(?:portal|p)\/)[^/?#]+/, "$1[token]");

// Pino пише в stdout, а за LOG_FILE ще й у файл. Заголовки (cookie, authorization) в лог не потрапляють.
function loggerOptions() {
  const targets = [{ target: "pino/file", options: { destination: 1 } }];
  if (env.LOG_FILE) {
    targets.push({
      target: "pino/file",
      options: { destination: env.LOG_FILE, mkdir: true } as never,
    });
  }
  return {
    ...(env.LOG_FILE ? { transport: { targets } } : {}),
    serializers: {
      req(req: FastifyRequest) {
        return {
          method: req.method,
          url: redactToken(req.url ?? ""),
          host: req.headers.host,
          remoteAddress: req.ip,
        };
      },
    },
  };
}

export function buildApp({ logger = true }: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: logger ? loggerOptions() : false,
    // За proxy без цього req.ip завжди адреса балансувальника: ламаються ліміти й підписи документів.
    trustProxy: env.TRUST_PROXY === "true",
  });

  // Таблиця маршрутів потрібна тесту, який звіряє її з OpenAPI-описом.
  const routeTable: { method: string; url: string }[] = [];
  app.addHook("onRoute", (route) => {
    for (const method of [route.method].flat()) {
      routeTable.push({ method, url: route.url });
    }
  });
  app.decorate("routeTable", routeTable);

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
  app.register(integrationRoutes);
  app.register(clientRoutes);
  app.register(projectRoutes);
  app.register(milestoneRoutes);
  app.register(commentRoutes);
  app.register(fileRoutes);
  app.register(documentRoutes);
  app.register(chatRoutes);
  app.register(portalRoutes);
  if (docsEnabled) app.register(docsRoutes);

  app.get("/health", async (req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true, db: true };
    } catch (err) {
      req.log.error(err);
      return reply.status(503).send({ ok: false, db: false });
    }
  });

  return app;
}
