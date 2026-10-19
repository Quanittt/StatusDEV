import {
  AddMemberSchema,
  CreateClientSchema,
  CreateCommentSchema,
  CreateDocumentSchema,
  CreateFileSchema,
  CreateMilestoneSchema,
  CreatePortalCommentSchema,
  CreateProjectSchema,
  PortalDocumentResponseSchema,
  PortalMilestoneResponseSchema,
  PortalUnlockSchema,
  PresignFileSchema,
  PresignLogoSchema,
  ReorderMilestonesSchema,
  SendMessageSchema,
  SetLogoSchema,
  ShareSettingsSchema,
  UpdateClientSchema,
  UpdateMilestoneSchema,
  UpdateProfileSchema,
  UpdateProjectSchema,
  WebhookSettingsSchema,
} from "@statusdev/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Опис API збирається з тих самих Zod-схем, якими маршрути перевіряють запити:
// тіла запитів не можуть розійтись з документацією. Список операцій звіряється з
// реальними маршрутами в test/openapi.test.ts.

type Method = "get" | "post" | "put" | "patch" | "delete";

interface Operation {
  method: Method;
  path: string; // у стилі Fastify: /projects/:id
  tag: string;
  summary: string;
  /** Потрібна сесія власника (cookie Better Auth). */
  auth?: boolean;
  body?: z.ZodTypeAny;
  query?: z.ZodObject<z.ZodRawShape>;
  /** Успішний статус; за замовчуванням 200. */
  status?: 200 | 201 | 204;
  description?: string;
  /** Додаткові статуси помилок цього маршруту. */
  errors?: number[];
}

const uuid = z.string().uuid();

const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

const PortalHeaderNote =
  "Якщо проєкт має пароль, передайте токен із `/portal/{token}/unlock` у заголовку `X-Portal-Access`.";

const o = (op: Operation): Operation => op;

