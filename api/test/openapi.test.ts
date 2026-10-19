import { describe, expect, it } from "vitest";
import { OPERATIONS } from "../src/openapi.js";
import { useTestApp } from "./suite.js";

// Маршрути, яких в OpenAPI немає свідомо: документація і службовий wildcard Better Auth.
const IGNORED = new Set(["/docs", "/openapi.json", "/api/auth/*"]);

const toOpenApi = (p: string) => p.replace(/:(\w+)/g, "{$1}");

describe("OpenAPI", () => {
  const ctx = useTestApp();

  it("кожен маршрут API описаний, і кожен опис має маршрут", () => {
    const actual = new Set(
      ctx.app.routeTable
        .filter((r) => !["HEAD", "OPTIONS"].includes(r.method))
        .filter((r) => !IGNORED.has(r.url))
        .map((r) => `${r.method.toLowerCase()} ${r.url}`),
    );
    const documented = new Set(
      OPERATIONS.filter((o) => !o.path.startsWith("/api/auth/")).map(
        (o) => `${o.method} ${o.path}`,
      ),
    );

    expect([...actual].filter((r) => !documented.has(r)).sort()).toEqual([]);
    expect([...documented].filter((r) => !actual.has(r)).sort()).toEqual([]);
  });

  it("/openapi.json віддає коректну специфікацію з тілами із Zod-схем", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/openapi.json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBe("3.0.3");

    const createProject = spec.paths["/projects"].post;
    const schema = createProject.requestBody.content["application/json"].schema;
    expect(schema.required).toContain("clientId");
    expect(schema.properties.template.enum).toContain("landing");
    expect(createProject.responses["201"]).toBeDefined();
    expect(createProject.responses["402"]).toBeDefined();
    expect(createProject.security).toEqual([{ sessionCookie: [] }]);

    // публічний портал без cookie, а захищений паролем — із заголовком
    const portal = spec.paths["/portal/{token}"].get;
    expect(portal.security).toBeUndefined();
    expect(
      portal.parameters.some((p: { name: string }) => p.name === "X-Portal-Access"),
    ).toBe(true);
  });

  it("кожен параметр шляху оголошений", async () => {
    const spec = (
      await ctx.app.inject({ method: "GET", url: "/openapi.json" })
    ).json();
    for (const op of OPERATIONS) {
      const names = [...op.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
      const declared = spec.paths[toOpenApi(op.path)][op.method].parameters
        .filter((p: { in: string }) => p.in === "path")
        .map((p: { name: string }) => p.name);
      expect(declared.sort(), op.path).toEqual(names.sort());
    }
  });

  it("Swagger UI доступний", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/docs" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("/openapi.json");
  });
});
