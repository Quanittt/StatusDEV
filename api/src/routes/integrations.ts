import { WebhookSettingsSchema } from "@statusdev/shared";
import type { FastifyInstance } from "fastify";
import {
  createTelegramLink,
  getIntegrations,
  setWebhook,
  unlinkTelegram,
} from "../services/integrations.js";
import { sendTestEvent } from "../services/owner-events.js";

// Куди власник хоче отримувати сповіщення: Telegram і вебхук.
export async function integrationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireOwner);

  app.get("/me/integrations", async (req) => getIntegrations(req.user!.id));

  app.post("/me/integrations/telegram/link", async (req, reply) =>
    reply.status(201).send(await createTelegramLink(req.user!.id)),
  );

  app.delete("/me/integrations/telegram", async (req, reply) => {
    await unlinkTelegram(req.user!.id);
    return reply.status(204).send();
  });

  app.put("/me/integrations/webhook", async (req) => {
    const { url } = WebhookSettingsSchema.parse(req.body);
    return setWebhook(req.user!.id, url);
  });

  app.post("/me/integrations/test", async (req) => sendTestEvent(req.user!.id));
}
