export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

// Єдиний формат помилок API: { error: { code, message, details? } }.
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// Наш API: { error: { code, message } }. Better Auth (/api/auth/*): { code, message }.
interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown }
  code?: string
  message?: string
}

// Better Auth повертає англійські повідомлення, тому відомі коди перекладаємо.
const AUTH_MESSAGES: Record<string, string> = {
  PASSWORD_TOO_SHORT: 'Пароль занадто короткий: потрібно щонайменше 8 символів',
  PASSWORD_TOO_LONG: 'Пароль занадто довгий: максимум 128 символів',
  INVALID_EMAIL: 'Некоректна адреса email',
  INVALID_EMAIL_OR_PASSWORD: 'Невірний email або пароль',
  USER_ALREADY_EXISTS: 'Користувач з таким email уже існує',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Користувач з таким email уже існує',
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // cookie сесії Better Auth ходить разом із запитами
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (res.status === 204) return undefined as T

  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const b = body as ErrorBody | null
    const e = b?.error ?? b
    const code = e?.code ?? 'UNKNOWN'
    throw new ApiError(
      res.status,
      code,
      AUTH_MESSAGES[code] ?? e?.message ?? `Помилка ${res.status}`,
      b?.error?.details,
    )
  }
  return body as T
}

export const http = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, data?: unknown) =>
    api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    api<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    api<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
}
