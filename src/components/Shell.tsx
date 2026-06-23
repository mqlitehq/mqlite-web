import { useEffect, useState, type ReactNode } from 'react'
import { discovery } from '../lib/api'
import type { Discovery } from '../lib/types'
import { cn } from '../lib/cn'
import { Overview } from '../views/Overview'
import { Queues } from '../views/Queues'
import { Topics } from '../views/Topics'
import { Metrics } from '../views/Metrics'
import { Detail } from '../views/Detail'

export type View = 'overview' | 'queues' | 'topics' | 'metrics'
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
]

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState<View>('overview')
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const [info, setInfo] = useState<Discovery | null>(null)

  useEffect(() => {
    discovery().then(setInfo)
  }, [])

  const openQueue = (name: string) => {
    setView('queues')
    setDetail({ kind: 'queue', name })
  }
  const openSub = (topic: string, name: string) => {
    setView('topics')
    setDetail({ kind: 'subscription', name, topic })
  }
  const go = (v: View) => {
    setDetail(null)
    setView(v)
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-surface/40">
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <span className="text-accent">▸</span>
          <span className="font-semibold">mqlite</span>
          <span className="text-xs text-muted-foreground">console</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <NavItem key={n.id} active={!detail && view === n.id} onClick={() => go(n.id)}>
              {n.label}
            </NavItem>
          ))}
          {detail && (
            <div className="mt-1 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
              <span className="text-accent">▸</span>
              <span className="truncate" title={detail.name}>
                {detail.name}
              </span>
            </div>
          )}
        </nav>

        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          <div className="truncate text-foreground/80">
            {info?.name ?? 'broker'}
            {info?.version ? ` ${info.version}` : ''}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-faint">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
            {info?.status ?? 'online'}
          </div>
          <button onClick={onSignOut} className="mt-3 text-muted-foreground transition-colors hover:text-danger">
            sign out →
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-6">
        {detail ? (
          <Detail target={detail} onBack={() => setDetail(null)} onOpenSub={openSub} />
        ) : view === 'overview' ? (
          <Overview onOpenQueue={openQueue} onOpenSub={openSub} onNav={go} />
        ) : view === 'queues' ? (
          <Queues onOpen={openQueue} />
        ) : view === 'topics' ? (
          <Topics onOpenSub={openSub} />
        ) : (
          <Metrics onOpenQueue={openQueue} onOpenSub={openSub} />
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
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
