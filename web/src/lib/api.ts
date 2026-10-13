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

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown }
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
    const e = (body as ErrorBody | null)?.error
    throw new ApiError(
      res.status,
      e?.code ?? 'UNKNOWN',
      e?.message ?? `Помилка ${res.status}`,
      e?.details,
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
