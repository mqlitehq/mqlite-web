import { useEffect, useState, type ReactNode } from 'react'
import { status } from '../lib/api'
import type { BrokerStatus } from '../lib/types'
import { Badge, Card, Dot } from './ui'
import { fmtBytes, fmtMs } from '../lib/format'

// A transparent read-out of what the broker is running on — backend, where its data
// lives (a local path, or a masked remote host), read latency, on-disk footprint, uptime.
// Everything here is already desensitized server-side (no connection string / token).
export function SystemPanel() {
  const [s, setS] = useState<BrokerStatus | null>(null)
  const [down, setDown] = useState(false)

  useEffect(() => {
    const load = () =>
      status()
        .then((d) => {
          setS(d)
          setDown(false)
        })
        .catch(() => setDown(true))
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const healthy = !down && !!s && s.ping_ms >= 0
  const local = s?.backend === 'local file'

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Dot state={healthy ? 'active' : 'dead_lettered'} />
          <span className="text-sm font-medium">{s ? s.backend : 'system'}</span>
          {s?.remote && <Badge tone="info">remote</Badge>}
          {s && !s.auth && <Badge tone="warn">auth off</Badge>}
        </div>
        <span className="text-xs text-faint">
          {s ? `mqlite ${s.version} · schema ${s.schema_version} · auth ${s.auth ? 'on' : 'off'}` : ''}
        </span>
      </div>

      <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
        {down ? 'broker unreachable' : (s?.location ?? '…')}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="read latency" value={s ? (s.ping_ms < 0 ? 'error' : `${s.ping_ms} ms`) : '·'} bad={s?.ping_ms === -1} />
        <Fact label="db on disk" value={s ? (local ? fmtBytes(s.db_size_bytes) : '—') : '·'} />
        <Fact label="uptime" value={s ? fmtMs(s.uptime_ms) : '·'} />
        <Fact label="topology" value={s ? `${s.queues} q · ${s.subscriptions} sub` : '·'} />
      </div>
    </Card>
  )
}

function Fact({ label, value, bad }: { label: string; value: ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm tabular-nums ${bad ? 'text-danger' : 'text-foreground'}`}>{value}</div>
    </div>
  )
}
