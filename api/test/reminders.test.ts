import { beforeEach, describe, expect, it, vi } from "vitest";

const mailer = vi.hoisted(() => ({
  sendEmail: vi.fn<(mail: unknown) => Promise<{ id: string } | null>>(async () => ({ id: "mail-1" })),
}));
vi.mock("../src/lib/miler.js", () => mailer);

import { runDeadlineReminders } from "../src/services/reminders.js";
import {
  api,
  createUser,
  makeMilestone,
  makeProject,
  type Api,
} from "./helpers.js";
import { useTestApp } from "./suite.js";

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY).toISOString();

interface Mail {
  to: string;
  subject: string;
  text: string;
}
const sent = () => mailer.sendEmail.mock.calls.map((c) => c[0] as Mail);

describe("нагадування про дедлайни", () => {
  const ctx = useTestApp();

  beforeEach(() => {
    mailer.sendEmail.mockReset();
    mailer.sendEmail.mockResolvedValue({ id: "mail-1" });
  });

  async function setup() {
    const owner = await createUser(ctx.app, "alice");
    const a = api(ctx.app, owner);
    const clientId = (
      await a.post("/clients", { name: "Acme", email: "client@example.com" })
    ).json().id;
    const projectId = await makeProject(a, clientId, { title: "Сайт" });
    await a.post(`/projects/${projectId}/share`);
    return { owner, a, projectId };
  }

  async function milestone(
    a: Api,
    projectId: string,
    patch: Record<string, unknown>,
  ) {
    const m = await makeMilestone(a, projectId, "Макети");
    const res = await a.patch(`/milestones/${m.id}`, patch);
    expect(res.statusCode).toBe(200);
    return m.id;
  }

  it("етап, термін якого за два дні, нагадується власнику один раз", async () => {
    const { owner, a, projectId } = await setup();
    await milestone(a, projectId, { dueDate: daysFromNow(1.5) });

    expect(await runDeadlineReminders()).toEqual({ soon: 1, overdue: 0 });
    expect(sent()).toHaveLength(1);
    expect(sent()[0].to).toBe(owner.email);
    expect(sent()[0].subject).toContain("Скоро");
    expect(sent()[0].subject).toContain("Макети");

    // повторний запуск нічого не шле
    expect(await runDeadlineReminders()).toEqual({ soon: 0, overdue: 0 });
    expect(sent()).toHaveLength(1);
  });

  it("прострочений етап: нагадування «прострочено» і лише один раз", async () => {
    const { a, projectId } = await setup();
    await milestone(a, projectId, { dueDate: daysFromNow(-3) });

    expect(await runDeadlineReminders()).toEqual({ soon: 0, overdue: 1 });
    expect(sent()[0].subject).toContain("Прострочено");
    expect(await runDeadlineReminders()).toEqual({ soon: 0, overdue: 0 });
  });

  it("після «скоро» пізніше приходить ще й «прострочено»", async () => {
    const { a, projectId } = await setup();
    await milestone(a, projectId, { dueDate: daysFromNow(1) });

    await runDeadlineReminders();
    const later = new Date(Date.now() + 3 * DAY);
    expect(await runDeadlineReminders(later)).toEqual({ soon: 0, overdue: 1 });
    expect(sent().map((m) => m.subject.split(" ")[0])).toEqual([
      "Скоро",
      "Прострочено",
    ]);
  });

  it("день дедлайну ще не прострочений", async () => {
    const { a, projectId } = await setup();
    // північ сьогоднішнього дня за UTC: день ще триває
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await milestone(a, projectId, { dueDate: today.toISOString() });

    const noon = new Date(today.getTime() + 12 * 60 * 60 * 1000);
    expect(await runDeadlineReminders(noon)).toEqual({ soon: 1, overdue: 0 });
  });

  it("далекі, завершені, без дати та в неактивних проєктах — без листів", async () => {
    const { a, projectId } = await setup();
    await milestone(a, projectId, { dueDate: daysFromNow(10) });
    await milestone(a, projectId, { dueDate: daysFromNow(-5), status: "done" });
    await makeMilestone(a, projectId, "Без дати");

    const { a: b, projectId: paused } = await setup();
    await milestone(b, paused, { dueDate: daysFromNow(-5) });
    await b.patch(`/projects/${paused}`, { status: "paused" });
    // лист про статус «готово» теж надсилається, але це не нагадування
    mailer.sendEmail.mockClear();

    expect(await runDeadlineReminders()).toEqual({ soon: 0, overdue: 0 });
    expect(sent()).toHaveLength(0);
  });

  it("клієнт теж отримує нагадування, але лише про етапи з дією від нього", async () => {
    const { a, projectId } = await setup();
    await milestone(a, projectId, {
      dueDate: daysFromNow(1),
      clientAction: "Надіслати тексти",
    });
    await milestone(a, projectId, { dueDate: daysFromNow(1) });

    await runDeadlineReminders();
    const toClient = sent().filter((m) => m.to === "client@example.com");
    expect(toClient).toHaveLength(1);
    expect(toClient[0].text).toContain("Надіслати тексти");
    expect(sent()).toHaveLength(3);
  });

  it("зміна дати дає нове нагадування", async () => {
    const { a, projectId } = await setup();
    const id = await milestone(a, projectId, { dueDate: daysFromNow(1) });
    await runDeadlineReminders();
    expect(sent()).toHaveLength(1);

    await a.patch(`/milestones/${id}`, { dueDate: daysFromNow(1.2) });
    expect(await runDeadlineReminders()).toEqual({ soon: 1, overdue: 0 });
  });

  // node-pg серіалізує Date у локальній зоні процесу, а колонки зберігають UTC. Якщо порівнювати
  // з Date, вікно "скоро" зсувається на величину зони: нагадування приходять завчасно або запізно.
  it("вікно «скоро» рівно 48 годин у UTC, незалежно від зони процесу", async () => {
    const { a, projectId } = await setup();
    await milestone(a, projectId, { dueDate: daysFromNow(47 / 24) });
    await milestone(a, projectId, { dueDate: daysFromNow(49 / 24) });

    expect(await runDeadlineReminders()).toEqual({ soon: 1, overdue: 0 });
  });

  it("збій листа клієнту не повторює нагадування власнику", async () => {
    const { owner, a, projectId } = await setup();
    await milestone(a, projectId, {
      dueDate: daysFromNow(1),
      clientAction: "Надіслати тексти",
    });
    mailer.sendEmail.mockClear();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mailer.sendEmail.mockImplementation(async (mail) => {
      if ((mail as Mail).to === "client@example.com") throw new Error("bounce");
      return { id: "mail-1" };
    });

    expect(await runDeadlineReminders()).toEqual({ soon: 1, overdue: 0 });
    expect(await runDeadlineReminders()).toEqual({ soon: 0, overdue: 0 });
    expect(sent().filter((m) => m.to === owner.email)).toHaveLength(1);
    spy.mockRestore();
  });

  it("збій відправки не втрачає нагадування: наступний запуск повторить", async () => {
    const { a, projectId } = await setup();
    await milestone(a, projectId, { dueDate: daysFromNow(1) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mailer.sendEmail.mockRejectedValueOnce(new Error("resend down"));

    expect(await runDeadlineReminders()).toEqual({ soon: 0, overdue: 0 });
    expect(await runDeadlineReminders()).toEqual({ soon: 1, overdue: 0 });
    spy.mockRestore();
  });
});
