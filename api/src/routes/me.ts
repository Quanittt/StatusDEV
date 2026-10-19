import {
  PresignLogoSchema,
  SetLogoSchema,
  UpdateProfileSchema,
} from "@statusdev/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";
import {
  createLogoUploadUrl,
  logoUrlFor,
  removeLogo,
  setLogo,
} from "../services/branding.js";

const profileColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  plan: user.plan,
  brandName: user.brandName,
  brandColor: user.brandColor,
  brandLogoKey: user.brandLogoKey,
};

// Ключ об'єкта назовні не віддаємо: клієнту потрібна лише посилання для показу.
async function publicProfile(row: {
  brandLogoKey: string | null;
  [k: string]: unknown;
}) {
  const { brandLogoKey, ...rest } = row;
  return { ...rest, brandLogoUrl: await logoUrlFor(brandLogoKey) };
}

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.requireOwner }, async (req) => {
    const [row] = await db
      .select(profileColumns)
      .from(user)
      .where(eq(user.id, req.user!.id));
    return publicProfile(row);
  });

  // Колір і назва бренду для порталу клієнта; null очищає поле.
  app.patch("/me", { preHandler: app.requireOwner }, async (req) => {
    const input = UpdateProfileSchema.parse(req.body);
    const [updated] = await db
      .update(user)
      .set(input)
      .where(eq(user.id, req.user!.id))
      .returning(profileColumns);
    return publicProfile(updated);
  });

  // Логотип: як і файли проєкту, спершу адреса для PUT у R2, потім підтвердження.
  app.post("/me/logo/presign", { preHandler: app.requireOwner }, async (req) => {
    const input = PresignLogoSchema.parse(req.body);
    return createLogoUploadUrl(req.user!.id, input);
  });

  app.put("/me/logo", { preHandler: app.requireOwner }, async (req) => {
    const { storageKey } = SetLogoSchema.parse(req.body);
    return setLogo(req.user!.id, storageKey);
  });

  app.delete("/me/logo", { preHandler: app.requireOwner }, async (req, reply) => {
    await removeLogo(req.user!.id);
    return reply.status(204).send();
  });
}
