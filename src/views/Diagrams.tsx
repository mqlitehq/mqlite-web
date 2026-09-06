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
        viewBox="0 0 900 380"
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
        {/* A · direct to a queue — producer → queue → consumer; DLQ is a closed side-loop */}
        <Heading x={30}>A · send straight to a queue</Heading>
        <Box x={40} y={40} w={170} h={32} lines={['producer']} />
        <Arrow x1={125} y1={72} x2={125} y2={98} label={'send "orders"'} />
        <rect x={30} y={104} width={190} height={128} rx={6} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />
        <text x={125} y={120} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-foreground)">
          queue · orders
        </text>
        <Box x={45} y={132} w={160} h={30} lines={['active']} tone="ok" />
        <Arrow x1={125} y1={162} x2={125} y2={176} label="claim" />
        <Box x={45} y={178} w={160} h={30} lines={['locked (in-flight)']} tone="warn" />
        {/* normal path: the consumer receives + completes, and the message leaves the queue */}
        <Arrow x1={125} y1={232} x2={125} y2={262} label="receive + complete" />
        <Box x={40} y={264} w={170} h={32} lines={['consumer']} />
        {/* exceptional path: only on failure → DLQ, a sink that closes back via redrive / purge */}
        <line x1={205} y1={188} x2={270} y2={182} stroke="var(--color-faint)" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#arr)" />
        <text x={237} y={172} textAnchor="middle" fontSize={10} fill="var(--color-faint)">on failure</text>
        <Box x={270} y={160} w={152} h={36} lines={['dead-letter (DLQ)']} tone="danger" />
        <path d="M 346 160 L 346 140 L 205 140" fill="none" stroke="var(--color-faint)" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#arr)" />
        <text x={276} y={132} textAnchor="middle" fontSize={10} fill="var(--color-faint)">redrive ↺ (to active)</text>
        <text x={346} y={212} textAnchor="middle" fontSize={10} fill="var(--color-faint)">…or purge ✗</text>

        {/* B · publish to a topic, fan out — each subscription is itself a full queue.
            Offset the whole column right + down so it staggers clear of Column A's DLQ box. */}
        <Heading x={410}>B · publish to a topic — fan out</Heading>
        <g transform="translate(50,24)">
        <Box x={500} y={40} w={160} h={32} lines={['producer']} />
        <Arrow x1={580} y1={72} x2={580} y2={98} label={'publish "events"'} />
        <Box x={440} y={104} w={290} h={50} lines={['topic · events', 'routing rule — stores nothing']} tone="accent" dashed />
        {/* three outcomes: match → two subscription queues, no match → dropped */}
        <Arrow x1={500} y1={154} x2={465} y2={198} label="match" />
        <Arrow x1={650} y1={154} x2={668} y2={196} label="match" />
        <Arrow x1={740} y1={154} x2={780} y2={194} />
        <Box x={386} y={198} w={158} h={64} lines={['sub · audit', 'backing queue', '= a queue · own DLQ']} />
        <Box x={591} y={198} w={158} h={64} lines={['sub · billing', 'backing queue', '= a queue · own DLQ']} />
        <text x={808} y={208} textAnchor="middle" fontSize={18} fill="var(--color-danger)">
          ✗
        </text>
        <text x={808} y={228} textAnchor="middle" fontSize={10} fill="var(--color-danger)">
          no match
        </text>
        <text x={808} y={241} textAnchor="middle" fontSize={10} fill="var(--color-danger)">
          dropped
        </text>
        <Arrow x1={465} y1={262} x2={465} y2={292} label="receive" />
        <Arrow x1={670} y1={262} x2={670} y2={292} label="receive" />
        <Box x={386} y={294} w={158} h={32} lines={['consumer']} />
        <Box x={591} y={294} w={158} h={32} lines={['consumer']} />
        </g>
      </Figure>

      {/* ── Figure 2: a message's life ───────────────────────────────────────── */}
      <Figure
        title="A message's life — states & settlement"
        viewBox="0 0 720 285"
        caption={
          <>
            <p>
              <strong className="text-foreground">receive</strong> locks an eligible active message and increments its
              delivery count; you then settle it. Ordering can hold successors behind an earlier message.
              <strong className="text-foreground"> Renew</strong> extends the current lease without changing state.
            </p>
            <p>
              Below the delivery limit, immediate <strong className="text-foreground">abandon</strong> or automatic{' '}
              <strong className="text-foreground">lock expiry</strong> returns the message to active. Abandon with a
              positive delay parks it in <strong className="text-foreground">scheduled</strong> until due, holding
              its group (or the whole strict-FIFO queue). Abandon or lock expiry at{' '}
              <strong className="text-foreground">delivery_count ≥ max</strong> goes to DLQ instead, as does an
              explicit <strong className="text-foreground">reject</strong>. The count increments on the next claim,
              not when requeued.
            </p>
            <p>
              <strong className="text-foreground">TTL</strong> expiry applies to active, locked, scheduled and
              deferred messages: DLQ when dead-letter-on-expire is enabled, otherwise removal.
              <strong className="text-foreground"> Cancel</strong> removes only a never-delivered scheduled message
              before activation; it cannot cancel a backoff retry.
            </p>
            <p>
              <strong className="text-foreground">ReceiveDeferred</strong> claims an unexpired deferred message by
              seq and increments its delivery count. <strong className="text-foreground">Redrive</strong> returns a
              DLQ message to active with the count reset; purge / retention removes it. Settlement is fenced by the
              lock token. Within receipt retention, a successful retry must repeat the exact queue, seq, token,
              operation and effect-changing arguments.
            </p>
          </>
        }
      >
        <Box x={20} y={70} w={120} h={36} lines={['scheduled']} tone="info" />
        <Arrow x1={142} y1={88} x2={185} y2={88} />
        <text x={163} y={79} textAnchor="middle" fontSize={10} fill="var(--color-faint)">due</text>
        <Box x={185} y={70} w={120} h={36} lines={['active']} tone="ok" />
        <Arrow x1={307} y1={88} x2={360} y2={88} />
        <text x={333} y={55} textAnchor="middle" fontSize={10} fill="var(--color-faint)">receive</text>
        <text x={333} y={68} textAnchor="middle" fontSize={10} fill="var(--color-faint)">(count++)</text>
        <Box x={360} y={70} w={120} h={36} lines={['locked']} tone="warn" />

        {/* settlement branches from locked */}
        <Arrow x1={480} y1={78} x2={545} y2={46} />
        <text x={502} y={56} textAnchor="middle" fontSize={10} fill="var(--color-faint)">complete</text>
        <Box x={545} y={30} w={150} h={32} lines={['removed ✓']} />
        {/* defer is bidirectional: defer parks the message, ReceiveDeferred (by seq) brings it back to locked */}
        <line x1={485} y1={92} x2={542} y2={98} stroke="var(--color-faint)" strokeWidth={1.5} markerStart="url(#arr)" markerEnd="url(#arr)" />
        <text x={513} y={82} textAnchor="middle" fontSize={10} fill="var(--color-faint)">defer ⇄</text>
        <Box x={545} y={88} w={150} h={32} lines={['deferred']} tone="info" />
        <Arrow x1={486} y1={106} x2={545} y2={160} />
        <text x={620} y={135} textAnchor="middle" fontSize={10} fill="var(--color-faint)">reject / count ≥ max</text>
        <Box x={545} y={146} w={150} h={32} lines={['dead-letter (DLQ)']} tone="danger" />

        {/* delayed abandon: below the delivery limit, park in scheduled until due */}
        <path d="M 420 70 L 420 26 L 80 26 L 80 68" fill="none" stroke="var(--color-faint)" strokeWidth={1.5} markerEnd="url(#arr)" />
        <text x={250} y={16} textAnchor="middle" fontSize={10} fill="var(--color-faint)">
          abandon + delay (count &lt; max)
        </text>

        {/* cancel: only a never-delivered scheduled message is removed */}
        <Arrow x1={80} y1={106} x2={80} y2={128} label="cancel" />
        <text x={58} y={144} fontSize={11} fill="var(--color-danger)">
          ✗ removed
        </text>
        <text x={80} y={161} textAnchor="middle" fontSize={10} fill="var(--color-faint)">
          never delivered
        </text>

        {/* immediate abandon or lock expiry below the limit returns to active */}
        <path d="M 420 106 L 420 205 L 245 205 L 245 106" fill="none" stroke="var(--color-faint)" strokeWidth={1.5} markerEnd="url(#arr)" />
        <text x={250} y={222} fontSize={10} fill="var(--color-faint)">
          immediate abandon / lock expiry (count &lt; max)
        </text>

        {/* redrive loop: a dead-letter sent back to active with delivery_count reset */}
        <path d="M 600 178 L 600 252 L 225 252 L 225 106" fill="none" stroke="var(--color-faint)" strokeWidth={1.5} markerEnd="url(#arr)" />
        <text x={250} y={268} fontSize={10} fill="var(--color-faint)">
          redrive → active (delivery_count reset to 0)
        </text>
      </Figure>
    </div>
  )
}
