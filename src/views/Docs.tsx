import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import concepts from '../docs/concepts.md?raw'
import apiref from '../docs/api-reference.md?raw'
import examples from '../docs/examples.md?raw'
import { Diagrams } from './Diagrams'
import { Card, PageHeader } from '../components/ui'
import { cn } from '../lib/cn'

// mqlite's own reference, bundled into the build (synced from mqlite/docs) so it reads
// offline, in-app. The first tab is hand-drawn SVG figures; the rest render markdown.
const TABS = [
  { id: 'diagrams', label: 'diagrams' },
  { id: 'concepts', label: 'concepts & filters' },
  { id: 'api', label: 'HTTP API' },
  { id: 'examples', label: 'examples' },
]
const MD: Record<string, string> = { concepts, api: apiref, examples }

export function Docs() {
  const [active, setActive] = useState('diagrams')
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="docs" subtitle="mqlite's own reference, bundled with this build" />
      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              active === t.id
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === 'diagrams' ? (
        <div className="mt-4">
          <Diagrams />
        </div>
      ) : (
        <Card className="mt-4 p-6">
          <div className="doc">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{MD[active] ?? ''}</ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  )
}
