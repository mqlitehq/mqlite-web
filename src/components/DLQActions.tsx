import { useState } from 'react'
import { purge, redrive } from '../lib/api'
import { Button, Card, Input, Label, Select } from './ui'

const UNITS = [
  { label: 'minutes', ms: 60_000 },
  { label: 'hours', ms: 3_600_000 },
  { label: 'days', ms: 86_400_000 },
]

// Bulk dead-letter actions with the full Redrive/Purge option set (Web↔API parity):
// act on a subset by age and/or count, redrive to a target queue, optionally rate-limited.
// Blank fields = act on everything with no limit. `run` reuses the parent's busy/result
// handling.
export function DLQActions({
  queue,
  busy,
  run,
}: {
  queue: string
  busy: boolean
  run: (fn: () => Promise<string>) => void
}) {
  const [olderN, setOlderN] = useState('')
  const [olderU, setOlderU] = useState(String(86_400_000))
  const [max, setMax] = useState('')
  const [target, setTarget] = useState('')
  const [rate, setRate] = useState('')

  const olderMs = Number(olderN) > 0 ? Number(olderN) * Number(olderU) : 0
  const base = {
    ...(Number(max) > 0 ? { max: Number(max) } : {}),
    ...(olderMs > 0 ? { older_than_ms: olderMs } : {}),
  }

  return (
    <Card className="mt-3 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>older than (blank = any)</Label>
          <div className="flex gap-2">
            <Input type="number" min="0" className="w-16" value={olderN} onChange={(e) => setOlderN(e.target.value)} placeholder="0" />
            <Select value={olderU} onChange={(e) => setOlderU(e.target.value)} className="flex-1">
              {UNITS.map((u) => (
                <option key={u.ms} value={u.ms}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>max (blank = all)</Label>
          <Input type="number" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder="all" />
        </div>
        <div>
          <Label>redrive target (blank = origin)</Label>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="(same queue)" />
        </div>
        <div>
          <Label>redrive rate /sec (blank = max)</Label>
          <Input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="∞" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-faint">applies to the messages matching the filters above</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const n = await redrive(queue, {
                  ...base,
                  ...(target ? { target } : {}),
                  ...(Number(rate) > 0 ? { rate_per_sec: Number(rate) } : {}),
                })
                return `redrove ${n} message(s)`
              })
            }
          >
            redrive
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => run(async () => `purged ${await purge(queue, base)} message(s)`)}
          >
            purge
          </Button>
        </div>
      </div>
    </Card>
  )
}
