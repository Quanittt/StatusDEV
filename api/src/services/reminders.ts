import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients, milestones, projects, user } from "../db/schema.js";
import { formatDateUk } from "../lib/format.js";
import { escapeTelegram } from "../lib/telegram.js";
import { portalUrl, projectUrl, sendTemplated } from "./notifications.js";
import { deliverOwnerEvent } from "./owner-events.js";

const SOON_HOURS = 48;
const DAY_MS = 24 * 60 * 60 * 1000;

type Kind = "soon" | "overdue";

// Дата етапу — це день, а не момент: due_date приходить як північ UTC. Етап вважається
// простроченим, коли минув увесь день дедлайну, а «скоро» — коли до нього менше 48 годин.
export async function runDeadlineReminders(now = new Date()) {
  // Колонки без часової зони зберігають UTC, тому порівнюємо з UTC-рядками: Date, переданий
  // в sql``, node-pg серіалізує в локальній зоні процесу, і межі "скоро/прострочено" зсунулись би.
  const nowUtc = now.toISOString();
  const soonUntilUtc = new Date(
    now.getTime() + SOON_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const endOfDay = sql`${milestones.dueDate} + interval '1 day'`;

  const rows = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      dueDate: milestones.dueDate,
      clientAction: milestones.clientAction,
      soonRemindedAt: milestones.soonRemindedAt,
      overdueRemindedAt: milestones.overdueRemindedAt,
      projectId: projects.id,
      projectTitle: projects.title,
      shareToken: projects.shareToken,
      clientName: clients.name,
      clientEmail: clients.email,
      ownerId: projects.ownerId,
      ownerEmail: user.email,
      ownerName: user.name,
      brandName: user.brandName,
      brandColor: user.brandColor,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(
      and(
        ne(milestones.status, "done"),
        eq(projects.status, "active"),
        sql`${milestones.dueDate} is not null`,
        or(
          and(
            isNull(milestones.overdueRemindedAt),
            sql`${endOfDay} <= ${nowUtc}::timestamp`,
          ),
          and(
            isNull(milestones.soonRemindedAt),
            sql`${endOfDay} > ${nowUtc}::timestamp`,
            sql`${milestones.dueDate} <= ${soonUntilUtc}::timestamp`,
          ),
        ),
      ),
    );

  const sent = { soon: 0, overdue: 0 };

  for (const m of rows) {
    const dueDate = m.dueDate as Date;
    const kind: Kind =
      dueDate.getTime() + DAY_MS <= now.getTime() ? "overdue" : "soon";

    // Спершу «займаємо» нагадування, потім шлемо: два інстанси не надішлють лист двічі.
    const column =
      kind === "soon" ? milestones.soonRemindedAt : milestones.overdueRemindedAt;
    const claim =
      kind === "soon"
        ? { soonRemindedAt: now }
        : { soonRemindedAt: m.soonRemindedAt ?? now, overdueRemindedAt: now };
    const claimed = await db
      .update(milestones)
      .set(claim)
      .where(and(eq(milestones.id, m.id), isNull(column)))
      .returning({ id: milestones.id });
    if (claimed.length === 0) continue;

    const brand = m.brandName?.trim() || m.ownerName;
    const due = formatDateUk(dueDate);
    const heading =
      kind === "soon"
        ? `Скоро термін етапу «${m.title}»`
        : `Прострочено етап «${m.title}»`;
    const when =
      kind === "soon"
        ? `Термін етапу — ${due}.`
        : `Термін етапу минув ${due}, а етап ще не завершено.`;

    // Власника сповіщаємо першим. Якщо його лист не пішов, знімаємо позначку й пробуємо наступного разу.
    // Після того як власник отримав повідомлення, збій клієнтського листа позначку не знімає:
    // інакше власнику щогодини приходило б те саме.
    let ownerNotified = false;
    try {
      await sendTemplated(m.ownerEmail, `${heading} — ${m.projectTitle}`, {
        brand: "StatusDEV",
        brandColor: m.brandColor,
        heading,
        paragraphs: [`Проєкт «${m.projectTitle}», клієнт ${m.clientName}.`, when],
        button: { label: "Відкрити проєкт", url: projectUrl(m.projectId) },
      });
      await deliverOwnerEvent(m.ownerId, {
        event: kind === "soon" ? "deadline.soon" : "deadline.overdue",
        telegramHtml: `${kind === "soon" ? "⏰" : "❗"} <b>${escapeTelegram(heading)}</b>
${escapeTelegram(m.projectTitle)}: ${escapeTelegram(when)}`,
        project: { id: m.projectId, title: m.projectTitle },
        data: { milestone: m.title, dueDate: dueDate.toISOString() },
      });

      ownerNotified = true;
      sent[kind] += 1;
    } catch (err) {
      console.error(`[reminders] не вдалося надіслати нагадування (${m.id}):`, err);
      // Знімаємо позначку, щоб наступний запуск спробував ще раз.
      await db
        .update(milestones)
        .set(
          kind === "soon"
            ? { soonRemindedAt: null }
            : { overdueRemindedAt: null, soonRemindedAt: m.soonRemindedAt },
        )
        .where(eq(milestones.id, m.id));
    }

    // Клієнту нагадуємо лише про етапи, де потрібна його дія. Його збій не повторюється:
    // позначка вже стоїть, а власник отримав своє.
    if (ownerNotified && m.clientAction && m.clientEmail && m.shareToken) {
      await sendTemplated(m.clientEmail, `${brand}: ${heading}`, {
        brand,
        brandColor: m.brandColor,
        heading,
        paragraphs: [
          `Проєкт «${m.projectTitle}». ${when}`,
          `Потрібно від вас: ${m.clientAction}`,
        ],
        button: { label: "Відкрити проєкт", url: portalUrl(m.shareToken) },
      }).catch((err) =>
        console.error(`[reminders] лист клієнту не надіслано (${m.id}):`, err),
      );
    }
  }

  return sent;
}

// Періодичний запуск у процесі API. stop() зупиняє таймери і дочікується запуску, що вже йде:
// інакше закритий пул базу обірвав би його посередині (етап позначено, а лист не пішов).
export function startReminderScheduler(
  intervalMinutes: number,
  log: { info: (msg: string) => void; error: (err: unknown) => void },
) {
  if (intervalMinutes <= 0) return async () => {};

  let current: Promise<void> | null = null;
  let stopped = false;
  const tick = () => {
    if (current || stopped) return;
    current = (async () => {
      try {
        const sent = await runDeadlineReminders();
        if (sent.soon || sent.overdue) {
          log.info(
            `нагадування про дедлайни: скоро ${sent.soon}, прострочено ${sent.overdue}`,
          );
        }
      } catch (err) {
        log.error(err);
      } finally {
        current = null;
      }
    })();
  };

  const first = setTimeout(tick, 30_000);
  const timer = setInterval(tick, intervalMinutes * 60_000);
  return async () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(timer);
    await current;
  };
}
