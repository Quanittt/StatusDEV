import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client.js";
import * as schema from "./db/schema.js";
import { env } from "./env.js";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: `http://localhost:${env.PORT}`,
  trustedOrigins: [env.WEB_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      plan: { type: "string", required: false, defaultValue: "free", input: false },
      brandName: { type: "string", required: false },
      brandColor: { type: "string", required: false },
    },
  },
});
