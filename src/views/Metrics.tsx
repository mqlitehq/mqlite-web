import { queueTotals } from '../lib/observation.js'
import { SystemPanel } from '../components/SystemPanel.js'
import { ProcessObservation } from '../components/process-observation.js'
import { useTopology } from '../lib/useTopology.js'
import type { Metrics as M } from '../lib/types.js'
import { Card, ErrorBanner, PageHeader, Spinner, Stat, StatStrip } from '../components/ui.js'
import { Button } from '../components/ui.js'
import { fmtNum } from '../lib/format.js'

interface Row {
  name: string
  m: M
  open: () => void
  sub?: string // topic, when this row is a subscription
}

export function Metrics({
  onOpenQueue,
  onOpenSub,
}: {
  onOpenQueue: (name: string) => void
  onOpenSub: (topic: string, name: string) => void
}) {
  const { queues, subscriptions, metrics, loading, err, reload, complete, canManage, observation } = useTopology()

  const agg = queueTotals(metrics, complete)
  const count = (value?: number) => (value === undefined ? 'unknown' : fmtNum(value))

  const observedQueues =
    observation?.queues?.filter((q) => q.kind !== 'subscription').map((q) => ({ name: q.queue })) ?? queues
  const queueRows: Row[] = observedQueues.flatMap((q) =>
    metrics[q.name] ? [{ name: q.name, m: metrics[q.name], open: () => onOpenQueue(q.name) }] : [],
  )
  const observedSubscriptions = observation?.queues
    ? observation.queues
        .filter((q) => q.kind === 'subscription')
        .map((q) => subscriptions.find((s) => s.name === q.queue) ?? { name: q.queue, topic: '', expr: '' })
    : subscriptions
  const subRows: Row[] = observedSubscriptions.flatMap((s) =>
    metrics[s.name] ? [{ name: s.name, m: metrics[s.name], sub: s.topic, open: () => onOpenSub(s.topic, s.name) }] : [],
  )

  const peak = Math.max(1, ...[...queueRows, ...subRows].map((r) => r.m.total))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="metrics"
        subtitle="message counts by state, per target"
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            refresh
          </Button>
        }
      />

      <SystemPanel />
      {err && <ErrorBanner message={err} />}
      {loading ? (
        <Spinner label="loading metrics" />
      ) : (
        <>
          <StatStrip label="totals · all targets">
            <Stat label="active" v={count(agg?.active)} state="active" />
            <Stat label="locked" v={count(agg?.locked)} state="locked" tone={agg?.locked ? 'warn' : undefined} />
            <Stat label="scheduled" v={count(agg?.scheduled)} state="scheduled" />
            <Stat label="deferred" v={count(agg?.deferred)} state="deferred" />
            <Stat
              label="dead-letter"
              v={count(agg?.dlq)}
              state="dead_lettered"
              tone={agg?.dlq ? 'danger' : undefined}
            />
            <Stat label="total" v={count(agg?.total)} />
          </StatStrip>

          <ProcessObservation />
          <BarSection title="queues" rows={queueRows} peak={peak} canManage={canManage} known={complete} />
          <BarSection title="subscriptions" rows={subRows} peak={peak} canManage={canManage} known={complete} />
        </>
      )}
    </div>
  )
}

function BarSection({
  title,
  rows,
  peak,
  canManage,
  known,
}: {
  title: string
  rows: Row[]
  peak: number
  canManage: boolean
  known: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        {title}
        <span className="text-faint/60">· {rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <Card className="px-4 py-5 text-center text-sm text-muted-foreground">{known ? 'none' : 'unknown'}</Card>
      ) : (
        <Card className="divide-y divide-border/60">
          {rows
            .slice()
            .sort((a, b) => b.m.total - a.m.total)
            .map((r) => (
              <button
                key={r.name}
                disabled={!canManage}
                onClick={r.open}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="w-36 shrink-0 truncate">
                  <span className="font-medium text-foreground">{r.name}</span>
                  {r.sub && <span className="ml-1 text-[11px] text-faint">{r.sub}</span>}
                </div>
                <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <Seg n={r.m.active} peak={peak} className="bg-ok" />
                  <Seg n={r.m.locked} peak={peak} className="bg-warn" />
                  <Seg n={r.m.scheduled + r.m.deferred} peak={peak} className="bg-info" />
                  <Seg n={r.m.dead_lettered} peak={peak} className="bg-danger" />
                </div>
                <div className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {fmtNum(r.m.total)}
                </div>
                {r.m.dead_lettered > 0 && (
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-danger">{r.m.dead_lettered}</span>
                )}
              </button>
            ))}
        </Card>
      )}
    </div>
  )
}

function Seg({ n, peak, className }: { n: number; peak: number; className: string }) {
  if (n <= 0) return null
  return <div className={className} style={{ width: `${(n / peak) * 100}%` }} title={`${n}`} />
}
