import type {
  CreateMilestoneInput,
  CreateProjectInput,
  ProjectStatus,
  UpdateMilestoneInput,
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
import { BadRequestError, NotFoundError, PlanLimitError } from "../errors.js";
import { recordActivity } from "./activity.js";
import { PROJECT_TEMPLATES } from "./milestone-templates.js";
import { dispatch, notifyClientMilestoneStatus } from "./notifications.js";

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

// Будь-яка зміна етапів оновлює updated_at проєкту: за ним портал показує «оновлено N днів тому».
export async function touchProject(tx: Tx, projectId: string) {
  await tx
    .update(projects)
    .set({ updatedAt: sql`now()` })
    .where(eq(projects.id, projectId));
}

// Хеш пароля порталу ніколи не йде назовні, навіть власнику: лише прапорець, що пароль є.
export function toOwnerProject<T extends { sharePasswordHash: string | null }>(
  project: T,
) {
  const { sharePasswordHash, ...rest } = project;
  return { ...rest, sharePasswordSet: !!sharePasswordHash };
}

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

    const { template, ...fields } = input;
    const [created] = await tx
      .insert(projects)
      .values({ ...fields, status, ownerId })
      .returning();

    if (template) {
      await tx.insert(milestones).values(
        PROJECT_TEMPLATES[template].milestones.map((m, index) => ({
          projectId: created.id,
          title: m.title,
          clientAction: m.clientAction ?? null,
          position: index + 1,
        })),
      );
    }
    await recordActivity(tx, {
      projectId: created.id,
      type: "project_created",
      actor: { type: "owner", id: ownerId },
      data: { title: created.title, template: template ?? null },
    });
    return toOwnerProject(created);
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

  // Хеш пароля порталу не вибираємо взагалі: у список він не потрапить.
  const { sharePasswordHash, ...publicColumns } = getTableColumns(projects);
  void sharePasswordHash;
  const rows = await db
    .select({
      ...publicColumns,
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
    ...toOwnerProject(project),
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
    if (input.status && input.status !== current.status) {
      await recordActivity(tx, {
        projectId,
        type: "project_status_changed",
        actor: { type: "owner", id: ownerId },
        data: { from: current.status, to: input.status },
      });
    }
    return toOwnerProject(updated);
  });
}

export async function archiveProject(projectId: string, ownerId: string) {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: projects.status })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
      .for("update");
    if (!current) throw new NotFoundError("Проєкт не знайдено");

    await tx
      .update(projects)
      .set({ status: "archived" })
      .where(eq(projects.id, projectId));
    if (current.status !== "archived") {
      await recordActivity(tx, {
        projectId,
        type: "project_status_changed",
        actor: { type: "owner", id: ownerId },
        data: { from: current.status, to: "archived" },
      });
    }
  });
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
    await touchProject(tx, projectId);
    await recordActivity(tx, {
      projectId,
      type: "milestone_created",
      actor: { type: "owner", id: ownerId },
      milestoneId: created.id,
      data: { title: created.title },
    });
    return created;
  });
}

// Доступ до етапу йде через власника проєкту; чужий етап — 404, як і чужий проєкт.
export async function getMilestoneForOwner(
  milestoneId: string,
  ownerId: string,
) {
  const [row] = await db
    .select({ milestone: milestones })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(and(eq(milestones.id, milestoneId), eq(projects.ownerId, ownerId)));
  if (!row) throw new NotFoundError("Етап не знайдено");
  return row.milestone;
}

