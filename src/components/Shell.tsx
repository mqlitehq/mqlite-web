import { useEffect, useState, type ReactNode } from 'react'
import { discovery } from '../lib/api.js'
import type { Discovery } from '../lib/types.js'
import { useObservation } from '../lib/observation-context.js'
import { cn } from '../lib/cn.js'
import { Logo } from './Logo.js'
import { TimeFormatToggle } from './Time.js'
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
        <div className="mx-auto flex h-full min-h-14 max-w-6xl flex-wrap items-center gap-x-7 gap-y-2 px-6 py-2">
          <Logo />
          <nav className="flex h-10 items-stretch gap-4 overflow-x-auto">
            {NAV.filter((n) => canManage || n.id === 'overview' || n.id === 'metrics').map((n) => (
              <NavItem key={n.id} active={view === n.id} onClick={() => go(n.id)}>
                {n.label}
              </NavItem>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <TimeFormatToggle />
            <div
              className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"
              title={current ? (healthy ? 'sample available' : 'partial observation') : 'availability unknown'}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${healthy ? 'bg-ok' : 'bg-warn'}`} />
              <span className="text-faint">
                {info?.name ?? 'broker'}
                {info?.version ? ` ${info.version}` : ''}
              </span>
            </div>
            <button onClick={onSignOut} className="text-xs text-muted-foreground transition-colors hover:text-danger">
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
