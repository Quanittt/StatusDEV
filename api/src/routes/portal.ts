import {
  CreatePortalCommentSchema,
  PortalDocumentResponseSchema,
  PortalMilestoneResponseSchema,
  PortalTokenSchema,
  PortalUnlockSchema,
} from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { rateLimit } from "../plugins/rate-limit.js";
import {
  createClientComment,
  getPortal,
  getPortalDocumentDownload,
  respondToDocument,
  respondToMilestone,
  unlockPortal,
} from "../services/portal.js";

const TokenParamsSchema = z.object({ token: PortalTokenSchema });

const tokenOf = (req: { params: unknown }) =>
  (req.params as { token?: string }).token ?? "";

// Токен доступу після введення пароля клієнт надсилає в цьому заголовку.
export const PORTAL_ACCESS_HEADER = "x-portal-access";
const accessOf = (req: { headers: Record<string, unknown> }) => {
  const v = req.headers[PORTAL_ACCESS_HEADER];
  return typeof v === "string" ? v : undefined;
};

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
  const responseLimit = rateLimit({
    max: 20,
    windowMs: 10 * 60_000,
    key: (req) => `${req.ip}:${tokenOf(req)}`,
  });
  // Захист від підбору пароля: 10 спроб за 10 хвилин на пару адреса + токен.
  const unlockLimit = rateLimit({
    max: 10,
    windowMs: 10 * 60_000,
    key: (req) => `${req.ip}:${tokenOf(req)}`,
  });

  app.get("/portal/:token", { preHandler: readLimit }, async (req, reply) => {
    const { token } = TokenParamsSchema.parse(req.params);
    reply.header("Cache-Control", "no-store");
    return getPortal(token, accessOf(req));
  });

  app.post(
    "/portal/:token/unlock",
    { preHandler: unlockLimit },
    async (req, reply) => {
      const { token } = TokenParamsSchema.parse(req.params);
      const { password } = PortalUnlockSchema.parse(req.body);
      reply.header("Cache-Control", "no-store");
      return unlockPortal(token, password);
    },
  );

  app.post("/portal/:token/comments", { preHandler: commentLimit }, async (req, reply) => {
    const { token } = TokenParamsSchema.parse(req.params);
    const input = CreatePortalCommentSchema.parse(req.body);
    const created = await createClientComment(token, input, accessOf(req));
    return reply.status(201).send(created);
  });

  app.post(
    "/portal/:token/milestones/:milestoneId/response",
    { preHandler: responseLimit },
    async (req) => {
      const { token, milestoneId } = z
        .object({ token: PortalTokenSchema, milestoneId: z.string().uuid() })
        .parse(req.params);
      const input = PortalMilestoneResponseSchema.parse(req.body);
      return respondToMilestone(token, milestoneId, input, accessOf(req));
    },
  );

  const DocumentParamsSchema = z.object({
    token: PortalTokenSchema,
    documentId: z.string().uuid(),
  });

  app.get(
    "/portal/:token/documents/:documentId/download",
    { preHandler: readLimit },
    async (req, reply) => {
      const { token, documentId } = DocumentParamsSchema.parse(req.params);
      reply.header("Cache-Control", "no-store");
      return getPortalDocumentDownload(token, documentId, accessOf(req));
    },
  );

  app.post(
    "/portal/:token/documents/:documentId/response",
    { preHandler: responseLimit },
    async (req) => {
      const { token, documentId } = DocumentParamsSchema.parse(req.params);
      const input = PortalDocumentResponseSchema.parse(req.body);
      return respondToDocument(
        token,
        documentId,
        input,
        { ip: req.ip },
        accessOf(req),
      );
    },
  );
}
