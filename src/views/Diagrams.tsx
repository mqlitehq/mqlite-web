import type { ReactNode } from 'react'
import { Card } from '../components/ui'

// Hand-drawn SVG replacements for the docs' ASCII figures — they render crisply at any
// width, unlike box-art in a proportional/markdown context.

const TONE: Record<string, { stroke: string; fill: string }> = {
  base: { stroke: 'var(--color-border-strong)', fill: 'var(--color-surface-2)' },
  accent: { stroke: 'var(--color-accent)', fill: 'var(--color-accent-dim)' },
  ok: { stroke: 'var(--color-ok)', fill: 'rgb(52 199 89 / 0.12)' },
  warn: { stroke: 'var(--color-warn)', fill: 'rgb(227 179 65 / 0.12)' },
  danger: { stroke: 'var(--color-danger)', fill: 'rgb(228 69 69 / 0.12)' },
  info: { stroke: 'var(--color-info)', fill: 'rgb(58 136 233 / 0.12)' },
}

function Box({
  x,
  y,
  w,
  h,
  lines,
  tone = 'base',
  dashed,
}: {
  x: number
  y: number
  w: number
  h: number
  lines: string[]
  tone?: keyof typeof TONE
  dashed?: boolean
}) {
  const t = TONE[tone]
  const cx = x + w / 2
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth={1.5}
        strokeDasharray={dashed ? '5 4' : undefined}
      />
      {lines.map((ln, i) => (
        <text
          key={i}
          x={cx}
          y={y + h / 2 + (i - (lines.length - 1) / 2) * 15}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={i === 0 ? 13 : 11}
          fontWeight={i === 0 ? 600 : 400}
          fill={i === 0 ? 'var(--color-foreground)' : 'var(--color-muted-foreground)'}
        >
          {ln}
        </text>
      ))}
    </g>
  )
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-faint)" strokeWidth={1.5} markerEnd="url(#arr)" />
      {label && (
        <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2} fontSize={10} dominantBaseline="central" fill="var(--color-faint)">
          {label}
        </text>
      )}
    </g>
  )
}

function Figure({ title, caption, viewBox, children }: { title: string; caption: ReactNode; viewBox: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <svg viewBox={viewBox} className="w-full" style={{ fontFamily: 'var(--font-mono)' }} role="img" aria-label={title}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--color-faint)" />
          </marker>
        </defs>
        {children}
      </svg>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{caption}</p>
    </Card>
  )
}

