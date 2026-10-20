import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { env, isProduction } from "../env.js";
import {
  createMilestone,
  createProject,
  updateMilestone,
  updateProject,
} from "../services/projects.js";
import { createShareLink } from "../services/portal.js";
import { db, pool } from "./client.js";
import {
  chatMessages,
  clients,
  comments,
  documents,
  files,
  milestones,
  projectMembers,
  projects,
  user,
} from "./schema.js";

// Демо-дані для локальної розробки: кілька власників із різними брендами, клієнти й проєкти
// в усіх станах, які є в інтерфейсі (порожній, прострочений, завершений, архів, правки клієнта,
// довгі назви, документи, команда з чатом). Скрипт можна запускати повторно:
// дані демо-власників створюються заново.
const PASSWORD = "12345678";
const PORTAL_PASSWORD = "demo1234";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const inDays = (d: number) => new Date(Date.now() + d * DAY);
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

type MilestoneStatus = "todo" | "in_progress" | "done";
type Template = "website" | "landing" | "mobile_app" | "branding" | "smm";

interface MilestoneSpec {
  status?: MilestoneStatus;
  due?: number; // днів від сьогодні, може бути від'ємним
  response?: "approved" | "changes_requested";
  note?: string;
}

interface ExtraMilestone {
  title: string;
  status?: MilestoneStatus;
  due?: number;
  clientAction?: string;
}

interface ProjectSpec {
  client: string;
  title: string;
  description?: string;
  template?: Template;
  status?: "active" | "paused" | "done" | "archived";
  deadline?: number;
  // Скільки перших етапів позначити виконаними; решту налаштовує milestones[i].
  done?: number;
  milestones?: MilestoneSpec[];
  extra?: ExtraMilestone[];
  // Посилання для клієнта. expiresIn < 0 дає вже прострочене посилання.
  link?: { password?: string; expiresIn?: number } | true;
  // [автор, текст, скільки годин тому]
  comments?: ["owner" | "client", string, number][];
  documents?: {
    title: string;
    file: string;
    status: "pending" | "approved" | "changes_requested";
    signer?: string;
    note?: string;
  }[];
  // Як давно проєкт оновлювали: для «оновлено N днів тому».
  ageDays?: number;
}

interface OwnerSpec {
  email: string;
  name: string;
  plan: "free" | "pro";
  brandName: string | null;
  brandColor: string | null;
  clients: { name: string; email?: string; phone?: string; notes?: string }[];
  projects: ProjectSpec[];
}

async function ensureUser(email: string, name: string) {
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) return existing.id;
  const created = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  return created.user.id;
}

const longMilestones: ExtraMilestone[] = [
  "Збір вимог від відділів",
  "Аналіз поточних процесів документообігу",
  "Проєктування архітектури та інтеграцій з 1С",
  "Дизайн особистого кабінету працівника",
  "Дизайн панелі керівника відділу закупівель і контролю виконання",
  "Розробка модуля заявок",
  "Розробка модуля погодження",
  "Інтеграція з електронною поштою та месенджерами",
  "Міграція архіву документів за 2019–2024 роки",
  "Налаштування ролей і прав доступу",
  "Пентест і виправлення вразливостей",
  "Навантажувальне тестування",
  "Навчання користувачів",
  "Пілотний запуск у двох відділах",
  "Збір відгуків і правки",
  "Повний запуск",
].map((title, i) => ({
  title,
  status: i < 5 ? "done" : i < 8 ? "in_progress" : "todo",
  due: i < 5 ? undefined : (i - 4) * 6,
  clientAction: i === 3 ? "Затвердити макети кабінету" : i === 12 ? "Узгодити графік навчання" : undefined,
}));

