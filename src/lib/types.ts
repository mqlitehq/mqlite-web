// Wire shapes — mirror the broker's JSON contract (mqlite/wire). Times are epoch-ms.

export interface QueueInfo {
  name: string
  kind: string // "queue" | "subscription"
  lock_duration_ms: number
  max_delivery_count: number
  default_ttl_ms: number
  dedup_window_ms: number
}

export interface Metrics {
  queue: string
  active: number
  locked: number
  deferred: number
  scheduled: number
  dead_lettered: number
  total: number
  oldest_message_age_ms: number
}

export interface WireMessage {
  seq_number?: number
  state?: string
  body?: string // base64 in JSON
  message_id?: string
  correlation_id?: string
  reply_to?: string
  group_id?: string
  content_type?: string
  subject?: string
  properties?: Record<string, string>
  delivery_count?: number
  enqueued_at_ms?: number
  visible_at_ms?: number
  locked_until_ms?: number
  lock_token?: string
  dead_letter_reason?: string
  dead_letter_description?: string
}

export interface QueueConfig {
  kind?: string
  lock_duration_ms?: number
  max_delivery_count?: number
  default_ttl_ms?: number
  dead_letter_on_expire?: boolean
  dedup_window_ms?: number
  ordering_mode?: string
}

export interface Discovery {
  name?: string
  version?: string
  status?: string
  [k: string]: unknown
}

export type MessageState =
  | 'active'
  | 'locked'
  | 'deferred'
  | 'scheduled'
  | 'dead_lettered'

export interface Subscription {
  topic: string
  name: string
  expr: string // filter expression; "" = match all
}

export interface FilterTest {
  valid: boolean
  error?: string
  ran: boolean
  matched: boolean
}
