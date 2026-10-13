import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";

export async function createTestApp() {
  const app = buildApp({ logger: false });
  await app.ready();
  return app;
}

// Порожня база перед кожним тестом; CASCADE чистить усе, що залежить від user.
export async function resetDb() {
  await db.execute(sql`truncate table "user" cascade`);
}

let counter = 0;

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

// Реєструє користувача через Better Auth і повертає cookie сесії для app.inject().
export async function createUser(
  app: FastifyInstance,
  name = `user${++counter}`,
): Promise<TestUser> {
  const email = `${name}-${Date.now()}-${counter}@test.com`;
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: "http://localhost:5173" },
    payload: { name, email, password: "password123" },
  });
  if (res.statusCode !== 200) {
    throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  }
  const setCookie = res.headers["set-cookie"];
  const cookie = [setCookie ?? []]
    .flat()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: res.json().user.id, email, cookie };
}

export function as(user: TestUser) {
  return { cookie: user.cookie, origin: "http://localhost:5173" };
}

// Скорочення для запитів від імені користувача: api.post("/clients", { name: "A" }).
export function api(app: FastifyInstance, user: TestUser) {
  const call =
    (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE") =>
    (url: string, payload?: object) =>
      app.inject({ method, url, headers: as(user), payload });
  return {
    get: call("GET"),
    post: call("POST"),
    patch: call("PATCH"),
    put: call("PUT"),
    del: call("DELETE"),
  };
}

export type Api = ReturnType<typeof api>;

export async function makeClient(a: Api, name = "Acme"): Promise<string> {
  return (await a.post("/clients", { name })).json().id;
}

export async function makeProject(
  a: Api,
  clientId: string,
  extra: object = {},
): Promise<string> {
  const res = await a.post("/projects", { clientId, title: "P", ...extra });
  if (res.statusCode !== 201) throw new Error(`project: ${res.body}`);
  return res.json().id;
}

export async function makeMilestone(a: Api, projectId: string, title = "M") {
  const res = await a.post(`/projects/${projectId}/milestones`, { title });
  if (res.statusCode !== 201) throw new Error(`milestone: ${res.body}`);
  return res.json() as { id: string; position: number };
}
