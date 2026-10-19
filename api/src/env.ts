import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  // Не задано = production: усі запобіжники (https-вебхуки, вимкнений Swagger, заборона seed)
  // мають діяти за замовчуванням. Локально задайте NODE_ENV=development в api/.env.
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  // Бути за reverse proxy (Heroku, nginx, Cloudflare): довіряти X-Forwarded-For для IP клієнта.
  TRUST_PROXY: z.enum(["true", "false"]).optional(),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  BETTER_AUTH_SECRET: z.string().min(32),
  WEB_URL: z.string().url().default("http://localhost:5173"),
  // Публічна адреса самого API. Без неї Better Auth будує посилання на localhost.
  API_URL: z.string().url().optional(),
  // Resend (листи)
  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(1),
  // Cloudflare R2 (S3-сумісне сховище файлів)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  // Telegram-бот для сповіщень власнику. Без токена Telegram-канал вимкнений.
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  // Як часто перевіряти дедлайни етапів і слати нагадування. 0 = вимкнено.
  REMINDERS_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(60),
  // Помилки сервера йдуть у Sentry, якщо задано DSN.
  SENTRY_DSN: z.string().url().optional(),
  // Дублювати логи у файл (шлях відносно робочої папки). Без нього лише stdout.
  LOG_FILE: z.string().min(1).optional(),
  // Swagger UI на /docs. За замовчуванням увімкнено скрізь, крім production.
  DOCS_ENABLED: z.enum(["true", "false"]).optional(),
});

// Підказка для кожної змінної: що це і який приклад значення. Показується, коли її бракує.
const HINTS: Record<string, string> = {
  DATABASE_URL:
    'рядок підключення до Postgres, напр. postgresql://postgres:postgres@localhost:5432/statusdev (база з `docker compose up -d`)',
  BETTER_AUTH_SECRET:
    "випадковий рядок від 32 символів: `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`",
  RESEND_API_KEY: "ключ з https://resend.com/api-keys, починається з re_",
  EMAIL_FROM: 'адреса відправника, напр. "StatusDEV <onboarding@resend.dev>"',
  R2_ACCOUNT_ID: "Cloudflare → R2 → Account ID",
  R2_ACCESS_KEY_ID: "Cloudflare → R2 → Manage API tokens",
  R2_SECRET_ACCESS_KEY: "Cloudflare → R2 → Manage API tokens (показується один раз)",
  R2_BUCKET: "назва бакета в R2, напр. statusdev-files",
  WEB_URL: "адреса фронтенда, напр. http://localhost:5173",
  API_URL: "публічна адреса API, напр. https://api.example.com",
  TELEGRAM_BOT_TOKEN: "токен від @BotFather",
  SENTRY_DSN: "DSN проєкту в Sentry (https://...@sentry.io/...)",
};

// Збирає читабельний звіт: що саме не так з кожною змінною і де взяти значення.
export function describeEnvProblems(
  fieldErrors: Record<string, string[] | undefined>,
  env: NodeJS.ProcessEnv,
  envFileExists: boolean,
): string {
  const lines = ["", "✖ API не запустився: проблеми зі змінними середовища.", ""];
  if (!envFileExists) {
    lines.push(
      "  Файлу api/.env немає. Створіть його: `cp api/.env.example api/.env`,",
      "  а потім заповніть значення нижче.",
      "",
    );
  }
  for (const [key, errors] of Object.entries(fieldErrors)) {
    const missing = env[key] === undefined || env[key] === "";
    lines.push(
      `  • ${key}: ${missing ? "не задано" : `невірне значення (${errors?.join(", ")})`}`,
    );
    if (HINTS[key]) lines.push(`      ${HINTS[key]}`);
  }
  lines.push("", "  Приклад усіх змінних: api/.env.example", "");
  return lines.join("\n");
}

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  console.error(
    describeEnvProblems(
      parsed.error.flatten().fieldErrors,
      process.env,
      existsSync(resolve(process.cwd(), ".env")),
    ),
  );
  process.exit(1);
}

export const env = load();

export const isProduction =
  env.NODE_ENV !== "development" && env.NODE_ENV !== "test";

export const docsEnabled =
  env.DOCS_ENABLED !== undefined ? env.DOCS_ENABLED === "true" : !isProduction;
