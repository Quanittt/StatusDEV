import type {
  CreateMilestoneInput,
  CreateProjectInput,
  ProjectStatus,
  UpdateProjectInput,
} from "@statusdev/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  max,
  sql,
} from "drizzle-orm";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Рахуються тільки активні проєкти: paused/done/archived у ліміт не входять.
async function assertActiveLimit(
  tx: Tx,
  ownerId: string,
  plan: string | null | undefined,
) {
  if ((plan ?? "free") !== "free") return;
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
    if (status === "active") await assertActiveLimit(tx, ownerId, owner?.plan);

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

export async function updateProject(
  projectId: string,
  ownerId: string,
  input: UpdateProjectInput,
) {
  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ plan: user.plan })
      .from(user)
      .where(eq(user.id, ownerId))
      .for("update");

    const [current] = await tx
      .select({ status: projects.status })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
    if (!current) throw new NotFoundError("Проєкт не знайдено");

    // Повернення в active займає місце в ліміті так само, як створення.
    if (input.status === "active" && current.status !== "active") {
      await assertActiveLimit(tx, ownerId, owner?.plan);
    }

    const [updated] = await tx
      .update(projects)
      .set(input)
      .where(eq(projects.id, projectId))
      .returning();
    return updated;
  });
}

export async function archiveProject(projectId: string, ownerId: string) {
  const [archived] = await db
    .update(projects)
    .set({ status: "archived" })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });
  if (!archived) throw new NotFoundError("Проєкт не знайдено");
}

export async function createMilestone(
  projectId: string,
  ownerId: string,
  input: CreateMilestoneInput,
) {
  return db.transaction(async (tx) => {
    // Блокуємо проєкт, щоб паралельні запити не отримали однакову position.
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
      .for("update");
    if (!project) throw new NotFoundError("Проєкт не знайдено");

    const [{ last }] = await tx
      .select({ last: max(milestones.position) })
      .from(milestones)
      .where(eq(milestones.projectId, projectId));

    const [created] = await tx
      .insert(milestones)
      .values({ ...input, projectId, position: (last ?? 0) + 1 })
      .returning();
    return created;
  });
}
