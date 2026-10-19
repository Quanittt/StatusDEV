import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

const UPLOAD_URL_TTL = 600;
const DOWNLOAD_URL_TTL = 300;
const VIEW_URL_TTL = 3600;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

// Content-Type і Content-Length входять у підпис: браузер не зможе підсунути інший тип чи розмір.
export function presignUpload(
  key: string,
  contentType: string,
  contentLength: number,
) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: UPLOAD_URL_TTL },
  );
}

export function presignDownload(key: string, fileName: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL },
  );
}

// Для показу в браузері (логотип): без Content-Disposition: attachment.
export function presignView(key: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
    { expiresIn: VIEW_URL_TTL },
  );
}

// Розмір об'єкта в сховищі або null, якщо його там немає.
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await s3.send(
      new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
    );
    return res.ContentLength ?? 0;
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
