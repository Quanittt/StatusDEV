import { randomBytes } from "node:crypto";
import type {
  CreatePortalCommentInput,
  PortalDocumentResponseInput,
  PortalMilestoneResponseInput,
  ShareSettingsInput,
} from "@statusdev/shared";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  comments,
  documents,
  files,
  milestones,
  projects,
  user,
} from "../db/schema.js";
import {
  BadRequestError,
  GoneError,
  NotFoundError,
  PortalPasswordRequiredError,
  WrongPasswordError,
} from "../errors.js";
import {
  hashPassword,
  issueAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "../lib/portal-access.js";
import { presignDownload, presignView } from "../lib/storage.js";
import { recordActivity } from "./activity.js";
import {
  dispatch,
  notifyOwnerClientComment,
  notifyOwnerDocumentResponse,
  notifyOwnerClientResponse,
} from "./notifications.js";
import { touchProject } from "./projects.js";

// 24 випадкові байти = 192 біти: токен неможливо вгадати перебором.
const newToken = () => randomBytes(24).toString("base64url");

// Створює або оновлює посилання. Старе одразу перестає працювати, а термін і пароль
// беруться з тіла запиту (без них нове посилання безстрокове й без пароля).
export async function createShareLink(
  projectId: string,
  ownerId: string,
  settings: ShareSettingsInput = {},
) {
  assertFutureDate(settings.expiresAt);
  const passwordHash = settings.password
    ? await hashPassword(settings.password)
    : null;
  const shareToken = newToken();
  const [updated] = await db
    .update(projects)
    .set({
      shareToken,
      shareExpiresAt: settings.expiresAt ?? null,
      sharePasswordHash: passwordHash,
    })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .returning({
      shareToken: projects.shareToken,
      shareExpiresAt: projects.shareExpiresAt,
    });
  if (!updated) throw new NotFoundError("Проєкт не знайдено");
  await recordActivity(db, {
    projectId,
    type: "share_link_created",
    actor: { type: "owner", id: ownerId },
  });
  return { ...updated, sharePasswordSet: !!passwordHash };
}

function assertFutureDate(date: Date | null | undefined) {
  if (date && date.getTime() <= Date.now()) {
    throw new BadRequestError("Термін дії посилання має бути в майбутньому");
  }
}

// Змінює термін і пароль чинного посилання, не міняючи сам токен.
export async function updateShareSettings(
  projectId: string,
  ownerId: string,
  input: ShareSettingsInput,
) {
  assertFutureDate(input.expiresAt);
  const [current] = await db
    .select({ shareToken: projects.shareToken })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
  if (!current) throw new NotFoundError("Проєкт не знайдено");
  if (!current.shareToken) {
    throw new BadRequestError("Спершу створіть посилання для клієнта");
  }

  const set: Partial<typeof projects.$inferInsert> = {};
  if (input.expiresAt !== undefined) set.shareExpiresAt = input.expiresAt;
  if (input.password !== undefined) {
    set.sharePasswordHash = input.password
      ? await hashPassword(input.password)
      : null;
  }
  if (Object.keys(set).length === 0) {
    throw new BadRequestError("Потрібно передати хоча б одне поле");
  }

  const [updated] = await db
    .update(projects)
    .set(set)
    .where(eq(projects.id, projectId))
    .returning({
      shareExpiresAt: projects.shareExpiresAt,
      sharePasswordHash: projects.sharePasswordHash,
    });
  await recordActivity(db, {
    projectId,
    type: "share_settings_changed",
    actor: { type: "owner", id: ownerId },
    data: {
      expiresAt: updated.shareExpiresAt?.toISOString() ?? null,
      passwordSet: !!updated.sharePasswordHash,
    },
  });
  return {
    shareExpiresAt: updated.shareExpiresAt,
    sharePasswordSet: !!updated.sharePasswordHash,
  };
}

export async function revokeShareLink(projectId: string, ownerId: string) {
  const [updated] = await db
    .update(projects)
    .set({ shareToken: null, shareExpiresAt: null, sharePasswordHash: null })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });
  if (!updated) throw new NotFoundError("Проєкт не знайдено");
  await recordActivity(db, {
    projectId,
    type: "share_link_revoked",
    actor: { type: "owner", id: ownerId },
  });
}

