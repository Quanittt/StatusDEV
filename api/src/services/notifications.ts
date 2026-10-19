import type {
  MilestoneClientResponse,
  MilestoneStatus,
} from "@statusdev/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients, milestones, projects, user } from "../db/schema.js";
import { env } from "../env.js";
import {
  oneLine,
  renderEmail,
  type EmailContent,
} from "../lib/email-templates.js";
import { sendEmail } from "../lib/miler.js";
import { escapeTelegram } from "../lib/telegram.js";
import { deliverOwnerEvent } from "./owner-events.js";

// Листи не повинні ні блокувати запит, ні ламати його: помилка Resend лише логується.
// У тестах чекаємо на виконання, щоб перевірки були детермінованими.
export async function dispatch(task: () => Promise<void>) {
  const run = task().catch((err) => {
    console.error("[email] не вдалося надіслати сповіщення:", err);
  });
  if (env.NODE_ENV === "test") await run;
}

// Лист і мессенджери йдуть незалежно: якщо Resend лежить, Telegram усе одно спрацює.
async function allChannels(...tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[notify] канал не спрацював:", r.reason);
    }
  }
}

export const portalUrl = (token: string) => `${env.WEB_URL}/p/${token}`;
export const projectUrl = (projectId: string) =>
  `${env.WEB_URL}/projects/${projectId}`;

export const MILESTONE_STATUS_TEXT: Record<MilestoneStatus, string> = {
  todo: "очікує",
  in_progress: "в роботі",
  done: "готово",
};

export function sendTemplated(to: string, subject: string, content: EmailContent) {
  const { html, text } = renderEmail(content);
  return sendEmail({ to, subject: oneLine(subject), html, text });
}