export function Diagrams() {
  return (
    <div className="space-y-6">
      {/* ── Figure 1: two delivery targets ───────────────────────────────────── */}
      <Figure
        title="Two delivery targets — queue vs. topic fan-out"
        viewBox="0 0 700 380"
        caption={
          <>
            A <strong className="text-foreground">topic stores nothing</strong> — it is only a routing rule that copies a
            message into the queues of the subscriptions whose filter matches. The thing that actually stores, is
            consumed, and can dead-letter is always a <strong className="text-foreground">queue</strong> (including the
            backing queue behind a subscription).
          </>
        }
      >
        {/* A: direct to a queue */}
        <text x={20} y={20} fontSize={13} fontWeight={600} fill="var(--color-foreground)">
          A · send straight to a queue
        </text>
        <Box x={45} y={38} w={150} h={32} lines={['producer']} />
        <Arrow x1={120} y1={70} x2={120} y2={96} label={'send "orders"'} />
        <rect x={30} y={100} width={210} height={208} rx={6} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />
        <text x={135} y={117} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-foreground)">
          queue · orders
        </text>
        <Box x={50} y={128} w={170} h={30} lines={['active']} tone="ok" />
        <Arrow x1={135} y1={158} x2={135} y2={172} />
        <Box x={50} y={174} w={170} h={30} lines={['locked (in-flight)']} tone="warn" />
        <Arrow x1={135} y1={204} x2={135} y2={218} />
        <Box x={50} y={220} w={170} h={30} lines={['dead-letter (DLQ)']} tone="danger" />
        <Arrow x1={135} y1={308} x2={135} y2={334} label="receive" />
        <Box x={45} y={336} w={150} h={32} lines={['consumer']} />

        {/* B: publish to a topic, fan out */}
        <text x={360} y={20} fontSize={13} fontWeight={600} fill="var(--color-foreground)">
          B · publish to a topic — fan out
        </text>
        <Box x={505} y={38} w={150} h={32} lines={['producer']} />
        <Arrow x1={580} y1={70} x2={580} y2={96} label={'publish "events"'} />
        <Box x={455} y={100} w={250} h={52} lines={['topic · events', 'routing rule — stores nothing']} tone="accent" dashed />
        <Arrow x1={500} y1={152} x2={470} y2={196} label="match" />
        <Arrow x1={620} y1={152} x2={620} y2={196} label="match" />
        <Box x={360} y={200} w={150} h={54} lines={['sub · audit', 'backing queue']} />
        <Box x={545} y={200} w={150} h={54} lines={['sub · billing', 'backing queue']} />
        <Arrow x1={435} y1={254} x2={435} y2={280} />
        <Arrow x1={620} y1={254} x2={620} y2={280} />
        <Box x={360} y={282} w={150} h={28} lines={['consumer']} />
        <Box x={545} y={282} w={150} h={28} lines={['consumer']} />
        <text x={360} y={336} fontSize={11} fill="var(--color-danger)">
          ✗ matches no subscription → dropped (no copy is stored)
        </text>
        <text x={360} y={356} fontSize={11} fill="var(--color-muted-foreground)">
          each subscription is its own independent queue (+ its own DLQ)
        </text>
      </Figure>

      {/* ── Figure 2: a message's life ───────────────────────────────────────── */}
      <Figure
        title="A message's life — states & settlement"
        viewBox="0 0 700 300"
        caption={
          <>
            <strong className="text-foreground">receive</strong> locks the head message; you then settle it. A queue
            holds messages by state; only <strong className="text-foreground">active</strong> is claimable. Expiry and
            exhausted retries dead-letter automatically.
          </>
        }
      >
        <Box x={20} y={70} w={120} h={36} lines={['scheduled']} tone="info" />
        <Arrow x1={140} y1={88} x2={185} y2={88} label="time reached" />
        <Box x={185} y={70} w={120} h={36} lines={['active']} tone="ok" />
        <Arrow x1={305} y1={88} x2={360} y2={88} label="receive" />
        <Box x={360} y={70} w={120} h={36} lines={['locked']} tone="warn" />

        {/* settlement branches from locked */}
        <Arrow x1={480} y1={80} x2={540} y2={48} label="complete" />
        <Box x={540} y={32} w={140} h={32} lines={['completed ✓']} />
        <Arrow x1={480} y1={88} x2={540} y2={104} label="defer" />
        <Box x={540} y={88} w={140} h={32} lines={['deferred']} tone="info" />
        <Arrow x1={480} y1={98} x2={540} y2={160} label="reject" />
        <Box x={540} y={146} w={140} h={32} lines={['dead-letter (DLQ)']} tone="danger" />

        {/* abandon loop back to active */}
        <path
          d="M 420 106 L 420 210 L 245 210 L 245 106"
          fill="none"
          stroke="var(--color-faint)"
          strokeWidth={1.5}
          markerEnd="url(#arr)"
        />
        <text x={300} y={224} fontSize={10} fill="var(--color-faint)">
          abandon → redelivered (delivery_count++)
        </text>

        <text x={20} y={262} fontSize={11} fill="var(--color-muted-foreground)">
          • TTL expires → DLQ (if dead-letter-on-expire) or discarded
        </text>
        <text x={20} y={282} fontSize={11} fill="var(--color-muted-foreground)">
          • redelivered past max-delivery-count → DLQ · defer → retrieve later by seq (ReceiveDeferred)
        </text>
      </Figure>
    </div>
  )
}
