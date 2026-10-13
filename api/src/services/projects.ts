import type { CreateProjectInput, ProjectStatus } from "@statusdev/shared";
import { and, asc, count, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients, milestones, projects, user } from "../db/schema.js";
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

export async function createProject(
  ownerId: string,
  input: CreateProjectInput,
) {
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
        .where(
          and(eq(projects.ownerId, ownerId), eq(projects.status, "active")),
        );
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

// Один запит: назва клієнта через join, прогрес рахується в самій базі.
export async function listProjectsForOwner(
  ownerId: string,
  status?: ProjectStatus,
) {
  const totalMilestones = count(milestones.id);
  const doneMilestones =
    sql<number>`count(${milestones.id}) filter (where ${milestones.status} = 'done')`.mapWith(
      Number,
    );

  const rows = await db
    .select({
      ...getTableColumns(projects),
      clientName: clients.name,
      milestonesTotal: totalMilestones,
      milestonesDone: doneMilestones,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(milestones, eq(milestones.projectId, projects.id))
    .where(
      and(
        eq(projects.ownerId, ownerId),
        status ? eq(projects.status, status) : undefined,
      ),
    )
    .groupBy(projects.id, clients.name)
    .orderBy(desc(projects.createdAt));

  return rows.map((r) => ({
    ...r,
    progress:
      r.milestonesTotal === 0 ? 0 : r.milestonesDone / r.milestonesTotal,
  }));
}

export async function getProjectDetailsForOwner(
  projectId: string,
  ownerId: string,
) {
  const project = await getProjectForOwner(projectId, ownerId);

  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, project.clientId));

  const projectMilestones = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, project.id))
    .orderBy(asc(milestones.position), asc(milestones.createdAt));

  return {
    ...project,
    clientName: client?.name ?? null,
    milestones: projectMilestones,
  };
}
