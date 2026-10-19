import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Міграції йдуть від окремої ролі, яка може міняти структуру; застосунок (DATABASE_URL) не може.
  dbCredentials: {
    url: (process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL)!,
  },
});
