import { Diagrams } from './Diagrams'
import { Card, PageHeader } from '../components/ui'

// In-app help is web-owned (the SVG concept figures + the subscription editor's built-in
// expression reference). The canonical, full docs live with the broker — we link out
// rather than bundling them, so this repo never depends on the main repo's source.
const REPO = 'https://github.com/mqlitehq/mqlite'
const LINKS = [
  { label: 'Concepts & subscription filters', href: `${REPO}/blob/main/docs/concepts.md` },
  { label: 'HTTP API reference', href: `${REPO}/blob/main/docs/api-reference.md` },
  { label: 'Examples', href: `${REPO}/blob/main/docs/examples.md` },
]

export function Docs() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="docs" subtitle="concept diagrams + the canonical reference" />
      <Diagrams />
      <Card className="p-5">
        <h3 className="mb-1.5 text-sm font-semibold">full reference</h3>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          The canonical docs live with the broker. (The subscription editor also has a built-in expression reference for
          filters.)
        </p>
        <ul className="space-y-1.5 text-sm">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2 transition-colors hover:text-accent-hover"
              >
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