export const OPERATIONS: Operation[] = [
  o({ method: "get", path: "/health", tag: "Служебні", summary: "Перевірка, що API і база живі", description: "Повертає 503, якщо база недоступна." }),

  // Better Auth: тіла описані вручну, бо схему веде сама бібліотека.
  o({ method: "post", path: "/api/auth/sign-up/email", tag: "Автентифікація", summary: "Реєстрація власника", body: z.object({ name: z.string(), email: z.string().email(), password: z.string().min(8) }) }),
  o({ method: "post", path: "/api/auth/sign-in/email", tag: "Автентифікація", summary: "Вхід (ставить cookie сесії)", body: z.object({ email: z.string().email(), password: z.string() }) }),
  o({ method: "post", path: "/api/auth/sign-out", tag: "Автентифікація", summary: "Вихід", body: z.object({}) }),

  o({ method: "get", path: "/me", tag: "Профіль", summary: "Поточний власник і бренд", auth: true }),
  o({ method: "patch", path: "/me", tag: "Профіль", summary: "Назва й колір бренду для порталу", auth: true, body: UpdateProfileSchema }),
  o({ method: "post", path: "/me/logo/presign", tag: "Профіль", summary: "Адреса для завантаження логотипу в R2", auth: true, body: PresignLogoSchema, description: "Далі PUT файлу на `uploadUrl`, потім `PUT /me/logo`." }),
  o({ method: "put", path: "/me/logo", tag: "Профіль", summary: "Підтвердити завантажений логотип", auth: true, body: SetLogoSchema }),
  o({ method: "delete", path: "/me/logo", tag: "Профіль", summary: "Видалити логотип", auth: true, status: 204 }),

  o({ method: "get", path: "/me/integrations", tag: "Інтеграції", summary: "Стан Telegram і вебхука", auth: true }),
  o({ method: "post", path: "/me/integrations/telegram/link", tag: "Інтеграції", summary: "Код і посилання для підключення Telegram", auth: true, status: 201 }),
  o({ method: "delete", path: "/me/integrations/telegram", tag: "Інтеграції", summary: "Відключити Telegram", auth: true, status: 204 }),
  o({ method: "put", path: "/me/integrations/webhook", tag: "Інтеграції", summary: "Задати адресу вебхука (null вимикає)", auth: true, body: WebhookSettingsSchema, description: "Запити підписані заголовком `X-StatusDEV-Signature: sha256=<HMAC тіла секретом>`." }),
  o({ method: "post", path: "/me/integrations/test", tag: "Інтеграції", summary: "Надіслати тестове сповіщення в усі канали", auth: true }),

  o({ method: "get", path: "/clients", tag: "Клієнти", summary: "Список клієнтів", auth: true }),
  o({ method: "post", path: "/clients", tag: "Клієнти", summary: "Створити клієнта", auth: true, body: CreateClientSchema, status: 201 }),
  o({ method: "patch", path: "/clients/:id", tag: "Клієнти", summary: "Змінити клієнта", auth: true, body: UpdateClientSchema }),
  o({ method: "delete", path: "/clients/:id", tag: "Клієнти", summary: "Видалити клієнта", auth: true, status: 204, errors: [409], description: "409, якщо в клієнта є проєкти." }),

  o({ method: "get", path: "/project-templates", tag: "Проєкти", summary: "Шаблони етапів для нового проєкту", auth: true }),
  o({ method: "get", path: "/projects", tag: "Проєкти", summary: "Список проєктів із прогресом", auth: true, query: z.object({ status: z.enum(["active", "paused", "done", "archived"]).optional() }) }),
  o({ method: "post", path: "/projects", tag: "Проєкти", summary: "Створити проєкт (за потреби з шаблону)", auth: true, body: CreateProjectSchema, status: 201, errors: [402], description: "402, якщо вичерпано ліміт тарифу Free." }),
  o({ method: "get", path: "/projects/:id", tag: "Проєкти", summary: "Проєкт з етапами", auth: true }),
  o({ method: "patch", path: "/projects/:id", tag: "Проєкти", summary: "Змінити проєкт", auth: true, body: UpdateProjectSchema, errors: [402] }),
  o({ method: "delete", path: "/projects/:id", tag: "Проєкти", summary: "Архівувати проєкт", auth: true, status: 204 }),
  o({ method: "get", path: "/projects/:id/activity", tag: "Проєкти", summary: "Історія подій проєкту", auth: true, query: Pagination }),

  o({ method: "post", path: "/projects/:id/milestones", tag: "Етапи", summary: "Додати етап", auth: true, body: CreateMilestoneSchema, status: 201 }),
  o({ method: "put", path: "/projects/:id/milestones/order", tag: "Етапи", summary: "Змінити порядок етапів", auth: true, body: ReorderMilestonesSchema }),
  o({ method: "patch", path: "/milestones/:id", tag: "Етапи", summary: "Змінити етап (статус, дата, дія для клієнта)", auth: true, body: UpdateMilestoneSchema }),
  o({ method: "delete", path: "/milestones/:id", tag: "Етапи", summary: "Видалити етап", auth: true, status: 204 }),

  o({ method: "get", path: "/projects/:id/comments", tag: "Коментарі", summary: "Коментарі проєкту (власника й клієнта)", auth: true }),
  o({ method: "post", path: "/projects/:id/comments", tag: "Коментарі", summary: "Написати коментар", auth: true, body: CreateCommentSchema, status: 201 }),

  o({ method: "get", path: "/projects/:id/files", tag: "Файли", summary: "Файли проєкту", auth: true }),
  o({ method: "post", path: "/projects/:id/files/presign", tag: "Файли", summary: "Крок 1: адреса для завантаження в R2", auth: true, body: PresignFileSchema }),
  o({ method: "post", path: "/projects/:id/files", tag: "Файли", summary: "Крок 2: зареєструвати завантажений файл", auth: true, body: CreateFileSchema, status: 201 }),
  o({ method: "get", path: "/files/:id/download", tag: "Файли", summary: "Тимчасове посилання на завантаження", auth: true }),
  o({ method: "delete", path: "/files/:id", tag: "Файли", summary: "Видалити файл", auth: true, status: 204 }),

  o({ method: "get", path: "/projects/:id/documents", tag: "Документи", summary: "Документи на погодження", auth: true }),
  o({ method: "post", path: "/projects/:id/documents", tag: "Документи", summary: "Надіслати файл проєкту на погодження клієнту", auth: true, body: CreateDocumentSchema, status: 201 }),
  o({ method: "delete", path: "/documents/:id", tag: "Документи", summary: "Скасувати запит на погодження", auth: true, status: 204 }),

  o({ method: "post", path: "/projects/:id/share", tag: "Портал", summary: "Створити посилання для клієнта (старе вимикається)", auth: true, body: ShareSettingsSchema, status: 201 }),
  o({ method: "patch", path: "/projects/:id/share", tag: "Портал", summary: "Змінити термін дії й пароль посилання", auth: true, body: ShareSettingsSchema }),
  o({ method: "delete", path: "/projects/:id/share", tag: "Портал", summary: "Вимкнути посилання", auth: true, status: 204 }),

  o({ method: "get", path: "/chat/projects", tag: "Чат", summary: "Проєкти, де я учасник чату", auth: true }),
  o({ method: "get", path: "/projects/:id/members", tag: "Чат", summary: "Команда проєкту", auth: true }),
  o({ method: "post", path: "/projects/:id/members", tag: "Чат", summary: "Додати PM або джуна за email", auth: true, body: AddMemberSchema, status: 201 }),
  o({ method: "delete", path: "/projects/:id/members/:userId", tag: "Чат", summary: "Прибрати учасника", auth: true, status: 204 }),
  o({ method: "get", path: "/projects/:id/chat/contacts", tag: "Чат", summary: "З ким я можу листуватись", auth: true }),
  o({ method: "get", path: "/projects/:id/chat/:userId/messages", tag: "Чат", summary: "Переписка з учасником", auth: true, query: Pagination }),
  o({ method: "post", path: "/projects/:id/chat/:userId/messages", tag: "Чат", summary: "Надіслати повідомлення", auth: true, body: SendMessageSchema, status: 201, errors: [429] }),

  o({ method: "get", path: "/portal/:token", tag: "Публічний портал", summary: "Дані проєкту для клієнта", description: PortalHeaderNote, errors: [401, 404, 410] }),
  o({ method: "post", path: "/portal/:token/unlock", tag: "Публічний портал", summary: "Ввести пароль порталу", body: PortalUnlockSchema, errors: [401, 429], description: "Повертає `accessToken` для заголовка `X-Portal-Access` (діє 12 годин)." }),
  o({ method: "post", path: "/portal/:token/comments", tag: "Публічний портал", summary: "Коментар клієнта", body: CreatePortalCommentSchema, status: 201, errors: [401, 404, 410, 429], description: PortalHeaderNote }),
  o({ method: "post", path: "/portal/:token/milestones/:milestoneId/response", tag: "Публічний портал", summary: "Прийняти етап або попросити правки", body: PortalMilestoneResponseSchema, errors: [401, 404, 410, 429], description: PortalHeaderNote }),
  o({ method: "get", path: "/portal/:token/documents/:documentId/download", tag: "Публічний портал", summary: "Тимчасове посилання на документ", errors: [401, 404, 410], description: PortalHeaderNote }),
  o({ method: "post", path: "/portal/:token/documents/:documentId/response", tag: "Публічний портал", summary: "Погодити документ іменем або попросити правки", body: PortalDocumentResponseSchema, errors: [401, 404, 410, 429], description: PortalHeaderNote }),
];

