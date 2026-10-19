import { describe, expect, it } from "vitest";
import { api, createUser } from "./helpers.js";
import { useTestApp } from "./suite.js";

describe("PATCH /me", () => {
  const ctx = useTestApp();

  it("зберігає назву й колір бренду, null очищає", async () => {
    const a = api(ctx.app, await createUser(ctx.app));
    const res = await a.patch("/me", {
      brandName: " Моя студія ",
      brandColor: "#1A2b3C",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      brandName: "Моя студія",
      brandColor: "#1A2b3C",
    });

    const cleared = await a.patch("/me", { brandColor: null });
    expect(cleared.json()).toMatchObject({
      brandName: "Моя студія",
      brandColor: null,
    });
    expect((await a.get("/me")).json().brandName).toBe("Моя студія");
  });

  it("відхиляє некоректний колір і порожнє тіло", async () => {
    const a = api(ctx.app, await createUser(ctx.app));
    for (const body of [
      { brandColor: "red" },
      { brandColor: "#fff" },
      { brandColor: "#GGGGGG" },
      { brandColor: "#123456; background:url(x)" },
      {},
    ]) {
      expect((await a.patch("/me", body)).statusCode).toBe(400);
    }
  });

  it("не дає змінити plan через PATCH /me", async () => {
    const a = api(ctx.app, await createUser(ctx.app));
    await a.patch("/me", { brandName: "X", plan: "pro" });
    expect((await a.get("/me")).json().plan).toBe("free");
  });

  it("без сесії 401", async () => {
    const res = await ctx.app.inject({ method: "PATCH", url: "/me", payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
