import type { Metrics } from './types.js'

export interface Histogram {
  bounds_seconds: number[]
  bucket_counts: number[]
  count: number
  sum_seconds: number
}
export interface QueueObservation extends Metrics {
  kind: string
  unexpected: number
}
export interface Observation {
  sampled_at_ms: number
  started_at_ms: number
  backend: string
  version: string
  access: 'manage' | 'monitor' | 'anonymous' | 'embedded'
  runtime: {
    schema_version: string
    ping_seconds: number
    read_available: boolean
    db_size_bytes: number
    db_size_available: boolean
  }
  collection: {
    state: 'available' | 'unavailable'
    last_success_at_ms: number
    duration_seconds: number
    error_code: string
  }
  queue_count: number
  subscription_count: number
  queues: QueueObservation[] | null
  messages: { queue: string; event: string; count: number }[]
  storage: {
    operations: { operation: string; outcome: string; error_code: string; duration: Histogram; retries: number }[]
    pool: {
      max_open: number
      open: number
      in_use: number
      idle: number
      wait_count: number
      wait_duration_seconds: number
    }
  }
  maintenance: {
    enabled: boolean
    task: string
    runs: number
    failures: number
    interrupted: number
    last_success_at_ms: number
    duration: Histogram
  }[]
  filters: { stage: string; count: number }[]
  http: {
    state: 'available' | 'not_applicable'
    requests: { rpc: string; code: string; count: number; duration_seconds: number }[]
    authentication: { outcome: string; count: number }[]
    handler_latency: {
      rpc: string
      buckets: { upper_bound_seconds: number; count: number }[]
      count: number
      sum_seconds: number
    }[]
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function fields(value: unknown, strings: string[], numbers: string[]): value is Record<string, unknown> {
  return (
    record(value) &&
    strings.every((key) => typeof value[key] === 'string') &&
    numbers.every(
      (key) =>
        typeof value[key] === 'number' &&
        Number.isFinite(value[key]) &&
        value[key] >= 0 &&
        (key.endsWith('_seconds') || Number.isSafeInteger(value[key])),
    )
  )
}
function rows(value: unknown, test: (value: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(test)
}
function histogram(value: unknown): value is unknown & Histogram {
  if (
    !fields(value, [], ['count', 'sum_seconds']) ||
    !rows(value.bounds_seconds, (n) => typeof n === 'number' && Number.isFinite(n) && n > 0) ||
    !rows(value.bucket_counts, (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
  )
    return false
  const bounds = value.bounds_seconds as number[]
  const counts = value.bucket_counts as number[]
  return (
    bounds.length > 0 &&
    bounds.length === counts.length &&
    bounds.every(
      (bound, i) =>
        (i === 0 || bound > bounds[i - 1]) &&
        counts[i] <= Number(value.count) &&
        (i === 0 || counts[i] >= counts[i - 1]),
    )
  )
}

function uniqueRows(value: unknown, keys: string[], required: string[] = []): boolean {
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  for (const row of value) {
    if (!record(row) || keys.some((key) => typeof row[key] !== 'string' || (!row[key] && key !== 'error_code')))
      return false
    const key = JSON.stringify(keys.map((field) => row[field]))
    if (seen.has(key)) return false
    seen.add(key)
  }
  return required.every((label) => value.some((row) => record(row) && row[keys[0]] === label))
}

// These finite domains mirror the canonical broker vocabulary. A missing row
// means unknown, including before the first event; it must not become a zero.
const messageEvents = [
  'enqueued',
  'scheduled',
  'deduplicated',
  'dedup_conflict',
  'delivered',
  'redelivered',
  'completed',
  'receive_deleted',
  'abandoned',
  'deferred',
  'rejected',
  'dead_lettered',
  'ttl_discarded',
  'retention_deleted',
  'purged',
  'canceled',
  'redriven',
  'lock_expired',
  'recovered',
  'activated',
]
const storageDimensions = ['read', 'write', 'transaction'].flatMap((operation) => [
  [operation, 'ok', ''],
  [operation, 'rejected', 'application'],
  [operation, 'outcome_unknown', 'outcome_unknown'],
  ...['canceled', 'closed', 'busy', 'connection', 'full', 'corrupt', 'io', 'other'].map((code) => [
    operation,
    'error',
    code,
  ]),
])
const requestRPCs = [
  ...[
    'Send',
    'Receive',
    'Complete',
    'CompleteBatch',
    'RenewBatch',
    'Abandon',
    'Reject',
    'Defer',
    'ReceiveDeferred',
    'Renew',
    'Schedule',
    'Cancel',
    'Peek',
    'Stats',
  ].map((name) => `QueueService/${name}`),
  ...[
    'CreateQueue',
    'Subscribe',
    'ListQueues',
    'ListSubscriptions',
    'TestFilter',
    'Redrive',
    'Purge',
    'Status',
    'Observe',
  ].map((name) => `AdminService/${name}`),
  ...['CreateKey', 'ListKeys', 'RevokeKey'].map((name) => `AuthService/${name}`),
]
const requestCodes = [
  'ok',
  'unauthenticated',
  'permission_denied',
  'key_conflict',
  'not_found',
  'already_exists',
  'name_conflict',
  'group_required',
  'invalid_argument',
  'message_too_large',
  'outcome_unknown',
  'canceled',
  'internal',
  'lock_lost',
  'unimplemented',
]

function completeCounters(snapshot: Observation): boolean {
  const storage = new Set(
    snapshot.storage.operations.map((r) => JSON.stringify([r.operation, r.outcome, r.error_code])),
  )
  if (!storageDimensions.every((dimension) => storage.has(JSON.stringify(dimension)))) return false
  if (snapshot.http.state === 'available') {
    const requests = new Set(snapshot.http.requests.map((r) => JSON.stringify([r.rpc, r.code])))
    if (!requestRPCs.every((rpc) => requestCodes.every((code) => requests.has(JSON.stringify([rpc, code])))))
      return false
  } else if (
    snapshot.http.requests.length ||
    snapshot.http.authentication.length ||
    snapshot.http.handler_latency.length
  ) {
    return false
  }
  const events = new Map((snapshot.queues ?? []).map((q) => [q.queue, new Set<string>()]))
  for (const row of snapshot.messages) {
    if (!events.has(row.queue)) events.set(row.queue, new Set())
    events.get(row.queue)!.add(row.event)
  }
  return [...events.values()].every((present) => messageEvents.every((event) => present.has(event)))
}

// Reject missing or malformed domains; HTTP 200 alone is not a healthy sample.
// Unknown fields remain forward compatible with newer brokers.
export function isObservation(value: unknown): value is Observation {
  if (
    !fields(
      value,
      ['backend', 'version', 'access'],
      ['sampled_at_ms', 'started_at_ms', 'queue_count', 'subscription_count'],
    ) ||
    !value.version ||
    !['memory', 'local', 'remote'].includes(value.backend as string) ||
    !['manage', 'monitor', 'anonymous', 'embedded'].includes(value.access as string) ||
    !fields(value.collection, ['state', 'error_code'], ['last_success_at_ms', 'duration_seconds']) ||
    !['available', 'unavailable'].includes(value.collection.state as string) ||
    !fields(value.runtime, ['schema_version'], ['ping_seconds', 'db_size_bytes']) ||
    typeof value.runtime.read_available !== 'boolean' ||
    typeof value.runtime.db_size_available !== 'boolean'
  )
    return false
  if (
    value.collection.state === 'unavailable'
      ? value.queues !== null
      : !rows(
          value.queues,
          (q) =>
            fields(
              q,
              ['queue', 'kind'],
              [
                'active',
                'locked',
                'deferred',
                'scheduled',
                'dead_lettered',
                'total',
                'oldest_message_age_ms',
                'unexpected',
              ],
            ) &&
            ['queue', 'subscription'].includes(q.kind as string) &&
            q.total ===
              Number(q.active) +
                Number(q.locked) +
                Number(q.deferred) +
                Number(q.scheduled) +
                Number(q.dead_lettered) +
                Number(q.unexpected),
        )
  )
    return false
  if (value.collection.state === 'available') {
    const queues = value.queues as QueueObservation[]
    if (
      value.collection.error_code !== '' ||
      new Set(queues.map((q) => q.queue)).size !== queues.length ||
      queues.some((q) => !q.queue) ||
      queues.filter((q) => q.kind === 'subscription').length !== value.subscription_count ||
      queues.filter((q) => q.kind !== 'subscription').length !== value.queue_count
    )
      return false
  } else if (!value.collection.error_code) return false
  if (
    !rows(value.messages, (r) => fields(r, ['queue', 'event'], ['count'])) ||
    !rows(value.filters, (r) => fields(r, ['stage'], ['count'])) ||
    !rows(
      value.maintenance,
      (r) =>
        fields(r, ['task'], ['runs', 'failures', 'interrupted', 'last_success_at_ms']) &&
        typeof r.enabled === 'boolean' &&
        histogram(r.duration) &&
        Number(r.failures) + Number(r.interrupted) <= Number(r.runs) &&
        r.duration.count === r.runs,
    ) ||
    !record(value.storage) ||
    !fields(value.storage.pool, [], ['max_open', 'open', 'in_use', 'idle', 'wait_count', 'wait_duration_seconds']) ||
    !rows(
      value.storage.operations,
      (r) => fields(r, ['operation', 'outcome', 'error_code'], ['retries']) && histogram(r.duration),
    )
  )
    return false
  if (
    !uniqueRows(value.messages, ['queue', 'event']) ||
    !uniqueRows(value.storage.operations, ['operation', 'outcome', 'error_code']) ||
    !uniqueRows(
      value.maintenance,
      ['task'],
      ['locks', 'scheduled', 'ttl', 'dedup', 'receipts', 'retention', 'reclaim'],
    ) ||
    !uniqueRows(value.filters, ['stage'], ['compile', 'evaluate'])
  )
    return false
  return (
    fields(value.http, ['state'], []) &&
    ['available', 'not_applicable'].includes(value.http.state as string) &&
    rows(value.http.requests, (r) => fields(r, ['rpc', 'code'], ['count', 'duration_seconds'])) &&
    rows(value.http.authentication, (r) => fields(r, ['outcome'], ['count'])) &&
    uniqueRows(value.http.requests, ['rpc', 'code']) &&
    uniqueRows(value.http.handler_latency, ['rpc']) &&
    uniqueRows(
      value.http.authentication,
      ['outcome'],
      value.http.state === 'available'
        ? ['success', 'missing', 'invalid', 'expired', 'revoked', 'permission_denied', 'backend_error']
        : [],
    ) &&
    rows(
      value.http.handler_latency,
      (r) =>
        fields(r, ['rpc'], ['count', 'sum_seconds']) &&
        rows(r.buckets, (b) => fields(b, [], ['upper_bound_seconds', 'count'])) &&
        histogram({
          bounds_seconds: (r.buckets as { upper_bound_seconds: number }[]).map((b) => b.upper_bound_seconds),
          bucket_counts: (r.buckets as { count: number }[]).map((b) => b.count),
          count: r.count,
          sum_seconds: r.sum_seconds,
        }),
    ) &&
    completeCounters(value as unknown as Observation)
  )
}

// Display projection only: sum the canonical gauges, including unexpected states.
// Incomplete collection has no aggregate, rather than a plausible partial zero.
export function queueTotals(metrics: Record<string, Metrics>, complete: boolean) {
  if (!complete) return null
  return Object.values(metrics).reduce(
    (a, m) => ({
      active: a.active + m.active,
      locked: a.locked + m.locked,
      scheduled: a.scheduled + m.scheduled,
      deferred: a.deferred + m.deferred,
      dlq: a.dlq + m.dead_lettered,
      total: a.total + m.total,
    }),
    { active: 0, locked: 0, scheduled: 0, deferred: 0, dlq: 0, total: 0 },
  )
}
