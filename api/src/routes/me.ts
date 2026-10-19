import { UpdateProfileSchema } from "@statusdev/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { user } from "../db/schema.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.requireOwner }, async (req) => req.user);

  // Колір і назва бренду для порталу клієнта; null очищає поле.
  app.patch("/me", { preHandler: app.requireOwner }, async (req) => {
    const input = UpdateProfileSchema.parse(req.body);
    const [updated] = await db
      .update(user)
      .set(input)
      .where(eq(user.id, req.user!.id))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        brandName: user.brandName,
        brandColor: user.brandColor,
      });
    return updated;
  });
}
