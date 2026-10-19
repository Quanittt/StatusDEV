import { describe, expect, it } from "vitest";
import {
  hashPassword,
  issueAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "../src/lib/portal-access.js";
import {
  api,
  createUser,
  makeClient,
  makeProject,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

const DAY = 24 * 60 * 60 * 1000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();

describe("пароль і токен доступу", () => {
  it("хеш перевіряється і не містить пароля", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).not.toContain("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("secret124", hash)).toBe(false);
    expect(await verifyPassword("x", "broken")).toBe(false);
    // сіль унікальна
    expect(await hashPassword("secret123")).not.toBe(hash);
  });

  it("токен доступу прив'язаний до проєкту, хеша й терміну", () => {
    const now = Date.now();
    const t = issueAccessToken("p1", "hash-a", now);
    expect(verifyAccessToken(t, "p1", "hash-a", now + 1000)).toBe(true);
    expect(verifyAccessToken(t, "p2", "hash-a", now + 1000)).toBe(false);
    // зміна пароля анулює токен
    expect(verifyAccessToken(t, "p1", "hash-b", now + 1000)).toBe(false);
    expect(verifyAccessToken(t, "p1", "hash-a", now + 13 * 60 * 60 * 1000)).toBe(false);
    expect(verifyAccessToken(undefined, "p1", "hash-a")).toBe(false);
    expect(verifyAccessToken("1.2.3", "p1", "hash-a")).toBe(false);
  });
});

describe("захист посилання на портал", () => {
  const ctx = useTestApp();

  async function setup() {
    const a = api(ctx.app, await createUser(ctx.app, "alice"));
    const projectId = await makeProject(a, await makeClient(a), { title: "Сайт" });
    const create = async (body?: object) =>
      (await a.post(`/projects/${projectId}/share`, body)).json();
    const portal = (token: string, access?: string) =>
      ctx.app.inject({
        method: "GET",
        url: `/portal/${token}`,
        headers: access ? { "x-portal-access": access } : {},
      });
    const unlock = (token: string, password: string) =>
      ctx.app.inject({
        method: "POST",
        url: `/portal/${token}/unlock`,
        payload: { password },
      });
    return { a, projectId, create, portal, unlock };
  }

  it("з паролем портал закритий, поки клієнт не розблокує його", async () => {
    const { create, portal, unlock } = await setup();
    const link = await create({ password: "secret123" });
    expect(link.sharePasswordSet).toBe(true);

    const locked = await portal(link.shareToken);
    expect(locked.statusCode).toBe(401);
    expect(locked.json().error.code).toBe("PORTAL_PASSWORD_REQUIRED");
    expect(JSON.stringify(locked.json())).not.toContain("Сайт");

    const wrong = await unlock(link.shareToken, "nope");
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe("WRONG_PASSWORD");

    const ok = await unlock(link.shareToken, "secret123");
    expect(ok.statusCode).toBe(200);
    const { accessToken } = ok.json();
    expect(accessToken).toBeTruthy();

    const open = await portal(link.shareToken, accessToken);
    expect(open.statusCode).toBe(200);
    expect(open.json().title).toBe("Сайт");
  });

  it("коментарі й відповіді теж вимагають розблокування", async () => {
    const { create, unlock } = await setup();
    const link = await create({ password: "secret123" });
    const send = (access?: string) =>
      ctx.app.inject({
        method: "POST",
        url: `/portal/${link.shareToken}/comments`,
        headers: access ? { "x-portal-access": access } : {},
        payload: { body: "Привіт" },
      });

    expect((await send()).statusCode).toBe(401);
    const { accessToken } = (await unlock(link.shareToken, "secret123")).json();
    expect((await send(accessToken)).statusCode).toBe(201);
  });

  it("токен від одного проєкту не відкриває інший", async () => {
    const one = await setup();
    const two = await setup();
    const l1 = await one.create({ password: "secret123" });
    const l2 = await two.create({ password: "secret123" });
    const { accessToken } = (await one.unlock(l1.shareToken, "secret123")).json();
    expect((await two.portal(l2.shareToken, accessToken)).statusCode).toBe(401);
  });

  it("зміна пароля анулює видані токени", async () => {
    const { a, projectId, create, portal, unlock } = await setup();
    const link = await create({ password: "secret123" });
    const { accessToken } = (await unlock(link.shareToken, "secret123")).json();

    const res = await a.patch(`/projects/${projectId}/share`, {
      password: "another456",
    });
    expect(res.statusCode).toBe(200);
    expect((await portal(link.shareToken, accessToken)).statusCode).toBe(401);
  });

  it("пароль можна зняти, тоді портал знову відкритий", async () => {
    const { a, projectId, create, portal } = await setup();
    const link = await create({ password: "secret123" });
    await a.patch(`/projects/${projectId}/share`, { password: null });
    expect((await portal(link.shareToken)).statusCode).toBe(200);
  });

  it("термін дії: після закінчення 410, а власник може продовжити", async () => {
    const { a, projectId, create, portal } = await setup();
    const link = await create({ expiresAt: inDays(1) });
    expect((await portal(link.shareToken)).statusCode).toBe(200);
    expect((await portal(link.shareToken)).json().expiresAt).not.toBeNull();

    // імітуємо закінчення терміну прямо в базі
    const { db } = await import("../src/db/client.js");
    const { projects } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    await db
      .update(projects)
      .set({ shareExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(projects.id, projectId));

    const gone = await portal(link.shareToken);
    expect(gone.statusCode).toBe(410);
    expect(gone.json().error.code).toBe("LINK_EXPIRED");

    await a.patch(`/projects/${projectId}/share`, { expiresAt: inDays(7) });
    expect((await portal(link.shareToken)).statusCode).toBe(200);
  });

  it("термін у минулому і короткий пароль відхиляються", async () => {
    const { a, projectId, create } = await setup();
    const past = await a.post(`/projects/${projectId}/share`, {
      expiresAt: inDays(-1),
    });
    expect(past.statusCode).toBe(400);
    expect(
      (await a.post(`/projects/${projectId}/share`, { password: "123" })).statusCode,
    ).toBe(400);

    await create();
    expect(
      (await a.patch(`/projects/${projectId}/share`, { password: "123" })).statusCode,
    ).toBe(400);
    expect((await a.patch(`/projects/${projectId}/share`, {})).statusCode).toBe(400);
  });

  it("налаштування без посилання не зберігаються", async () => {
    const { a, projectId } = await setup();
    const res = await a.patch(`/projects/${projectId}/share`, {
      password: "secret123",
    });
    expect(res.statusCode).toBe(400);
  });

  it("власник бачить прапорець пароля, але не хеш", async () => {
    const { a, projectId, create } = await setup();
    await create({ password: "secret123", expiresAt: inDays(3) });

    const details = (await a.get(`/projects/${projectId}`)).json();
    expect(details.sharePasswordSet).toBe(true);
    expect(details.shareExpiresAt).not.toBeNull();
    expect(JSON.stringify(details)).not.toContain("scrypt");

    const list = JSON.stringify((await a.get("/projects")).json());
    expect(list).not.toContain("scrypt");
    expect(list).not.toContain("sharePasswordHash");
  });

  it("відкликання посилання очищає пароль і термін", async () => {
    const { a, projectId, create } = await setup();
    await create({ password: "secret123", expiresAt: inDays(3) });
    await a.del(`/projects/${projectId}/share`);
    const details = (await a.get(`/projects/${projectId}`)).json();
    expect(details.sharePasswordSet).toBe(false);
    expect(details.shareExpiresAt).toBeNull();
  });

  it("ліміт спроб пароля: 11-та отримує 429", async () => {
    const { create, unlock } = await setup();
    const link = await create({ password: "secret123" });
    let last = await unlock(link.shareToken, "bad");
    for (let i = 2; i <= 10; i++) last = await unlock(link.shareToken, `bad${i}`);
    expect(last.statusCode).toBe(401);
    expect((await unlock(link.shareToken, "secret123")).statusCode).toBe(429);
  });
});