// Усе, що потрібно для листа про етап: сам етап, проєкт, клієнт і власник з брендом.
async function loadMilestoneContext(milestoneId: string) {
  const [row] = await db
    .select({
      milestoneTitle: milestones.title,
      clientAction: milestones.clientAction,
      projectId: projects.id,
      projectTitle: projects.title,
      ownerId: projects.ownerId,
      shareToken: projects.shareToken,
      projectStatus: projects.status,
      clientName: clients.name,
      clientEmail: clients.email,
      ownerName: user.name,
      ownerEmail: user.email,
      brandName: user.brandName,
      brandColor: user.brandColor,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(eq(milestones.id, milestoneId));
  if (!row) return null;
  return { ...row, brand: row.brandName?.trim() || row.ownerName };
}

// Клієнту: етап зрушив з місця. Повернення в «очікує» — правка власника, листа не варте.
// Лист іде лише коли є активне посилання і email: інакше клієнту нікуди переходити.
export async function notifyClientMilestoneStatus(
  milestoneId: string,
  from: MilestoneStatus,
  to: MilestoneStatus,
) {
  if (to === "todo" || from === to) return;
  const c = await loadMilestoneContext(milestoneId);
  if (!c || !c.clientEmail || !c.shareToken || c.projectStatus === "archived") {
    return;
  }

  await sendTemplated(
    c.clientEmail,
    `${c.brand}: етап «${c.milestoneTitle}» — ${MILESTONE_STATUS_TEXT[to]}`,
    {
      brand: c.brand,
      brandColor: c.brandColor,
      heading: `Етап «${c.milestoneTitle}»: ${MILESTONE_STATUS_TEXT[to]}`,
      paragraphs: [
        `Проєкт «${c.projectTitle}»: статус етапу змінився з «${MILESTONE_STATUS_TEXT[from]}» на «${MILESTONE_STATUS_TEXT[to]}».`,
        ...(c.clientAction && to !== "done"
          ? [`Потрібно від вас: ${c.clientAction}`]
          : []),
      ],
      button: { label: "Відкрити проєкт", url: portalUrl(c.shareToken) },
    },
  );
}

// Власнику: клієнт написав у порталі.
export async function notifyOwnerClientComment(projectId: string, body: string) {
  const [row] = await db
    .select({
      title: projects.title,
      ownerId: projects.ownerId,
      clientName: clients.name,
      ownerEmail: user.email,
      brandColor: user.brandColor,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(eq(projects.id, projectId));
  if (!row) return;

  await allChannels(
    sendTemplated(row.ownerEmail, `Новий коментар від клієнта: ${row.title}`, {
      brand: "StatusDEV",
      brandColor: row.brandColor,
      heading: `${row.clientName} залишив(ла) коментар`,
      paragraphs: [`Проєкт «${row.title}»:`],
      quote: body,
      button: { label: "Відкрити проєкт", url: projectUrl(projectId) },
    }),
    deliverOwnerEvent(row.ownerId, {
      event: "client.comment",
      telegramHtml: `💬 <b>${escapeTelegram(row.clientName)}</b> • ${escapeTelegram(row.title)}
${escapeTelegram(body.slice(0, 500))}`,
      project: { id: projectId, title: row.title },
      data: { client: row.clientName, body },
    }),
  );
}

// Власнику: клієнт прийняв етап або попросив правки.
export async function notifyOwnerClientResponse(
  milestoneId: string,
  response: MilestoneClientResponse,
  note: string | null,
) {
  const c = await loadMilestoneContext(milestoneId);
  if (!c) return;
  const approved = response === "approved";
  const headline = approved
    ? `${c.clientName} прийняв(ла) етап «${c.milestoneTitle}»`
    : `${c.clientName} просить правки до етапу «${c.milestoneTitle}»`;

  await allChannels(
    sendTemplated(
      c.ownerEmail,
      approved
        ? `Клієнт прийняв етап «${c.milestoneTitle}»`
        : `Клієнт просить правки: «${c.milestoneTitle}»`,
      {
        brand: "StatusDEV",
        brandColor: c.brandColor,
        heading: headline,
        paragraphs: [`Проєкт «${c.projectTitle}».`],
        quote: note ?? undefined,
        button: { label: "Відкрити проєкт", url: projectUrl(c.projectId) },
      },
    ),
    deliverOwnerEvent(c.ownerId, {
      event: "client.milestone_response",
      telegramHtml: `${approved ? "✅" : "✏️"} ${escapeTelegram(headline)}${note ? `
${escapeTelegram(note.slice(0, 500))}` : ""}`,
      project: { id: c.projectId, title: c.projectTitle },
      data: { milestone: c.milestoneTitle, response, note },
    }),
  );
}

// Власнику: клієнт погодив документ іменем або попросив правки.
export async function notifyOwnerDocumentResponse(
  projectId: string,
  documentTitle: string,
  response: "approved" | "changes_requested",
  detail: string,
) {
  const [row] = await db
    .select({
      title: projects.title,
      ownerId: projects.ownerId,
      clientName: clients.name,
      ownerEmail: user.email,
      brandColor: user.brandColor,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(eq(projects.id, projectId));
  if (!row) return;
  const approved = response === "approved";
  const headline = approved
    ? `Документ «${documentTitle}» погоджено: ${detail}`
    : `Правки до документа «${documentTitle}»`;

  await allChannels(
    sendTemplated(row.ownerEmail, headline, {
      brand: "StatusDEV",
      brandColor: row.brandColor,
      heading: headline,
      paragraphs: [`Проєкт «${row.title}», клієнт ${row.clientName}.`],
      quote: approved ? undefined : detail,
      button: { label: "Відкрити проєкт", url: projectUrl(projectId) },
    }),
    deliverOwnerEvent(row.ownerId, {
      event: "client.document_response",
      telegramHtml: `${approved ? "🖊" : "✏️"} ${escapeTelegram(headline)}${approved ? "" : `
${escapeTelegram(detail.slice(0, 500))}`}`,
      project: { id: projectId, title: row.title },
      data: { document: documentTitle, response, detail },
    }),
  );
}

// Клієнту: власник надіслав документ на погодження.
export async function notifyClientDocumentRequested(
  projectId: string,
  documentTitle: string,
) {
  const [row] = await db
    .select({
      title: projects.title,
      shareToken: projects.shareToken,
      status: projects.status,
      clientEmail: clients.email,
      ownerName: user.name,
      brandName: user.brandName,
      brandColor: user.brandColor,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(eq(projects.id, projectId));
  if (!row || !row.clientEmail || !row.shareToken || row.status === "archived") {
    return;
  }
  const brand = row.brandName?.trim() || row.ownerName;

  await sendTemplated(row.clientEmail, `${brand}: погодьте документ «${documentTitle}»`, {
    brand,
    brandColor: row.brandColor,
    heading: `Потрібне ваше погодження: «${documentTitle}»`,
    paragraphs: [
      `Проєкт «${row.title}»: відкрийте документ, перегляньте його й погодьте або залиште правки.`,
    ],
    button: { label: "Відкрити документ", url: portalUrl(row.shareToken) },
  });
}
