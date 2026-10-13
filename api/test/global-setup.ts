import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// Перед усіма тестами: створює порожню тестову базу і накочує міграції.
export default async function setup() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/statusdev_test",
  );
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Тестова база має називатись *_test, а не "${dbName}"`);
  }

  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), {
      pathname: "/postgres",
    }).toString(),
  });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Не вдалось підключитись до Postgres (${url.host}). Запусти \`docker compose up -d\`.`,
      { cause: err },
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
