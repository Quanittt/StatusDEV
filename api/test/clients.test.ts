import { describe, expect, it } from "vitest";
import { api, createUser, makeClient, makeProject } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("клієнти", () => {
  const ctx = useTestApp();

  it("клієнта з проєктами видалити не можна: 409", async () => {
    const a = api(ctx.app, await createUser(ctx.app));
    const clientId = await makeClient(a);
    await makeProject(a, clientId);

    const res = await a.del(`/clients/${clientId}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
    expect((await a.get("/clients")).json()).toHaveLength(1);
  });

  it("архівний проєкт теж блокує видалення клієнта", async () => {
    const a = api(ctx.app, await createUser(ctx.app));
    const clientId = await makeClient(a);
    const projectId = await makeProject(a, clientId);
    await a.del(`/projects/${projectId}`);
    expect((await a.del(`/clients/${clientId}`)).statusCode).toBe(409);
  });

  it("клієнта без проєктів видалити можна", async () => {
    const a = api(ctx.app, await createUser(ctx.app));
    const clientId = await makeClient(a);
    expect((await a.del(`/clients/${clientId}`)).statusCode).toBe(204);
    expect((await a.get("/clients")).json()).toHaveLength(0);
  });
});
