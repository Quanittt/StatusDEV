import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Telegram не чіпаємо: перехоплюємо fetch, яким бот відповідає в чат.
const sent: { chat_id: string; text: string }[] = [];
const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
  sent.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
});
vi.stubGlobal("fetch", fetchMock);

import { db } from "../src/db/client.js";
import { user } from "../src/db/schema.js";
import { handleMessage } from "../src/lib/telegram.js";
import { createUser } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("прив'язка Telegram", () => {
  const ctx = useTestApp();

  beforeEach(() => {
    sent.length = 0;
  });

  async function ownerWithCode(name: string, code: string) {
    const owner = await createUser(ctx.app, name);
    await db
      .update(user)
      .set({ telegramLinkCode: code, telegramLinkExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(user.id, owner.id));
    return owner;
  }

  const chatOf = async (id: string) =>
    (await db.select({ c: user.telegramChatId }).from(user).where(eq(user.id, id)))[0].c;

  it("/start з дійсним кодом прив'язує чат і гасить код", async () => {
    const owner = await ownerWithCode("alice", "code-a");
    await handleMessage("111", "/start code-a");
    expect(await chatOf(owner.id)).toBe("111");
    expect(sent.at(-1)?.text).toContain("Підключено");

    // код одноразовий
    await handleMessage("222", "/start code-a");
    expect(await chatOf(owner.id)).toBe("111");
    expect(sent.at(-1)?.text).toContain("недійсний");
  });

  it("прострочений або невідомий код не прив'язує нікого", async () => {
    const owner = await ownerWithCode("alice", "code-old");
    await db
      .update(user)
      .set({ telegramLinkExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(user.id, owner.id));
    await handleMessage("111", "/start code-old");
    await handleMessage("111", "/start nope");
    expect(await chatOf(owner.id)).toBeNull();
  });

  it("чат, уже підключений до іншого акаунта, не можна прив'язати вдруге", async () => {
    const alice = await ownerWithCode("alice", "code-a");
    const bob = await ownerWithCode("bob", "code-b");
    await handleMessage("111", "/start code-a");
    await handleMessage("111", "/start code-b");

    expect(await chatOf(alice.id)).toBe("111");
    expect(await chatOf(bob.id)).toBeNull();
    expect(sent.at(-1)?.text).toContain("уже підключений");
  });

  it("/stop відв'язує чат", async () => {
    const owner = await ownerWithCode("alice", "code-a");
    await handleMessage("111", "/start code-a");
    await handleMessage("111", "/stop");
    expect(await chatOf(owner.id)).toBeNull();
  });
});
