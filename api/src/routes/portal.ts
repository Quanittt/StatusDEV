import {
  CreatePortalCommentSchema,
  PortalTokenSchema,
} from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { rateLimit } from "../plugins/rate-limit.js";
import { createClientComment, getPortal } from "../services/portal.js";

const TokenParamsSchema = z.object({ token: PortalTokenSchema });

const tokenOf = (req: { params: unknown }) =>
  (req.params as { token?: string }).token ?? "";

// Публічні маршрути: без сесії, доступ дає лише секретний токен у посиланні.
export async function portalRoutes(app: FastifyInstance) {
  // Токен у URL не повинен витікати через заголовок Referer.
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Referrer-Policy", "no-referrer");
  });

  // Читання: 120 за хвилину з однієї адреси. Коментарі: 10 за 10 хвилин на пару адреса + токен.
  const readLimit = rateLimit({
    max: 120,
    windowMs: 60_000,
    key: (req) => req.ip,
  });
  const commentLimit = rateLimit({
    max: 10,
    windowMs: 10 * 60_000,
    key: (req) => `${req.ip}:${tokenOf(req)}`,
  });

  app.get("/portal/:token", { preHandler: readLimit }, async (req, reply) => {
    const { token } = TokenParamsSchema.parse(req.params);
    reply.header("Cache-Control", "no-store");
    return getPortal(token);
  });

  app.post("/portal/:token/comments", { preHandler: commentLimit }, async (req, reply) => {
    const { token } = TokenParamsSchema.parse(req.params);
    const input = CreatePortalCommentSchema.parse(req.body);
    const created = await createClientComment(token, input);
    return reply.status(201).send(created);
  });
}
