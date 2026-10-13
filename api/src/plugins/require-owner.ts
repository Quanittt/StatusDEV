import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { auth } from "../auth.js";
import { UnauthorizedError } from "../errors.js";

type SessionUser = typeof auth.$Infer.Session.user;

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
  interface FastifyInstance {
    requireOwner: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const requireOwnerPlugin = fp(async (app) => {
  app.decorateRequest("user", undefined);

  app.decorate("requireOwner", async (req: FastifyRequest) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) throw new UnauthorizedError();
    req.user = session.user;
  });
});
