import {
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../env.js";

const KEY_LENGTH = 32;
const ACCESS_TTL_MS = 12 * 60 * 60 * 1000;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

// Пароль порталу зберігається як scrypt-хеш із сіллю: у базі пароля немає.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await derive(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const sign = (projectId: string, passwordHash: string, exp: number) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`portal:${projectId}:${passwordHash}:${exp}`)
    .digest("base64url");

// Токен доступу після введення пароля. Прив'язаний до хеша пароля: зміна пароля його анулює.
export function issueAccessToken(
  projectId: string,
  passwordHash: string,
  now = Date.now(),
) {
  const exp = now + ACCESS_TTL_MS;
  return `${exp}.${sign(projectId, passwordHash, exp)}`;
}

export function verifyAccessToken(
  token: string | undefined,
  projectId: string,
  passwordHash: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  const expected = Buffer.from(sign(projectId, passwordHash, exp));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
