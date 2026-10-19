import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertWebhookUrl,
  deliverWebhook,
  isPrivateAddress,
  signBody,
} from "../src/lib/webhook.js";

describe("SSRF-захист вебхука", () => {
  it("IPv4, вбудований в IPv6, розпізнається в усіх формах запису", () => {
    for (const ip of [
      "::ffff:127.0.0.1",
      "::ffff:7f00:1", // так URL-парсер нормалізує [::ffff:127.0.0.1]
      "::ffff:a9fe:a9fe", // 169.254.169.254, метадані хмари
      "::ffff:a00:1", // 10.0.0.1
      "::ffff:c0a8:101", // 192.168.1.1
      "64:ff9b::7f00:1", // NAT64
      "2002:7f00:1::", // 6to4
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("::ffff:808:808")).toBe(false); // 8.8.8.8
  });

  it("assertWebhookUrl відхиляє нормалізований mapped-запис", async () => {
    // new URL("https://[::ffff:169.254.169.254]/").hostname === "[::ffff:a9fe:a9fe]"
    await expect(assertWebhookUrl("https://[::ffff:169.254.169.254]/")).rejects.toThrow(
      /внутрішню/,
    );
    await expect(assertWebhookUrl("https://[::ffff:10.0.0.1]/")).rejects.toThrow(/внутрішню/);
    await expect(assertWebhookUrl("https://8.8.8.8/hook")).resolves.toBeInstanceOf(URL);
  });
});

describe("відправка вебхука", () => {
  let server: http.Server;
  let base: string;
  const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  let respondWith: { status: number; location?: string } = { status: 200 };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = respondWith.status;
        if (respondWith.location) res.setHeader("Location", respondWith.location);
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const payload = { event: "test", occurredAt: "2030-01-01T00:00:00.000Z", data: { a: 1 } };

  it("шле JSON з підписом, який отримувач може перевірити секретом", async () => {
    respondWith = { status: 200 };
    received.length = 0;
    await deliverWebhook(`${base}/hook`, "whsec_test", payload);

    expect(received).toHaveLength(1);
    const { headers, body } = received[0];
    expect(JSON.parse(body)).toEqual(payload);
    expect(headers["x-statusdev-event"]).toBe("test");
    expect(headers["x-statusdev-signature"]).toBe(signBody("whsec_test", body));
    expect(headers["content-type"]).toBe("application/json");
  });

  it("не 2xx — помилка, редірект не виконується", async () => {
    respondWith = { status: 500 };
    await expect(deliverWebhook(`${base}/hook`, "s", payload)).rejects.toThrow(/500/);

    received.length = 0;
    respondWith = { status: 302, location: "http://169.254.169.254/latest" };
    await expect(deliverWebhook(`${base}/hook`, "s", payload)).rejects.toThrow(/302/);
    expect(received).toHaveLength(1); // за Location ніхто не ходив
  });
});
