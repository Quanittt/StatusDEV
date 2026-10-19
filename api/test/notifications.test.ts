import { beforeEach, describe, expect, it, vi } from "vitest";

// Resend у тестах не чіпаємо: підміняємо шар відправки листів.
const mailer = vi.hoisted(() => ({
  sendEmail: vi.fn<(mail: unknown) => Promise<{ id: string } | null>>(async () => ({ id: "mail-1" })),
}));
vi.mock("../src/lib/miler.js", () => mailer);

import {
  api,
  createUser,
  makeMilestone,
  makeProject,
  type Api,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}
const sent = () => mailer.sendEmail.mock.calls.map((c) => c[0] as Mail);

describe("email-сповіщення", () => {
  const ctx = useTestApp();

  beforeEach(() => {
    mailer.sendEmail.mockReset();
    mailer.sendEmail.mockResolvedValue({ id: "mail-1" });
  });

  async function setup(clientEmail: string | null = "client@example.com") {
    const owner = await createUser(ctx.app, "alice");
    const a = api(ctx.app, owner);
    const clientId = (
      await a.post("/clients", { name: "Acme", email: clientEmail })
    ).json().id;
    const projectId = await makeProject(a, clientId, { title: "Сайт" });
    const milestone = await makeMilestone(a, projectId, "Макети");
    const share = async () =>
      (await a.post(`/projects/${projectId}/share`)).json()
        .shareToken as string;
    return { owner, a, projectId, milestone, share };
  }

  const setStatus = (a: Api, id: string, status: string) =>
    a.patch(`/milestones/${id}`, { status });

  it("клієнт отримує лист, коли етап змінив статус", async () => {
    const { a, milestone, share } = await setup();
    const token = await share();

    const res = await setStatus(a, milestone.id, "in_progress");
    expect(res.statusCode).toBe(200);

    expect(sent()).toHaveLength(1);
    const mail = sent()[0];
    expect(mail.to).toBe("client@example.com");
    expect(mail.subject).toContain("Макети");
    expect(mail.subject).toContain("в роботі");
    expect(mail.html).toContain(`/p/${token}`);
    expect(mail.text).toContain(`/p/${token}`);
  });

  it("лист про готовий етап іде з «готово» і не просить дій у клієнта", async () => {
    const { a, milestone, share } = await setup();
    await a.patch(`/milestones/${milestone.id}`, {
      clientAction: "Надіслати логотип",
    });
    await share();

    await setStatus(a, milestone.id, "done");
    expect(sent()[0].subject).toContain("готово");
    expect(sent()[0].text).not.toContain("Надіслати логотип");
  });

  it("лист не йде, якщо статус не змінився або етап повернули в «очікує»", async () => {
    const { a, milestone, share } = await setup();
    await share();

    await setStatus(a, milestone.id, "in_progress");
    mailer.sendEmail.mockClear();

    await setStatus(a, milestone.id, "in_progress");
    await a.patch(`/milestones/${milestone.id}`, { title: "Нова назва" });
    await setStatus(a, milestone.id, "todo");
    expect(sent()).toHaveLength(0);
  });

  it("без посилання для клієнта або без email листа немає", async () => {
    const noLink = await setup();
    await setStatus(noLink.a, noLink.milestone.id, "in_progress");
    expect(sent()).toHaveLength(0);

    const noEmail = await setup(null);
    await noEmail.share();
    await setStatus(noEmail.a, noEmail.milestone.id, "in_progress");
    expect(sent()).toHaveLength(0);
  });

  it("назви екрануються в HTML, а тема листа — в один рядок", async () => {
    const { a, projectId, share } = await setup();
    await share();
    const m = await a.post(`/projects/${projectId}/milestones`, {
      title: "<b>Хак</b>\nBcc: x@evil.test",
    });
    await setStatus(a, m.json().id, "in_progress");

    const mail = sent()[0];
    expect(mail.html).toContain("&lt;b&gt;Хак&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Хак</b>");
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it("власник отримує лист про коментар клієнта з порталу", async () => {
    const { owner, share } = await setup();
    const token = await share();

    const res = await ctx.app.inject({
      method: "POST",
      url: `/portal/${token}/comments`,
      payload: { body: "Чи можна інший колір <script>?" },
    });
    expect(res.statusCode).toBe(201);

    expect(sent()).toHaveLength(1);
    const mail = sent()[0];
    expect(mail.to).toBe(owner.email);
    expect(mail.subject).toContain("Сайт");
    expect(mail.text).toContain("Чи можна інший колір <script>?");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("збій Resend не ламає запит", async () => {
    const { a, milestone, share } = await setup();
    await share();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mailer.sendEmail.mockRejectedValueOnce(new Error("resend down"));

    const res = await setStatus(a, milestone.id, "in_progress");
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("in_progress");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
