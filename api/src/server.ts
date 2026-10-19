import { initSentry, flushSentry } from "./lib/sentry.js";
import { buildApp } from "./app.js";
import { pool } from "./db/client.js";
import { env } from "./env.js";
import { startTelegramPolling } from "./lib/telegram.js";
import { startReminderScheduler } from "./services/reminders.js";

initSentry();
const app = buildApp();

// Спершу перестаємо приймати запити й дочікуємось поточних, потім закриваємо пул.
const stopReminders = startReminderScheduler(env.REMINDERS_INTERVAL_MINUTES, {
  info: (msg) => app.log.info(msg),
  error: (err) => app.log.error(err),
});

const stopTelegram = startTelegramPolling({
  info: (msg) => app.log.info(msg),
  error: (err) => app.log.error(err),
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal}: зупиняю сервер`);
  try {
    stopTelegram();
    await stopReminders();
    await app.close();
    await pool.end();
    await flushSentry();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
