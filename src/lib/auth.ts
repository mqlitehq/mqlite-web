// Token-based auth. The broker authenticates every RPC with `Authorization: Bearer
// <token>` — so "logging in" is just holding a valid broker token and attaching it.
// We keep it in sessionStorage (cleared when the tab closes) and the api layer wipes
// it + signals a re-login on any 401.

const KEY = 'mqlite_token'
const ENDPOINT_KEY = 'mqlite_endpoint'

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

// The broker this console talks to. Empty = same origin (the embedded case: the broker
// serves the console at /ui/). A full URL points it at *any* mqlite broker — the console
// is a standalone connector. Remembered across sessions (localStorage); not sensitive.
export function getEndpoint(): string {
  return localStorage.getItem(ENDPOINT_KEY) ?? ''
}

export function setEndpoint(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, '') // no trailing slash
  if (trimmed) localStorage.setItem(ENDPOINT_KEY, trimmed)
  else localStorage.removeItem(ENDPOINT_KEY)
}
