import { defineConfig, devices } from "@playwright/test";

// E2E ганяє справжні api і web на окремих портах та окремій базі statusdev_e2e,
// тому dev-сервери й dev-база не заважають. NODE_ENV=test вимикає реальні листи Resend.
const API_PORT = 3101;
const WEB_PORT = 5174;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/statusdev_e2e";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    locale: "uk-UA",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Спершу свіжа база з міграціями, потім сервер.
      command: "node ../e2e/prepare-db.mjs && npx tsx src/server.ts",
      cwd: "api",
      url: `${API_URL}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        DATABASE_URL,
        PORT: String(API_PORT),
        API_URL,
        WEB_URL,
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456",
        RESEND_API_KEY: "re_e2e",
        EMAIL_FROM: "e2e@example.com",
        R2_ACCOUNT_ID: "e2e",
        R2_ACCESS_KEY_ID: "e2e",
        R2_SECRET_ACCESS_KEY: "e2e",
        R2_BUCKET: "e2e",
        REMINDERS_INTERVAL_MINUTES: "0",
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: "web",
      url: WEB_URL,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
