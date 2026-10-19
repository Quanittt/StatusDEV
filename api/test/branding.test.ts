import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  presignUpload: vi.fn(async (key: string) => `https://r2.test/${key}?sig=1`),
  presignDownload: vi.fn(async (key: string) => `https://r2.test/${key}?dl=1`),
  presignView: vi.fn(async (key: string) => `https://r2.test/${key}?view=1`),
  headObjectSize: vi.fn<(key: string) => Promise<number | null>>(),
  deleteObject: vi.fn(async () => {}),
}));
vi.mock("../src/lib/storage.js", () => storage);

import { api, createUser, makeClient, makeProject } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("логотип бренду", () => {
  const ctx = useTestApp();

  beforeEach(() => {
    storage.headObjectSize.mockReset();
    storage.headObjectSize.mockResolvedValue(5000);
    storage.deleteObject.mockClear();
  });

  async function setup() {
    const user = await createUser(ctx.app, "alice");
    return { user, a: api(ctx.app, user) };
  }

  const presign = (a: ReturnType<typeof api>, body: object) =>
    a.post("/me/logo/presign", body);

  async function upload(a: ReturnType<typeof api>) {
    const { storageKey } = (
      await presign(a, { mimeType: "image/png", sizeBytes: 5000 })
    ).json();
    const res = await a.put("/me/logo", { storageKey });
    return { storageKey, res };
  }

  it("presign: ключ у папці користувача, підпис тільки для PNG/JPEG/WebP", async () => {
    const { user, a } = await setup();
    const ok = await presign(a, { mimeType: "image/png", sizeBytes: 5000 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().storageKey).toMatch(new RegExp(`^brands/${user.id}/`));
    expect(storage.presignUpload).toHaveBeenLastCalledWith(
      ok.json().storageKey,
      "image/png",
      5000,
    );

    expect((await presign(a, { mimeType: "image/svg+xml", sizeBytes: 5000 })).statusCode).toBe(400);
    expect((await presign(a, { mimeType: "application/pdf", sizeBytes: 5000 })).statusCode).toBe(400);
    expect((await presign(a, { mimeType: "image/png", sizeBytes: 2 * 1024 * 1024 })).statusCode).toBe(400);
  });

  it("після завантаження /me віддає посилання на логотип, а не ключ", async () => {
    const { a } = await setup();
    const { res, storageKey } = await upload(a);
    expect(res.statusCode).toBe(200);
    expect(res.json().logoUrl).toContain(storageKey);

    const me = (await a.get("/me")).json();
    expect(me.brandLogoUrl).toContain(storageKey);
    expect(me.brandLogoKey).toBeUndefined();
  });

  it("новий логотип видаляє старий з R2", async () => {
    const { a } = await setup();
    const first = await upload(a);
    const second = await upload(a);
    expect(storage.deleteObject).toHaveBeenCalledWith(first.storageKey);
    expect(second.res.statusCode).toBe(200);
  });

  it("чужий ключ, відсутній файл і завеликий файл відхиляються", async () => {
    const { a } = await setup();
    const bob = await createUser(ctx.app, "bob");
    const bobKey = (
      await presign(api(ctx.app, bob), { mimeType: "image/png", sizeBytes: 5000 })
    ).json().storageKey;
    expect((await a.put("/me/logo", { storageKey: bobKey })).statusCode).toBe(400);

    const { storageKey } = (
      await presign(a, { mimeType: "image/png", sizeBytes: 5000 })
    ).json();
    storage.headObjectSize.mockResolvedValueOnce(null);
    expect((await a.put("/me/logo", { storageKey })).statusCode).toBe(400);

    storage.headObjectSize.mockResolvedValueOnce(5 * 1024 * 1024);
    expect((await a.put("/me/logo", { storageKey })).statusCode).toBe(400);
    expect(storage.deleteObject).toHaveBeenCalledWith(storageKey);
  });

  it("логотип показується в порталі клієнта", async () => {
    const { a } = await setup();
    const { storageKey } = await upload(a);
    const projectId = await makeProject(a, await makeClient(a));
    const token = (await a.post(`/projects/${projectId}/share`)).json().shareToken;

    const portal = (
      await ctx.app.inject({ method: "GET", url: `/portal/${token}` })
    ).json();
    expect(portal.owner.logoUrl).toContain(storageKey);
    // ключ об'єкта назовні не йде
    expect(JSON.stringify(portal)).not.toContain("brandLogoKey");
  });

  it("видалення логотипу чистить поле й об'єкт", async () => {
    const { a } = await setup();
    const { storageKey } = await upload(a);
    expect((await a.del("/me/logo")).statusCode).toBe(204);
    expect(storage.deleteObject).toHaveBeenCalledWith(storageKey);
    expect((await a.get("/me")).json().brandLogoUrl).toBeNull();
  });

  it("без входу 401", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/me/logo/presign",
      payload: { mimeType: "image/png", sizeBytes: 5000 },
    });
    expect(res.statusCode).toBe(401);
  });
});
