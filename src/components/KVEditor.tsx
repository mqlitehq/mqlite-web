import { Button, Input } from './ui'

export interface KV {
  k: string
  v: string
}

// Collapse rows into a properties map, dropping blank keys.
export function kvRecord(pairs: KV[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) if (p.k.trim()) out[p.k.trim()] = p.v
  return out
}

// A small key/value rows editor — one row per property, add/remove. Used wherever a
// message's properties are entered by hand (publish, filter sample).
export function KVEditor({
  pairs,
  onChange,
  addLabel = '+ property',
}: {
  pairs: KV[]
  onChange: (pairs: KV[]) => void
  addLabel?: string
}) {
  const set = (i: number, patch: Partial<KV>) => onChange(pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="space-y-1.5">
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-1.5">
          <Input className="flex-1" placeholder="key" value={p.k} onChange={(e) => set(i, { k: e.target.value })} />
          <Input className="flex-1" placeholder="value" value={p.v} onChange={(e) => set(i, { v: e.target.value })} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="remove property"
            onClick={() => onChange(pairs.filter((_, j) => j !== i))}
          >
            ✕
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...pairs, { k: '', v: '' }])}>
        {addLabel}
      </Button>
    </div>
  )
}
