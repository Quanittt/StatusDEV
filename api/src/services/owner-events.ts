import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import { escapeTelegram, sendTelegramMessage, telegramEnabled } from "../lib/telegram.js";
import { deliverWebhook, type WebhookPayload } from "../lib/webhook.js";
import { env } from "../env.js";

export interface OwnerEvent {
  /** Назва події для вебхука: client.comment, deadline.soon тощо. */
  event: string;
  /** Готовий текст для Telegram; значення від клієнтів тут уже екрановані. */
  telegramHtml: string;
  project?: { id: string; title: string };
  data?: Record<string, unknown>;
}

const projectLink = (projectId: string) => `${env.WEB_URL}/projects/${projectId}`;

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

// Шле подію в усі канали, які підключив власник. Збій одного каналу не заважає іншим.
export async function deliverOwnerEvent(ownerId: string, e: OwnerEvent) {
  const [owner] = await db
    .select({
      chatId: user.telegramChatId,
      webhookUrl: user.webhookUrl,
      webhookSecret: user.webhookSecret,
    })
    .from(user)
    .where(eq(user.id, ownerId));
  if (!owner) return;

  const tasks: Promise<void>[] = [];

  if (owner.chatId && telegramEnabled()) {
    const link = e.project
      ? `\n<a href="${escapeTelegram(projectLink(e.project.id))}">Відкрити проєкт</a>`
      : "";
    tasks.push(sendTelegramMessage(owner.chatId, e.telegramHtml + link));
  }

  if (owner.webhookUrl && owner.webhookSecret) {
    const payload: WebhookPayload = {
      event: e.event,
      occurredAt: new Date().toISOString(),
      project: e.project && {
        ...e.project,
        url: projectLink(e.project.id),
      },
      data: e.data ?? {},
    };
    tasks.push(deliverWebhook(owner.webhookUrl, owner.webhookSecret, payload));
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[owner-events] канал не спрацював:", r.reason);
    }
  }
}

// Для кнопки «Надіслати тест» у налаштуваннях: помилки каналів повертаємо власнику.
export async function sendTestEvent(ownerId: string) {
  const [owner] = await db
    .select({
      chatId: user.telegramChatId,
      webhookUrl: user.webhookUrl,
      webhookSecret: user.webhookSecret,
    })
    .from(user)
    .where(eq(user.id, ownerId));

  const status = (r: PromiseSettledResult<void>) =>
    r.status === "fulfilled"
      ? "ok"
      : `error: ${(r.reason as Error).message}`;

  const result: { telegram: string; webhook: string } = {
    telegram: "not_configured",
    webhook: "not_configured",
  };
  if (owner?.chatId && telegramEnabled()) {
    result.telegram = status(
      (await Promise.allSettled([
        sendTelegramMessage(owner.chatId, "🔔 Тестове сповіщення від StatusDEV"),
      ]))[0],
    );
  }
  if (owner?.webhookUrl && owner.webhookSecret) {
    result.webhook = status(
      (await Promise.allSettled([
        deliverWebhook(owner.webhookUrl, owner.webhookSecret, {
          event: "test",
          occurredAt: new Date().toISOString(),
          data: { message: "Тестове сповіщення від StatusDEV" },
        }),
      ]))[0],
    );
  }
  return result;
}
