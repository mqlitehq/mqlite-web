// mqlite broker client. Every operation is one JSON POST to /mqlite.v1.<Service>/<Method>
// with a Bearer token; a single rpc() wrapper attaches auth and intercepts 401 (wiping
// the token and signalling a re-login). Base URL is '' = same origin (the broker can
// embed and serve this console at /ui/); the dev server proxies the RPC paths.

import { getToken, clearToken, setToken, getEndpoint } from './auth.js'
import type {
  AccessKey,
  BrokerStatus,
  CreateKeyRequest,
  CreateKeyResult,
  KeyPage,
  Discovery,
  FilterTest,
  MessageState,
  Metrics,
  QueueConfig,
  QueueInfo,
  Subscription,
  WireMessage,
} from './types.js'

// Target broker base URL: the stored endpoint (standalone connector → any broker), else a
// build-time default, else '' = same origin (embedded: the broker serves us at /ui/).
function base(): string {
  return getEndpoint() || (import.meta.env.VITE_MQLITE_URL as string | undefined) || ''
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

// re-login signal (the app subscribes to bounce back to the login screen on 401).
type Listener = () => void
const unauthListeners = new Set<Listener>()
export function onUnauthorized(fn: Listener): () => void {
  unauthListeners.add(fn)
  return () => unauthListeners.delete(fn)
}

async function rpc<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const tok = token ?? getToken()
  const res = await fetch(base() + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  if (res.status === 401) {
    clearToken()
    unauthListeners.forEach((fn) => fn())
    throw new ApiError(401, 'unauthenticated', 'invalid or missing token')
  }
  const text = await res.text()
  let json: Record<string, unknown> = {}
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      /* non-JSON body */
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, (json.code as string) ?? 'error', (json.message as string) ?? res.statusText)
  }
  return json as T
}

// ── base64 <-> UTF-8 text (message bodies are base64 on the wire) ──────────────
export function encodeBody(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
}
export function decodeBody(b64?: string): string {
  if (!b64) return ''
  try {
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return b64
  }
}
export function bodySize(b64?: string): number {
  if (!b64) return 0
  try {
    return atob(b64).length
  } catch {
    return 0
  }
}

