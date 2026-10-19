// Один запуск для локальної розробки: перевіряє .env і базу, накочує міграції,
// збирає shared і підіймає api та web разом. Ctrl+C зупиняє обидва.
//
//   npm run dev                 звичайний запуск
//   npm run dev -- --no-migrate не чіпати міграції
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "api");
const logsDir = join(root, "logs");
const skipMigrate = process.argv.includes("--no-migrate");
const isWin = process.platform === "win32";

// На Windows npm - це .cmd, тому потрібен shell. Команду передаємо одним рядком,
// бо Node застарів масив аргументів разом з shell: true (DEP0190).
const npmArgs = (args) =>
  isWin ? ["npm " + args.join(" "), [], { shell: true }] : ["npm", args, {}];

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function fail(message, hint) {
  console.error(`\n${c.red("✖")} ${message}`);
  if (hint) console.error(`  ${hint.split("\n").join("\n  ")}`);
  console.error();
  process.exit(1);
}

function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

// 1. api/.env
const envPath = join(apiDir, ".env");
if (!existsSync(envPath)) {
  fail(
    "Немає файлу api/.env.",
    "Створіть його з прикладу й заповніть значення:\n  cp api/.env.example api/.env",
  );
}
const env = readEnvFile(envPath);
if (!env.DATABASE_URL) {
  fail("У api/.env не задано DATABASE_URL.", "Приклад: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/statusdev");
}

// 2. Залежності
if (!existsSync(join(root, "node_modules"))) {
  fail("Не встановлені залежності.", "Виконайте з кореня репо: npm install");
}

// 3. База: підключення і, за потреби, міграції
const require = createRequire(join(apiDir, "package.json"));
const pg = require("pg");

async function checkDatabase() {
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 4000,
  });
  const target = (() => {
    try {
      const u = new URL(env.DATABASE_URL);
      return `${u.hostname}:${u.port || 5432}${u.pathname}`;
    } catch {
      return env.DATABASE_URL;
    }
  })();

  try {
    await client.connect();
  } catch (err) {
    fail(
      `Не вдалося підключитись до Postgres (${target}): ${err.message}`,
      "Підніміть базу: docker compose up -d\nабо перевірте DATABASE_URL (порт, пароль, назву бази) у api/.env",
    );
  }

  const journal = JSON.parse(
    readFileSync(join(apiDir, "drizzle", "meta", "_journal.json"), "utf8"),
  );
  let applied = 0;
  try {
    const res = await client.query(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    applied = res.rows[0].n;
  } catch {
    applied = 0; // таблиці міграцій ще немає: база порожня
  }
  await client.end();
  return { target, pending: journal.entries.length - applied };
}

const db = await checkDatabase();
console.log(`${c.green("✔")} База ${c.dim(db.target)} доступна`);

if (db.pending > 0) {
  if (skipMigrate) {
    console.log(`${c.yellow("!")} Є ${db.pending} нових міграцій, але --no-migrate: пропускаю`);
  } else {
    console.log(`${c.cyan("→")} Накочую ${db.pending} міграцій…`);
    const [cmd, args, opts] = npmArgs(["run", "db:migrate", "--workspace=api"]);
    const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
    if (res.status !== 0) fail("Міграції не застосувались (див. вивід вище).");
  }
} else {
  console.log(`${c.green("✔")} Міграції актуальні`);
}

// 4. shared має бути зібраний, інакше api і web не знайдуть типи
if (!existsSync(join(root, "shared", "dist", "index.js"))) {
  console.log(`${c.cyan("→")} Збираю shared…`);
  const [cmd, args, opts] = npmArgs(["run", "build:shared"]);
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
  if (res.status !== 0) fail("Не вдалося зібрати shared.");
}

// 5. api і web
mkdirSync(logsDir, { recursive: true });
const webLog = createWriteStream(join(logsDir, "web.log"), { flags: "a" });

const children = [];

function run(name, color, args, extraEnv = {}, logStream) {
  const [cmd, cmdArgs, opts] = npmArgs(args);
  const child = spawn(cmd, cmdArgs, {
    cwd: root,
    ...opts,
    // На POSIX запускаємо в окремій групі процесів, щоб зупинити все дерево одним сигналом.
    detached: !isWin,
    env: { ...process.env, FORCE_COLOR: "1", ...extraEnv },
  });
  children.push(child);

  const prefix = color(`[${name}]`);
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        out.write(`${prefix} ${line}\n`);
        logStream?.write(`${line}\n`);
      }
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${c.red("✖")} ${name} завершився з кодом ${code}, зупиняю решту`);
      stop(code ?? 1);
    }
  });
  return child;
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (isWin) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      // процес уже завершився
    }
  }
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

console.log(`${c.cyan("→")} Запускаю api та web. Логи також у ${c.dim("logs/")}\n`);
// API сам пише JSON-логи у файл (LOG_FILE), а вивід у консоль іде з префіксом.
run("api", c.cyan, ["run", "dev", "--workspace=api"], {
  NODE_ENV: "development",
  LOG_FILE: env.LOG_FILE ?? join(logsDir, "api.log"),
});
run("web", c.magenta, ["run", "dev", "--workspace=web"], {}, webLog);

setTimeout(() => {
  console.log(`
  ${c.green("api")}  http://localhost:${env.PORT ?? 3001}   ${c.dim("(документація: /docs)")}
  ${c.green("web")}  http://localhost:5173
`);
}, 2500);
