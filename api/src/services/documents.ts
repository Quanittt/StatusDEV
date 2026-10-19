import type { CreateDocumentInput } from "@statusdev/shared";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { documents, files } from "../db/schema.js";
import { NotFoundError } from "../errors.js";
import { recordActivity } from "./activity.js";
import { dispatch, notifyClientDocumentRequested } from "./notifications.js";
import { getProjectForOwner, touchProject } from "./projects.js";

export async function listDocuments(projectId: string, ownerId: string) {
  await getProjectForOwner(projectId, ownerId);
  return db
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      signerName: documents.signerName,
      signerIp: documents.signerIp,
      note: documents.note,
      respondedAt: documents.respondedAt,
      createdAt: documents.createdAt,
      fileId: documents.fileId,
      fileName: files.name,
      sizeBytes: files.sizeBytes,
    })
    .from(documents)
    .innerJoin(files, eq(files.id, documents.fileId))
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.createdAt));
}

// Документом стає файл самого проєкту: його вже завантажено в R2 звичайним шляхом.
export async function createDocument(
  projectId: string,
  ownerId: string,
  input: CreateDocumentInput,
) {
  await getProjectForOwner(projectId, ownerId);
  const [file] = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, input.fileId), eq(files.projectId, projectId)));
  if (!file) throw new NotFoundError("Файл не знайдено");

  const created = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(documents)
      .values({
        projectId,
        fileId: file.id,
        title: input.title,
        createdBy: ownerId,
      })
      .returning();
    await touchProject(tx, projectId);
    await recordActivity(tx, {
      projectId,
      type: "document_requested",
      actor: { type: "owner", id: ownerId },
      data: { title: created.title },
    });
    return created;
  });
  await dispatch(() => notifyClientDocumentRequested(projectId, created.title));
  return created;
}

export async function deleteDocument(documentId: string, ownerId: string) {
  const [doc] = await db
    .select({
      id: documents.id,
      projectId: documents.projectId,
      title: documents.title,
    })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!doc) throw new NotFoundError("Документ не знайдено");
  // Чужий документ виглядає як неіснуючий.
  await getProjectForOwner(doc.projectId, ownerId).catch(() => {
    throw new NotFoundError("Документ не знайдено");
  });

  await db.transaction(async (tx) => {
    await tx.delete(documents).where(eq(documents.id, doc.id));
    await touchProject(tx, doc.projectId);
    await recordActivity(tx, {
      projectId: doc.projectId,
      type: "document_deleted",
      actor: { type: "owner", id: ownerId },
      data: { title: doc.title },
    });
  });
}