// ── open endpoint: broker discovery (no auth) ──────────────────────────────────
export async function discovery(): Promise<Discovery | null> {
  try {
    const res = await fetch(base() + '/', { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null
    return (await res.json()) as Discovery
  } catch {
    return null
  }
}

// ── auth: validate a token by making one authed call ───────────────────────────
export async function login(token: string): Promise<void> {
  try {
    await rpc('/mqlite.v1.AdminService/ListQueues', {}, token)
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw new ApiError(
        403,
        'permission_denied',
        'This admin console requires a manage key or a configured administrator token. Send and listen keys work with the API, SDK, and CLI.',
      )
    }
    throw error
  }
  setToken(token)
}

// ── AdminService ───────────────────────────────────────────────────────────────
export async function listQueues(): Promise<QueueInfo[]> {
  const r = await rpc<{ queues?: QueueInfo[] }>('/mqlite.v1.AdminService/ListQueues', {})
  return r.queues ?? []
}
export function createQueue(name: string, config: QueueConfig = {}): Promise<unknown> {
  return rpc('/mqlite.v1.AdminService/CreateQueue', { name, config })
}
export function subscribe(topic: string, name: string, expr?: string): Promise<unknown> {
  return rpc('/mqlite.v1.AdminService/Subscribe', {
    topic,
    name,
    ...(expr ? { filter: { expr } } : {}),
  })
}
// Desensitized runtime snapshot (backend, redacted location, latency, footprint, …).
export function status(): Promise<BrokerStatus> {
  return rpc<BrokerStatus>('/mqlite.v1.AdminService/Status', {})
}
// Every subscription with its topic + filter expression — what ListQueues omits.
export async function listSubscriptions(): Promise<Subscription[]> {
  const r = await rpc<{ subscriptions?: Subscription[] }>('/mqlite.v1.AdminService/ListSubscriptions', {})
  return r.subscriptions ?? []
}

export interface FilterSample {
  subject?: string
  properties?: Record<string, string>
  bodyText?: string
}
// Dry-run a filter expression. Without a sample it only compiles (validate-as-you-type);
// with one it evaluates exactly as publish-time fan-out would. Nothing is enqueued.
export function testFilter(expr: string, sample?: FilterSample): Promise<FilterTest> {
  let message: Partial<WireMessage> | undefined
  if (sample) {
    message = {}
    if (sample.subject) message.subject = sample.subject
    if (sample.properties && Object.keys(sample.properties).length) message.properties = sample.properties
    if (sample.bodyText) message.body = encodeBody(sample.bodyText)
  }
  return rpc<FilterTest>('/mqlite.v1.AdminService/TestFilter', { expr, ...(message ? { message } : {}) })
}
export async function redrive(
  queue: string,
  opts: { target?: string; max?: number; older_than_ms?: number; rate_per_sec?: number } = {},
): Promise<number> {
  const r = await rpc<{ moved?: number }>('/mqlite.v1.AdminService/Redrive', { queue, ...opts })
  return r.moved ?? 0
}
export async function purge(queue: string, opts: { max?: number; older_than_ms?: number } = {}): Promise<number> {
  const r = await rpc<{ purged?: number }>('/mqlite.v1.AdminService/Purge', { queue, ...opts })
  return r.purged ?? 0
}

// ── QueueService ─────────────────────────────────────────────────────────────
export function stats(queue: string): Promise<Metrics> {
  return rpc<Metrics>('/mqlite.v1.QueueService/Stats', { queue })
}
export async function send(
  queue: string,
  msg: Partial<WireMessage> & { bodyText?: string; ttlMs?: number; scheduledEnqueueTimeMs?: number },
): Promise<number[]> {
  const { bodyText, ttlMs, scheduledEnqueueTimeMs, ...rest } = msg
  const wire: WireMessage = { ...rest }
  if (bodyText !== undefined) wire.body = encodeBody(bodyText)
  const r = await rpc<{ seq_numbers?: number[] }>('/mqlite.v1.QueueService/Send', {
    queue,
    messages: [wire],
    ...(ttlMs && ttlMs > 0 ? { ttl_ms: ttlMs } : {}), // SendRequest.ttl_ms applies to the batch
    ...(scheduledEnqueueTimeMs && scheduledEnqueueTimeMs > 0
      ? { scheduled_enqueue_time_ms: scheduledEnqueueTimeMs } // schedules the message (→ scheduled state)
      : {}),
  })
  return r.seq_numbers ?? []
}
// Delete a not-yet-activated scheduled message by seq (the one clean single-message op).
export function cancel(queue: string, seq: number): Promise<unknown> {
  return rpc('/mqlite.v1.QueueService/Cancel', { queue, seq_number: seq })
}
export async function peek(queue: string, state: MessageState | '', max = 50): Promise<WireMessage[]> {
  const r = await rpc<{ messages?: WireMessage[] }>('/mqlite.v1.QueueService/Peek', {
    queue,
    ...(state ? { state } : {}),
    max,
  })
  return r.messages ?? []
}
// Pull specific deferred messages back by seq (they hold their lock until you settle).
export async function receiveDeferred(queue: string, seqs: number[]): Promise<WireMessage[]> {
  const r = await rpc<{ messages?: WireMessage[] }>('/mqlite.v1.QueueService/ReceiveDeferred', {
    queue,
    seq_numbers: seqs,
  })
  return r.messages ?? []
}
export async function receive(queue: string, max = 10, waitMs = 0): Promise<WireMessage[]> {
  const r = await rpc<{ messages?: WireMessage[] }>('/mqlite.v1.QueueService/Receive', {
    queue,
    max_messages: max,
    wait_time_ms: waitMs,
  })
  return r.messages ?? []
}
export function complete(queue: string, seq: number, token: string): Promise<unknown> {
  return rpc('/mqlite.v1.QueueService/Complete', { queue, seq_number: seq, lock_token: token })
}
export function abandon(queue: string, seq: number, token: string, delayMs = 0): Promise<unknown> {
  return rpc('/mqlite.v1.QueueService/Abandon', { queue, seq_number: seq, lock_token: token, delay_ms: delayMs })
}
export function reject(queue: string, seq: number, token: string, reason = 'rejected via console'): Promise<unknown> {
  return rpc('/mqlite.v1.QueueService/Reject', {
    queue,
    seq_number: seq,
    lock_token: token,
    dead_letter_reason: reason,
  })
}
export function defer(queue: string, seq: number, token: string): Promise<unknown> {
  return rpc('/mqlite.v1.QueueService/Defer', { queue, seq_number: seq, lock_token: token })
}

// ── AuthService ─────────────────────────────────────────────────────────────
// IDs are retained by the caller before this single request. Never retry issuance:
// a failed response does not prove the server failed to create the credential.
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function keyMetadata(value: unknown): value is AccessKey {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !/^[0-9a-f]{32}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.trim() !== value.name ||
    new TextEncoder().encode(value.name).length > 128 ||
    value.name.includes('\0') ||
    !Array.isArray(value.permissions) ||
    !value.permissions.every((permission) => typeof permission === 'string')
  )
    return false
  if (!['["send"]', '["listen"]', '["send","listen"]', '["manage"]'].includes(JSON.stringify(value.permissions)))
    return false
  if (new TextDecoder().decode(new TextEncoder().encode(value.name)) !== value.name) return false
  if (
    typeof value.created_at_ms !== 'number' ||
    typeof value.expires_at_ms !== 'number' ||
    (value.expires_at_ms !== 0 && value.expires_at_ms <= value.created_at_ms)
  )
    return false
  return ['created_at_ms', 'expires_at_ms', 'revoked_at_ms'].every(
    (field) => typeof value[field] === 'number' && Number.isSafeInteger(value[field]) && value[field] >= 0,
  )
}