export async function updateMilestone(
  milestoneId: string,
  ownerId: string,
  input: UpdateMilestoneInput,
) {
  const { updated, previousStatus } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        status: milestones.status,
        dueDate: milestones.dueDate,
        clientAction: milestones.clientAction,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(and(eq(milestones.id, milestoneId), eq(projects.ownerId, ownerId)))
      .for("update", { of: milestones });
    if (!row) throw new NotFoundError("Етап не знайдено");

    const statusChanged = !!input.status && input.status !== row.status;
    const dueChanged =
      input.dueDate !== undefined &&
      (input.dueDate?.getTime() ?? null) !== (row.dueDate?.getTime() ?? null);
    const actionChanged =
      input.clientAction !== undefined &&
      (input.clientAction ?? null) !== row.clientAction;

    // completed_at ставимо при вході в done і чистимо при виході; done -> done не чіпає.
    let completedAt: Date | null | undefined;
    if (statusChanged) completedAt = input.status === "done" ? new Date() : null;

    const [updated] = await tx
      .update(milestones)
      .set({
        ...input,
        ...(completedAt !== undefined && { completedAt }),
        // Нова дата: нові нагадування.
        ...(dueChanged && { soonRemindedAt: null, overdueRemindedAt: null }),
        // Старе рішення клієнта стосувалось попереднього стану етапу.
        ...((statusChanged || actionChanged) && {
          clientResponse: null,
          clientResponseNote: null,
          clientRespondedAt: null,
        }),
      })
      .where(eq(milestones.id, milestoneId))
      .returning();
    await touchProject(tx, updated.projectId);

    const actor = { type: "owner", id: ownerId } as const;
    if (statusChanged) {
      await recordActivity(tx, {
        projectId: updated.projectId,
        type: "milestone_status_changed",
        actor,
        milestoneId,
        data: { title: updated.title, from: row.status, to: updated.status },
      });
    }
    if (dueChanged) {
      await recordActivity(tx, {
        projectId: updated.projectId,
        type: "milestone_due_changed",
        actor,
        milestoneId,
        data: {
          title: updated.title,
          from: row.dueDate?.toISOString() ?? null,
          to: updated.dueDate?.toISOString() ?? null,
        },
      });
    }
    return { updated, previousStatus: statusChanged ? row.status : null };
  });

  if (previousStatus) {
    await dispatch(() =>
      notifyClientMilestoneStatus(milestoneId, previousStatus, updated.status),
    );
  }
  return updated;
}

export async function reorderMilestones(
  projectId: string,
  ownerId: string,
  ids: string[],
) {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
      .for("update");
    if (!project) throw new NotFoundError("Проєкт не знайдено");

    const existing = await tx
      .select({ id: milestones.id })
      .from(milestones)
      .where(eq(milestones.projectId, projectId));

    // Список має містити всі етапи проєкту рівно по одному разу: без чужих, зайвих і дублів.
    const existingIds = new Set(existing.map((m) => m.id));
    const valid =
      ids.length === existingIds.size &&
      new Set(ids).size === ids.length &&
      ids.every((id) => existingIds.has(id));
    if (!valid) {
      throw new BadRequestError(
        "ids має містити всі етапи цього проєкту по одному разу",
      );
    }

    for (const [index, id] of ids.entries()) {
      await tx
        .update(milestones)
        .set({ position: index + 1 })
        .where(eq(milestones.id, id));
    }

    await touchProject(tx, projectId);

    return tx
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.position));
  });
}

export async function deleteMilestone(milestoneId: string, ownerId: string) {
  await db.transaction(async (tx) => {
    // Блокуємо проєкт, щоб перенумерація не змішалась із паралельним додаванням.
    const [row] = await tx
      .select({ projectId: milestones.projectId, title: milestones.title })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(and(eq(milestones.id, milestoneId), eq(projects.ownerId, ownerId)))
      .for("update", { of: projects });
    if (!row) throw new NotFoundError("Етап не знайдено");

    await tx.delete(milestones).where(eq(milestones.id, milestoneId));
    await touchProject(tx, row.projectId);
    await recordActivity(tx, {
      projectId: row.projectId,
      type: "milestone_deleted",
      actor: { type: "owner", id: ownerId },
      data: { title: row.title },
    });

    await tx.execute(sql`
      update ${milestones} m
      set position = r.rn
      from (
        select id, row_number() over (order by position, created_at) as rn
        from ${milestones}
        where project_id = ${row.projectId}
      ) r
      where m.id = r.id and m.position <> r.rn
    `);
  });
}
