import { describe, expect, it } from "vitest";
import {
  api,
  createUser,
  makeClient,
  makeMilestone,
  makeProject,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

interface Event {
  type: string;
  actorType: string;
  actorName: string | null;
  data: Record<string, unknown>;
}

describe("стрічка активності", () => {
  const ctx = useTestApp();

  async function setup() {
    const a = api(ctx.app, await createUser(ctx.app, "alice"));
    const projectId = await makeProject(a, await makeClient(a), {
      title: "Сайт",
    });
    const events = async (query = "") =>
      (await a.get(`/projects/${projectId}/activity${query}`)).json() as Event[];
    // від старих до нових, так читати історію зручніше
    const types = async () => (await events()).map((e) => e.type).reverse();
    return { a, projectId, events, types };
  }

  it("записує ключові дії власника, новіші зверху", async () => {
    const { a, projectId, events, types } = await setup();
    const m = await makeMilestone(a, projectId, "Макети");
    await a.patch(`/milestones/${m.id}`, { status: "in_progress" });
    await a.patch(`/milestones/${m.id}`, { dueDate: "2030-01-15T00:00:00.000Z" });
    await a.post(`/projects/${projectId}/comments`, { body: "Привіт" });
    await a.post(`/projects/${projectId}/share`);
    await a.del(`/projects/${projectId}/share`);
    await a.patch(`/projects/${projectId}`, { status: "paused" });
    await a.del(`/milestones/${m.id}`);

    expect(await types()).toEqual([
      "project_created",
      "milestone_created",
      "milestone_status_changed",
      "milestone_due_changed",
      "comment_added",
      "share_link_created",
      "share_link_revoked",
      "project_status_changed",
      "milestone_deleted",
    ]);

    const [latest] = await events();
    expect(latest.type).toBe("milestone_deleted");
    expect(latest.data.title).toBe("Макети");
    expect(latest.actorType).toBe("owner");
    expect(latest.actorName).toMatch(/^alice/);
  });

  it("зберігає, що саме змінилось", async () => {
    const { a, projectId, events } = await setup();
    const m = await makeMilestone(a, projectId, "Макети");
    await a.patch(`/milestones/${m.id}`, { status: "done" });

    const status = (await events()).find(
      (e) => e.type === "milestone_status_changed",
    )!;
    expect(status.data).toMatchObject({
      title: "Макети",
      from: "todo",
      to: "done",
    });
  });

  it("повторне збереження без змін подій не створює", async () => {
    const { a, projectId, types } = await setup();
    const m = await makeMilestone(a, projectId);
    await a.patch(`/milestones/${m.id}`, { status: "done" });
    await a.patch(`/milestones/${m.id}`, { status: "done", title: "Нова" });
    await a.patch(`/projects/${projectId}`, { status: "active" });

    expect(
      (await types()).filter((t) => t === "milestone_status_changed"),
    ).toHaveLength(1);
    expect(await types()).not.toContain("project_status_changed");
  });

  it("події клієнта з порталу позначені як клієнт", async () => {
    const { a, projectId, events } = await setup();
    const token = (await a.post(`/projects/${projectId}/share`)).json()
      .shareToken;
    const m = await makeMilestone(a, projectId, "Макети");
    await a.patch(`/milestones/${m.id}`, { status: "done" });

    await ctx.app.inject({
      method: "POST",
      url: `/portal/${token}/comments`,
      payload: { body: "Дякую" },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/portal/${token}/milestones/${m.id}/response`,
      payload: { response: "approved" },
    });

    const fromClient = (await events()).filter((e) => e.actorType === "client");
    expect(fromClient.map((e) => e.type).sort()).toEqual([
      "comment_added",
      "milestone_client_response",
    ]);
    expect(fromClient.every((e) => e.actorName === null)).toBe(true);
  });

  it("ліміт і пагінація за before", async () => {
    const { a, projectId, events } = await setup();
    for (let i = 0; i < 4; i++) await makeMilestone(a, projectId, `E${i}`);

    const page = await events("?limit=2");
    expect(page).toHaveLength(2);

    const all = (await a.get(`/projects/${projectId}/activity`)).json();
    expect(all).toHaveLength(5);
    const rest = await events(
      `?before=${encodeURIComponent(all[1].createdAt)}`,
    );
    expect(rest.map((e) => e.data.title)).toEqual(
      all.slice(2).map((e: Event) => e.data.title),
    );

    expect((await a.get(`/projects/${projectId}/activity?limit=0`)).statusCode).toBe(400);
    expect((await a.get(`/projects/${projectId}/activity?limit=101`)).statusCode).toBe(400);
  });

  it("історію видалених етапів видно, а чужу історію — ні (404)", async () => {
    const { a, projectId, events } = await setup();
    const m = await makeMilestone(a, projectId, "Старий");
    await a.del(`/milestones/${m.id}`);
    expect((await events()).some((e) => e.data.title === "Старий")).toBe(true);

    const bob = api(ctx.app, await createUser(ctx.app, "bob"));
    expect((await bob.get(`/projects/${projectId}/activity`)).statusCode).toBe(404);
  });
});
