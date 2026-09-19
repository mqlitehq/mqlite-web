import { getEndpoint } from './auth.js'

// Only public correlation metadata belongs in storage. Secrets stay in memory.
export interface PendingKeyCreation {
  id: string
  name: string
  started_at_ms: number
  outcome: 'pending' | 'created' | 'unknown' | 'failed'
}

export function generateKeyID(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function pendingKeyStorageSlot(): string {
  const endpoint = getEndpoint() || (import.meta.env.VITE_MQLITE_URL as string | undefined) || window.location.origin
  return `mqlite_pending_key:${endpoint}`
}

export function readPendingKey(slot: string): PendingKeyCreation | null {
  const raw = sessionStorage.getItem(slot)
  if (!raw) return null
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object')
    throw new Error('The saved key request is unreadable. Preserve this tab before clearing its session storage.')
  const record = value as Partial<PendingKeyCreation>
  if (
    typeof record.id !== 'string' ||
    !/^[0-9a-f]{32}$/.test(record.id) ||
    typeof record.name !== 'string' ||
    typeof record.started_at_ms !== 'number' ||
    !['pending', 'created', 'unknown', 'failed'].includes(record.outcome ?? '')
  ) {
    throw new Error('The saved key request is unreadable. Preserve this tab before clearing its session storage.')
  }
  return record as PendingKeyCreation
}

export function retainPendingKey(slot: string, record: PendingKeyCreation): void {
  // Failure must stop issuance: a lost response needs this ID for reconciliation.
  sessionStorage.setItem(slot, JSON.stringify(record))
}

export function keyState(
  key: { expires_at_ms: number; revoked_at_ms: number },
  now = Date.now(),
): 'active' | 'expired' | 'revoked' {
  if (key.revoked_at_ms) return 'revoked'
  if (key.expires_at_ms && key.expires_at_ms <= now) return 'expired'
  return 'active'
}
