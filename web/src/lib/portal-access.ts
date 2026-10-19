// Токен доступу до порталу з паролем живе лише у вкладці (sessionStorage) і прив'язаний до посилання.
const key = (token: string) => `portal-access:${token}`

export function getPortalAccess(token: string): string | null {
  try {
    return sessionStorage.getItem(key(token))
  } catch {
    return null
  }
}

export function setPortalAccess(token: string, access: string | null) {
  try {
    if (access) sessionStorage.setItem(key(token), access)
    else sessionStorage.removeItem(key(token))
  } catch {
    // sessionStorage недоступний (приватний режим): пароль доведеться вводити після оновлення
  }
}

export const portalHeaders = (token: string): Record<string, string> => {
  const access = getPortalAccess(token)
  return access ? { 'X-Portal-Access': access } : {}
}
