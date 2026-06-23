import { useState } from 'react'
import { send } from '../lib/api'
import { Button, Card, ErrorBanner, Input, Label, Select, Textarea } from './ui'
import { KVEditor, kvRecord, type KV } from './KVEditor'

// Publish to a topic — fans out to every subscription whose filter matches. Properties are
// entered as key/value rows because filters routinely key off them (`properties["tier"]`).
export function PublishPanel({
  topic,
  onPublished,
  bordered = true,
}: {
  topic: string
  onPublished: () => void
  bordered?: boolean
}) {
  const [subject, setSubject] = useState('orders.created')
  const [props, setProps] = useState<KV[]>([
    { k: 'region', v: 'eu' },
    { k: 'tier', v: 'gold' },
  ])
  const [body, setBody] = useState('{"amount": 250}')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [warn, setWarn] = useState('')
  const [err, setErr] = useState('')

  async function publish() {
    setBusy(true)
    setErr('')
    setNote('')
    setWarn('')
    const properties = kvRecord(props)
    try {
      const seqs = await send(topic, {
        ...(subject ? { subject } : {}),
        ...(Object.keys(properties).length ? { properties } : {}),
        bodyText: body,
      })
      // a topic publish returns seq 0 when no subscription filter matched — dropped.
      if (seqs.every((s) => s <= 0)) {
        setWarn('matched no subscription — the message was dropped (not delivered)')
      } else {
        setNote('published — routed to matching subscription(s)')
      }
      onPublished()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'publish failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={bordered ? 'space-y-3 border-b border-border bg-surface/50 px-4 py-3' : 'space-y-3'}>
      <div>
        <Label>subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="orders.created" />
      </div>
      <div>
        <Label>properties</Label>
        <KVEditor pairs={props} onChange={setProps} />
      </div>
      <div>
        <Label>body</Label>
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono" placeholder='{"amount": 250}' />
      </div>
      {err && <ErrorBanner message={err} />}
      {note && <p className="text-xs text-ok">✓ {note}</p>}
      {warn && <p className="text-xs text-warn">⚠ {warn}</p>}
      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={publish}>
          {busy ? 'publishing…' : `publish to ${topic}`}
        </Button>
      </div>
    </div>
  )
}

const TTL_UNITS = [
  { label: 'seconds', ms: 1000 },
  { label: 'minutes', ms: 60_000 },
  { label: 'hours', ms: 3_600_000 },
  { label: 'days', ms: 86_400_000 },
]

// Full message composer for a direct queue enqueue: every settable message field, an
// optional per-message TTL (blank = queue default; a message TTL is capped by it), and
// optional scheduling (a future enqueue time → the message lands in `scheduled` until then).
export function SendPanel({ queue, onClose, onSent }: { queue: string; onClose: () => void; onSent: () => void }) {
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [group, setGroup] = useState('')
  const [messageId, setMessageId] = useState('')
  const [correlationId, setCorrelationId] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [contentType, setContentType] = useState('')
  const [props, setProps] = useState<KV[]>([])
  const [ttl, setTtl] = useState('')
  const [ttlUnit, setTtlUnit] = useState(String(60_000))
  const [scheduleAt, setScheduleAt] = useState('') // datetime-local; blank = send now
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const scheduled = scheduleAt.trim() !== ''

  async function submit() {
    if (busy) return
    setBusy(true)
    setErr('')
    setOk('')
    const properties = kvRecord(props)
    const ttlMs = Number(ttl) > 0 ? Number(ttl) * Number(ttlUnit) : 0
    const scheduledEnqueueTimeMs = scheduled ? new Date(scheduleAt).getTime() : 0
    try {
      const seqs = await send(queue, {
        bodyText: body,
        ...(subject ? { subject } : {}),
        ...(group ? { group_id: group } : {}),
        ...(messageId ? { message_id: messageId } : {}),
        ...(correlationId ? { correlation_id: correlationId } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(contentType ? { content_type: contentType } : {}),
        ...(Object.keys(properties).length ? { properties } : {}),
        ...(ttlMs > 0 ? { ttlMs } : {}),
        ...(scheduledEnqueueTimeMs > 0 ? { scheduledEnqueueTimeMs } : {}),
      })
      setOk(`${scheduled ? 'scheduled' : 'sent'} seq ${seqs.join(', ') || '—'}`)
      setBody('')
      onSent()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'send failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">send a message</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          close ✕
        </button>
      </div>
      <Label>body</Label>
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"hello":"world"}' autoFocus className="font-mono" />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <Label>subject (optional)</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="order.created" />
        </div>
        <div>
          <Label>group id (optional)</Label>
          <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="order-42" />
        </div>
      </div>

      {/* delivery: now vs scheduled + TTL */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <Label>schedule for (optional — blank = send now)</Label>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        </div>
        <div>
          <Label>time-to-live (optional — capped by queue default)</Label>
          <div className="flex gap-2">
            <Input type="number" min="0" className="w-24" value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="0" />
            <Select value={ttlUnit} onChange={(e) => setTtlUnit(e.target.value)} className="flex-1">
              {TTL_UNITS.map((u) => (
                <option key={u.ms} value={u.ms}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Label>properties (optional)</Label>
        <KVEditor pairs={props} onChange={setProps} />
      </div>

      {/* every remaining message field, tucked away */}
      <button
        onClick={() => setMore((v) => !v)}
        className="mt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {more ? '▾' : '▸'} more fields — message id, content type, correlation id, reply to
      </button>
      {more && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <Label>message id (dedup key)</Label>
            <Input value={messageId} onChange={(e) => setMessageId(e.target.value)} placeholder="ord-42" />
          </div>
          <div>
            <Label>content type</Label>
            <Input value={contentType} onChange={(e) => setContentType(e.target.value)} placeholder="application/json" />
          </div>
          <div>
            <Label>correlation id</Label>
            <Input value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} placeholder="req-7" />
          </div>
          <div>
            <Label>reply to</Label>
            <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="responses" />
          </div>
        </div>
      )}

      {err && (
        <div className="mt-3">
          <ErrorBanner message={err} />
        </div>
      )}
      {ok && <p className="mt-3 text-xs text-ok">✓ {ok}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          done
        </Button>
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? 'working…' : scheduled ? 'schedule' : 'send'}
        </Button>
      </div>
    </Card>
  )
}
