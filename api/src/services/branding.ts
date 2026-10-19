import { randomUUID } from "node:crypto";
import { MAX_LOGO_SIZE_BYTES, type PresignLogoInput } from "@statusdev/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import { BadRequestError } from "../errors.js";
import {
  deleteObject,
  headObjectSize,
  presignUpload,
  presignView,
} from "../lib/storage.js";

const keyPrefix = (userId: string) => `brands/${userId}/`;

export async function createLogoUploadUrl(
  userId: string,
  input: PresignLogoInput,
) {
  const storageKey = `${keyPrefix(userId)}${randomUUID()}`;
  const uploadUrl = await presignUpload(
    storageKey,
    input.mimeType,
    input.sizeBytes,
  );
  return { uploadUrl, storageKey };
}

// Викликається після PUT у R2. Старий логотип видаляється, щоб сховище не росло.
export async function setLogo(userId: string, storageKey: string) {
  if (!storageKey.startsWith(keyPrefix(userId))) {
    throw new BadRequestError("Некоректний ключ файлу");
  }
  const size = await headObjectSize(storageKey);
  if (size === null) throw new BadRequestError("Файл не завантажено в сховище");
  if (size > MAX_LOGO_SIZE_BYTES) {
    await deleteObject(storageKey);
    throw new BadRequestError("Логотип завеликий");
  }

  const [before] = await db
    .select({ key: user.brandLogoKey })
    .from(user)
    .where(eq(user.id, userId));
  await db
    .update(user)
    .set({ brandLogoKey: storageKey })
    .where(eq(user.id, userId));
  if (before?.key && before.key !== storageKey) {
    await deleteObject(before.key).catch(() => {});
  }
  return { logoUrl: await presignView(storageKey) };
}

export async function removeLogo(userId: string) {
  const [before] = await db
    .select({ key: user.brandLogoKey })
    .from(user)
    .where(eq(user.id, userId));
  await db.update(user).set({ brandLogoKey: null }).where(eq(user.id, userId));
  if (before?.key) await deleteObject(before.key).catch(() => {});
}

export async function logoUrlFor(key: string | null | undefined) {
  return key ? presignView(key) : null;
}
