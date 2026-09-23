import { queueTotals } from '../lib/observation.js'
import { ProcessObservation } from '../components/process-observation.js'
import { useTopology } from '../lib/useTopology.js'
import type { View } from '../components/Shell.js'
import { Badge, Button, Card, ErrorBanner, PageHeader, Spinner, Stat, StatStrip } from '../components/ui.js'
import { SystemPanel } from '../components/SystemPanel.js'
import { fmtNum } from '../lib/format.js'

export function Overview({
  onOpenQueue,
  onOpenSub,
  onNav,
}: {
  onOpenQueue: (name: string) => void
  onOpenSub: (topic: string, name: string) => void
  onNav: (v: View) => void
}) {
  const {
    queues,
    subscriptions,
    topics,
    metrics,
    loading,
    err,
    reload,
    complete,
    canManage,
    observation,
    metadataError,
  } = useTopology()

  // Aggregate message counts across *every* target (queues + subscription backing queues).
  const agg = queueTotals(metrics, complete)
  const count = (value?: number) => (value === undefined ? 'unknown' : fmtNum(value))

  // name → how to open it (queue vs subscription, with its topic).
  const subByName = new Map(subscriptions.map((s) => [s.name, s]))
  const attention = Object.entries(metrics)
    .filter(([, m]) => m.dead_lettered > 0)
    .sort((a, b) => b[1].dead_lettered - a[1].dead_lettered)
  const open = (name: string) => {
    const s = subByName.get(name)
    if (s) onOpenSub(s.topic, s.name)
    else onOpenQueue(name)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="overview"
        subtitle="one broker, one SQLite file"
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            refresh
          </Button>
        }
      />

      <SystemPanel />

      {err && <ErrorBanner message={err} />}
      {loading ? (
        <Spinner label="loading topology" />
      ) : (
        <>
          {/* level 1 — topology (entity counts). These are NOT message counts. */}
          <StatStrip label="topology">
            <Stat
              label="queues"
              v={complete ? (observation?.queue_count ?? queues.length) : 'unknown'}
              onClick={canManage ? () => onNav('queues') : undefined}
            />
            <Stat
              label="topics"
              v={canManage && complete && !metadataError ? topics.length : 'unknown'}
              onClick={canManage ? () => onNav('topics') : undefined}
            />
            <Stat
              label="subscriptions"
              v={complete ? (observation?.subscription_count ?? subscriptions.length) : 'unknown'}
              onClick={canManage ? () => onNav('topics') : undefined}
            />
          </StatStrip>

          {/* level 2 — messages across all targets. A different level, labelled as such. */}
          <StatStrip label="messages · all targets">
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

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">needs attention</div>
            {attention.length === 0 ? (
              <Card className="px-4 py-6 text-center text-sm text-muted-foreground">
                {complete ? 'no dead-lettered messages in this sample' : 'dead-letter status unknown'}
              </Card>
            ) : (
              <Card className="divide-y divide-border/60">
                {attention.map(([name, m]) => {
                  const s = subByName.get(name)
                  return (
                    <button
                      key={name}
                      disabled={!canManage}
                      onClick={() => open(name)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <Badge tone="danger">{m.dead_lettered} dlq</Badge>
                      <span className="font-medium">{name}</span>
                      {s ? (
                        <span className="text-xs text-muted-foreground">subscription · {s.topic}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">queue</span>
                      )}
                      <span className="ml-auto text-faint">→</span>
                    </button>
                  )
                })}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
