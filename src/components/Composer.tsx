import { useState } from 'react'
import { send } from '../lib/api'
import { Button, Card, ErrorBanner, Input, Label, Textarea } from './ui'

function parseProps(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [k, ...rest] = pair.split('=')
    if (k.trim()) out[k.trim()] = rest.join('=').trim()
  }
  return out
}

// Publish to a topic — fans out to every subscription whose filter matches. Properties are
// editable because filters routinely key off them (`properties["tier"] == "gold"`).
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
  const [props, setProps] = useState('region=eu, tier=gold')
  const [body, setBody] = useState('{"amount": 250}')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  async function publish() {
    setBusy(true)
    setErr('')
    setNote('')
    const properties = parseProps(props)
    try {
      await send(topic, {
        ...(subject ? { subject } : {}),
        ...(Object.keys(properties).length ? { properties } : {}),
        bodyText: body,
      })
      setNote('published — fanned out to matching subscriptions')
      onPublished()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'publish failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={bordered ? 'space-y-3 border-b border-border bg-surface/50 px-4 py-3' : 'space-y-3'}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="orders.created" />
        </div>
        <div>
          <Label>properties (k=v, comma-separated)</Label>
          <Input value={props} onChange={(e) => setProps(e.target.value)} placeholder="region=eu, tier=gold" />
        </div>
      </div>
      <div>
        <Label>body</Label>
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono" placeholder='{"amount": 250}' />
      </div>
      {err && <ErrorBanner message={err} />}
      {note && <p className="text-xs text-ok">✓ {note}</p>}
      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={publish}>
          {busy ? 'publishing…' : `publish to ${topic}`}
        </Button>
      </div>
    </div>
  )
}

// Send straight into a queue (no filter — direct enqueue).
export function SendPanel({ queue, onClose, onSent }: { queue: string; onClose: () => void; onSent: () => void }) {
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [group, setGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  async function submit() {
    if (busy) return
    setBusy(true)
    setErr('')
    setOk('')
    try {
      const seqs = await send(queue, {
        bodyText: body,
        ...(subject ? { subject } : {}),
        ...(group ? { group_id: group } : {}),
      })
      setOk(`sent seq ${seqs.join(', ') || '—'}`)
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
          {busy ? 'sending…' : 'send'}
        </Button>
      </div>
    </Card>
  )
}
