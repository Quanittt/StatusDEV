import { describe, expect, it } from "vitest";
import {
  api,
  createUser,
  makeClient,
  makeMilestone,
  makeProject,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("портал клієнта", () => {
  const ctx = useTestApp();

  async function setup() {
    const a = api(ctx.app, await createUser(ctx.app, "alice"));
    const projectId = await makeProject(a, await makeClient(a), {
      title: "Сайт",
    });
    const share = async () =>
      (await a.post(`/projects/${projectId}/share`)).json()
        .shareToken as string;
    // Портал публічний: запити йдуть без cookie.
    const portal = (token: string) =>
      ctx.app.inject({ method: "GET", url: `/portal/${token}` });
    const comment = (token: string, body: unknown) =>
      ctx.app.inject({
        method: "POST",
        url: `/portal/${token}/comments`,
        payload: body as object,
      });
    return { a, projectId, share, portal, comment };
  }

  it("власник створює посилання, клієнт відкриває його без входу", async () => {
    const { share, portal } = await setup();
    const token = await share();
    expect(token.length).toBeGreaterThanOrEqual(20);

    const res = await portal(token);
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Сайт");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("портал не віддає службові дані власника", async () => {
    const { share, portal } = await setup();
    const body = (await portal(await share())).json();
    const text = JSON.stringify(body);
    expect(text).not.toContain("@test.com");
    expect(text).not.toContain("ownerId");
    expect(text).not.toContain("shareToken");
    expect(Object.keys(body.owner).sort()).toEqual(["color", "name"]);
  });

  it("повертає етапи, прогрес і найближчу дату", async () => {
    const { a, projectId, share, portal } = await setup();
    const m1 = await makeMilestone(a, projectId, "Бриф");
    const m2 = await makeMilestone(a, projectId, "Макети");
    await a.patch(`/milestones/${m1.id}`, { status: "done" });
    await a.patch(`/milestones/${m2.id}`, {
      dueDate: "2030-01-15T00:00:00.000Z",
      clientAction: "Затвердити макет",
    });

    const body = (await portal(await share())).json();
    expect(body.milestones.map((m: { title: string }) => m.title)).toEqual([
      "Бриф",
      "Макети",
    ]);
    expect(body.milestonesDone).toBe(1);
    expect(body.progress).toBe(0.5);
    expect(body.nextDate).toBe("2030-01-15T00:00:00.000Z");
    expect(body.milestones[1].clientAction).toBe("Затвердити макет");
  });

  it("недійсний токен: 404, і це не відрізнити від відкликаного", async () => {
    const { share, portal, a, projectId } = await setup();
    expect((await portal("x".repeat(32))).statusCode).toBe(404);
    // занадто короткий токен не доходить до бази
    expect((await portal("abc")).statusCode).toBe(400);

    const token = await share();
    expect((await a.del(`/projects/${projectId}/share`)).statusCode).toBe(204);
    const revoked = await portal(token);
    expect(revoked.statusCode).toBe(404);
    expect(revoked.json().error.message).toBe("Посилання недійсне");
  });

  it("нове посилання вимикає старе", async () => {
    const { share, portal } = await setup();
    const first = await share();
    const second = await share();
    expect(second).not.toBe(first);
    expect((await portal(first)).statusCode).toBe(404);
    expect((await portal(second)).statusCode).toBe(200);
  });

  it("архівний проєкт недоступний на порталі", async () => {
    const { share, portal, a, projectId } = await setup();
    const token = await share();
    await a.del(`/projects/${projectId}`);
    expect((await portal(token)).statusCode).toBe(404);
  });

  it("коментар клієнта: author_type client, видно власнику, проєкт оновлюється", async () => {
    const { a, projectId, share, comment } = await setup();
    const token = await share();
    const before = (await a.get(`/projects/${projectId}`)).json().updatedAt;
    await new Promise((r) => setTimeout(r, 15));

    const res = await comment(token, { body: "  Макет затверджую  " });
    expect(res.statusCode).toBe(201);
    expect(res.json().authorType).toBe("client");
    expect(res.json().body).toBe("Макет затверджую");

    const list = (await a.get(`/projects/${projectId}/comments`)).json();
    expect(list).toHaveLength(1);
    expect(list[0].authorType).toBe("client");
    expect(list[0].authorId).toBeNull();
    const after = (await a.get(`/projects/${projectId}`)).json().updatedAt;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it("коментар: порожній і надто довгий текст відхиляються, milestoneId ігнорується", async () => {
    const { share, comment, a, projectId } = await setup();
    const token = await share();
    expect((await comment(token, { body: "   " })).statusCode).toBe(400);
    expect((await comment(token, { body: "a".repeat(2001) })).statusCode).toBe(400);

    const ok = await comment(token, { body: "ok", milestoneId: "x" });
    expect(ok.statusCode).toBe(201);
    const [saved] = (await a.get(`/projects/${projectId}/comments`)).json();
    expect(saved.milestoneId).toBeNull();
  });

  it("коментар за відкликаним посиланням не зберігається", async () => {
    const { share, comment, a, projectId } = await setup();
    const token = await share();
    await a.del(`/projects/${projectId}/share`);
    expect((await comment(token, { body: "hi" })).statusCode).toBe(404);
    expect((await a.get(`/projects/${projectId}/comments`)).json()).toHaveLength(0);
  });

  it("чужий проєкт: створити чи вимкнути посилання не можна (404)", async () => {
    const { projectId } = await setup();
    const bob = api(ctx.app, await createUser(ctx.app, "bob"));
    expect((await bob.post(`/projects/${projectId}/share`)).statusCode).toBe(404);
    expect((await bob.del(`/projects/${projectId}/share`)).statusCode).toBe(404);
  });

  it("створювати посилання можна лише власнику з сесією", async () => {
    const { projectId } = await setup();
    const res = await ctx.app.inject({
      method: "POST",
      url: `/projects/${projectId}/share`,
    });
    expect(res.statusCode).toBe(401);
  });
});