const OWNERS: OwnerSpec[] = [
  {
    email: "t1@example.com",
    name: "Тестовий власник",
    plan: "pro",
    brandName: "Студія Тест",
    brandColor: "#7c3aed",
    clients: [
      { name: "Олена Коваленко", email: "olena@example.com", notes: "Пише ввечері" },
      { name: "ТОВ Смачна кава", email: "cafe@example.com", phone: "+380501112233" },
      { name: "Андрій (без email)", notes: "Листів не отримує, лише портал" },
      { name: "Віктор Шевченко", email: "viktor@example.com", phone: "+380671234567" },
      {
        name: "Агенція «Горизонт»",
        email: "office@horyzont.example.com",
        notes:
          "Контактна особа — Ірина, бухгалтерія. Всі правки лише письмово, дзвінки не любить. Оплата по факту підписання актів.",
      },
      { name: "Ірина" },
    ],
    projects: [
      {
        // Сайт: у процесі, є дії від клієнта, відповідь клієнта і команда.
        client: "ТОВ Смачна кава",
        title: "Сайт для кав'ярні",
        description: "Сайт-візитка з меню та бронюванням столиків",
        template: "website",
        deadline: 30,
        done: 1,
        milestones: [{ response: "approved" }, { status: "in_progress", due: 2 }, { due: 14 }],
        link: true,
        ageDays: 0,
        comments: [
          ["owner", "Надіслала перший варіант дизайну, гляньте, будь ласка.", 30],
          ["client", "Дякую! Подивлюсь завтра зранку.", 5],
        ],
        documents: [
          { title: "Договір на розробку сайту", file: "dogovir-kavyarnya.pdf", status: "approved", signer: "Дмитро Смачний" },
          { title: "Технічне завдання", file: "tz-kavyarnya.pdf", status: "pending" },
        ],
      },
      {
        // Лендинг: прострочений етап, портал із паролем і терміном дії.
        client: "Олена Коваленко",
        title: "Лендинг онлайн-курсу",
        template: "landing",
        deadline: 20,
        done: 2,
        milestones: [{}, {}, { status: "in_progress", due: -3 }],
        extra: [{ title: "Підключити оплату", clientAction: "Надіслати дані ФОП для еквайрингу" }],
        link: { password: PORTAL_PASSWORD, expiresIn: 30 },
        ageDays: 1,
      },
      // Застосунок: на паузі, без посилання.
      {
        client: "Андрій (без email)",
        title: "Мобільний застосунок для зали",
        template: "mobile_app",
        status: "paused",
        ageDays: 12,
      },
      // Логотип: завершений проєкт.
      {
        client: "Олена Коваленко",
        title: "Логотип і брендбук",
        template: "branding",
        status: "done",
        done: 4,
        link: true,
        ageDays: 40,
        comments: [
          ["owner", "Фінальні файли у вкладенні, дякую за співпрацю!", 24 * 40],
          ["client", "Все чудово, ми в захваті 🙌", 24 * 39],
        ],
      },
      {
        // Довга назва й опис, багато етапів різної довжини.
        client: "Агенція «Горизонт»",
        title: "Корпоративний портал для внутрішньої комунікації та автоматизації документообігу відділу закупівель",
        description:
          "Єдина точка входу для працівників: заявки на закупівлі, погодження документів, нагадування про дедлайни, інтеграція з 1С та поштою, особистий кабінет, панель керівника та звіти. Проєкт розрахований на 300 користувачів у п'яти філіях по Україні.",
        deadline: 75,
        extra: longMilestones,
        link: true,
        ageDays: 2,
      },
      // Порожній проєкт: без етапів і коментарів.
      {
        client: "Віктор Шевченко",
        title: "Консультація: аудит сайту",
        link: true,
        ageDays: 0,
      },
      // Свіжий проєкт зі близьким дедлайном, усі етапи заплановані.
      {
        client: "Ірина",
        title: "SMM для кондитерської",
        template: "smm",
        deadline: 3,
        ageDays: 0,
      },
      {
        // Клієнт попросив правки.
        client: "Віктор Шевченко",
        title: "Сайт-портфоліо фотографа",
        template: "website",
        deadline: 18,
        done: 1,
        milestones: [
          {},
          {
            status: "in_progress",
            due: 1,
            response: "changes_requested",
            note: "Хедер занадто темний, і хотілося б побачити галерею у три колонки, а не у дві. Ще — замініть шрифт заголовків на щось легше.",
          },
        ],
        link: true,
        ageDays: 0,
        comments: [
          ["owner", "Привіт! Додала першу версію дизайну, чекаю на відгук.", 72],
          ["client", "Привіт, вигляд цікавий, але є кілька зауважень — написав на етапі.", 50],
          ["owner", "Бачу, виправлю сьогодні.", 49],
          ["client", "А можна ще додати сторінку «Про мене»?", 26],
          ["owner", "Можна, це +1 день до строків. Влаштує?", 25],
          ["client", "Так, влаштує.", 2],
        ],
      },
      {
        // Посилання вже прострочене: портал покаже 410.
        client: "ТОВ Смачна кава",
        title: "Айдентика для нової точки",
        template: "branding",
        done: 2,
        milestones: [{}, {}, { status: "in_progress", due: 5 }],
        link: { expiresIn: -2 },
        ageDays: 9,
      },
      {
        // Три документи з усіма статусами.
        client: "Агенція «Горизонт»",
        title: "Сайт агенції",
        template: "website",
        done: 3,
        milestones: [{}, {}, {}, { status: "in_progress", due: 4 }],
        link: true,
        ageDays: 3,
        documents: [
          { title: "Договір", file: "dogovir-horyzont.pdf", status: "approved", signer: "Ірина Мельник" },
          { title: "Специфікація робіт", file: "specyfikatsiya.pdf", status: "changes_requested", note: "У пункті 3.2 вказано старі терміни." },
          { title: "Акт виконаних робіт, етап 1", file: "akt-1.pdf", status: "pending" },
        ],
      },
      {
        // Активний проєкт із простроченим дедлайном.
        client: "Андрій (без email)",
        title: "Лендинг для залу: акція до Нового року",
        template: "landing",
        deadline: -10,
        done: 4,
        milestones: [{}, {}, {}, {}, { status: "in_progress", due: -6 }],
        link: true,
        ageDays: 6,
      },
      // Архів.
      {
        client: "Олена Коваленко",
        title: "Редизайн блогу (2023)",
        template: "website",
        status: "archived",
        done: 5,
        ageDays: 200,
      },
    ],
  },
  {
    // Дуже світлий бренд-колір: текст у шапці порталу має стати темним.
    email: "t2@example.com",
    name: "Марко Жовтий",
    plan: "pro",
    brandName: "Сонячна студія",
    brandColor: "#facc15",
    clients: [{ name: "Кав'ярня «Лютий»", email: "lutyi@example.com" }],
    projects: [
      {
        client: "Кав'ярня «Лютий»",
        title: "Сайт кав'ярні",
        template: "website",
        done: 2,
        milestones: [{}, {}, { status: "in_progress", due: 3 }],
        deadline: 14,
        link: true,
        comments: [["owner", "Дизайн готовий, чекаю на ваші правки.", 20]],
      },
      { client: "Кав'ярня «Лютий»", title: "Логотип", template: "branding", status: "done", done: 4, link: true, ageDays: 20 },
    ],
  },
  {
    // Майже чорний бренд-колір.
    email: "t3@example.com",
    name: "Максим Мінімал",
    plan: "pro",
    brandName: "MONO",
    brandColor: "#111827",
    clients: [{ name: "Studio Nord", email: "hello@nord.example.com" }],
    projects: [
      {
        client: "Studio Nord",
        title: "Лендинг для Studio Nord",
        template: "landing",
        done: 3,
        milestones: [{}, {}, {}, { status: "in_progress", due: 2 }],
        link: true,
        comments: [["client", "Мінімалізм саме те, що треба.", 8]],
      },
      { client: "Studio Nord", title: "SMM на квартал", template: "smm", done: 1, milestones: [{}, { status: "in_progress", due: 7 }], link: true },
    ],
  },
  {
    // Зелений бренд і портал із паролем.
    email: "t4@example.com",
    name: "Єва Еко",
    plan: "pro",
    brandName: "Eco Dev",
    brandColor: "#15803d",
    clients: [{ name: "Еко-ферма «Колос»", email: "kolos@example.com" }],
    projects: [
      {
        client: "Еко-ферма «Колос»",
        title: "Інтернет-магазин фермерських продуктів",
        template: "website",
        done: 1,
        milestones: [{}, { status: "in_progress", due: 4 }],
        link: { password: PORTAL_PASSWORD },
      },
    ],
  },
  {
    // Free без бренду: портал у кольорі StatusDEV; ліміт двох активних проєктів уже вичерпано.
    email: "t5@example.com",
    name: "Нікіта Безбрендовий",
    plan: "free",
    brandName: null,
    brandColor: null,
    clients: [{ name: "Тарас" }],
    projects: [
      { client: "Тарас", title: "Застосунок для обліку витрат", template: "mobile_app", done: 2, milestones: [{}, {}, { status: "in_progress", due: 6 }], link: true },
      { client: "Тарас", title: "Візитка на одну сторінку", template: "landing", link: true },
    ],
  },
];

