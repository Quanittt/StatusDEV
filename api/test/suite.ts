import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { pool } from "../src/db/client.js";
import { createTestApp, resetDb } from "./helpers.js";

// Спільний каркас файлу з тестами: app піднімається раз, база чиститься перед кожним тестом.
export function useTestApp() {
  const ctx = {} as { app: FastifyInstance };
  beforeAll(async () => {
    ctx.app = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
    await pool.end();
  });
  beforeEach(resetDb);
  return ctx;
}
