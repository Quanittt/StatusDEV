// Перевірка R2 (задача B1).
// Запуск із папки api:  npx tsx scripts/r2-test.ts
import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error("Не вистачає змінних R2_* в api/.env");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// 1. Завантаження файлу з Node.js
const key = "test/hello.txt";
await s3.send(
  new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: `hello from StatusDEV, ${new Date().toISOString()}`,
    ContentType: "text/plain",
  }),
);
console.log(`1. Завантажено: ${key}`);

// 2. Перевірка, що файл справді в бакеті
const list = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: "test/" }));
console.log("2. Файли в test/:", list.Contents?.map((o) => `${o.Key} (${o.Size} B)`));

// 3. Читання назад
const got = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
console.log("3. Вміст:", await got.Body?.transformToString());

// 4. Presigned URL для перевірки CORS із браузера (діє 10 хвилин)
const putUrl = await getSignedUrl(
  s3,
  new PutObjectCommand({ Bucket: R2_BUCKET, Key: "test/from-browser.txt", ContentType: "text/plain" }),
  { expiresIn: 600 },
);
console.log("\n4. Для перевірки CORS встав у консоль браузера на http://localhost:5173:\n");
console.log(
  `await fetch(${JSON.stringify(putUrl)}, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "hello from browser" }).then(r => console.log("Статус:", r.status))`,
);
