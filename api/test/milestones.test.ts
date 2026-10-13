import { describe, expect, it } from "vitest";
import {
  api,
  createUser,
  makeClient,
  makeMilestone,
  makeProject,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

interface MilestoneRow {
  id: string;
  title: string;
  position: number;
  status: string;
  completedAt: string | null;
}

describe("етапи", () => {
  const ctx = useTestApp();

  async function setup() {
    const a = api(ctx.app, await createUser(ctx.app));
    const projectId = await makeProject(a, await makeClient(a));
    const list = async () =>
      (await a.get(`/projects/${projectId}`)).json()
        .milestones as MilestoneRow[];
    return { a, projectId, list };
  }

  describe("порядок", () => {
    it("нові етапи додаються в кінець", async () => {
      const { a, projectId, list } = await setup();
      for (const t of ["one", "two", "three"]) {
        await makeMilestone(a, projectId, t);
      }
      expect((await list()).map((m) => [m.title, m.position])).toEqual([
        ["one", 1],
        ["two", 2],
        ["three", 3],
      ]);
    });

    it("PUT order зберігає новий порядок", async () => {
      const { a, projectId, list } = await setup();
      const m1 = await makeMilestone(a, projectId, "one");
      const m2 = await makeMilestone(a, projectId, "two");
      const m3 = await makeMilestone(a, projectId, "three");
      const res = await a.put(`/projects/${projectId}/milestones/order`, {
        ids: [m3.id, m1.id, m2.id],
      });
      expect(res.statusCode).toBe(200);
      expect((await list()).map((m) => m.title)).toEqual([
        "three",
        "one",
        "two",
      ]);
    });

    it("PUT order відхиляє зайвий, чужий, пропущений і дубльований id", async () => {
      const { a, projectId } = await setup();
      const m1 = await makeMilestone(a, projectId, "one");
      const m2 = await makeMilestone(a, projectId, "two");
      const stranger = api(ctx.app, await createUser(ctx.app));
      const foreign = await makeMilestone(
        stranger,
        await makeProject(stranger, await makeClient(stranger)),
      );
      const put = (ids: string[]) =>
        a.put(`/projects/${projectId}/milestones/order`, { ids });

      expect((await put([m1.id, m2.id, foreign.id])).statusCode).toBe(400);
      expect((await put([m1.id, foreign.id])).statusCode).toBe(400);
      expect((await put([m1.id])).statusCode).toBe(400);
      expect((await put([m1.id, m1.id])).statusCode).toBe(400);
    });

    it("після видалення позиції йдуть 1, 2, 3 без дірок", async () => {
      const { a, projectId, list } = await setup();
      const ms = [];
      for (const t of ["a", "b", "c", "d"]) {
        ms.push(await makeMilestone(a, projectId, t));
      }
      expect((await a.del(`/milestones/${ms[1].id}`)).statusCode).toBe(204);
      expect((await list()).map((m) => [m.title, m.position])).toEqual([
        ["a", 1],
        ["c", 2],
        ["d", 3],
      ]);
      await a.del(`/milestones/${ms[0].id}`);
      expect((await list()).map((m) => m.position)).toEqual([1, 2]);
    });
  });

  describe("completed_at", () => {
    it("ставиться при done, очищається при виході, не міняється при done -> done", async () => {
      const { a, projectId } = await setup();
      const { id } = await makeMilestone(a, projectId);
      const patch = async (body: object) =>
        (await a.patch(`/milestones/${id}`, body)).json();

      expect((await patch({ status: "in_progress" })).completedAt).toBeNull();

      const done = await patch({ status: "done" });
      expect(done.completedAt).not.toBeNull();

      await new Promise((r) => setTimeout(r, 20));
      const again = await patch({ status: "done", title: "renamed" });
      expect(again.completedAt).toBe(done.completedAt);

      expect((await patch({ status: "todo" })).completedAt).toBeNull();

      const redone = await patch({ status: "done" });
      expect(redone.completedAt).not.toBeNull();
      expect(redone.completedAt).not.toBe(done.completedAt);
    });

    it("зміна поля без статусу не чіпає completed_at", async () => {
      const { a, projectId } = await setup();
      const { id } = await makeMilestone(a, projectId);
      const done = (
        await a.patch(`/milestones/${id}`, { status: "done" })
      ).json();
      const renamed = (
        await a.patch(`/milestones/${id}`, { title: "x" })
      ).json();
      expect(renamed.completedAt).toBe(done.completedAt);
    });
  });

  it("зміни етапів оновлюють updated_at проєкту", async () => {
    const { a, projectId } = await setup();
    const before = (await a.get(`/projects/${projectId}`)).json().updatedAt;
    await new Promise((r) => setTimeout(r, 20));
    await makeMilestone(a, projectId);
    const after = (await a.get(`/projects/${projectId}`)).json().updatedAt;
    expect(new Date(after).getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    );
  });
});
