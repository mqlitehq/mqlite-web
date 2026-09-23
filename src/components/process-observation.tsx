import { useObservation } from '../lib/observation-context.js'
import { fmtNum, fmtTime } from '../lib/format.js'
import { Card, Stat, StatStrip } from './ui.js'

export function ProcessObservation() {
  const { observation: s, current, complete, legacy } = useObservation()
  if (!s)
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        {legacy ? 'Process counters require a broker with Observe support.' : 'Process counters are unknown.'}
      </Card>
    )
  const effects = s.messages.filter((r) => r.count > 0)
  const unexpected = (s.queues ?? []).reduce((n, q) => n + q.unexpected, 0)
  const requests = s.http.requests.filter((r) => r.code !== 'ok').reduce((n, r) => n + r.count, 0)
  const storage = s.storage.operations
    .filter((r) => r.outcome === 'error' || r.outcome === 'outcome_unknown')
    .reduce((n, r) => n + r.duration.count, 0)
  const failures = s.maintenance.reduce((n, r) => n + r.failures, 0)
  const filters = s.filters.reduce((n, r) => n + r.count, 0)
  const number = (n: number) => (current ? fmtNum(n) : 'unknown')
  return (
    <section className="space-y-4" aria-label="process observations">
      <div className="text-xs text-muted-foreground">
        Process counters since {fmtTime(s.started_at_ms)}; reset on restart. Event categories can overlap and are not a
        message ledger.
        {!current && <span className="text-warn"> Last sample is stale; current values are unknown.</span>}
      </div>
      <StatStrip label="process errors · cumulative">
        <Stat
          label="RPC errors"
          v={s.http.state === 'not_applicable' ? 'not applicable' : number(requests)}
          tone={requests ? 'danger' : undefined}
        />
        <Stat label="storage errors" v={number(storage)} tone={storage ? 'danger' : undefined} />
        <Stat label="maintenance failures" v={number(failures)} tone={failures ? 'danger' : undefined} />
        <Stat label="filter errors" v={number(filters)} tone={filters ? 'danger' : undefined} />
        <Stat
          label="unexpected states"
          v={complete && current ? fmtNum(unexpected) : 'unknown'}
          tone={unexpected ? 'danger' : undefined}
        />
      </StatStrip>
      <Card className="max-h-80 overflow-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">committed message effects</h2>
        {!current ? (
          <p className="text-sm text-warn">unknown</p>
        ) : effects.length ? (
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th>target</th>
                <th>event</th>
                <th className="text-right">count</th>
              </tr>
            </thead>
            <tbody>
              {effects.map((r) => (
                <tr key={`${r.queue}:${r.event}`} className="border-t border-border/60">
                  <td className="py-1">{r.queue}</td>
                  <td>{r.event}</td>
                  <td className="text-right tabular-nums">{fmtNum(r.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-muted-foreground">no committed message effects recorded in this process</p>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">storage and maintenance</h2>
        <p className="text-xs text-muted-foreground">
          Pool: {number(s.storage.pool.in_use)} in use · {number(s.storage.pool.idle)} idle ·{' '}
          {number(s.storage.pool.wait_count)} waits. HTTP: {s.http.state.replace('_', ' ')}.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {s.maintenance.map((task) => (
            <div key={task.task} className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs">
              <span className="font-medium">{task.task}</span>:{' '}
              {task.enabled
                ? `${number(task.runs)} runs · ${number(task.failures)} failures · ${number(task.interrupted)} interrupted`
                : 'disabled / not applicable'}
              <div className="mt-1 text-faint">last success: {fmtTime(task.last_success_at_ms)}</div>
            </div>
          ))}
        </div>
      </Card>
      <details className="rounded-xl bg-surface p-4 ring-1 ring-border">
        <summary className="cursor-pointer text-sm">
          canonical snapshot · all domains{!current ? ' · stale' : ''}
        </summary>
        <p className="my-2 text-xs text-muted-foreground">
          The same fields are available through Observe, the Go SDK, CLI and MCP. Durations use seconds; timestamps use
          epoch milliseconds.
        </p>
        <pre className="max-h-96 overflow-auto text-[11px] text-muted-foreground">{JSON.stringify(s, null, 2)}</pre>
      </details>
    </section>
  )
}
