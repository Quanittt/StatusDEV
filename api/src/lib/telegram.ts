import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import { env } from "../env.js";

const api = (method: string) =>
  `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

export const telegramEnabled = () => !!env.TELEGRAM_BOT_TOKEN;

let botUsername: string | null = null;
export const getBotUsername = () => botUsername;

async function call<T>(
  method: string,
  body: object,
  timeoutMs = 10_000,
  abort?: AbortSignal,
) {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: abort
      ? AbortSignal.any([AbortSignal.timeout(timeoutMs), abort])
      : AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    description?: string;
  } | null;
  if (!res.ok || !json?.ok) {
    throw new Error(`Telegram: ${json?.description ?? `статус ${res.status}`}`);
  }
  return json.result as T;
}

export const escapeTelegram = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Текст іде з parse_mode=HTML, тому все, що прийшло від клієнтів, треба екранувати до виклику.
export async function sendTelegramMessage(chatId: string, html: string) {
  await call("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

interface Update {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string } };
}

// /start <код> прив'язує чат до власника; /stop відв'язує. Код одноразовий і живе 15 хвилин.
export async function handleMessage(chatId: string, text: string) {
  const [command, arg] = text.trim().split(/\s+/);
  if (command === "/start" && arg) {
    const [owner] = await db
      .select({
        id: user.id,
        expiresAt: user.telegramLinkExpiresAt,
      })
      .from(user)
      .where(eq(user.telegramLinkCode, arg));
    if (!owner || !owner.expiresAt || owner.expiresAt.getTime() < Date.now()) {
      await sendTelegramMessage(
        chatId,
        "Код недійсний або застарів. Згенеруйте новий у налаштуваннях StatusDEV.",
      );
      return;
    }
    // Один чат належить одному акаунту: інакше чужий власник міг би "підписатись" на сповіщення.
    const [taken] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.telegramChatId, chatId));
    if (taken && taken.id !== owner.id) {
      await sendTelegramMessage(
        chatId,
        "Цей чат уже підключений до іншого акаунта. Надішліть /stop, а потім повторіть підключення.",
      );
      return;
    }
    await db
      .update(user)
      .set({
        telegramChatId: chatId,
        telegramLinkCode: null,
        telegramLinkExpiresAt: null,
      })
      .where(eq(user.id, owner.id));
    await sendTelegramMessage(
      chatId,
      "✅ Підключено. Сюди прийдуть сповіщення про коментарі й відповіді клієнтів.",
    );
    return;
  }
  if (command === "/stop") {
    await db
      .update(user)
      .set({ telegramChatId: null })
      .where(eq(user.telegramChatId, chatId));
    await sendTelegramMessage(chatId, "Сповіщення вимкнено.");
    return;
  }
  await sendTelegramMessage(
    chatId,
    "Щоб підключити сповіщення, натисніть кнопку «Підключити Telegram» у налаштуваннях StatusDEV.",
  );
}

// Long polling: працює без публічної адреси. Запускати лише в одному інстансі API.
export function startTelegramPolling(log: {
  info: (msg: string) => void;
  error: (err: unknown) => void;
}) {
  if (!telegramEnabled()) return () => {};

  let stopped = false;
  let offset = 0;
  const controller = new AbortController();

  (async () => {
    // Якщо Telegram недоступний під час старту, getMe повторюється разом з опитуванням.
    while (!stopped) {
      try {
        if (!botUsername) {
          const me = await call<{ username?: string }>("getMe", {}, 10_000, controller.signal);
          botUsername = me.username ?? null;
          log.info(`Telegram-бот @${botUsername} підключено`);
        }
        const updates = await call<Update[]>(
          "getUpdates",
          { offset, timeout: 25, allowed_updates: ["message"] },
          35_000,
          controller.signal,
        );
        for (const u of updates) {
          offset = u.update_id + 1;
          const m = u.message;
          // Лише приватні чати: у групах бот не повинен нікого прив'язувати.
          if (m?.text && m.chat.type === "private") {
            await handleMessage(String(m.chat.id), m.text).catch(log.error);
          }
        }
      } catch (err) {
        if (stopped) break;
        log.error(err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();

  return () => {
    stopped = true;
    controller.abort();
  };
}