// Недійсний, відкликаний і архівний токен дають однакову відповідь: клієнт не бачить різниці.
// Прострочене посилання відповідає 410, щоб клієнт знав, що варто попросити нове.
async function loadProject(token: string) {
  const [row] = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      status: projects.status,
      deadline: projects.deadline,
      updatedAt: projects.updatedAt,
      shareExpiresAt: projects.shareExpiresAt,
      sharePasswordHash: projects.sharePasswordHash,
      ownerName: user.name,
      brandName: user.brandName,
      brandColor: user.brandColor,
      brandLogoKey: user.brandLogoKey,
    })
    .from(projects)
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(and(eq(projects.shareToken, token), ne(projects.status, "archived")));
  if (!row) throw new NotFoundError("Посилання недійсне");
  if (row.shareExpiresAt && row.shareExpiresAt.getTime() <= Date.now()) {
    throw new GoneError();
  }
  return row;
}

// Усі маршрути порталу, крім unlock, проходять через цю перевірку пароля.
async function projectByToken(token: string, access?: string) {
  const row = await loadProject(token);
  if (
    row.sharePasswordHash &&
    !verifyAccessToken(access, row.id, row.sharePasswordHash)
  ) {
    throw new PortalPasswordRequiredError();
  }
  return row;
}

// Клієнт вводить пароль і отримує токен доступу, який далі надсилає в заголовку.
export async function unlockPortal(token: string, password: string) {
  const row = await loadProject(token);
  if (!row.sharePasswordHash) return { accessToken: null };
  if (!(await verifyPassword(password, row.sharePasswordHash))) {
    throw new WrongPasswordError();
  }
  return { accessToken: issueAccessToken(row.id, row.sharePasswordHash) };
}

// Відповісти можна на завершений етап (прийняти або попросити правки) і на етап, де від клієнта щось потрібно.
const canRespond = (m: { status: string; clientAction: string | null }) =>
  m.status === "done" || !!m.clientAction;

// Лише те, що можна бачити клієнту: без id власника, email і службових полів.
export async function getPortal(token: string, access?: string) {
  const p = await projectByToken(token, access);

  const ms = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      status: milestones.status,
      dueDate: milestones.dueDate,
      clientAction: milestones.clientAction,
      completedAt: milestones.completedAt,
      clientResponse: milestones.clientResponse,
      clientResponseNote: milestones.clientResponseNote,
      clientRespondedAt: milestones.clientRespondedAt,
    })
    .from(milestones)
    .where(eq(milestones.projectId, p.id))
    .orderBy(asc(milestones.position), asc(milestones.createdAt));

  const thread = await db
    .select({
      id: comments.id,
      body: comments.body,
      authorType: comments.authorType,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(eq(comments.projectId, p.id))
    .orderBy(asc(comments.createdAt));

  const docs = await db
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      signerName: documents.signerName,
      note: documents.note,
      respondedAt: documents.respondedAt,
      createdAt: documents.createdAt,
      fileName: files.name,
      sizeBytes: files.sizeBytes,
    })
    .from(documents)
    .innerJoin(files, eq(files.id, documents.fileId))
    .where(eq(documents.projectId, p.id))
    .orderBy(asc(documents.createdAt));

  const done = ms.filter((m) => m.status === "done").length;
  const upcoming = ms
    .filter((m) => m.status !== "done" && m.dueDate)
    .map((m) => m.dueDate as Date)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    title: p.title,
    description: p.description,
    status: p.status,
    deadline: p.deadline,
    updatedAt: p.updatedAt,
    expiresAt: p.shareExpiresAt,
    owner: {
      name: p.brandName?.trim() || p.ownerName,
      color: p.brandColor,
      logoUrl: p.brandLogoKey ? await presignView(p.brandLogoKey) : null,
    },
    milestones: ms.map((m) => ({ ...m, canRespond: canRespond(m) })),
    milestonesDone: done,
    progress: ms.length === 0 ? 0 : done / ms.length,
    nextDate: upcoming[0] ?? null,
    comments: thread,
    documents: docs,
  };
}

export async function createClientComment(
  token: string,
  input: CreatePortalCommentInput,
  access?: string,
) {
  const p = await projectByToken(token, access);
  const created = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(comments)
      .values({
        projectId: p.id,
        body: input.body,
        authorType: "client",
        authorId: null,
      })
      .returning({
        id: comments.id,
        body: comments.body,
        authorType: comments.authorType,
        createdAt: comments.createdAt,
      });
    await touchProject(tx, p.id);
    await recordActivity(tx, {
      projectId: p.id,
      type: "comment_added",
      actor: { type: "client" },
      data: { preview: created.body.slice(0, 120) },
    });
    return created;
  });
  await dispatch(() => notifyOwnerClientComment(p.id, created.body));
  return created;
}

