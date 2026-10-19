import { beforeEach, describe, expect, it, vi } from "vitest";

// R2 у тестах не чіпаємо: підміняємо шар storage.
const storage = vi.hoisted(() => ({
  presignUpload: vi.fn(async (key: string) => `https://r2.test/${key}?sig=1`),
  presignDownload: vi.fn(async (key: string) => `https://r2.test/${key}?dl=1`),
  headObjectSize: vi.fn<(key: string) => Promise<number | null>>(),
  deleteObject: vi.fn(async () => {}),
}));
vi.mock("../src/lib/storage.js", () => storage);

import {
  api,
  createUser,
  makeClient,
  makeMilestone,
  makeProject,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

const meta = { name: "brief.pdf", mimeType: "application/pdf", sizeBytes: 1234 };

describe("файли", () => {
  const ctx = useTestApp();

  beforeEach(() => {
    storage.headObjectSize.mockReset();
    storage.deleteObject.mockClear();
  });

  async function setup() {
    const a = api(ctx.app, await createUser(ctx.app));
    const projectId = await makeProject(a, await makeClient(a));
    return { a, projectId };
  }

  async function upload(a: ReturnType<typeof api>, projectId: string) {
    const presign = await a.post(`/projects/${projectId}/files/presign`, meta);
    const { storageKey } = presign.json();
    storage.headObjectSize.mockResolvedValue(meta.sizeBytes);
    return a.post(`/projects/${projectId}/files`, { ...meta, storageKey });
  }

  it("presign повертає URL і ключ у папці проєкту", async () => {
    const { a, projectId } = await setup();
    const res = await a.post(`/projects/${projectId}/files/presign`, meta);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.storageKey.startsWith(`projects/${projectId}/`)).toBe(true);
    expect(body.uploadUrl).toContain(body.storageKey);
  });

  it("presign відхиляє завеликий файл", async () => {
    const { a, projectId } = await setup();
    const res = await a.post(`/projects/${projectId}/files/presign`, {
      ...meta,
      sizeBytes: 26 * 1024 * 1024,
    });
    expect(res.statusCode).toBe(400);
  });

  it("повний цикл: presign → запис → список → завантаження → видалення", async () => {
    const { a, projectId } = await setup();
    const created = await upload(a, projectId);
    expect(created.statusCode).toBe(201);
    const file = created.json();
    expect(file.name).toBe("brief.pdf");

    const list = (await a.get(`/projects/${projectId}/files`)).json();
    expect(list.map((f: { id: string }) => f.id)).toEqual([file.id]);

    const dl = await a.get(`/files/${file.id}/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.json().url).toContain(file.storageKey);

    expect((await a.del(`/files/${file.id}`)).statusCode).toBe(204);
    expect(storage.deleteObject).toHaveBeenCalledWith(file.storageKey);
    expect((await a.get(`/projects/${projectId}/files`)).json()).toEqual([]);
  });

  it("запис відхиляється, якщо файлу немає в R2", async () => {
    const { a, projectId } = await setup();
    storage.headObjectSize.mockResolvedValue(null);
    const res = await a.post(`/projects/${projectId}/files`, {
      ...meta,
      storageKey: `projects/${projectId}/x-brief.pdf`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("запис відхиляється, якщо розмір у R2 інший", async () => {
    const { a, projectId } = await setup();
    storage.headObjectSize.mockResolvedValue(1);
    const res = await a.post(`/projects/${projectId}/files`, {
      ...meta,
      storageKey: `projects/${projectId}/x-brief.pdf`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("запис відхиляється з ключем чужого проєкту", async () => {
    const { a, projectId } = await setup();
    storage.headObjectSize.mockResolvedValue(meta.sizeBytes);
    const res = await a.post(`/projects/${projectId}/files`, {
      ...meta,
      storageKey: "projects/other/x-brief.pdf",
    });
    expect(res.statusCode).toBe(400);
  });

  it("файл можна прив'язати до етапу, але тільки свого проєкту", async () => {
    const { a, projectId } = await setup();
    const m = await makeMilestone(a, projectId);
    const ok = await a.post(`/projects/${projectId}/files/presign`, {
      ...meta,
      milestoneId: m.id,
    });
    expect(ok.statusCode).toBe(200);

    const otherProject = await makeProject(a, await makeClient(a, "B"));
    const bad = await a.post(`/projects/${otherProject}/files/presign`, {
      ...meta,
      milestoneId: m.id,
    });
    expect(bad.statusCode).toBe(404);
  });

  it("чужий користувач не бачить, не качає і не видаляє файли", async () => {
    const { a, projectId } = await setup();
    const file = (await upload(a, projectId)).json();
    const b = api(ctx.app, await createUser(ctx.app));

    expect((await b.get(`/projects/${projectId}/files`)).statusCode).toBe(404);
    expect(
      (await b.post(`/projects/${projectId}/files/presign`, meta)).statusCode,
    ).toBe(404);
    expect((await b.get(`/files/${file.id}/download`)).statusCode).toBe(404);
    expect((await b.del(`/files/${file.id}`)).statusCode).toBe(404);
  });
});
