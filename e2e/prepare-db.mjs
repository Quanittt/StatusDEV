// Створює порожню базу для E2E і накочує міграції. Запускається перед стартом API.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = new URL(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/statusdev_e2e",
);
const dbName = url.pathname.slice(1);
if (!dbName.endsWith("_e2e")) {
  throw new Error(`База для E2E має називатись *_e2e, а не "${dbName}"`);
}

const admin = new pg.Client({
  connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString(),
});
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${dbName}"`);
await admin.end();

const pool = new pg.Pool({ connectionString: url.toString() });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();
console.log(`E2E: база ${dbName} готова`);
