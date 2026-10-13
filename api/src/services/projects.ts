import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects } from "../db/schema.js";
import { NotFoundError } from "../errors.js";

// Чужий проєкт неможливо відрізнити від неіснуючого: завжди 404, не 403.
export async function getProjectForOwner(projectId: string, ownerId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));
  if (!project) throw new NotFoundError("Проєкт не знайдено");
  return project;
}
