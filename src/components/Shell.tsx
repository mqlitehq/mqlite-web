import { useEffect, useId, useState, type ReactNode } from 'react'
import { discovery } from '../lib/api.js'
import type { Discovery } from '../lib/types.js'
import { useObservation } from '../lib/observation-context.js'
import { cn } from '../lib/cn.js'
import { currentBrokerTarget, type BrokerTarget } from '../lib/broker-target.js'
import { Logo } from './Logo.js'
import { TimeFormatToggle } from './Time.js'
import { Badge } from './ui.js'
import { Overview } from '../views/Overview.js'
import { Queues } from '../views/Queues.js'
import { Topics } from '../views/Topics.js'
import { Metrics } from '../views/Metrics.js'
import { Docs } from '../views/Docs.js'
import { Detail } from '../views/Detail.js'
import { AccessKeys } from '../views/access-keys.js'

export type View = 'overview' | 'queues' | 'topics' | 'metrics' | 'keys' | 'docs'
export interface DetailTarget {
  kind: 'queue' | 'subscription'
  name: string
  topic?: string
}

const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'overview' },
  { id: 'queues', label: 'queues' },
  { id: 'topics', label: 'topics' },
  { id: 'metrics', label: 'metrics' },
  { id: 'keys', label: 'access keys' },
  { id: 'docs', label: 'docs' },
]

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { canManage, current, complete, loading, observation } = useObservation()
  const healthy =
    current &&
    complete &&
    (!observation ||
      (observation.runtime.read_available &&
        (observation.backend !== 'local' || observation.runtime.db_size_available)))
  const [view, setView] = useState<View>('overview')
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const [info, setInfo] = useState<Discovery | null>(null)
  const brokerTarget = currentBrokerTarget()
  const connectionAvailability = current
    ? healthy
      ? 'sample available'
      : 'partial observation'
    : 'availability unknown'

  useEffect(() => {
    discovery().then(setInfo)
  }, [])

  const openQueue = (name: string) => {
    if (!canManage) return
    setView('queues')
    setDetail({ kind: 'queue', name })
  }
  const openSub = (topic: string, name: string) => {
    if (!canManage) return
    setView('topics')
    setDetail({ kind: 'subscription', name, topic })
  }
  const go = (v: View) => {
    if (!canManage && v !== 'overview' && v !== 'metrics') return
    setDetail(null)
    setView(v)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 min-h-14 border-b border-border bg-surface-header/95 backdrop-blur">
        <div className="mx-auto flex h-full min-h-14 max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2 xl:gap-x-7">
          <Logo />
          <nav className="flex h-10 min-w-0 items-stretch gap-3 overflow-x-auto lg:gap-4">
            {NAV.filter((n) => canManage || n.id === 'overview' || n.id === 'metrics').map((n) => (
              <NavItem key={n.id} active={view === n.id} onClick={() => go(n.id)}>
                {n.label}
              </NavItem>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <TimeFormatToggle />
            <BrokerConnection
              target={brokerTarget}
              info={info}
              healthy={Boolean(healthy)}
              availability={connectionAvailability}
            />
            <button
              onClick={onSignOut}
              className="shrink-0 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-danger"
            >
              sign out →
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-7">
        {loading ? (
          <p className="text-sm text-muted-foreground">loading observation…</p>
        ) : !canManage && view !== 'metrics' ? (
          <Overview onOpenQueue={openQueue} onOpenSub={openSub} onNav={go} />
        ) : detail && canManage ? (
          <Detail target={detail} onBack={() => setDetail(null)} onOpenSub={openSub} />
        ) : view === 'overview' ? (
          <Overview onOpenQueue={openQueue} onOpenSub={openSub} onNav={go} />
        ) : view === 'queues' ? (
          <Queues onOpen={openQueue} />
        ) : view === 'topics' ? (
          <Topics onOpenSub={openSub} />
        ) : view === 'metrics' ? (
          <Metrics onOpenQueue={openQueue} onOpenSub={openSub} />
        ) : view === 'keys' ? (
          <AccessKeys />
        ) : (
          <Docs onOpenKeys={() => go('keys')} />
        )}
      </main>
    </div>
  )
}

function BrokerConnection({
  target,
  info,
  healthy,
  availability,
}: {
  target: BrokerTarget
  info: Discovery | null
  healthy: boolean
  availability: string
}) {
  const tooltipId = useId()
  const connectionLabel = `broker connection: ${target.kind} ${target.display}`
  const brokerIdentity = `${info?.name ?? 'broker'}${info?.version ? ` ${info.version}` : ''}`

  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        aria-label={connectionLabel}
        aria-describedby={tooltipId}
        className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${healthy ? 'bg-ok' : 'bg-warn'}`}
        />
        <Badge
          tone={target.kind === 'remote' ? 'info' : target.kind === 'custom' ? 'warn' : 'neutral'}
          className="h-4 px-1.5 text-[10px]"
        >
          {target.kind}
        </Badge>
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-surface p-3 text-left opacity-0 ring-1 ring-border-strong transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="block text-[10px] font-medium uppercase tracking-wide text-faint">
          broker connection
        </span>
        <span className="mt-1 block break-all text-xs text-foreground">{target.display}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {brokerIdentity} · {availability}
        </span>
      </div>
    </div>
  )
}

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-full shrink-0 items-center whitespace-nowrap text-sm font-semibold transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" />}
    </button>
  )
}
