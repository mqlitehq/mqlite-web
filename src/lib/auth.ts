// Token-based auth. The broker authenticates every RPC with `Authorization: Bearer
// <token>` — so "logging in" is just holding a valid broker token and attaching it.
// We keep it in sessionStorage (cleared when the tab closes) and the api layer wipes
// it + signals a re-login on any 401.

const KEY = 'mqlite_token'

export function getToken(): string | null {
  return sessionStorage.getItem(KEY)
}

export function setToken(token: string): void {
  sessionStorage.setItem(KEY, token)
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY)
}

export function isAuthed(): boolean {
  return !!getToken()
}
