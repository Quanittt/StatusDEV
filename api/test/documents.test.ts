import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  presignUpload: vi.fn(async (key: string) => `https://r2.test/${key}?sig=1`),
  presignDownload: vi.fn(async (key: string) => `https://r2.test/${key}?dl=1`),
  presignView: vi.fn(async (key: string) => `https://r2.test/${key}?view=1`),
  headObjectSize: vi.fn<(key: string) => Promise<number | null>>(),
  deleteObject: vi.fn(async () => {}),
}));
vi.mock("../src/lib/storage.js", () => storage);

const mailer = vi.hoisted(() => ({
  sendEmail: vi.fn<(mail: unknown) => Promise<{ id: string } | null>>(
    async () => ({ id: "mail-1" }),
  ),
}));
vi.mock("../src/lib/miler.js", () => mailer);

import { api, createUser, makeProject, type Api } from "./helpers.js";
import { useTestApp } from "./suite.js";

const meta = { name: "contract.pdf", mimeType: "application/pdf", sizeBytes: 2048 };

describe("документи на погодження", () => {
  const ctx = useTestApp();

  beforeEach(() => {
    storage.headObjectSize.mockReset();
    storage.headObjectSize.mockResolvedValue(meta.sizeBytes);
    storage.deleteObject.mockClear();
    mailer.sendEmail.mockClear();
  });

  async function uploadFile(a: Api, projectId: string) {
    const { storageKey } = (
      await a.post(`/projects/${projectId}/files/presign`, meta)
    ).json();
    return (await a.post(`/projects/${projectId}/files`, { ...meta, storageKey })).json()
      .id as string;
  }

  async function setup() {
    const owner = await createUser(ctx.app, "alice");
    const a = api(ctx.app, owner);
    const clientId = (
      await a.post("/clients", { name: "Acme", email: "client@example.com" })
    ).json().id;
    const projectId = await makeProject(a, clientId, { title: "Сайт" });
    const token = (await a.post(`/projects/${projectId}/share`)).json()
      .shareToken as string;
    const fileId = await uploadFile(a, projectId);
    const doc = (
      await a.post(`/projects/${projectId}/documents`, { fileId, title: "Договір" })
    ).json();
    const respond = (body: unknown, t = token, id = doc.id) =>
      ctx.app.inject({
        method: "POST",
        url: `/portal/${t}/documents/${id}/response`,
        payload: body as object,
      });
    return { owner, a, projectId, token, fileId, doc, respond };
  }

  it("власник створює запит, клієнт отримує лист і бачить документ у порталі", async () => {
    const { token, doc } = await setup();
    expect(doc.status).toBe("pending");

    const sentTo = mailer.sendEmail.mock.calls.map(
      (c) => (c[0] as { to: string }).to,
    );
    expect(sentTo).toContain("client@example.com");

    const portal = (
      await ctx.app.inject({ method: "GET", url: `/portal/${token}` })
    ).json();
    expect(portal.documents).toHaveLength(1);
    expect(portal.documents[0]).toMatchObject({
      title: "Договір",
      status: "pending",
      fileName: "contract.pdf",
    });
    // службові поля підпису в порталі — лише ім'я і примітка
    expect(JSON.stringify(portal)).not.toContain("signerIp");
  });

  it("клієнт погоджує іменем: фіксується ім'я, час, IP, власник отримує лист", async () => {
    const { owner, a, projectId, respond } = await setup();
    mailer.sendEmail.mockClear();

    const res = await respond({ response: "approved", signerName: "  Іван Петренко " });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "approved", signerName: "Іван Петренко" });

    const [doc] = (await a.get(`/projects/${projectId}/documents`)).json();
    expect(doc.status).toBe("approved");
    expect(doc.signerName).toBe("Іван Петренко");
    expect(doc.signerIp).toBeTruthy();
    expect(doc.respondedAt).not.toBeNull();

    const mail = mailer.sendEmail.mock.calls.at(-1)![0] as {
      to: string;
      subject: string;
    };
    expect(mail.to).toBe(owner.email);
    expect(mail.subject).toContain("Договір");

    const activity = (await a.get(`/projects/${projectId}/activity`)).json();
    expect(activity.map((e: { type: string }) => e.type)).toContain("document_signed");
  });

  it("погоджений документ остаточний", async () => {
    const { respond } = await setup();
    await respond({ response: "approved", signerName: "Іван" });
    const again = await respond({ response: "changes_requested", note: "Передумав" });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.message).toContain("погоджено");
  });

  it("правки потребують опису, після них можна погодити", async () => {
    const { a, projectId, respond } = await setup();
    expect((await respond({ response: "changes_requested" })).statusCode).toBe(400);
    expect(
      (await respond({ response: "changes_requested", note: "  " })).statusCode,
    ).toBe(400);

    const changes = await respond({ response: "changes_requested", note: "Змініть п. 3" });
    expect(changes.statusCode).toBe(200);
    const [doc] = (await a.get(`/projects/${projectId}/documents`)).json();
    expect(doc.status).toBe("changes_requested");
    expect(doc.note).toBe("Змініть п. 3");

    expect(
      (await respond({ response: "approved", signerName: "Іван" })).statusCode,
    ).toBe(200);
  });

  it("підпис без імені відхиляється", async () => {
    const { respond } = await setup();
    expect((await respond({ response: "approved" })).statusCode).toBe(400);
    expect((await respond({ response: "approved", signerName: " " })).statusCode).toBe(400);
  });

  it("клієнт завантажує документ через тимчасове посилання", async () => {
    const { token, doc } = await setup();
    const res = await ctx.app.inject({
      method: "GET",
      url: `/portal/${token}/documents/${doc.id}/download`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("dl=1");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("документ чужого проєкту й невідомий токен: 404", async () => {
    const one = await setup();
    const two = await setup();
    expect(
      (await one.respond({ response: "approved", signerName: "Х" }, one.token, two.doc.id))
        .statusCode,
    ).toBe(404);
    const dl = await ctx.app.inject({
      method: "GET",
      url: `/portal/${one.token}/documents/${two.doc.id}/download`,
    });
    expect(dl.statusCode).toBe(404);
    expect(
      (await one.respond({ response: "approved", signerName: "Х" }, "x".repeat(32)))
        .statusCode,
    ).toBe(404);
  });

  it("файл іншого проєкту не можна зробити документом", async () => {
    const one = await setup();
    const two = await setup();
    const res = await one.a.post(`/projects/${one.projectId}/documents`, {
      fileId: two.fileId,
      title: "Чужий",
    });
    expect(res.statusCode).toBe(404);
  });

  it("чужий власник не бачить і не видаляє документи", async () => {
    const { projectId, doc } = await setup();
    const bob = api(ctx.app, await createUser(ctx.app, "bob"));
    expect((await bob.get(`/projects/${projectId}/documents`)).statusCode).toBe(404);
    expect((await bob.del(`/documents/${doc.id}`)).statusCode).toBe(404);
  });

  it("видалення запиту прибирає його з порталу, файл лишається", async () => {
    const { a, projectId, token, doc } = await setup();
    expect((await a.del(`/documents/${doc.id}`)).statusCode).toBe(204);
    const portal = (
      await ctx.app.inject({ method: "GET", url: `/portal/${token}` })
    ).json();
    expect(portal.documents).toHaveLength(0);
    expect((await a.get(`/projects/${projectId}/files`)).json()).toHaveLength(1);
  });

  it("файл під документом не можна видалити: підпис клієнта не губиться", async () => {
    const { a, projectId, fileId, doc, respond } = await setup();
    await respond({ response: "approved", signerName: "Іван" });

    const refused = await a.del(`/files/${fileId}`);
    expect(refused.statusCode).toBe(409);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    const [still] = (await a.get(`/projects/${projectId}/documents`)).json();
    expect(still.signerName).toBe("Іван");

    // після скасування запиту файл видаляється звичайним шляхом
    await a.del(`/documents/${doc.id}`);
    expect((await a.del(`/files/${fileId}`)).statusCode).toBe(204);
  });
});
