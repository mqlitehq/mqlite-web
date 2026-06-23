import type { ReactNode } from 'react'
import { bodySize, decodeBody } from '../lib/api'
import type { WireMessage } from '../lib/types'
import { Badge, Dot } from './ui'
import { Time } from './Time'
import { fmtBytes } from '../lib/format'

// Everything Peek already returns about a message — the "head" (ids, routing, timestamps,
// settlement) and properties, plus the full (pretty-printed) body. Shown when a row is
// expanded, so the list stays scannable but nothing is hidden.
export function MessageDetail({ m }: { m: WireMessage }) {
  const body = decodeBody(m.body)
  const size = bodySize(m.body)

  const head: { label: string; value: ReactNode }[] = []
  const add = (label: string, value: ReactNode, show = value !== undefined && value !== '' && value !== 0) => {
    if (show) head.push({ label, value })
  }
  add('seq', m.seq_number)
  add('delivery count', m.delivery_count, !!m.delivery_count)
  add('message id', m.message_id)
  add('correlation id', m.correlation_id)
  add('reply to', m.reply_to)
  add('group id', m.group_id)
  add('subject', m.subject)
  add('content type', m.content_type)
  add('enqueued', <Time ms={m.enqueued_at_ms} />, !!m.enqueued_at_ms)
  add('visible', <Time ms={m.visible_at_ms} />, !!m.visible_at_ms)
  add('expires', <Time ms={m.expires_at_ms} />, !!m.expires_at_ms)
  add('locked until', <Time ms={m.locked_until_ms} />, !!m.locked_until_ms)
  add('lock token', <span className="break-all">{m.lock_token}</span>)

  const props = Object.entries(m.properties ?? {})

  return (
    <div className="space-y-3 bg-surface-2/40 px-4 py-3 text-xs">
      <div className="flex items-center gap-2">
        {m.state && <Dot state={m.state} />}
        <span className="font-medium text-foreground">{m.state ?? 'message'}</span>
      </div>

      {/* head */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {head.map((f) => (
          <div key={f.label} className="flex gap-2">
            <span className="w-28 shrink-0 text-faint">{f.label}</span>
            <span className="min-w-0 break-words font-mono text-foreground/90">{f.value}</span>
          </div>
        ))}
      </div>

      {/* dead-letter reason */}
      {(m.dead_letter_reason || m.dead_letter_description) && (
        <div>
          <div className="mb-1 text-faint">dead-letter</div>
          <div className="text-danger/90">{m.dead_letter_reason}</div>
          {m.dead_letter_description && <div className="text-faint">{m.dead_letter_description}</div>}
        </div>
      )}

      {/* properties (the custom headers) */}
      <div>
        <div className="mb-1 text-faint">properties{props.length ? ` · ${props.length}` : ''}</div>
        {props.length === 0 ? (
          <span className="text-faint">none</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {props.map(([k, v]) => (
              <Badge key={k} tone="outline" className="font-mono">
                {k}=<span className="text-foreground">{v}</span>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* full body */}
      <div>
        <div className="mb-1 text-faint">body · {fmtBytes(size)}</div>
        {body ? (
          <pre className="max-h-72 overflow-auto rounded-lg bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90 ring-1 ring-border">
            {pretty(body)}
          </pre>
        ) : (
          <span className="text-faint">empty</span>
        )}
      </div>
    </div>
  )
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