async function buildProject(ownerId: string, clientIds: Map<string, string>, spec: ProjectSpec) {
  const clientId = clientIds.get(spec.client);
  if (!clientId) throw new Error(`У сіді немає клієнта «${spec.client}»`);

  const project = await createProject(ownerId, {
    clientId,
    title: spec.title,
    description: spec.description,
    template: spec.template,
    status: spec.status,
    deadline: spec.deadline === undefined ? undefined : inDays(spec.deadline),
  });

  const list = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, project.id))
    .orderBy(milestones.position);

  for (const [i, m] of list.entries()) {
    const s = spec.milestones?.[i] ?? {};
    const status = s.status ?? (i < (spec.done ?? 0) ? "done" : undefined);
    if (status || s.due !== undefined) {
      await updateMilestone(m.id, ownerId, {
        ...(status && { status }),
        ...(s.due !== undefined && { dueDate: inDays(s.due) }),
      });
    }
  }

  for (const e of spec.extra ?? []) {
    const created = await createMilestone(project.id, ownerId, {
      title: e.title,
      clientAction: e.clientAction,
    });
    if (e.status || e.due !== undefined) {
      await updateMilestone(created.id, ownerId, {
        ...(e.status && { status: e.status }),
        ...(e.due !== undefined && { dueDate: inDays(e.due) }),
      });
    }
  }

  return { project, milestones: list };
}