// Клієнт приймає етап або просить правки. Правки до завершеного етапу повертають його в роботу.
export async function respondToMilestone(
  token: string,
  milestoneId: string,
  input: PortalMilestoneResponseInput,
  access?: string,
) {
  const p = await projectByToken(token, access);
  const note = input.note?.trim() || null;

  const result = await db.transaction(async (tx) => {
    const [m] = await tx
      .select({
        id: milestones.id,
        title: milestones.title,
        status: milestones.status,
        clientAction: milestones.clientAction,
      })
      .from(milestones)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, p.id)))
      .for("update");
    if (!m) throw new NotFoundError("Етап не знайдено");
    if (!canRespond(m)) {
      throw new BadRequestError("На цей етап поки не потрібна відповідь");
    }

    const reopen = input.response === "changes_requested" && m.status === "done";
    const [updated] = await tx
      .update(milestones)
      .set({
        clientResponse: input.response,
        clientResponseNote: input.response === "changes_requested" ? note : null,
        clientRespondedAt: new Date(),
        ...(reopen && { status: "in_progress" as const, completedAt: null }),
      })
      .where(eq(milestones.id, m.id))
      .returning({
        id: milestones.id,
        clientResponse: milestones.clientResponse,
        clientResponseNote: milestones.clientResponseNote,
        clientRespondedAt: milestones.clientRespondedAt,
        status: milestones.status,
      });

    // Опис правок видно і в загальній стрічці коментарів.
    if (input.response === "changes_requested" && note) {
      await tx.insert(comments).values({
        projectId: p.id,
        milestoneId: m.id,
        body: `Правки до етапу «${m.title}»: ${note}`,
        authorType: "client",
        authorId: null,
      });
    }
    await touchProject(tx, p.id);
    await recordActivity(tx, {
      projectId: p.id,
      type: "milestone_client_response",
      actor: { type: "client" },
      milestoneId: m.id,
      data: {
        title: m.title,
        response: input.response,
        note,
        reopened: reopen,
      },
    });
    return updated;
  });

  await dispatch(() =>
    notifyOwnerClientResponse(milestoneId, input.response, note),
  );
  return result;
}

async function documentOfProject(projectId: string, documentId: string) {
  const [doc] = await db
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      storageKey: files.storageKey,
      fileName: files.name,
    })
    .from(documents)
    .innerJoin(files, eq(files.id, documents.fileId))
    .where(and(eq(documents.id, documentId), eq(documents.projectId, projectId)));
  if (!doc) throw new NotFoundError("Документ не знайдено");
  return doc;
}

export async function getPortalDocumentDownload(
  token: string,
  documentId: string,
  access?: string,
) {
  const p = await projectByToken(token, access);
  const doc = await documentOfProject(p.id, documentId);
  return { url: await presignDownload(doc.storageKey, doc.fileName) };
}

// Клієнт погоджує документ іменем або просить правки. Погоджене остаточне: зміна лише через новий запит.
export async function respondToDocument(
  token: string,
  documentId: string,
  input: PortalDocumentResponseInput,
  meta: { ip: string },
  access?: string,
) {
  const p = await projectByToken(token, access);

  const result = await db.transaction(async (tx) => {
    const [doc] = await tx
      .select({
        id: documents.id,
        title: documents.title,
        status: documents.status,
      })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.projectId, p.id)))
      .for("update");
    if (!doc) throw new NotFoundError("Документ не знайдено");
    if (doc.status === "approved") {
      throw new BadRequestError("Документ уже погоджено");
    }

    const approved = input.response === "approved";
    const [updated] = await tx
      .update(documents)
      .set({
        status: input.response,
        signerName: approved ? input.signerName : null,
        signerIp: approved ? meta.ip : null,
        note: approved ? null : input.note,
        respondedAt: new Date(),
      })
      .where(eq(documents.id, doc.id))
      .returning({
        id: documents.id,
        status: documents.status,
        signerName: documents.signerName,
        note: documents.note,
        respondedAt: documents.respondedAt,
      });

    await touchProject(tx, p.id);
    await recordActivity(tx, {
      projectId: p.id,
      type: approved ? "document_signed" : "document_changes_requested",
      actor: { type: "client" },
      data: {
        title: doc.title,
        signerName: approved ? input.signerName : null,
        note: approved ? null : input.note,
      },
    });
    return { updated, title: doc.title };
  });

  await dispatch(() =>
    notifyOwnerDocumentResponse(
      p.id,
      result.title,
      input.response,
      input.response === "approved" ? input.signerName : input.note,
    ),
  );
  return result.updated;
}
