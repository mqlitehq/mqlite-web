import { useState } from 'react'
import { abandon, complete, decodeBody, defer, receive, reject } from '../lib/api'
import type { WireMessage } from '../lib/types'
import { Badge, Button, Card, ErrorBanner } from './ui'

// Receive a message with Peek-Lock, then settle it explicitly — exposing every settlement
// verb the API has (complete · abandon · defer · reject→DLQ) instead of auto-completing.
// The lock is held on the message until you pick one.
export function Receiver({
  queue,
  onClose,
  onChanged,
}: {
  queue: string
  onClose: () => void
  onChanged: () => void
}) {
  const [held, setHeld] = useState<WireMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  async function receiveNext() {
    setBusy(true)
    setErr('')
    setNote('')
    try {
      const got = await receive(queue, 1, 0)
      if (got.length === 0) {
        setHeld(null)
        setNote('nothing available to receive')
      } else {
        setHeld(got[0])
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'receive failed')
    } finally {
      setBusy(false)
    }
  }

  async function settle(verb: string, fn: () => Promise<unknown>) {
    if (!held) return
    setBusy(true)
    setErr('')
    setNote('')
    try {
      await fn()
      setNote(`${verb} seq ${held.seq_number}`)
      setHeld(null)
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${verb} failed`)
    } finally {
      setBusy(false)
    }
  }

  const m = held
  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">receive &amp; settle</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          close ✕
        </button>
      </div>

      {!m ? (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={busy} onClick={receiveNext}>
            {busy ? 'receiving…' : 'receive next (peek-lock)'}
          </Button>
          <span className="text-xs text-faint">locks the head message until you settle it</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-surface-2/50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Badge tone="warn">locked</Badge>
              <span className="font-mono">seq {m.seq_number}</span>
              {m.subject && <span className="text-muted-foreground">{m.subject}</span>}
              {m.delivery_count ? <span className="text-warn">delivery #{m.delivery_count}</span> : null}
            </div>
            <pre className="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-foreground/90">
              {decodeBody(m.body) || '(empty body)'}
            </pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => settle('completed', () => complete(queue, m.seq_number!, m.lock_token!))}>
              complete
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => settle('abandoned', () => abandon(queue, m.seq_number!, m.lock_token!))}>
              abandon — redeliver
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => settle('deferred', () => defer(queue, m.seq_number!, m.lock_token!))}>
              defer
            </Button>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => settle('rejected', () => reject(queue, m.seq_number!, m.lock_token!))}>
              reject → DLQ
            </Button>
          </div>
        </div>
      )}

      {err && (
        <div className="mt-3">
          <ErrorBanner message={err} />
        </div>
      )}
      {note && <p className="mt-3 text-xs text-ok">✓ {note}</p>}
    </Card>
  )
}
