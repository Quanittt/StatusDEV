import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors.js";
import { captureError } from "../lib/sentry.js";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Невірні дані запиту",
          details: err.flatten().fieldErrors,
        },
      });
    }

    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message } });
    }

    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply
        .status(status)
        .send({ error: { code: "BAD_REQUEST", message: (err as Error).message } });
    }

    req.log.error(err);
    captureError(err, { route: req.routeOptions?.url ?? "unknown" });
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL", message: "Внутрішня помилка сервера" } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply
      .status(404)
      .send({ error: { code: "NOT_FOUND", message: "Маршрут не знайдено" } });
  });
}