const toOpenApiPath = (p: string) => p.replace(/:(\w+)/g, "{$1}");
const schemaOf = (s: z.ZodTypeAny) =>
  zodToJsonSchema(s, { target: "openApi3", $refStrategy: "none" });

function paramsOf(op: Operation) {
  const names = [...op.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
  const params: object[] = names.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: name === "token" ? { type: "string" } : schemaOf(uuid),
  }));
  if (op.query) {
    const json = schemaOf(op.query) as {
      properties?: Record<string, object>;
      required?: string[];
    };
    for (const [name, schema] of Object.entries(json.properties ?? {})) {
      params.push({
        name,
        in: "query",
        required: json.required?.includes(name) ?? false,
        schema,
      });
    }
  }
  if (op.path.startsWith("/portal/") && !op.path.endsWith("/unlock")) {
    params.push({
      name: "X-Portal-Access",
      in: "header",
      required: false,
      schema: { type: "string" },
      description: "Токен доступу, якщо портал захищено паролем",
    });
  }
  return params;
}

const ERROR_TEXT: Record<number, string> = {
  400: "Невірні дані запиту",
  401: "Потрібен вхід (або пароль порталу)",
  402: "Ліміт тарифу вичерпано",
  404: "Не знайдено (чуже виглядає як неіснуюче)",
  409: "Конфлікт даних",
  410: "Термін дії посилання минув",
  429: "Забагато запитів",
};

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, object>> = {};

  for (const op of OPERATIONS) {
    const status = op.status ?? 200;
    const errors = new Set<number>([
      ...(op.body || op.query || op.path.includes(":") ? [400] : []),
      ...(op.auth ? [401] : []),
      ...(op.path.includes(":") && op.auth ? [404] : []),
      ...(op.errors ?? []),
    ]);

    const responses: Record<string, object> = {
      [status]: {
        description: status === 204 ? "Без вмісту" : "Успіх",
        ...(status === 204
          ? {}
          : { content: { "application/json": { schema: { type: "object" } } } }),
      },
    };
    for (const code of [...errors].sort()) {
      responses[code] = {
        description: ERROR_TEXT[code] ?? "Помилка",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/Error" } },
        },
      };
    }

    (paths[toOpenApiPath(op.path)] ??= {})[op.method] = {
      tags: [op.tag],
      summary: op.summary,
      ...(op.description && { description: op.description }),
      parameters: paramsOf(op),
      ...(op.body && {
        requestBody: {
          required: true,
          content: { "application/json": { schema: schemaOf(op.body) } },
        },
      }),
      ...(op.auth && { security: [{ sessionCookie: [] }] }),
      responses,
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "StatusDEV API",
      version: "0.0.1",
      description:
        "Портал клієнта для фрілансерів. Власники входять через Better Auth (cookie сесії), клієнти працюють із порталом за секретним токеном у посиланні.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "NOT_FOUND" },
                message: { type: "string" },
                details: { type: "object", additionalProperties: true },
              },
              required: ["code", "message"],
            },
          },
        },
      },
    },
    paths,
  };
}