function invalidKeyResponse(): ApiError {
  return new ApiError(
    502,
    'invalid_response',
    'The broker returned an invalid key response. Do not assume the operation failed; reconcile its public ID before retrying.',
  )
}

export async function createAccessKey(request: CreateKeyRequest): Promise<CreateKeyResult> {
  const result = await rpc<unknown>('/mqlite.v1.AuthService/CreateKey', request)
  const permissions = request.permissions.includes('manage')
    ? ['manage']
    : ['send', 'listen'].filter((permission) => request.permissions.includes(permission))
  if (
    !record(result) ||
    !keyMetadata(result.key) ||
    typeof result.token !== 'string' ||
    !/^mqk_[0-9a-f]{64}$/.test(result.token) ||
    result.key.id !== request.id ||
    result.key.name !== request.name ||
    result.key.revoked_at_ms !== 0 ||
    result.key.expires_at_ms !== (request.expires_at_ms ?? 0) ||
    result.key.permissions.join(',') !== permissions.join(',')
  ) {
    throw invalidKeyResponse()
  }
  return { key: result.key, token: result.token }
}

export async function listAccessKeys(afterID = '', limit = 25, sort: '' | 'id_asc' | 'created_desc' = 'id_asc'): Promise<KeyPage> {
  const result = await rpc<unknown>('/mqlite.v1.AuthService/ListKeys', { after_id: afterID, limit, sort })
  if (!record(result) || !Array.isArray(result.keys) || result.keys.length > limit) throw invalidKeyResponse()
  const seen = new Set<string>()
  let previous: AccessKey | undefined
  for (const key of result.keys) {
    if (!keyMetadata(key) || key.id === afterID || seen.has(key.id)) throw invalidKeyResponse()
    if (sort === 'created_desc') {
      if (previous && (
        key.created_at_ms > previous.created_at_ms ||
        (key.created_at_ms === previous.created_at_ms && key.id >= previous.id)
      )) throw invalidKeyResponse()
    } else if (key.id <= (previous?.id ?? afterID)) {
      throw invalidKeyResponse()
    }
    seen.add(key.id)
    previous = key
  }
  if (
    result.next_after_id !== undefined &&
    (typeof result.next_after_id !== 'string' ||
      !result.keys.length ||
      result.next_after_id !== previous?.id ||
      result.next_after_id === afterID ||
      (sort !== 'created_desc' && result.next_after_id <= afterID) ||
      result.keys.length !== limit)
  )
    throw invalidKeyResponse()
  return { keys: result.keys, ...(result.next_after_id !== undefined ? { next_after_id: result.next_after_id } : {}) }
}

export async function revokeAccessKey(id: string): Promise<{ ok: boolean }> {
  const result = await rpc<unknown>('/mqlite.v1.AuthService/RevokeKey', { id })
  if (!record(result) || result.ok !== true) throw invalidKeyResponse()
  return { ok: true }
}
