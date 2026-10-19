import { AddMemberSchema, SendMessageSchema } from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { rateLimit } from "../plugins/rate-limit.js";
import {
  addMember,
  listChatProjects,
  listContacts,
  listMembers,
  listMessages,
  removeMember,
  sendMessage,
} from "../services/chat.js";

const ProjectParamsSchema = z.object({ id: z.string().uuid() });
const MemberParamsSchema = ProjectParamsSchema.extend({
  userId: z.string().min(1).max(100),
});
const MessagesQuerySchema = z.object({
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function chatRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  // 30 повідомлень за хвилину на користувача.
  const sendLimit = rateLimit({
    max: 30,
    windowMs: 60_000,
    key: (req) => req.user!.id,
  });

  app.get("/chat/projects", async (req) => listChatProjects(req.user!.id));

  app.get("/projects/:id/members", async (req) => {
    const { id } = ProjectParamsSchema.parse(req.params);
    return listMembers(id, req.user!.id);
  });

  app.post("/projects/:id/members", async (req, reply) => {
    const { id } = ProjectParamsSchema.parse(req.params);
    const input = AddMemberSchema.parse(req.body);
    return reply.status(201).send(await addMember(id, req.user!.id, input));
  });

  app.delete("/projects/:id/members/:userId", async (req, reply) => {
    const { id, userId } = MemberParamsSchema.parse(req.params);
    await removeMember(id, req.user!.id, userId);
    return reply.status(204).send();
  });

  app.get("/projects/:id/chat/contacts", async (req) => {
    const { id } = ProjectParamsSchema.parse(req.params);
    return listContacts(id, req.user!.id);
  });

  app.get("/projects/:id/chat/:userId/messages", async (req) => {
    const { id, userId } = MemberParamsSchema.parse(req.params);
    const query = MessagesQuerySchema.parse(req.query);
    return listMessages(id, req.user!.id, userId, query);
  });

  app.post(
    "/projects/:id/chat/:userId/messages",
    { preHandler: sendLimit },
    async (req, reply) => {
      const { id, userId } = MemberParamsSchema.parse(req.params);
      const { body } = SendMessageSchema.parse(req.body);
      const created = await sendMessage(id, req.user!.id, userId, body);
      return reply.status(201).send(created);
    },
  );
}
