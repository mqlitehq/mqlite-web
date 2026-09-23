import { Diagrams } from './Diagrams.js'
import { Button, Card, PageHeader } from '../components/ui.js'

// In-app help is web-owned (the SVG concept figures + the subscription editor's built-in
// expression reference). The canonical, full docs live with the broker — we link out
// rather than bundling them, so this repo never depends on the main repo's source.
const REPO = 'https://github.com/mqlitehq/mqlite'
const LINKS = [
  { label: 'Concepts & subscription filters', href: `${REPO}/blob/main/docs/concepts.md` },
  { label: 'Access keys and credential rotation', href: `${REPO}/blob/main/docs/access-keys.md` },
  { label: 'HTTP API reference', href: `${REPO}/blob/main/docs/api-reference.md` },
  { label: 'Examples', href: `${REPO}/blob/main/docs/examples.md` },
]

export function Docs({ onOpenKeys }: { onOpenKeys: () => void }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="docs" subtitle="concept diagrams + the canonical reference" />
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">access keys</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Use a configured administrator token or a managed key with manage permission for administration. Configured
          monitor tokens open read-only overview and metrics views. Create separate send keys for producers, listen keys
          for consumers, or send + listen keys for processors. Manage includes both and can issue and revoke other
          administrator keys. Permissions apply to the entire broker.
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          New secrets use mqk_ followed by 64 random lowercase hexadecimal characters (256 bits). Copy the secret once
          into your secret manager. Rotate by creating a replacement, switching clients, then revoking the old key. If a
          creation response is lost, retain its public request ID, check that exact ID and revoke any undelivered key
          before replacing it. A missing row does not prove an outstanding request cannot still commit. The console
          never retries creation automatically.
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Managed keys may expire or be revoked; configured tokens are managed through deployment configuration.
          Restoring an old database backup can restore keys that were revoked later: audit and rotate them before
          reopening access. Existing v0.3.0 brokers keep their original queue tools; managed keys require v0.3.1 or
          later.
        </p>
        <Button variant="outline" size="sm" onClick={onOpenKeys}>
          open access keys
        </Button>
      </Card>
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
