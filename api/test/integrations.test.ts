import { beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({
  telegramEnabled: vi.fn(() => true),
  getBotUsername: vi.fn(() => "statusdev_test_bot"),
  sendTelegramMessage: vi.fn<(chatId: string, html: string) => Promise<void>>(
    async () => {},
  ),
  startTelegramPolling: vi.fn(() => () => {}),
  escapeTelegram: (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));
vi.mock("../src/lib/telegram.js", () => telegram);

const webhook = vi.hoisted(() => ({
  deliver: vi.fn<(url: string, secret: string, payload: unknown) => Promise<void>>(
    async () => {},
  ),
}));
vi.mock("../src/lib/webhook.js", async (importActual) => ({
  ...(await importActual<typeof import("../src/lib/webhook.js")>()),
  deliverWebhook: webhook.deliver,
}));

const mailer = vi.hoisted(() => ({
  sendEmail: vi.fn<(mail: unknown) => Promise<{ id: string } | null>>(
    async () => ({ id: "mail-1" }),
  ),
}));
vi.mock("../src/lib/miler.js", () => mailer);

import { db } from "../src/db/client.js";
import { user } from "../src/db/schema.js";
import {
  isPrivateAddress,
  signBody,
} from "../src/lib/webhook.js";
import { eq } from "drizzle-orm";
import { api, createUser, makeClient, makeProject } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("перевірка адрес вебхука", () => {
  it("внутрішні адреси відсікаються, публічні — ні", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("підпис HMAC детермінований і залежить від секрету та тіла", () => {
    const a = signBody("s1", '{"a":1}');
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signBody("s1", '{"a":1}')).toBe(a);
    expect(signBody("s2", '{"a":1}')).not.toBe(a);
    expect(signBody("s1", '{"a":2}')).not.toBe(a);
  });
});

describe("інтеграції власника: Telegram і вебхук", () => {
  const ctx = useTestApp();

  beforeEach(() => {
    telegram.sendTelegramMessage.mockReset();
    telegram.sendTelegramMessage.mockResolvedValue(undefined);
    telegram.telegramEnabled.mockReturnValue(true);
    webhook.deliver.mockReset();
    webhook.deliver.mockResolvedValue(undefined);
    mailer.sendEmail.mockClear();
  });

  async function setup() {
    const owner = await createUser(ctx.app, "alice");
    const a = api(ctx.app, owner);
    const projectId = await makeProject(a, await makeClient(a), { title: "Сайт" });
    const token = (await a.post(`/projects/${projectId}/share`)).json()
      .shareToken as string;
    const comment = (body: string) =>
      ctx.app.inject({
        method: "POST",
        url: `/portal/${token}/comments`,
        payload: { body },
      });
    return { owner, a, projectId, token, comment };
  }

  it("за замовчуванням нічого не підключено", async () => {
    const { a } = await setup();
    const res = (await a.get("/me/integrations")).json();
    expect(res.telegram).toMatchObject({ available: true, linked: false });
    expect(res.webhook).toEqual({ url: null, secret: null });
  });

  it("Telegram: код, посилання на бота, прив'язка і відв'язка", async () => {
    const { owner, a } = await setup();
    const link = await a.post("/me/integrations/telegram/link");
    expect(link.statusCode).toBe(201);
    expect(link.json().deepLink).toBe(
      `https://t.me/statusdev_test_bot?start=${link.json().code}`,
    );

    // бот у реальності робить це сам після /start <код>
    await db
      .update(user)
      .set({ telegramChatId: "123456" })
      .where(eq(user.id, owner.id));
    expect((await a.get("/me/integrations")).json().telegram.linked).toBe(true);

    expect((await a.del("/me/integrations/telegram")).statusCode).toBe(204);
    expect((await a.get("/me/integrations")).json().telegram.linked).toBe(false);
  });

  it("без налаштованого бота код не видається", async () => {
    const { a } = await setup();
    telegram.telegramEnabled.mockReturnValue(false);
    expect((await a.post("/me/integrations/telegram/link")).statusCode).toBe(400);
  });

  it("вебхук: секрет створюється один раз і не змінюється при новій адресі", async () => {
    const { a } = await setup();
    const first = await a.put("/me/integrations/webhook", {
      url: "https://8.8.8.8/hook",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().secret).toMatch(/^whsec_/);

    const second = await a.put("/me/integrations/webhook", {
      url: "https://1.1.1.1/hook",
    });
    expect(second.json().secret).toBe(first.json().secret);

    const cleared = await a.put("/me/integrations/webhook", { url: null });
    expect(cleared.json()).toEqual({ url: null, secret: null });
  });

  it("вебхук: внутрішня адреса й нерозпізнаний URL відхиляються", async () => {
    const { a } = await setup();
    for (const url of [
      "http://10.0.0.5/hook",
      "http://169.254.169.254/latest",
      "https://user:pass@8.8.8.8/hook",
      "ftp://8.8.8.8/hook",
    ]) {
      const res = await a.put("/me/integrations/webhook", { url });
      expect(res.statusCode, url).toBe(400);
    }
    expect((await a.put("/me/integrations/webhook", { url: "not a url" })).statusCode).toBe(400);
  });

  it("коментар клієнта йде у Telegram і у вебхук, текст екранується", async () => {
    const { owner, a, projectId, comment } = await setup();
    await db
      .update(user)
      .set({ telegramChatId: "123456" })
      .where(eq(user.id, owner.id));
    const { secret } = (
      await a.put("/me/integrations/webhook", { url: "https://8.8.8.8/hook" })
    ).json();

    await comment("Привіт <b>світ</b>");

    expect(telegram.sendTelegramMessage).toHaveBeenCalledTimes(1);
    const [chatId, html] = telegram.sendTelegramMessage.mock.calls[0];
    expect(chatId).toBe("123456");
    expect(html).toContain("&lt;b&gt;світ&lt;/b&gt;");
    expect(html).not.toContain("<b>світ</b>");
    expect(html).toContain(`/projects/${projectId}`);

    expect(webhook.deliver).toHaveBeenCalledTimes(1);
    const [url, usedSecret, payload] = webhook.deliver.mock.calls[0] as [
      string,
      string,
      { event: string; project: { id: string }; data: { body: string } },
    ];
    expect(url).toBe("https://8.8.8.8/hook");
    expect(usedSecret).toBe(secret);
    expect(payload.event).toBe("client.comment");
    expect(payload.project.id).toBe(projectId);
    expect(payload.data.body).toBe("Привіт <b>світ</b>");
  });

  it("збій одного каналу не зупиняє інші, а запит клієнта успішний", async () => {
    const { owner, a, comment } = await setup();
    await db
      .update(user)
      .set({ telegramChatId: "123456" })
      .where(eq(user.id, owner.id));
    await a.put("/me/integrations/webhook", { url: "https://8.8.8.8/hook" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    telegram.sendTelegramMessage.mockRejectedValue(new Error("telegram down"));

    const res = await comment("Привіт");
    expect(res.statusCode).toBe(201);
    expect(webhook.deliver).toHaveBeenCalledTimes(1);
    // і лист власнику теж пішов
    expect(mailer.sendEmail).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("відповідь на етап і документ теж потрапляють у вебхук", async () => {
    const { a, projectId, token } = await setup();
    await a.put("/me/integrations/webhook", { url: "https://8.8.8.8/hook" });
    const ms = (await a.post(`/projects/${projectId}/milestones`, { title: "Макети" })).json();
    await a.patch(`/milestones/${ms.id}`, { status: "done" });

    await ctx.app.inject({
      method: "POST",
      url: `/portal/${token}/milestones/${ms.id}/response`,
      payload: { response: "approved" },
    });
    const events = webhook.deliver.mock.calls.map(
      (c) => (c[2] as { event: string }).event,
    );
    expect(events).toContain("client.milestone_response");
  });

  it("тест-кнопка повертає стан кожного каналу", async () => {
    const { owner, a } = await setup();
    const none = (await a.post("/me/integrations/test")).json();
    expect(none).toEqual({ telegram: "not_configured", webhook: "not_configured" });

    await db
      .update(user)
      .set({ telegramChatId: "123456" })
      .where(eq(user.id, owner.id));
    await a.put("/me/integrations/webhook", { url: "https://8.8.8.8/hook" });
    webhook.deliver.mockRejectedValueOnce(new Error("Вебхук відповів статусом 500"));

    const res = (await a.post("/me/integrations/test")).json();
    expect(res.telegram).toBe("ok");
    expect(res.webhook).toContain("500");
  });

  it("інтеграції доступні лише власнику акаунта", async () => {
    const { a } = await setup();
    const bob = api(ctx.app, await createUser(ctx.app, "bob"));
    await a.put("/me/integrations/webhook", { url: "https://8.8.8.8/hook" });
    expect((await bob.get("/me/integrations")).json().webhook.url).toBeNull();

    const anon = await ctx.app.inject({ method: "GET", url: "/me/integrations" });
    expect(anon.statusCode).toBe(401);
  });
});
