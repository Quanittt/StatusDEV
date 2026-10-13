import type { CreateCommentInput } from "@statusdev/shared";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { comments, milestones } from "../db/schema.js";
import { NotFoundError } from "../errors.js";
import { getProjectForOwner, touchProject } from "./projects.js";

// Від старих до нових, як у чаті. Тут і коментарі клієнта, і власника.
export async function listComments(projectId: string, ownerId: string) {
  await getProjectForOwner(projectId, ownerId);
  return db
    .select()
    .from(comments)
    .where(eq(comments.projectId, projectId))
    .orderBy(asc(comments.createdAt));
}

export async function createOwnerComment(
  projectId: string,
  ownerId: string,
  input: CreateCommentInput,
) {
  await getProjectForOwner(projectId, ownerId);

  return db.transaction(async (tx) => {
    if (input.milestoneId) {
      const [milestone] = await tx
        .select({ id: milestones.id })
        .from(milestones)
        .where(
          and(
            eq(milestones.id, input.milestoneId),
            eq(milestones.projectId, projectId),
          ),
        );
      if (!milestone) throw new NotFoundError("Етап не знайдено");
    }

    const [created] = await tx
      .insert(comments)
      .values({
        projectId,
        milestoneId: input.milestoneId ?? null,
        body: input.body,
        authorType: "owner",
        authorId: ownerId,
      })
      .returning();
    await touchProject(tx, projectId);
    return created;
  });
}
