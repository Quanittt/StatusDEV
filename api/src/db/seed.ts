import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { env, isProduction } from "../env.js";
import { createOwnerComment } from "../services/comments.js";
import {
  createMilestone,
  createProject,
  updateMilestone,
  updateProject,
} from "../services/projects.js";
import { createShareLink } from "../services/portal.js";
import { db, pool } from "./client.js";
import { clients, comments, milestones, user } from "./schema.js";

// Демо-дані для локальної розробки: тестовий власник, клієнти й проєкти в різних станах.
// Скрипт можна запускати повторно: дані цього користувача створюються заново.
const EMAIL = "t1@example.com";
const PASSWORD = "12345678";
const PORTAL_PASSWORD = "demo1234";

const DAY = 24 * 60 * 60 * 1000;
const inDays = (d: number) => new Date(Date.now() + d * DAY);

async function ensureUser() {
  const [existing] = await db.select().from(user).where(eq(user.email, EMAIL));
  if (existing) return existing.id;
  const created = await auth.api.signUpEmail({
    body: { name: "Тестовий власник", email: EMAIL, password: PASSWORD },
  });
  return created.user.id;
}

async function main() {
  if (isProduction) {
    throw new Error(
      "db:seed працює лише з NODE_ENV=development (задайте його в api/.env): скрипт створює акаунт із відомим паролем.",
    );
  }

  const ownerId = await ensureUser();
  // pro, щоб не впертись у ліміт двох активних проєктів на Free.
  await db
    .update(user)
    .set({ plan: "pro", brandName: "Студія Тест", brandColor: "#7c3aed" })
    .where(eq(user.id, ownerId));
  // Каскад прибирає проєкти, етапи, коментарі й історію старого демо.
  await db.delete(clients).where(eq(clients.ownerId, ownerId));

  const [olena, cafe, andriy] = await db
    .insert(clients)
    .values([
      { ownerId, name: "Олена Коваленко", email: "olena@example.com", notes: "Пише ввечері" },
      { ownerId, name: "ТОВ Смачна кава", email: "cafe@example.com", phone: "+380501112233" },
      { ownerId, name: "Андрій (без email)", notes: "Листів не отримує, лише портал" },
    ])
    .returning();

  // 1. Сайт: у процесі, є дія від клієнта і відповідь клієнта на готовий етап.
  const site = await createProject(ownerId, {
    clientId: cafe.id,
    title: "Сайт для кав'ярні",
    description: "Сайт-візитка з меню та бронюванням столиків",
    deadline: inDays(30),
    template: "website",
  });
  const siteMs = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, site.id))
    .orderBy(milestones.position);
  await updateMilestone(siteMs[0].id, ownerId, { status: "done" });
  await updateMilestone(siteMs[1].id, ownerId, {
    status: "in_progress",
    dueDate: inDays(2),
  });
  await updateMilestone(siteMs[2].id, ownerId, { dueDate: inDays(14) });
  await createOwnerComment(site.id, ownerId, {
    body: "Надіслала перший варіант дизайну, гляньте, будь ласка.",
  });

  // 2. Лендинг: прострочений етап і портал із паролем та терміном дії.
  const landing = await createProject(ownerId, {
    clientId: olena.id,
    title: "Лендинг онлайн-курсу",
    deadline: inDays(20),
    template: "landing",
  });
  const landingMs = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, landing.id))
    .orderBy(milestones.position);
  await updateMilestone(landingMs[0].id, ownerId, { status: "done" });
  await updateMilestone(landingMs[1].id, ownerId, { status: "done" });
  await updateMilestone(landingMs[2].id, ownerId, {
    status: "in_progress",
    dueDate: inDays(-3),
  });

  // 3. Застосунок: на паузі, без посилання.
  await createProject(ownerId, {
    clientId: andriy.id,
    title: "Мобільний застосунок для зали",
    status: "paused",
    template: "mobile_app",
  });

  // 4. Логотип: завершений проєкт.
  const logo = await createProject(ownerId, {
    clientId: olena.id,
    title: "Логотип і брендбук",
    template: "branding",
  });
  const logoMs = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, logo.id));
  for (const m of logoMs) {
    await updateMilestone(m.id, ownerId, { status: "done" });
  }
  await updateProject(logo.id, ownerId, { status: "done" });

  // Посилання створюємо після зміни етапів: інакше клієнти отримали б листи про кожну зміну.
  const siteLink = await createShareLink(site.id, ownerId);
  const landingLink = await createShareLink(landing.id, ownerId, {
    password: PORTAL_PASSWORD,
    expiresAt: inDays(30),
  });
  const logoLink = await createShareLink(logo.id, ownerId);
  await createMilestone(landing.id, ownerId, {
    title: "Підключити оплату",
    clientAction: "Надіслати дані ФОП для еквайрингу",
  });

  // Дії клієнта записуємо напряму: через портал власнику пішли б листи на вигадану адресу.
  await db.insert(comments).values({
    projectId: site.id,
    authorType: "client",
    authorId: null,
    body: "Дякую! Подивлюсь завтра зранку.",
  });
  await db
    .update(milestones)
    .set({ clientResponse: "approved", clientRespondedAt: new Date() })
    .where(eq(milestones.id, siteMs[0].id));

  const web = env.WEB_URL;
  console.log(`
Демо-дані готові.

  Вхід:      ${EMAIL} / ${PASSWORD}
  Портали:
    Сайт для кав'ярні   ${web}/p/${siteLink.shareToken}
    Лендинг (пароль ${PORTAL_PASSWORD}) ${web}/p/${landingLink.shareToken}
    Логотип             ${web}/p/${logoLink.shareToken}
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
