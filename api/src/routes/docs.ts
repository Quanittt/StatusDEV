import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { buildOpenApi } from "../openapi.js";

const SWAGGER_UI_VERSION = "5.17.14";

const page = `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StatusDEV API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
</head>
<body>
  <div id="ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: "/openapi.json", dom_id: "#ui", deepLinking: true });
  </script>
</body>
</html>`;

// Документація API: сама специфікація і Swagger UI. Вмикається через DOCS_ENABLED.
export async function docsRoutes(app: FastifyInstance) {
  const spec = buildOpenApi(env.API_URL ?? `http://localhost:${env.PORT}`);

  app.get("/openapi.json", async () => spec);
  app.get("/docs", async (_req, reply) => reply.type("text/html").send(page));
}
