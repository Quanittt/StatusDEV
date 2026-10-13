import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { user } from "../src/db/schema.js";
import { api, createUser, makeClient, makeProject } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("ліміт тарифу Free: 2 активні проєкти", () => {
  const ctx = useTestApp();

  async function setup() {
    const owner = await createUser(ctx.app);
    const a = api(ctx.app, owner);
    return { a, owner, clientId: await makeClient(a) };
  }

  it("третій активний проєкт дає 402 PLAN_LIMIT", async () => {
    const { a, clientId } = await setup();
    await makeProject(a, clientId);
    await makeProject(a, clientId);
    const res = await a.post("/projects", { clientId, title: "3" });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe("PLAN_LIMIT");
  });

  it("призупинені й архівні проєкти в ліміт не входять", async () => {
    const { a, clientId } = await setup();
    const p1 = await makeProject(a, clientId);
    await makeProject(a, clientId);
    expect((await a.del(`/projects/${p1}`)).statusCode).toBe(204);
    await makeProject(a, clientId);
    const paused = await a.post("/projects", {
      clientId,
      title: "p",
      status: "paused",
    });
    expect(paused.statusCode).toBe(201);
  });

  it("повернення в active теж перевіряє ліміт", async () => {
    const { a, clientId } = await setup();
    const paused = await makeProject(a, clientId, { status: "paused" });
    await makeProject(a, clientId);
    await makeProject(a, clientId);
    const res = await a.patch(`/projects/${paused}`, { status: "active" });
    expect(res.statusCode).toBe(402);
  });

  it("невдале створення з шаблоном не залишає етапів", async () => {
    const { a, clientId } = await setup();
    await makeProject(a, clientId);
    await makeProject(a, clientId);
    const res = await a.post("/projects", {
      clientId,
      title: "3",
      template: "website",
    });
    expect(res.statusCode).toBe(402);
    expect((await a.get("/projects")).json()).toHaveLength(2);
  });

  it("на тарифі pro ліміту немає", async () => {
    const { a, owner, clientId } = await setup();
    await db.update(user).set({ plan: "pro" }).where(eq(user.id, owner.id));
    for (let i = 0; i < 4; i++) await makeProject(a, clientId);
    expect((await a.get("/projects?status=active")).json()).toHaveLength(4);
  });

  it("паралельні запити не обходять ліміт", async () => {
    const { a, clientId } = await setup();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        a.post("/projects", { clientId, title: `p${i}` }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 201, 402, 402, 402]);
  });
});
