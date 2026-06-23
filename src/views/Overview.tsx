import { useTopology } from '../lib/useTopology'
import type { View } from '../components/Shell'
import { Badge, Button, Card, ErrorBanner, PageHeader, Spinner, Stat, StatStrip } from '../components/ui'
import { fmtNum } from '../lib/format'

export function Overview({
  onOpenQueue,
  onOpenSub,
  onNav,
}: {
  onOpenQueue: (name: string) => void
  onOpenSub: (topic: string, name: string) => void
  onNav: (v: View) => void
}) {
  const { queues, subscriptions, topics, metrics, loading, err, reload } = useTopology()

  // Aggregate message counts across *every* target (queues + subscription backing queues).
  const agg = Object.values(metrics).reduce(
    (a, m) => ({
      active: a.active + m.active,
      locked: a.locked + m.locked,
      scheduled: a.scheduled + m.scheduled,
      deferred: a.deferred + m.deferred,
      dlq: a.dlq + m.dead_lettered,
      total: a.total + m.total,
    }),
    { active: 0, locked: 0, scheduled: 0, deferred: 0, dlq: 0, total: 0 },
  )

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

      {err && <ErrorBanner message={err} />}
      {loading ? (
        <Spinner label="loading topology" />
      ) : (
        <>
          {/* level 1 — topology (entity counts). These are NOT message counts. */}
          <StatStrip label="topology">
            <Stat label="queues" v={queues.length} onClick={() => onNav('queues')} />
            <Stat label="topics" v={topics.length} onClick={() => onNav('topics')} />
            <Stat label="subscriptions" v={subscriptions.length} onClick={() => onNav('topics')} />
          </StatStrip>

          {/* level 2 — messages across all targets. A different level, labelled as such. */}
          <StatStrip label="messages · all targets">
            <Stat label="active" v={fmtNum(agg.active)} state="active" />
            <Stat label="locked" v={fmtNum(agg.locked)} state="locked" tone={agg.locked ? 'warn' : undefined} />
            <Stat label="scheduled" v={fmtNum(agg.scheduled)} state="scheduled" />
            <Stat label="deferred" v={fmtNum(agg.deferred)} state="deferred" />
            <Stat label="dead-letter" v={fmtNum(agg.dlq)} state="dead_lettered" tone={agg.dlq ? 'danger' : undefined} />
            <Stat label="total" v={fmtNum(agg.total)} />
          </StatStrip>

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">needs attention</div>
            {attention.length === 0 ? (
              <Card className="px-4 py-6 text-center text-sm text-muted-foreground">
                nothing dead-lettered — all clear
              </Card>
            ) : (
              <Card className="divide-y divide-border/60">
                {attention.map(([name, m]) => {
                  const s = subByName.get(name)
                  return (
                    <button
                      key={name}
                      onClick={() => open(name)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <Badge tone="danger">{m.dead_lettered} dlq</Badge>
                      <span className="font-medium">{name}</span>
                      {s ? (
                        <span className="text-xs text-muted-foreground">
                          subscription · {s.topic}
                        </span>
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
