import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  BETTER_AUTH_SECRET: z.string().min(32),
  WEB_URL: z.string().url().default("http://localhost:5173"),
  // Публічна адреса самого API. Без неї Better Auth будує посилання на localhost.
    API_URL: z.string().url().optional(),
//Resend api keys
    RESEND_API_KEY: z.string().startsWith("re_"),
    EMAIL_FROM: z.string().min(1),
  // Cloudflare R2 (S3-сумісне сховище файлів)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = Object.entries(parsed.error.flatten().fieldErrors)
    .map(([key, errors]) => `  ${key}: ${errors?.join(", ")}`)
    .join("\n");
  console.error(`Невірні або відсутні змінні середовища:\n${missing}`);
  process.exit(1);
}

export const env = parsed.data;
