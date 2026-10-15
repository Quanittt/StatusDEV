import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";

export class RateLimitError extends AppError {
  constructor(message = "Забагато запитів. Спробуйте трохи пізніше") {
    super(429, "RATE_LIMITED", message);
  }
}

// Простий ліміт у пам'яті процесу: вікно `windowMs`, не більше `max` запитів на ключ.
// Для одного інстансу цього досить; при кількох інстансах ліміт треба винести в Redis.
export function rateLimit({
  max,
  windowMs,
  key,
}: {
  max: number;
  windowMs: number;
  key: (req: FastifyRequest) => string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Прибирає прострочені записи, щоб Map не росла безкінечно.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref();

  return async function limit(req: FastifyRequest, reply: FastifyReply) {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      reply.header("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      throw new RateLimitError();
    }
  };
}
