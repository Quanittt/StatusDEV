import { describe, expect, it } from "vitest";
import { canChat } from "../src/services/chat.js";
import { api, createUser, makeClient, makeProject } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("canChat", () => {
  it("дозволяє тільки owner↔pm і pm↔junior", () => {
    expect(canChat("owner", "pm")).toBe(true);
    expect(canChat("pm", "owner")).toBe(true);
    expect(canChat("pm", "junior")).toBe(true);
    expect(canChat("junior", "pm")).toBe(true);
    expect(canChat("owner", "junior")).toBe(false);
    expect(canChat("junior", "owner")).toBe(false);
    expect(canChat("owner", "owner")).toBe(false);
    expect(canChat("pm", "pm")).toBe(false);
    expect(canChat("junior", "junior")).toBe(false);
  });
});

describe("чат owner / pm / junior", () => {
  const ctx = useTestApp();

  async function setup() {
    const ownerU = await createUser(ctx.app, "owner");
    const pmU = await createUser(ctx.app, "pm");
    const juniorU = await createUser(ctx.app, "junior");
    const owner = api(ctx.app, ownerU);
    const pm = api(ctx.app, pmU);
    const junior = api(ctx.app, juniorU);
    const projectId = await makeProject(owner, await makeClient(owner));
    const add = (u: { email: string }, role: string) =>
      owner.post(`/projects/${projectId}/members`, { email: u.email, role });
    expect((await add(pmU, "pm")).statusCode).toBe(201);
    expect((await add(juniorU, "junior")).statusCode).toBe(201);
    const msg = (a: typeof owner, to: string, body = "привіт") =>
      a.post(`/projects/${projectId}/chat/${to}/messages`, { body });
    const read = (a: typeof owner, withUser: string, qs = "") =>
      a.get(`/projects/${projectId}/chat/${withUser}/messages${qs}`);
    return { owner, pm, junior, ownerU, pmU, juniorU, projectId, msg, read };
  }

  it("owner↔pm і pm↔junior листуються, повідомлення видно обом", async () => {
    const s = await setup();
    expect((await s.msg(s.owner, s.pmU.id, "від owner")).statusCode).toBe(201);
    expect((await s.msg(s.pm, s.ownerU.id, "від pm")).statusCode).toBe(201);
    expect((await s.msg(s.pm, s.juniorU.id, "pm джуну")).statusCode).toBe(201);
    expect((await s.msg(s.junior, s.pmU.id, "джун pm")).statusCode).toBe(201);

    const fromOwner = (await s.read(s.owner, s.pmU.id)).json();
    expect(fromOwner.map((m: { body: string }) => m.body)).toEqual([
      "від owner",
      "від pm",
    ]);
    const fromPm = (await s.read(s.pm, s.ownerU.id)).json();
    expect(fromPm).toHaveLength(2);
  });

  it("owner не може писати і читати джуна, і навпаки", async () => {
    const s = await setup();
    expect((await s.msg(s.owner, s.juniorU.id)).statusCode).toBe(403);
    expect((await s.msg(s.junior, s.ownerU.id)).statusCode).toBe(403);
    expect((await s.read(s.owner, s.juniorU.id)).statusCode).toBe(403);
    expect((await s.read(s.junior, s.ownerU.id)).statusCode).toBe(403);
  });

  it("owner не бачить переписку pm і джуна", async () => {
    const s = await setup();
    await s.msg(s.pm, s.juniorU.id, "таємниця");
    // Owner намагається прочитати «від імені» пари: його пара завжди з ним самим.
    expect((await s.read(s.owner, s.pmU.id)).json()).toEqual([]);
    expect((await s.read(s.owner, s.juniorU.id)).statusCode).toBe(403);
  });

  it("відправник береться з сесії, а не з тіла", async () => {
    const s = await setup();
    const res = await s.owner.post(
      `/projects/${s.projectId}/chat/${s.pmU.id}/messages`,
      { body: "x", senderId: s.juniorU.id, recipientId: s.juniorU.id },
    );
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      senderId: s.ownerU.id,
      recipientId: s.pmU.id,
    });
  });

  it("чужий користувач бачить 404, не 403", async () => {
    const s = await setup();
    const stranger = api(ctx.app, await createUser(ctx.app, "stranger"));
    expect((await s.msg(stranger, s.pmU.id)).statusCode).toBe(404);
    expect((await s.read(stranger, s.pmU.id)).statusCode).toBe(404);
    expect(
      (await stranger.get(`/projects/${s.projectId}/members`)).statusCode,
    ).toBe(404);
  });

  it("не можна писати собі та людині поза проєктом", async () => {
    const s = await setup();
    expect((await s.msg(s.owner, s.ownerU.id)).statusCode).toBe(400);
    const outsider = await createUser(ctx.app, "outsider");
    expect((await s.msg(s.owner, outsider.id)).statusCode).toBe(404);
  });

  it("видалений учасник одразу втрачає доступ", async () => {
    const s = await setup();
    await s.msg(s.pm, s.ownerU.id);
    const del = await s.owner.del(
      `/projects/${s.projectId}/members/${s.pmU.id}`,
    );
    expect(del.statusCode).toBe(204);
    expect((await s.msg(s.pm, s.ownerU.id)).statusCode).toBe(404);
    expect((await s.msg(s.owner, s.pmU.id)).statusCode).toBe(404);
  });

  it("лише owner керує командою", async () => {
    const s = await setup();
    const third = await createUser(ctx.app, "third");
    const body = { email: third.email, role: "junior" };
    expect(
      (await s.pm.post(`/projects/${s.projectId}/members`, body)).statusCode,
    ).toBe(403);
    expect(
      (
        await s.junior.del(`/projects/${s.projectId}/members/${s.pmU.id}`)
      ).statusCode,
    ).toBe(403);
    expect(
      (await s.junior.get(`/projects/${s.projectId}/members`)).statusCode,
    ).toBe(403);
    expect(
      (await s.pm.get(`/projects/${s.projectId}/members`)).statusCode,
    ).toBe(200);
  });

  it("додавання: дубль 409, невідомий email 404, owner 400, поганий role 400", async () => {
    const s = await setup();
    const url = `/projects/${s.projectId}/members`;
    expect(
      (await s.owner.post(url, { email: s.pmU.email, role: "pm" })).statusCode,
    ).toBe(409);
    expect(
      (await s.owner.post(url, { email: "no@one.com", role: "pm" })).statusCode,
    ).toBe(404);
    expect(
      (await s.owner.post(url, { email: s.ownerU.email, role: "pm" })).statusCode,
    ).toBe(400);
    expect(
      (await s.owner.post(url, { email: s.pmU.email, role: "owner" })).statusCode,
    ).toBe(400);
  });

  it("contacts показує тільки дозволених співрозмовників", async () => {
    const s = await setup();
    const names = async (a: typeof s.owner) =>
      (await a.get(`/projects/${s.projectId}/chat/contacts`))
        .json()
        .map((c: { role: string }) => c.role)
        .sort();
    expect(await names(s.owner)).toEqual(["pm"]);
    expect(await names(s.pm)).toEqual(["junior", "owner"]);
    expect(await names(s.junior)).toEqual(["pm"]);
  });

  it("after віддає лише новіші повідомлення; поле body обмежене", async () => {
    const s = await setup();
    const first = (await s.msg(s.owner, s.pmU.id, "1")).json();
    await s.msg(s.pm, s.ownerU.id, "2");
    await s.msg(s.owner, s.pmU.id, "3");
    const newer = (await s.read(s.owner, s.pmU.id, `?after=${first.id}`)).json();
    expect(newer.map((m: { body: string }) => m.body)).toEqual(["2", "3"]);

    expect((await s.msg(s.owner, s.pmU.id, "")).statusCode).toBe(400);
    expect((await s.msg(s.owner, s.pmU.id, "a".repeat(2001))).statusCode).toBe(
      400,
    );
  });

  it("chat/projects показує проєкти з моєю роллю", async () => {
    const s = await setup();
    const roles = async (a: typeof s.owner) =>
      (await a.get("/chat/projects")).json().map((p: { role: string }) => p.role);
    expect(await roles(s.owner)).toEqual(["owner"]);
    expect(await roles(s.pm)).toEqual(["pm"]);
    expect(await roles(s.junior)).toEqual(["junior"]);
  });

  it("без сесії 401", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/projects/00000000-0000-0000-0000-000000000000/chat/contacts",
    });
    expect(res.statusCode).toBe(401);
  });
});
