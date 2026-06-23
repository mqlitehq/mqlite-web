import type { ReactNode } from 'react'
import { Card } from '../components/ui'

// Hand-drawn SVG replacements for the docs' ASCII figures — crisp at any width, themed.
// All prose lives in the HTML caption (it wraps); the SVG carries only boxes/arrows/short
// labels, kept inside the viewBox so nothing clips.

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
        <text x={(x1 + x2) / 2 + 7} y={(y1 + y2) / 2} fontSize={10} dominantBaseline="central" fill="var(--color-faint)">
          {label}
        </text>
      )}
    </g>
  )
}

function Heading({ x, children }: { x: number; children: string }) {
  return (
    <text x={x} y={20} fontSize={13} fontWeight={600} fill="var(--color-foreground)">
      {children}
    </text>
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
      <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">{caption}</div>
    </Card>
  )
}

export function Diagrams() {
  return (
    <div className="space-y-6">
      {/* ── Figure 1: two delivery targets ───────────────────────────────────── */}
      <Figure
        title="Two delivery targets — queue vs. topic fan-out"
        viewBox="0 0 800 350"
        caption={
          <>
            <p>
              <strong className="text-foreground">A topic stores nothing</strong> — it is only a routing rule that copies
              a message into the queues of the subscriptions whose filter matches. The thing that actually stores, is
              consumed, and can dead-letter is always a <strong className="text-foreground">queue</strong> (including the
              backing queue behind a subscription).
            </p>
            <p>
              <span className="text-danger">✗ matches no subscription → the message is dropped</span> (no copy is
              stored). Each subscription is its own independent queue, with its own DLQ.
            </p>
          </>
        }
      >
        {/* A · direct to a queue */}
        <Heading x={30}>A · send straight to a queue</Heading>
        <Box x={50} y={40} w={160} h={32} lines={['producer']} />
        <Arrow x1={130} y1={72} x2={130} y2={98} label={'send "orders"'} />
        <rect x={35} y={104} width={220} height={182} rx={6} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />
        <text x={145} y={120} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-foreground)">
          queue · orders
        </text>
        <Box x={55} y={130} w={180} h={30} lines={['active']} tone="ok" />
        <Arrow x1={145} y1={160} x2={145} y2={174} />
        <Box x={55} y={176} w={180} h={30} lines={['locked (in-flight)']} tone="warn" />
        <Arrow x1={145} y1={206} x2={145} y2={220} />
        <Box x={55} y={222} w={180} h={30} lines={['dead-letter (DLQ)']} tone="danger" />
        <Arrow x1={145} y1={286} x2={145} y2={310} label="receive" />
        <Box x={50} y={312} w={160} h={32} lines={['consumer']} />

        {/* B · publish to a topic, fan out */}
        <Heading x={360}>B · publish to a topic — fan out</Heading>
        <Box x={500} y={40} w={160} h={32} lines={['producer']} />
        <Arrow x1={580} y1={72} x2={580} y2={98} label={'publish "events"'} />
        <Box x={440} y={104} w={290} h={50} lines={['topic · events', 'routing rule — stores nothing']} tone="accent" dashed />
        {/* three outcomes */}
        <Arrow x1={500} y1={154} x2={465} y2={198} label="match" />
        <Arrow x1={620} y1={154} x2={622} y2={198} label="match" />
        <Arrow x1={700} y1={154} x2={730} y2={196} />
        <Box x={390} y={202} w={150} h={52} lines={['sub · audit', 'backing queue']} />
        <Box x={550} y={202} w={150} h={52} lines={['sub · billing', 'backing queue']} />
        <text x={745} y={206} fontSize={18} fill="var(--color-danger)">
          ✗
        </text>
        <text x={712} y={228} fontSize={10} fill="var(--color-danger)">
          no match
        </text>
        <text x={712} y={242} fontSize={10} fill="var(--color-danger)">
          dropped
        </text>
        <Arrow x1={465} y1={254} x2={465} y2={282} />
        <Arrow x1={625} y1={254} x2={625} y2={282} />
        <Box x={390} y={284} w={150} h={30} lines={['consumer']} />
        <Box x={550} y={284} w={150} h={30} lines={['consumer']} />
      </Figure>

      {/* ── Figure 2: a message's life ───────────────────────────────────────── */}
      <Figure
        title="A message's life — states & settlement"
        viewBox="0 0 720 250"
        caption={
          <>
            <p>
              <strong className="text-foreground">receive</strong> locks the head message; you then settle it. A queue
              holds messages by state, and only <strong className="text-foreground">active</strong> is claimable.
            </p>
            <p>
              Automatic transitions: a message redelivered past <strong className="text-foreground">max-delivery-count</strong>{' '}
              → DLQ; a <strong className="text-foreground">TTL</strong> expiry → DLQ (if dead-letter-on-expire) or
              discarded. A <strong className="text-foreground">deferred</strong> message is retrieved later by its seq
              (ReceiveDeferred).
            </p>
          </>
        }
      >
        <Box x={20} y={70} w={120} h={36} lines={['scheduled']} tone="info" />
        <Arrow x1={140} y1={88} x2={185} y2={88} label="due" />
        <Box x={185} y={70} w={120} h={36} lines={['active']} tone="ok" />
        <Arrow x1={305} y1={88} x2={360} y2={88} label="receive" />
        <Box x={360} y={70} w={120} h={36} lines={['locked']} tone="warn" />

        {/* settlement branches from locked */}
        <Arrow x1={480} y1={80} x2={545} y2={46} label="complete" />
        <Box x={545} y={30} w={150} h={32} lines={['completed ✓']} />
        <Arrow x1={480} y1={88} x2={545} y2={104} label="defer" />
        <Box x={545} y={88} w={150} h={32} lines={['deferred']} tone="info" />
        <Arrow x1={480} y1={98} x2={545} y2={162} label="reject" />
        <Box x={545} y={146} w={150} h={32} lines={['dead-letter']} tone="danger" />

        {/* abandon loop back to active */}
        <path d="M 420 106 L 420 205 L 245 205 L 245 106" fill="none" stroke="var(--color-faint)" strokeWidth={1.5} markerEnd="url(#arr)" />
        <text x={300} y={220} fontSize={10} fill="var(--color-faint)">
          abandon → redelivered (delivery_count++)
        </text>
      </Figure>
    </div>
  )
}
