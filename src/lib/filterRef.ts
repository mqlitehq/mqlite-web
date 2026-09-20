// One source of truth for the subscription-filter (expr) reference, rendered two ways:
// a human panel (FilterReference) and a plain-text block for an AI (filterRefText).
// Mirrors mqlite/docs/concepts.html; every example here is verified against the broker.

export interface RefRow {
  expr: string
  desc: string
}
export interface RefSection {
  title: string
  intro?: string
  rows?: RefRow[]
  note?: string
}

export const FILTER_INTRO =
  'A subscription filter is one expr-lang boolean expression, evaluated per message at ' +
  'publish time — the subscription receives a copy only when it is true. An empty filter ' +
  'matches everything. It is type-checked when you subscribe (a typo or unknown name is ' +
  'rejected then), and if it errors at runtime it fails closed (the message is not routed).'

export const FILTER_REF: RefSection[] = [
  {
    title: 'Message fields',
    intro: 'The message’s own fields. properties values are always strings.',
    rows: [
      { expr: 'subject == "orders.created"', desc: 'routing label (ASB Label)' },
      { expr: 'properties["tier"] == "gold"', desc: 'custom header (string); absent key → ""' },
      { expr: '"tier" in properties', desc: 'header presence' },
      { expr: 'group_id == "acct-42"', desc: 'ordering / session key' },
      { expr: 'content_type == "application/json"', desc: 'message content type' },
      { expr: 'correlation_id != ""', desc: 'also: message_id, reply_to' },
    ],
  },
  {
    title: 'Derived',
    intro: 'Computed from the message; always defined (never error on absence).',
    rows: [
      { expr: 'subject_parts[0] == "orders"', desc: '"orders.eu.new" → ["orders","eu","new"]' },
      { expr: 'len(subject_parts) >= 2 && subject_parts[1] == "eu"', desc: 'topic hierarchy' },
      { expr: 'body_size < 4096', desc: 'body byte length — route by size, not content' },
      { expr: '"tier" in property_keys', desc: 'property_keys = sorted property names' },
    ],
  },
  {
    title: 'Body content',
    intro: 'Route on the payload. Only projected when referenced, so filters that ignore the body pay nothing.',
    rows: [
      { expr: 'body_text contains "urgent"', desc: 'raw body as text; "" for empty body' },
      { expr: 'body_json.amount > 100', desc: 'body decoded as JSON object (already typed)' },
      { expr: '"amount" in body_json && body_json.amount > 100', desc: 'guard an optional field' },
    ],
    note:
      'body_json is decoded only when content_type looks like JSON (or is unset); a non-JSON, ' +
      'empty, or non-object body yields {}. Reaching into an ABSENT field (body_json.amount with ' +
      'no amount) is nil, and comparing nil is a runtime error → fails closed. Guard with "k" in body_json.',
  },
  {
    title: 'Types & conversion',
    intro:
      'body_json fields keep their JSON type (number/bool/string). properties and subject are ' +
      'ALWAYS strings — convert before comparing numerically.',
    rows: [
      { expr: 'int(properties["amount"]) > 250', desc: 'string property → integer' },
      { expr: 'float(properties["price"]) >= 9.99', desc: 'string property → float' },
      { expr: '"amount" in properties && int(properties["amount"]) > 250', desc: 'guard: "" / absent would error' },
      { expr: 'body_json.amount > 250', desc: 'a number in the BODY needs no conversion' },
      { expr: 'string(body_json.code) == "200"', desc: 'number → string' },
      { expr: 'properties["amount"] matches "^[0-9]+$"', desc: 'or keep it a string and regex-match' },
    ],
    note:
      'int("") and int("abc") error (→ fails closed), so guard a property that may be missing or ' +
      'non-numeric with a presence check or a matches "^[0-9]+$" test first.',
  },
  {
    title: 'Operators & functions',
    rows: [
      { expr: 'a == b · a != b · < <= > >=', desc: 'comparison' },
      { expr: 'a && b · a || b · !a (or and / or / not)', desc: 'boolean' },
      { expr: '"x" in list · "k" in map', desc: 'membership' },
      { expr: 'subject startsWith "orders."', desc: 'also endsWith, contains' },
      { expr: 'subject matches "^orders\\\\.(eu|us)\\\\."', desc: 'regex match' },
      { expr: 'lower(subject) · upper(s) · trim(s)', desc: 'string helpers' },
      { expr: 'len(x) · all(xs, # > 0) · any(xs, # == "eu")', desc: 'collections' },
    ],
  },
  {
    title: 'Durations & time',
    intro:
      'enqueued_at and visible_at are the message’s own timestamps (UTC). Subtract for a duration. ' +
      'now() reads the wall clock; prefer enqueued_at as the publish-time reference for repeatable routing.',
    rows: [
      { expr: 'visible_at - enqueued_at > days(1)', desc: 'delayed more than a day' },
      { expr: 'enqueued_at.Hour() >= 9 && enqueued_at.Hour() <= 21', desc: 'publish-hour window' },
      { expr: 'visible_at - enqueued_at > duration("1d12h")', desc: 'seconds/minutes/hours/days/weeks(); d=24h, w=7d' },
    ],
    note: 'No month/year unit (ambiguous as fixed spans) — use days(30) for "older than a month".',
  },
]

// A complete copy-pasteable plain-text spec — for handing to an AI writing filters.
export function filterRefText(): string {
  const lines: string[] = []
  lines.push('mqlite subscription filter (expr-lang) reference')
  lines.push('='.repeat(48))
  lines.push('')
  lines.push(FILTER_INTRO)
  for (const s of FILTER_REF) {
    lines.push('')
    lines.push(`## ${s.title}`)
    if (s.intro) lines.push(s.intro)
    if (s.rows) {
      lines.push('')
      for (const r of s.rows) lines.push(`  ${r.expr}`.padEnd(58) + `# ${r.desc}`)
    }
    if (s.note) {
      lines.push('')
      lines.push(`note: ${s.note}`)
    }
  }
  lines.push('')
  lines.push('Empty filter = match all. Filter must be boolean. No file or network I/O; ' + 'runtime errors fail closed (message not routed).')
  return lines.join('\n')
}
