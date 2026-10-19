import { describe, expect, it } from "vitest";
import { useTestApp } from "./suite.js";

describe("CORS для Better Auth", () => {
  const ctx = useTestApp();

  // Відповіді /api/auth/* віддає Better Auth в обхід Fastify, тому заголовки CORS треба додавати вручну.
  it("відповідь на вхід містить Access-Control-Allow-Origin для фронтенда", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "nobody@test.com", password: "password123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("реєстрація теж віддає CORS-заголовки", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: "http://localhost:5173" },
      payload: { name: "Cors", email: "cors@test.com", password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});
