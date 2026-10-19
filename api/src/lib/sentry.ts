import * as Sentry from "@sentry/node";
import { env } from "../env.js";

// Секретний токен порталу сидить у шляху запиту: до Sentry він потрапляти не повинен.
const scrub = (s: string) =>
  s.replace(/(\/(?:portal|p)\/)[^/?#\s]+/g, "$1[token]");

export const sentryEnabled = !!env.SENTRY_DSN;

// Без DSN Sentry не ініціалізується, а captureError нічого не робить.
export function initSentry() {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV ?? "production",
    // Cookie, заголовки, тіла запитів і дані користувача не збираємо:
    // у них сесії, токени порталу й коментарі клієнтів.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrub(event.request.url);
      if (event.transaction) event.transaction = scrub(event.transaction);
      return event;
    },
  });
}

export function captureError(err: unknown, context?: Record<string, string>) {
  if (!sentryEnabled) return;
  Sentry.captureException(err, context ? { tags: context } : undefined);
}

export async function flushSentry(timeoutMs = 2000) {
  if (sentryEnabled) await Sentry.flush(timeoutMs);
}
