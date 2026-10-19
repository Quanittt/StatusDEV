import { createHmac } from "node:crypto";
import { lookup, type LookupAddress } from "node:dns";
import { lookup as lookupAsync } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isProduction } from "../env.js";

// IPv6-адреса, в яку вбудовано IPv4 (::ffff:7f00:1, ::ffff:127.0.0.1), як звичайний IPv4.
function embeddedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

// Адреси, на які вебхук слати не можна: власна машина, локальна мережа, метаданих хмари.
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const mapped = embeddedIPv4(ip);
    if (mapped) return isPrivateAddress(mapped);
    const lower = ip.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      // NAT64 і 6to4 несуть вбудований IPv4, який ми не розбираємо: блокуємо цілком.
      lower.startsWith("64:ff9b:") ||
      lower.startsWith("2002:")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

const isLoopback = (ip: string) => {
  const v4 = embeddedIPv4(ip) ?? ip;
  return v4 === "::1" || v4.startsWith("127.");
};

export class WebhookUrlError extends Error {}

// Чи дозволена ця адреса як ціль вебхука. У розробці loopback дозволено, щоб було що налагоджувати.
const addressAllowed = (ip: string) =>
  !isPrivateAddress(ip) || (!isProduction && isLoopback(ip));

// У проді тільки https. Адреси перевіряються тут (щоб одразу показати помилку власнику)
// і ще раз у момент з'єднання (див. deliverWebhook), бо DNS між перевірками міг змінитись.
export async function assertWebhookUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlError("Некоректна адреса вебхука");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !isProduction)) {
    throw new WebhookUrlError("Вебхук має використовувати https");
  }
  if (url.username || url.password) {
    throw new WebhookUrlError("Логін і пароль в адресі вебхука не підтримуються");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookupAsync(host, { all: true }).catch(() => [])).map(
        (a) => a.address,
      );
  if (addresses.length === 0) {
    throw new WebhookUrlError("Не вдалося визначити адресу вебхука");
  }
  if (!addresses.every(addressAllowed)) {
    throw new WebhookUrlError("Вебхук не може вказувати на внутрішню адресу");
  }
  return url;
}

export interface WebhookPayload {
  event: string;
  occurredAt: string;
  project?: { id: string; title: string; url: string };
  data: Record<string, unknown>;
}

export const signBody = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

// Підміна dns.lookup, що перевіряє адресу, до якої реально підключаємось. Без цього
// fetch розв'язав би ім'я вдруге, і зловмисний DNS міг би віддати внутрішню адресу.
type LookupCallback = (
  err: Error | null,
  address?: string | LookupAddress[],
  family?: number,
) => void;
const rawLookup = lookup as unknown as (
  hostname: string,
  options: object,
  cb: LookupCallback,
) => void;

const safeLookup: LookupFunction = (hostname, options, cb) => {
  const done = cb as LookupCallback;
  rawLookup(hostname, options, (err, address, family) => {
    if (err) return done(err);
    const list = Array.isArray(address) ? address : [{ address: address ?? "" }];
    if (!list.every((a) => addressAllowed(a.address))) {
      return done(new WebhookUrlError("Вебхук не може вказувати на внутрішню адресу"));
    }
    done(null, address, family);
  });
};

// Один POST з підписом у X-StatusDEV-Signature. Редіректи не виконуємо: вони обходять перевірку адреси.
export async function deliverWebhook(
  rawUrl: string,
  secret: string,
  payload: WebhookPayload,
) {
  const url = await assertWebhookUrl(rawUrl);
  const body = JSON.stringify(payload);
  const transport = url.protocol === "https:" ? https : http;

  await new Promise<void>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "POST",
        timeout: 5000,
        lookup: safeLookup,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "StatusDEV-Webhook/1",
          "X-StatusDEV-Event": payload.event,
          "X-StatusDEV-Signature": signBody(secret, body),
        },
      },
      (res) => {
        res.resume();
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) resolve();
        else reject(new Error(`Вебхук відповів статусом ${status}`));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Вебхук не відповів за 5 с")));
    req.on("error", reject);
    req.end(body);
  });
}
