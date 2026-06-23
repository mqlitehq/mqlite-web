import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import concepts from '../docs/concepts.md?raw'
import apiref from '../docs/api-reference.md?raw'
import examples from '../docs/examples.md?raw'
import { Card, PageHeader } from '../components/ui'
import { cn } from '../lib/cn'

// mqlite's own reference, bundled into the build (synced from mqlite/docs) so it reads
// offline, in-app — no trip to GitHub.
const DOCS = [
  { id: 'concepts', label: 'concepts & filters', md: concepts },
  { id: 'api', label: 'HTTP API', md: apiref },
  { id: 'examples', label: 'examples', md: examples },
]

export function Docs() {
  const [active, setActive] = useState(DOCS[0].id)
  const doc = DOCS.find((d) => d.id === active) ?? DOCS[0]
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="docs" subtitle="mqlite's own reference, bundled with this build" />
      <div className="mt-4 flex flex-wrap gap-2">
        {DOCS.map((d) => (
          <button
            key={d.id}
            onClick={() => setActive(d.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              active === d.id
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <Card className="mt-4 p-6">
        <div className="doc">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.md}</ReactMarkdown>
        </div>
      </Card>
    </div>
  )
}
