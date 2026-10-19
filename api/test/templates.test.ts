import { describe, expect, it } from "vitest";
import { api, createUser, makeClient } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("шаблони проєктів", () => {
  const ctx = useTestApp();

  async function setup() {
    const a = api(ctx.app, await createUser(ctx.app));
    return { a, clientId: await makeClient(a) };
  }

  it("список шаблонів містить лендинг і мобільний застосунок", async () => {
    const { a } = await setup();
    const list = (await a.get("/project-templates")).json() as {
      id: string;
      label: string;
      milestones: { title: string }[];
    }[];
    const ids = list.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(["website", "landing", "mobile_app", "branding", "smm"]),
    );
    for (const t of list) {
      expect(t.label).toBeTruthy();
      expect(t.milestones.length).toBeGreaterThan(0);
    }
  });

  it("потрібен вхід", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/project-templates" });
    expect(res.statusCode).toBe(401);
  });

  it("проєкт із шаблону отримує етапи по порядку й дії для клієнта", async () => {
    const { a, clientId } = await setup();
    const res = await a.post("/projects", {
      clientId,
      title: "Додаток",
      template: "mobile_app",
    });
    expect(res.statusCode).toBe(201);

    const details = (await a.get(`/projects/${res.json().id}`)).json();
    expect(details.milestones.map((m: { position: number }) => m.position)).toEqual(
      [1, 2, 3, 4, 5, 6],
    );
    expect(details.milestones[0].title).toBe("Вимоги й user stories");
    expect(details.milestones[0].clientAction).toBeTruthy();
    // етап розробки робить виконавець, дії від клієнта там немає
    expect(details.milestones[3].clientAction).toBeNull();
  });

  it("невідомий шаблон відхиляється", async () => {
    const { a, clientId } = await setup();
    const res = await a.post("/projects", { clientId, title: "X", template: "nope" });
    expect(res.statusCode).toBe(400);
  });
});
