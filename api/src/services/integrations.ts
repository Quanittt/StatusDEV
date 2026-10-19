import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import { BadRequestError } from "../errors.js";
import { getBotUsername, telegramEnabled } from "../lib/telegram.js";
import { assertWebhookUrl, WebhookUrlError } from "../lib/webhook.js";
import { newWebhookSecret } from "./owner-events.js";

const LINK_TTL_MS = 15 * 60 * 1000;

export async function getIntegrations(userId: string) {
  const [u] = await db
    .select({
      chatId: user.telegramChatId,
      webhookUrl: user.webhookUrl,
      webhookSecret: user.webhookSecret,
    })
    .from(user)
    .where(eq(user.id, userId));
  return {
    telegram: {
      available: telegramEnabled(),
      linked: !!u?.chatId,
      botUsername: getBotUsername(),
    },
    webhook: { url: u?.webhookUrl ?? null, secret: u?.webhookSecret ?? null },
  };
}

// Одноразовий код для /start у боті. Новий код анулює попередній.
export async function createTelegramLink(userId: string) {
  if (!telegramEnabled()) {
    throw new BadRequestError("Telegram-бот на сервері не налаштований");
  }
  const code = randomBytes(12).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await db
    .update(user)
    .set({ telegramLinkCode: code, telegramLinkExpiresAt: expiresAt })
    .where(eq(user.id, userId));
  const bot = getBotUsername();
  return {
    code,
    expiresAt,
    deepLink: bot ? `https://t.me/${bot}?start=${code}` : null,
  };
}

export async function unlinkTelegram(userId: string) {
  await db
    .update(user)
    .set({
      telegramChatId: null,
      telegramLinkCode: null,
      telegramLinkExpiresAt: null,
    })
    .where(eq(user.id, userId));
}

// Нова адреса зберігає старий секрет, щоб одержувач не перенастроював перевірку підпису.
export async function setWebhook(userId: string, url: string | null) {
  if (url === null) {
    await db
      .update(user)
      .set({ webhookUrl: null, webhookSecret: null })
      .where(eq(user.id, userId));
    return { url: null, secret: null };
  }

  try {
    await assertWebhookUrl(url);
  } catch (err) {
    if (err instanceof WebhookUrlError) throw new BadRequestError(err.message);
    throw err;
  }
  const [current] = await db
    .select({ secret: user.webhookSecret })
    .from(user)
    .where(eq(user.id, userId));
  const secret = current?.secret ?? newWebhookSecret();
  await db
    .update(user)
    .set({ webhookUrl: url, webhookSecret: secret })
    .where(eq(user.id, userId));
  return { url, secret };
}
