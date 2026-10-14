import { randomBytes } from "node:crypto";
import type { CreatePortalCommentInput } from "@statusdev/shared";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { comments, milestones, projects, user } from "../db/schema.js";
import { NotFoundError } from "../errors.js";
import { touchProject } from "./projects.js";

// 24 випадкові байти = 192 біти: токен неможливо вгадати перебором.
const newToken = () => randomBytes(24).toString("base64url");

// Створює або оновлює посилання. Старе одразу перестає працювати.
export async function createShareLink(projectId: string, ownerId: string) {
  const shareToken = newToken();
  const [updated] = await db
    .update(projects)
    .set({ shareToken })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .returning({ shareToken: projects.shareToken });
  if (!updated) throw new NotFoundError("Проєкт не знайдено");
  return updated;
}

export async function revokeShareLink(projectId: string, ownerId: string) {
  const [updated] = await db
    .update(projects)
    .set({ shareToken: null })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });
  if (!updated) throw new NotFoundError("Проєкт не знайдено");
}

// Недійсний, відкликаний і архівний токен дають однакову відповідь: клієнт не бачить різниці.
async function projectByToken(token: string) {
  const [row] = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      status: projects.status,
      deadline: projects.deadline,
      updatedAt: projects.updatedAt,
      ownerName: user.name,
      brandName: user.brandName,
      brandColor: user.brandColor,
    })
    .from(projects)
    .innerJoin(user, eq(user.id, projects.ownerId))
    .where(and(eq(projects.shareToken, token), ne(projects.status, "archived")));
  if (!row) throw new NotFoundError("Посилання недійсне");
  return row;
}

// Лише те, що можна бачити клієнту: без id власника, email і службових полів.
export async function getPortal(token: string) {
  const p = await projectByToken(token);

  const ms = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      status: milestones.status,
      dueDate: milestones.dueDate,
      clientAction: milestones.clientAction,
      completedAt: milestones.completedAt,
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
    owner: { name: p.brandName?.trim() || p.ownerName, color: p.brandColor },
    milestones: ms,
    milestonesDone: done,
    progress: ms.length === 0 ? 0 : done / ms.length,
    nextDate: upcoming[0] ?? null,
    comments: thread,
  };
}

export async function createClientComment(
  token: string,
  input: CreatePortalCommentInput,
) {
  const p = await projectByToken(token);
  return db.transaction(async (tx) => {
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
    return created;
  });
}
