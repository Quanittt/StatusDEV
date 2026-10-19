import { randomUUID } from "node:crypto";
import type { CreateFileInput, PresignFileInput } from "@statusdev/shared";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { documents, files, milestones } from "../db/schema.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import {
  deleteObject,
  headObjectSize,
  presignDownload,
  presignUpload,
} from "../lib/storage.js";
import { recordActivity } from "./activity.js";
import { getProjectForOwner } from "./projects.js";

const keyPrefix = (projectId: string) => `projects/${projectId}/`;

// У ключі лишається тільки безпечна частина імені; справжнє ім'я зберігається в files.name.
function safeName(name: string) {
  return name.replace(/[^\w.-]+/g, "_").slice(-100);
}

async function assertMilestoneInProject(
  projectId: string,
  milestoneId: string | null | undefined,
) {
  if (!milestoneId) return;
  const [milestone] = await db
    .select({ id: milestones.id })
    .from(milestones)
    .where(
      and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)),
    );
  if (!milestone) throw new NotFoundError("Етап не знайдено");
}

export async function createUploadUrl(
  projectId: string,
  ownerId: string,
  input: PresignFileInput,
) {
  await getProjectForOwner(projectId, ownerId);
  await assertMilestoneInProject(projectId, input.milestoneId);

  const storageKey = `${keyPrefix(projectId)}${randomUUID()}-${safeName(input.name)}`;
  const uploadUrl = await presignUpload(
    storageKey,
    input.mimeType,
    input.sizeBytes,
  );
  return { uploadUrl, storageKey };
}

// Викликається після того, як браузер завантажив файл у R2.
export async function registerFile(
  projectId: string,
  ownerId: string,
  input: CreateFileInput,
) {
  await getProjectForOwner(projectId, ownerId);
  await assertMilestoneInProject(projectId, input.milestoneId);

  if (!input.storageKey.startsWith(keyPrefix(projectId))) {
    throw new BadRequestError("Некоректний ключ файлу");
  }
  const size = await headObjectSize(input.storageKey);
  if (size === null) throw new BadRequestError("Файл не завантажено в сховище");
  if (size !== input.sizeBytes) {
    throw new BadRequestError("Розмір файлу не збігається");
  }

  const [created] = await db
    .insert(files)
    .values({
      projectId,
      milestoneId: input.milestoneId ?? null,
      uploadedBy: ownerId,
      name: input.name,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: size,
    })
    .returning();
  await recordActivity(db, {
    projectId,
    type: "file_added",
    actor: { type: "owner", id: ownerId },
    milestoneId: created.milestoneId,
    data: { name: created.name },
  });
  return created;
}

export async function listFiles(projectId: string, ownerId: string) {
  await getProjectForOwner(projectId, ownerId);
  return db
    .select()
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(desc(files.createdAt));
}

async function getFileForOwner(fileId: string, ownerId: string) {
  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) throw new NotFoundError("Файл не знайдено");
  // Чужий файл виглядає як неіснуючий.
  await getProjectForOwner(file.projectId, ownerId).catch(() => {
    throw new NotFoundError("Файл не знайдено");
  });
  return file;
}

export async function getDownloadUrl(fileId: string, ownerId: string) {
  const file = await getFileForOwner(fileId, ownerId);
  return { url: await presignDownload(file.storageKey, file.name) };
}

export async function deleteFile(fileId: string, ownerId: string) {
  const file = await getFileForOwner(fileId, ownerId);

  // Видалення файлу каскадом прибрало б документ разом із підписом клієнта, а об'єкт в R2 зник би.
  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.fileId, file.id));
  if (document) {
    throw new ConflictError(
      "Файл використовується в документі на погодження. Спершу скасуйте запит на погодження.",
    );
  }

  await db.delete(files).where(eq(files.id, file.id));
  await recordActivity(db, {
    projectId: file.projectId,
    type: "file_deleted",
    actor: { type: "owner", id: ownerId },
    data: { name: file.name },
  });
  await deleteObject(file.storageKey);
}
