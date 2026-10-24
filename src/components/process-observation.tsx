import { useState } from 'react'
import { compactSnapshot, type MaintenanceDiagnostics } from '../lib/observation.js'
import { useObservation } from '../lib/observation-context.js'
import { fmtNum, fmtTime } from '../lib/format.js'
import { Card, Stat, StatStrip } from './ui.js'

export function ProcessObservation() {
  const { observation: s, current, complete, legacy } = useObservation()
  const [domain, setDomain] = useState('all domains')
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
  const storageErrors = s.storage.operations.filter(
    (r) => (r.outcome === 'error' || r.outcome === 'outcome_unknown') && r.duration.count > 0,
  )
  const rpcErrors = s.http.requests.filter((r) => r.code !== 'ok' && r.count > 0)
  const domains: Record<string, unknown> = {
    'all domains': s,
    runtime: {
      sampled_at_ms: s.sampled_at_ms,
      server_time_ms: s.server_time_ms,
      started_at_ms: s.started_at_ms,
      backend: s.backend,
      runtime: s.runtime,
      collection: s.collection,
    },
    queues: s.queues,
    messages: s.messages,
    storage: s.storage,
    maintenance: s.maintenance,
    filters: s.filters,
    http: s.http,
  }
  const failures = s.maintenance.reduce((n, r) => n + r.failures, 0)
  const failing = s.maintenance.some((task) => task.enabled && task.diagnostics?.last_outcome === 'failed')
  const maintenanceErrors = s.maintenance
    .flatMap((task) =>
      (task.diagnostics?.recent_failures ?? []).map((failure) => ({ ...failure, task: task.task })),
    )
    .sort((a, b) => b.error.at_ms - a.error.at_ms)
  const legacyDiagnostics = s.maintenance.some((task) => task.failures > 0 && !task.diagnostics)
  const filters = s.filters.reduce((n, r) => n + r.count, 0)
  const number = (n: number) => (current ? fmtNum(n) : 'unknown')
  return (
    <section className="space-y-3" aria-label="process observations">
      <div className="text-xs text-muted-foreground">
        Process counters since {fmtTime(s.started_at_ms)}; reset on restart. Event categories can overlap and
        are not a message ledger.
        {!current && <span className="text-warn"> Last sample is stale; current values are unknown.</span>}
      </div>
      <StatStrip label="process errors · cumulative">
        <Stat
          label="RPC errors"
          v={s.http.state === 'not_applicable' ? 'not applicable' : number(requests)}
          tone={current && requests ? 'warn' : undefined}
        />
        <Stat label="storage errors" v={number(storage)} tone={current && storage ? 'warn' : undefined} />
        <Stat
          label="maintenance failures"
          v={number(failures)}
          tone={current && failing ? 'danger' : current && failures ? 'warn' : undefined}
        />
        <Stat label="filter errors" v={number(filters)} tone={current && filters ? 'warn' : undefined} />
        <Stat
          label="unexpected states"
          v={complete && current ? fmtNum(unexpected) : 'unknown'}
          tone={unexpected ? 'danger' : undefined}
        />
      </StatStrip>
      <p className="text-xs text-muted-foreground">
        Error counts are historical totals, not current health. Maintenance failures can include storage
        errors; do not add them together.
      </p>
      <Card className="overflow-hidden">
        <div className="border-b border-border/60 px-3 py-2.5">
          <h2 className="text-sm font-semibold">storage and maintenance</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pool: {number(s.storage.pool.in_use)} in use · {number(s.storage.pool.idle)} idle ·{' '}
            {number(s.storage.pool.wait_count)} waits. HTTP: {s.http.state.replace('_', ' ')}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table aria-label="maintenance tasks" className="w-full whitespace-nowrap text-left text-xs">
            <thead className="bg-surface-2/60 text-faint">
              <tr>
                <th className="px-3 py-2 font-normal">task</th>
                <th className="px-3 py-2 text-right font-normal">runs</th>
                <th className="px-3 py-2 text-right font-normal">failures</th>
                <th className="px-3 py-2 text-right font-normal">interrupted</th>
                <th className="px-3 py-2 font-normal">latest result</th>
                <th className="px-3 py-2 font-normal">last success</th>
              </tr>
            </thead>
            <tbody>
              {s.maintenance.map((task) => (
                <tr key={task.task} className="border-t border-border/60">
                  <td className="px-3 py-1.5 font-medium">{task.task}</td>
                  {task.enabled ? (
                    <>
                      <td
                        className="px-3 py-1.5 text-right tabular-nums"
                        title={current ? String(task.runs) : undefined}
                      >
                        {number(task.runs)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums ${current && task.failures ? 'text-warn' : ''}`}
                      >
                        {number(task.failures)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{number(task.interrupted)}</td>
                      <td
                        className={`px-3 py-1.5 ${current && task.diagnostics?.last_outcome === 'failed' ? 'text-danger' : 'text-muted-foreground'}`}
                        title={
                          task.diagnostics?.recovered_at_ms
                            ? `Recovered at ${fmtTime(task.diagnostics.recovered_at_ms)}`
                            : undefined
                        }
                      >
                        {current ? maintenanceResult(task.diagnostics) : 'unknown · stale'}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {fmtTime(task.last_success_at_ms)}
                        {!current && ' · stale'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-1.5 text-faint">
                      disabled / not applicable
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(storageErrors.length > 0 || failures > 0 || rpcErrors.length > 0) && (
          <div className="space-y-2 border-t border-border/60 px-3 py-2.5">
            <h3 className="text-xs font-medium">recorded error details{!current && ' · stale'}</h3>
            {storageErrors.length > 0 && (
              <div className="overflow-x-auto">
                <table aria-label="storage error details" className="w-full min-w-[36rem] text-left text-xs">
                  <thead className="text-faint">
                    <tr>
                      <th className="py-1 font-normal">operation</th>
                      <th className="px-2 font-normal">code</th>
                      <th className="px-2 text-right font-normal">count</th>
                      <th className="pl-2 font-normal">latest failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageErrors.map((row) => (
                      <tr
                        key={`${row.operation}:${row.outcome}:${row.error_code}`}
                        className="border-t border-border/60"
                      >
                        <td className="py-1.5">{row.operation}</td>
                        <td className="px-2 text-warn">{row.error_code}</td>
                        <td className="px-2 text-right tabular-nums">{number(row.duration.count)}</td>
                        <td className="pl-2 text-muted-foreground">
                          {row.last_error ? (
                            <>
                              <span className="text-foreground">{row.last_error.category}</span> ·{' '}
                              {fmtTime(row.last_error.at_ms)}
                              <div>{row.last_error.message}</div>
                              <div className="text-faint">ref {row.last_error.fingerprint}</div>
                            </>
                          ) : (
                            storageErrorMeaning(row.error_code)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rpcErrors.length > 0 && (
              <div className="overflow-x-auto">
                <table aria-label="RPC error details" className="w-full text-left text-xs">
                  <thead className="text-faint">
                    <tr>
                      <th className="py-1 font-normal">RPC</th>
                      <th className="px-2 font-normal">code</th>
                      <th className="text-right font-normal">count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rpcErrors.map((row) => (
                      <tr key={`${row.rpc}:${row.code}`} className="border-t border-border/60">
                        <td className="py-1.5">{row.rpc}</td>
                        <td className="px-2 text-warn">{row.code}</td>
                        <td className="text-right tabular-nums">{number(row.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {maintenanceErrors.length > 0 && (
              <details open>
                <summary className="cursor-pointer text-xs font-medium">
                  recent maintenance failures · {maintenanceErrors.length}
                </summary>
                <div
                  className="mt-2 max-h-80 space-y-2 overflow-auto"
                  aria-label="maintenance failure history"
                >
                  {maintenanceErrors.map((failure, index) => (
                    <div
                      key={`${failure.task}:${failure.error.at_ms}:${index}`}
                      className="rounded border border-border/60 px-2.5 py-2 text-xs"
                    >
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-medium">
                          {failure.task} / {failure.stage}
                        </span>
                        <span className="text-warn">{failure.error.category}</span>
                        <span className="text-faint">{fmtTime(failure.error.at_ms)}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{failure.error.message}</p>
                      <div className="mt-1 break-all text-[11px] text-faint">
                        {failure.error.http_status > 0 && `HTTP ${failure.error.http_status} · `}
                        {failure.error.sqlite_code > 0 && `SQLite ${failure.error.sqlite_code} · `}
                        ref {failure.error.fingerprint}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {legacyDiagnostics
                ? 'This broker reports no failure timestamps or per-task error reasons. Upgrade the broker to record diagnostic history. '
                : 'History keeps the latest 8 failed steps per task for this process, including recovered failures. '}
              Storage counts cover each lifetime error bucket; the latest cause does not describe every past
              occurrence. Use the reference to find the corresponding private diagnostic log entry.
            </p>
          </div>
        )}
      </Card>
      <details className="overflow-hidden rounded-lg bg-surface ring-1 ring-border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
          message activity details{!current ? ' · stale' : ''}
        </summary>
        <div className="max-h-80 overflow-auto border-t border-border/60 px-3 py-2.5">
          <p className="mb-2 text-[11px] text-muted-foreground">
            Committed events since process start. Counts overlap and do not represent queued messages.
          </p>
          {!current ? (
            <p className="text-sm text-warn">unknown</p>
          ) : effects.length ? (
            <table aria-label="message activity" className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th>queue</th>
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
            <p className="text-xs text-muted-foreground">
              no committed message effects recorded in this process
            </p>
          )}
        </div>
      </details>
      <details className="overflow-hidden rounded-lg bg-surface ring-1 ring-border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
          canonical snapshot · {domain}
          {!current ? ' · stale' : ''}
        </summary>
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          <label htmlFor="snapshot-domain">domain</label>
          <select
            id="snapshot-domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            className="h-7 rounded border border-border-strong bg-input px-2 text-xs text-foreground"
          >
            {Object.keys(domains).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <span>durations: seconds · timestamps: epoch ms</span>
        </div>
        <pre
          tabIndex={0}
          aria-label="canonical snapshot JSON"
          className="max-h-80 overflow-auto border-t border-border/60 px-3 py-2 text-[11px] leading-4 text-muted-foreground"
        >
          {compactSnapshot(domains[domain])}
        </pre>
      </details>
    </section>
  )
}

function storageErrorMeaning(code: string): string {
  const meanings: Record<string, string> = {
    other: 'Unclassified database/provider error; check broker logs.',
    connection: 'Database connection or transport failure.',
    busy: 'Database lock contention.',
    canceled: 'Operation canceled or deadline exceeded.',
    closed: 'Database closed.',
    full: 'Database storage is full.',
    corrupt: 'Database corruption or invalid database format.',
    io: 'Database I/O failure.',
    outcome_unknown: 'Write outcome is unknown; verify before retrying.',
  }
  return meanings[code] ?? 'See broker logs for this error code.'
}

function maintenanceResult(diagnostics?: MaintenanceDiagnostics): string {
  if (!diagnostics) return 'not reported'
  switch (diagnostics.last_outcome) {
    case 'never':
      return 'not run yet'
    case 'failed':
      return `failed · ${diagnostics.consecutive_failures} consecutive`
    case 'interrupted':
      return 'interrupted'
    case 'ok':
      return diagnostics.recovered_at_ms > 0 ? 'recovered' : 'ok'
  }
}
