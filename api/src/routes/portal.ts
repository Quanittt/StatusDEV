import {
  CreatePortalCommentSchema,
  PortalTokenSchema,
} from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createClientComment, getPortal } from "../services/portal.js";

const TokenParamsSchema = z.object({ token: PortalTokenSchema });

// Публічні маршрути: без сесії, доступ дає лише секретний токен у посиланні.
export async function portalRoutes(app: FastifyInstance) {
  app.get("/portal/:token", async (req, reply) => {
    const { token } = TokenParamsSchema.parse(req.params);
    reply.header("Cache-Control", "no-store");
    return getPortal(token);
  });

  app.post("/portal/:token/comments", async (req, reply) => {
    const { token } = TokenParamsSchema.parse(req.params);
    const input = CreatePortalCommentSchema.parse(req.body);
    const created = await createClientComment(token, input);
    return reply.status(201).send(created);
  });
}
