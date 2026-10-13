import { describe, expect, it } from "vitest";
import {
  api,
  createUser,
  makeClient,
  makeMilestone,
  makeProject,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("ізоляція власників: чуже завжди 404, не 403", () => {
  const ctx = useTestApp();

  async function setup() {
    const a = api(ctx.app, await createUser(ctx.app, "alice"));
    const b = api(ctx.app, await createUser(ctx.app, "bob"));
    const clientId = await makeClient(a);
    const projectId = await makeProject(a, clientId);
    const milestone = await makeMilestone(a, projectId);
    return { a, b, clientId, projectId, milestoneId: milestone.id };
  }

  it("списки показують тільки свої дані", async () => {
    const { a, b } = await setup();
    expect((await a.get("/clients")).json()).toHaveLength(1);
    expect((await b.get("/clients")).json()).toHaveLength(0);
    expect((await a.get("/projects")).json()).toHaveLength(1);
    expect((await b.get("/projects")).json()).toHaveLength(0);
  });

  it("клієнти: PATCH і DELETE чужого дають 404", async () => {
    const { b, clientId } = await setup();
    expect(
      (await b.patch(`/clients/${clientId}`, { name: "x" })).statusCode,
    ).toBe(404);
    expect((await b.del(`/clients/${clientId}`)).statusCode).toBe(404);
  });

  it("проєкти: GET, PATCH, DELETE чужого дають 404", async () => {
    const { b, projectId } = await setup();
    expect((await b.get(`/projects/${projectId}`)).statusCode).toBe(404);
    expect(
      (await b.patch(`/projects/${projectId}`, { title: "x" })).statusCode,
    ).toBe(404);
    expect((await b.del(`/projects/${projectId}`)).statusCode).toBe(404);
  });

  it("не можна створити проєкт на чужого клієнта", async () => {
    const { b, clientId } = await setup();
    const res = await b.post("/projects", { clientId, title: "x" });
    expect(res.statusCode).toBe(404);
  });

  it("етапи і коментарі чужого проєкту недоступні", async () => {
    const { b, projectId, milestoneId } = await setup();
    const order = `/projects/${projectId}/milestones/order`;
    expect(
      (await b.post(`/projects/${projectId}/milestones`, { title: "x" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await b.patch(`/milestones/${milestoneId}`, { title: "x" })).statusCode,
    ).toBe(404);
    expect((await b.del(`/milestones/${milestoneId}`)).statusCode).toBe(404);
    expect((await b.put(order, { ids: [milestoneId] })).statusCode).toBe(404);
    expect((await b.get(`/projects/${projectId}/comments`)).statusCode).toBe(
      404,
    );
    expect(
      (await b.post(`/projects/${projectId}/comments`, { body: "x" }))
        .statusCode,
    ).toBe(404);
  });

  it("чужий етап не можна прикріпити до коментаря", async () => {
    const { a, b, projectId } = await setup();
    const bProject = await makeProject(b, await makeClient(b));
    const foreign = await makeMilestone(b, bProject);
    const res = await a.post(`/projects/${projectId}/comments`, {
      body: "x",
      milestoneId: foreign.id,
    });
    expect(res.statusCode).toBe(404);
  });
});
