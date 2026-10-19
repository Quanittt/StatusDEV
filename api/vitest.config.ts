import { defineConfig } from "vitest/config";

// Тести ніколи не ходять у dev-базу: змінні виставляються тут, а dotenv їх не перезаписує.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/statusdev_test";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
      WEB_URL: "http://localhost:5173",
      PORT: "3999",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "test@example.com",
      R2_ACCOUNT_ID: "test",
      R2_ACCESS_KEY_ID: "test",
      R2_SECRET_ACCESS_KEY: "test",
      R2_BUCKET: "test-bucket",
    },
    // Одна спільна база, тому файли тестів ідуть по черзі.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
