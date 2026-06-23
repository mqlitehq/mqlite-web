import { useState } from 'react'
import { abandon, complete, defer, receiveDeferred, reject } from '../lib/api'
import type { WireMessage } from '../lib/types'
import { Button } from './ui'

// Per-seq handling for a deferred message: pull this specific one back with
// ReceiveDeferred (it locks), then settle it — complete / abandon / defer again /
// reject→DLQ. This is the only way to act on one specific (non-head) message.
export function DeferredSettle({ queue, seq, onDone }: { queue: string; seq: number; onDone: () => void }) {
  const [held, setHeld] = useState<WireMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function pull() {
    setBusy(true)
    setErr('')
    try {
      const got = await receiveDeferred(queue, [seq])
      if (got[0]) setHeld(got[0])
      else setErr('could not receive — already taken?')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'receive failed')
    } finally {
      setBusy(false)
    }
  }

  async function settle(fn: () => Promise<unknown>) {
    if (!held) return
    setBusy(true)
    setErr('')
    try {
      await fn()
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'settle failed')
    } finally {
      setBusy(false)
    }
  }

  const tok = held?.lock_token
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!held ? (
        <>
          <Button size="sm" disabled={busy} onClick={pull}>
            receive &amp; settle (by seq)
          </Button>
          <span className="text-[11px] text-faint">pull this deferred message back and settle it</span>
        </>
      ) : (
        <>
          <span className="text-[11px] text-warn">locked — choose:</span>
          <Button size="sm" disabled={busy} onClick={() => settle(() => complete(queue, seq, tok!))}>
            complete
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => settle(() => abandon(queue, seq, tok!))}>
            abandon
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => settle(() => defer(queue, seq, tok!))}>
            defer again
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => settle(() => reject(queue, seq, tok!))}>
            reject → DLQ
          </Button>
        </>
      )}
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  )
}
