import { beforeEach, describe, expect, it, vi } from "vitest";

const mailer = vi.hoisted(() => ({
  sendEmail: vi.fn<(mail: unknown) => Promise<{ id: string } | null>>(async () => ({ id: "mail-1" })),
}));
vi.mock("../src/lib/miler.js", () => mailer);

import {
  api,
  createUser,
  makeClient,
  makeMilestone,
  makeProject,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("відповідь клієнта на етап", () => {
  const ctx = useTestApp();

  beforeEach(() => mailer.sendEmail.mockClear());

  async function setup() {
    const owner = await createUser(ctx.app, "alice");
    const a = api(ctx.app, owner);
    const projectId = await makeProject(a, await makeClient(a), {
      title: "Сайт",
    });
    const token = (await a.post(`/projects/${projectId}/share`)).json()
      .shareToken as string;
    const respond = (milestoneId: string, body: unknown, t = token) =>
      ctx.app.inject({
        method: "POST",
        url: `/portal/${t}/milestones/${milestoneId}/response`,
        payload: body as object,
      });
    const portal = async () =>
      (
        await ctx.app.inject({ method: "GET", url: `/portal/${token}` })
      ).json();
    return { owner, a, projectId, token, respond, portal };
  }

  it("клієнт приймає завершений етап: видно і на порталі, і власнику", async () => {
    const { owner, a, projectId, respond, portal } = await setup();
    const m = await makeMilestone(a, projectId, "Макети");
    await a.patch(`/milestones/${m.id}`, { status: "done" });

    const res = await respond(m.id, { response: "approved" });
    expect(res.statusCode).toBe(200);
    expect(res.json().clientResponse).toBe("approved");

    const portalMs = (await portal()).milestones[0];
    expect(portalMs.clientResponse).toBe("approved");
    expect(portalMs.canRespond).toBe(true);

    const details = (await a.get(`/projects/${projectId}`)).json();
    expect(details.milestones[0].clientResponse).toBe("approved");
    expect(details.milestones[0].clientRespondedAt).not.toBeNull();

    const mail = mailer.sendEmail.mock.calls.at(-1)![0] as {
      to: string;
      subject: string;
    };
    expect(mail.to).toBe(owner.email);
    expect(mail.subject).toContain("прийняв");
  });

  it("правки: потрібен опис, етап повертається в роботу, текст потрапляє в коментарі", async () => {
    const { owner, a, projectId, respond, portal } = await setup();
    const m = await makeMilestone(a, projectId, "Макети");
    await a.patch(`/milestones/${m.id}`, { status: "done" });

    expect(
      (await respond(m.id, { response: "changes_requested" })).statusCode,
    ).toBe(400);
    expect(
      (await respond(m.id, { response: "changes_requested", note: "   " }))
        .statusCode,
    ).toBe(400);

    const res = await respond(m.id, {
      response: "changes_requested",
      note: "Збільшіть логотип",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("in_progress");

    const details = (await a.get(`/projects/${projectId}`)).json();
    expect(details.milestones[0].status).toBe("in_progress");
    expect(details.milestones[0].completedAt).toBeNull();
    expect(details.milestones[0].clientResponseNote).toBe("Збільшіть логотип");

    const thread = (await portal()).comments;
    expect(thread).toHaveLength(1);
    expect(thread[0].authorType).toBe("client");
    expect(thread[0].body).toContain("Збільшіть логотип");

    const mail = mailer.sendEmail.mock.calls.at(-1)![0] as {
      to: string;
      subject: string;
      text: string;
    };
    expect(mail.to).toBe(owner.email);
    expect(mail.subject).toContain("правки");
    expect(mail.text).toContain("Збільшіть логотип");
  });

  it("відповісти можна лише на завершений етап або етап із дією від клієнта", async () => {
    const { a, projectId, respond } = await setup();
    const plain = await makeMilestone(a, projectId, "Без дії");
    expect((await respond(plain.id, { response: "approved" })).statusCode).toBe(
      400,
    );

    const withAction = await makeMilestone(a, projectId, "З дією");
    await a.patch(`/milestones/${withAction.id}`, {
      clientAction: "Надіслати тексти",
    });
    expect(
      (await respond(withAction.id, { response: "approved" })).statusCode,
    ).toBe(200);
  });

  it("можна передумати: нова відповідь замінює стару", async () => {
    const { a, projectId, respond } = await setup();
    const m = await makeMilestone(a, projectId);
    await a.patch(`/milestones/${m.id}`, { status: "done" });
    await respond(m.id, { response: "approved" });

    // Другий раз: правки. Нотатка від попередньої відповіді не лишається.
    await respond(m.id, { response: "changes_requested", note: "Ще дрібниця" });
    await a.patch(`/milestones/${m.id}`, { status: "done" });
    const res = await respond(m.id, { response: "approved", note: "ігнорується" });
    expect(res.json().clientResponse).toBe("approved");
    expect(res.json().clientResponseNote).toBeNull();
  });

  it("власник міняє статус етапу — стара відповідь клієнта скидається", async () => {
    const { a, projectId, respond } = await setup();
    const m = await makeMilestone(a, projectId);
    await a.patch(`/milestones/${m.id}`, { status: "done" });
    await respond(m.id, { response: "approved" });

    await a.patch(`/milestones/${m.id}`, { status: "in_progress" });
    const ms = (await a.get(`/projects/${projectId}`)).json().milestones[0];
    expect(ms.clientResponse).toBeNull();
    expect(ms.clientRespondedAt).toBeNull();
  });

  it("чужий етап і недійсний токен: 404", async () => {
    const one = await setup();
    const two = await setup();
    const foreign = await makeMilestone(two.a, two.projectId);
    await two.a.patch(`/milestones/${foreign.id}`, { status: "done" });

    // етап іншого проєкту через токен цього
    expect(
      (await one.respond(foreign.id, { response: "approved" })).statusCode,
    ).toBe(404);

    const mine = await makeMilestone(one.a, one.projectId);
    await one.a.patch(`/milestones/${mine.id}`, { status: "done" });
    expect(
      (await one.respond(mine.id, { response: "approved" }, "x".repeat(32)))
        .statusCode,
    ).toBe(404);

    await one.a.del(`/projects/${one.projectId}/share`);
    expect(
      (await one.respond(mine.id, { response: "approved" })).statusCode,
    ).toBe(404);
  });

  it("невідома відповідь відхиляється", async () => {
    const { a, projectId, respond } = await setup();
    const m = await makeMilestone(a, projectId);
    await a.patch(`/milestones/${m.id}`, { status: "done" });
    expect((await respond(m.id, { response: "maybe" })).statusCode).toBe(400);
  });
});
