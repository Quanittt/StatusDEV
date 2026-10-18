import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// Без цього обробника падіння бази (рестарт, Ctrl+C) валить весь процес API
// через необроблену подію 'error' на простоюючому з'єднанні.
pool.on("error", (err) => {
  console.error("Postgres: з'єднання в пулі обірвалось:", err.message);
});

export const db = drizzle(pool);
