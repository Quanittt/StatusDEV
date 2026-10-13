import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import { as, createTestApp, createUser, resetDb } from "./helpers.js";

describe("smoke", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  beforeEach(resetDb);

  it("GET /health відповідає і торкається бази", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: true });
  });

  it("без сесії /clients дає 401", async () => {
    const res = await app.inject({ method: "GET", url: "/clients" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("з cookie із createUser() запити йдуть від імені користувача", async () => {
    const user = await createUser(app);

    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: as(user),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().id).toBe(user.id);

    const created = await app.inject({
      method: "POST",
      url: "/clients",
      headers: as(user),
      payload: { name: "Acme" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().ownerId).toBe(user.id);
  });

  it("CORS дозволяє PATCH/PUT/DELETE з cookies для WEB_URL", async () => {
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/clients/x",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": method,
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:5173",
      );
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["access-control-allow-methods"]).toContain(method);
    }
  });
});
