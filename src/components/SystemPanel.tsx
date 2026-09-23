import { useObservation } from '../lib/observation-context.js'
import { fmtBytes, fmtMs, fmtTime } from '../lib/format.js'
import { Badge, Card, Dot } from './ui.js'

export function SystemPanel() {
  const { observation: s, current, complete, legacy, canManage, err } = useObservation()
  const runtimeAvailable = !s || (s.runtime.read_available && (s.backend !== 'local' || s.runtime.db_size_available))
  const state = !current ? 'unknown' : complete && runtimeAvailable ? 'available' : 'partial'
  return (
    <Card className="p-4" aria-label="observation status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Dot state={state === 'available' ? 'active' : 'locked'} />
          <span className="text-sm font-medium">{s?.backend ?? (legacy ? 'legacy broker' : 'broker')}</span>
          <Badge tone={state === 'available' ? 'ok' : 'warn'}>{state}</Badge>
          {current && !canManage && <Badge tone="info">monitor · read only</Badge>}
        </div>
        <span className="text-xs text-faint">
          {s ? `mqlite ${s.version} · schema ${s.runtime.schema_version}` : ''}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          sampled: {s ? fmtTime(s.sampled_at_ms) : 'unknown'}
          {!current && s ? ' · stale' : ''}
        </div>
        <div>last collection success: {s ? fmtTime(s.collection.last_success_at_ms) : 'unknown'}</div>
        <div>process uptime: {s ? fmtMs(s.sampled_at_ms - s.started_at_ms) : 'unknown'}</div>
      </div>
      {s && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            read latency:{' '}
            {current && s.runtime.read_available ? `${(s.runtime.ping_seconds * 1000).toFixed(2)} ms` : 'unknown'}
          </div>
          <div>
            db on disk:{' '}
            {current && s.runtime.db_size_available
              ? fmtBytes(s.runtime.db_size_bytes)
              : s.backend === 'local'
                ? 'unknown'
                : 'not applicable'}
          </div>
        </div>
      )}
      {!current && <p className="mt-2 text-xs text-warn">Current measurements are unknown. {err}</p>}
      {current && !complete && (
        <p className="mt-2 text-xs text-warn">Queue gauges are unavailable; process counters remain available.</p>
      )}
      {legacy && (
        <p className="mt-2 text-xs text-faint">
          Legacy broker: per-queue compatibility view. Process counters and collection freshness are unavailable.
        </p>
      )}
    </Card>
  )
}
