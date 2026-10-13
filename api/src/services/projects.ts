import type { CreateProjectInput } from "@statusdev/shared";
import { and, count, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients, projects, user } from "../db/schema.js";
import { NotFoundError, PlanLimitError } from "../errors.js";

const FREE_ACTIVE_PROJECTS_LIMIT = 2;

// Чужий проєкт неможливо відрізнити від неіснуючого: завжди 404, не 403.
export async function getProjectForOwner(projectId: string, ownerId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
  if (!project) throw new NotFoundError("Проєкт не знайдено");
  return project;
}

export async function createProject(ownerId: string, input: CreateProjectInput) {
  return db.transaction(async (tx) => {
    // Блокуємо рядок власника, щоб два паралельні запити не обійшли ліміт.
    const [owner] = await tx
      .select({ plan: user.plan })
      .from(user)
      .where(eq(user.id, ownerId))
      .for("update");

    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.ownerId, ownerId)));
    if (!client) throw new NotFoundError("Клієнта не знайдено");

    const status = input.status ?? "active";
    if (status === "active" && (owner?.plan ?? "free") === "free") {
      const [{ active }] = await tx
        .select({ active: count() })
        .from(projects)
        .where(and(eq(projects.ownerId, ownerId), eq(projects.status, "active")));
      if (active >= FREE_ACTIVE_PROJECTS_LIMIT) {
        throw new PlanLimitError(
          `На тарифі Free можна мати не більше ${FREE_ACTIVE_PROJECTS_LIMIT} активних проєктів`,
        );
      }
    }

    const [created] = await tx
      .insert(projects)
      .values({ ...input, status, ownerId })
      .returning();
    return created;
  });
}
