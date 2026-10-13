import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  BETTER_AUTH_SECRET: z.string().min(32),
  WEB_URL: z.string().url().default("http://localhost:5173"),
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
