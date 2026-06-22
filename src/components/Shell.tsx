import { useEffect, useState, type ReactNode } from 'react'
import { discovery } from '../lib/api'
import type { Discovery } from '../lib/types'
import { cn } from '../lib/cn'
import { Overview } from '../views/Overview'
import { QueueDetail } from '../views/QueueDetail'

export function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [info, setInfo] = useState<Discovery | null>(null)

  useEffect(() => {
    discovery().then(setInfo)
  }, [])

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-surface/40">
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <span className="text-accent">▸</span>
          <span className="font-semibold">mqlite</span>
          <span className="text-xs text-muted-foreground">console</span>
        </div>

        <nav className="flex-1 p-2">
          <NavItem active={!selected} onClick={() => setSelected(null)}>
            overview
          </NavItem>
          {selected && (
            <div className="mt-1 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
              <span className="text-accent">▸</span>
              <span className="truncate">{selected}</span>
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
        {selected ? (
          <QueueDetail name={selected} onBack={() => setSelected(null)} />
        ) : (
          <Overview onOpen={setSelected} />
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
