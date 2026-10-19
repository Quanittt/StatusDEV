import type { ActivityType } from "@statusdev/shared";
import { desc, eq, and, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { activityEvents, user } from "../db/schema.js";
import { getProjectForOwner } from "./projects.js";

// Працює і з транзакцією, і зі звичайним db: подія пишеться разом зі зміною, яку описує.
type Executor = Pick<typeof db, "insert">;

export interface ActivityInput {
  projectId: string;
  type: ActivityType;
  actor: { type: "owner"; id: string } | { type: "client" } | { type: "system" };
  milestoneId?: string | null;
  data?: Record<string, unknown>;
}

export async function recordActivity(tx: Executor, e: ActivityInput) {
  await tx.insert(activityEvents).values({
    projectId: e.projectId,
    milestoneId: e.milestoneId ?? null,
    actorType: e.actor.type,
    actorId: e.actor.type === "owner" ? e.actor.id : null,
    type: e.type,
    data: e.data ?? {},
  });
}

export async function listActivity(
  projectId: string,
  ownerId: string,
  { limit, before }: { limit: number; before?: Date },
) {
  await getProjectForOwner(projectId, ownerId);
  return db
    .select({
      id: activityEvents.id,
      type: activityEvents.type,
      actorType: activityEvents.actorType,
      actorName: user.name,
      milestoneId: activityEvents.milestoneId,
      data: activityEvents.data,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .leftJoin(user, eq(user.id, activityEvents.actorId))
    .where(
      and(
        eq(activityEvents.projectId, projectId),
        before ? lt(activityEvents.createdAt, before) : undefined,
      ),
    )
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);
}