async function main() {
  if (isProduction) {
    throw new Error(
      "db:seed працює лише з NODE_ENV=development (задайте його в api/.env): скрипт створює акаунти з відомим паролем.",
    );
  }

  const links: string[] = [];
  const logins: string[] = [];
  let teamProjectId: string | null = null;
  let mainOwnerId = "";

  for (const owner of OWNERS) {
    const ownerId = await ensureUser(owner.email, owner.name);
    if (!mainOwnerId) mainOwnerId = ownerId;
    // pro, щоб не впертись у ліміт двох активних проєктів на Free (крім демо-власника саме на Free).
    await db
      .update(user)
      .set({ plan: owner.plan, brandName: owner.brandName, brandColor: owner.brandColor })
      .where(eq(user.id, ownerId));
    // Каскад прибирає проєкти, етапи, коментарі й історію старого демо.
    await db.delete(clients).where(eq(clients.ownerId, ownerId));

    const created = await db
      .insert(clients)
      .values(owner.clients.map((c) => ({ ownerId, ...c })))
      .returning();
    const clientIds = new Map(created.map((c) => [c.name, c.id]));

    logins.push(
      `${owner.email}  ${owner.plan.padEnd(4)} ${owner.brandColor ?? "без бренду"} ${owner.brandName ?? ""}`,
    );

    for (const spec of owner.projects) {
      const { project, milestones: list } = await buildProject(ownerId, clientIds, spec);
      if (owner.email === "t1@example.com" && spec.title === "Сайт для кав'ярні") {
        teamProjectId = project.id;
      }

      // Коментарі й документи пишемо напряму: через сервіси власнику чи клієнту пішли б листи.
      for (const [author, body, hoursAgo] of spec.comments ?? []) {
        await db.insert(comments).values({
          projectId: project.id,
          authorType: author,
          authorId: author === "owner" ? ownerId : null,
          body,
          createdAt: ago(hoursAgo),
        });
      }

      // Відповіді клієнта ставимо після всіх змін етапів: будь-яка зміна їх скидає.
      for (const [i, m] of list.entries()) {
        const s = spec.milestones?.[i];
        if (!s?.response) continue;
        await db
          .update(milestones)
          .set({
            clientResponse: s.response,
            clientResponseNote: s.note ?? null,
            clientRespondedAt: new Date(),
          })
          .where(eq(milestones.id, m.id));
      }

      for (const d of spec.documents ?? []) {
        const [file] = await db
          .insert(files)
          .values({
            projectId: project.id,
            uploadedBy: ownerId,
            name: d.file,
            // Файлу в сховищі немає: картки документів видно, а завантаження не спрацює.
            storageKey: `demo/${project.id}/${d.file}`,
            mimeType: "application/pdf",
            sizeBytes: 184_320,
          })
          .returning();
        await db.insert(documents).values({
          projectId: project.id,
          fileId: file.id,
          title: d.title,
          status: d.status,
          signerName: d.signer ?? null,
          signerIp: d.signer ? "127.0.0.1" : null,
          note: d.note ?? null,
          respondedAt: d.status === "pending" ? null : ago(30),
          createdBy: ownerId,
        });
      }

      // Посилання створюємо після зміни етапів: інакше клієнти отримали б листи про кожну зміну.
      if (spec.link) {
        const opts = spec.link === true ? {} : spec.link;
        const link = await createShareLink(project.id, ownerId, {
          ...(opts.password && { password: opts.password }),
          ...(opts.expiresIn && opts.expiresIn > 0 && { expiresAt: inDays(opts.expiresIn) }),
        });
        // Сервіс не дозволяє дату в минулому, а для демо потрібне прострочене посилання.
        if (opts.expiresIn && opts.expiresIn < 0) {
          await db
            .update(projects)
            .set({ shareExpiresAt: inDays(opts.expiresIn) })
            .where(eq(projects.id, project.id));
        }
        const note = [
          opts.password && `пароль ${opts.password}`,
          opts.expiresIn && opts.expiresIn < 0 && "прострочене",
        ]
          .filter(Boolean)
          .join(", ");
        links.push(
          `${owner.brandName ?? "StatusDEV"} · ${spec.title.slice(0, 40)}${note ? ` (${note})` : ""}\n    ${env.WEB_URL}/p/${link.shareToken}`,
        );
      }

      if (spec.ageDays !== undefined) {
        await db
          .update(projects)
          .set({ updatedAt: ago(spec.ageDays * 24) })
          .where(eq(projects.id, project.id));
      }
    }
  }

  // Команда й чат: PM спілкується і з власником, і з джуніором; власник із джуніором напряму ні.
  if (teamProjectId) {
    const pmId = await ensureUser("pm@example.com", "Марина (PM)");
    const juniorId = await ensureUser("junior@example.com", "Богдан (junior)");
    await db.insert(projectMembers).values([
      { projectId: teamProjectId, userId: pmId, role: "pm" },
      { projectId: teamProjectId, userId: juniorId, role: "junior" },
    ]);
    const msg = (from: string, to: string, body: string, hoursAgo: number) => ({
      projectId: teamProjectId!,
      senderId: from,
      recipientId: to,
      body,
      createdAt: ago(hoursAgo),
    });
    await db.insert(chatMessages).values([
      msg(mainOwnerId, pmId, "Марино, клієнт просить перенести дедлайн на тиждень. Що скажеш?", 30),
      msg(pmId, mainOwnerId, "Можемо, якщо бриф буде до п'ятниці. Напишу їм.", 29),
      msg(mainOwnerId, pmId, "Супер, дякую!", 28),
      msg(pmId, juniorId, "Богдане, візьми верстку сторінки меню, макет у Figma.", 26),
      msg(juniorId, pmId, "Беру. Потрібні фото страв чи поки заглушки?", 25),
      msg(pmId, juniorId, "Заглушки, фото клієнт надішле пізніше.", 24),
    ]);
    logins.push("pm@example.com / junior@example.com — учасники проєкту «Сайт для кав'ярні» (чат)");
  }

  console.log(`
Демо-дані готові. Пароль усіх акаунтів: ${PASSWORD}

Входи:
  ${logins.join("\n  ")}

Портали клієнтів:
  ${links.join("\n  ")}
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
