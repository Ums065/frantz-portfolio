/* OfferStepper — the shared, real-time status tracker for an internship offer.
   Every stakeholder (business / admin / student / parent) sees the SAME picture:
   an animated 4-step progress rail, a live progress %, the current stage badge,
   what happens next, and — on click — the full audit timeline of who did what when.

   Driven entirely by the backend `stage` object + `timeline` array so there is a
   single source of truth. Purely presentational; no data fetching. */

export interface OfferStage {
  key: string
  label: string
  progress: number
  rejected?: boolean
  by?: string
  reason?: string
  next?: string
}

export interface OfferEvent {
  event: string
  actor_role: string
  actor_label: string
  note: string
  ts: number
}

/* The four milestones on the happy path. A rejected offer freezes at whichever
   step it died on and paints that step (and the rail up to it) red. */
const STEPS = [
  { key: 'admin', label: 'Admin Review', reach: 25 },
  { key: 'student', label: 'Student', reach: 55 },
  { key: 'parent', label: 'Parent Consent', reach: 80 },
  { key: 'confirmed', label: 'Confirmed', reach: 100 },
]

const EVENT_LABELS: Record<string, string> = {
  created: 'Offer created by business',
  admin_approved: 'Approved by admin',
  admin_rejected: 'Rejected by admin',
  admin_info: 'Admin requested more information',
  student_accepted: 'Accepted by student',
  student_declined: 'Declined by student',
  parent_approved: 'Consent given by parent/guardian',
  parent_declined: 'Consent declined by parent/guardian',
  confirmed: 'Internship confirmed 🎉',
}

function fmtTs(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function StageBadge({ stage }: { stage: OfferStage }) {
  const rejected = !!stage.rejected
  const confirmed = stage.key === 'confirmed'
  const bg = rejected ? 'rgba(224,138,138,0.16)' : confirmed ? 'rgba(120,200,140,0.16)' : 'rgba(212,175,90,0.16)'
  const fg = rejected ? '#e59a9a' : confirmed ? '#8fd6a3' : 'var(--gold-light)'
  const bd = rejected ? 'rgba(224,138,138,0.4)' : confirmed ? 'rgba(120,200,140,0.4)' : 'rgba(212,175,90,0.4)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, color: fg,
      border: `1px solid ${bd}`, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700,
      letterSpacing: '.02em', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: fg, boxShadow: `0 0 6px ${fg}` }} />
      {stage.label}
    </span>
  )
}

export default function OfferStepper({ stage, timeline, compact }: { stage: OfferStage; timeline?: OfferEvent[]; compact?: boolean }) {
  const pct = Math.max(0, Math.min(100, stage.progress || 0))
  const rejected = !!stage.rejected
  const railColor = rejected ? '#e08a8a' : 'var(--gold)'

  return (
    <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
      {/* Header: stage badge + live % */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <StageBadge stage={stage} />
        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{pct}% complete</span>
      </div>

      {/* Animated progress rail with milestone nodes */}
      <div style={{ position: 'relative', padding: '2px 4px' }}>
        <div style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,0.09)', borderRadius: 4, margin: '0 6px' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
            background: rejected
              ? `linear-gradient(90deg, ${railColor}, #c96f6f)`
              : 'linear-gradient(90deg, var(--gold), var(--gold-light))',
            borderRadius: 4, transition: 'width 700ms cubic-bezier(.2,.8,.2,1)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -13 }}>
          {STEPS.map((s) => {
            const done = pct >= s.reach
            const active = !done && pct >= s.reach - 30 && !rejected
            const isRejectStep = rejected && pct <= s.reach
            const dot = isRejectStep && done ? '#e08a8a' : done ? 'var(--gold)' : active ? 'var(--gold-light)' : 'rgba(255,255,255,0.18)'
            const ring = done || active ? railColor : 'rgba(255,255,255,0.18)'
            return (
              <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: dot,
                  border: `2px solid ${ring}`, boxShadow: done ? `0 0 8px ${dot}` : 'none',
                  transition: 'all 500ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#1c1a14', fontWeight: 900,
                }}>{done && !rejected ? '✓' : ''}</span>
                <span style={{
                  fontSize: 10.5, marginTop: 6, color: done ? 'var(--ivory)' : 'var(--muted)',
                  fontWeight: done ? 600 : 400, textAlign: 'center', lineHeight: 1.2,
                }}>{s.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Next action / rejection reason */}
      {rejected ? (
        <div style={{ background: 'rgba(224,138,138,0.1)', border: '1px solid rgba(224,138,138,0.3)', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: 12, color: '#e59a9a', fontWeight: 700 }}>Not proceeding</div>
          {stage.reason ? <div style={{ fontSize: 12.5, color: '#e8c9c9', marginTop: 3, lineHeight: 1.5 }}>Reason: {stage.reason}</div> : null}
        </div>
      ) : stage.next ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>Next: </span>{stage.next}
        </div>
      ) : null}

      {/* Full audit timeline */}
      {!compact && timeline && timeline.length > 0 ? (
        <details style={{ marginTop: 2 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--gold-light)', fontWeight: 600, userSelect: 'none' }}>
            View full history ({timeline.length})
          </summary>
          <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 10, borderLeft: '1px solid var(--line)', paddingLeft: 14 }}>
            {timeline.map((e, i) => (
              <li key={i} style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: -19, top: 3, width: 8, height: 8, borderRadius: '50%', background: e.event.includes('declined') || e.event.includes('rejected') ? '#e08a8a' : e.event === 'confirmed' ? '#8fd6a3' : 'var(--gold)' }} />
                <div style={{ fontSize: 12.5, color: 'var(--ivory)', fontWeight: 600 }}>{EVENT_LABELS[e.event] || e.event}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{[e.actor_label, fmtTs(e.ts)].filter(Boolean).join(' · ')}</div>
                {e.note ? <div style={{ fontSize: 12, color: '#d8d3c6', marginTop: 2, fontStyle: 'italic' }}>“{e.note}”</div> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}

/* Lightweight confetti burst — no dependency. Renders ~40 falling gold/green
   pieces for ~1.6s. Mount conditionally (e.g. right after a student confirms). */
export function Confetti({ show }: { show: boolean }) {
  if (!show) return null
  const colors = ['#d4af5a', '#e6cd7f', '#8fd6a3', '#f5e9c8', '#c99b3f']
  const pieces = Array.from({ length: 44 }, (_, i) => i)
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      <style>{`@keyframes fc-confetti-fall{0%{transform:translateY(-12vh) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:.9}}`}</style>
      {pieces.map((i) => {
        const left = (i * 2.27) % 100
        const delay = (i % 10) * 0.08
        const dur = 1.2 + (i % 7) * 0.12
        const size = 6 + (i % 4) * 2
        const c = colors[i % colors.length]
        return (
          <span key={i} style={{
            position: 'absolute', top: 0, left: `${left}%`, width: size, height: size * 1.4,
            background: c, borderRadius: 1, opacity: 0,
            animation: `fc-confetti-fall ${dur}s cubic-bezier(.3,.6,.4,1) ${delay}s forwards`,
          }} />
        )
      })}
    </div>
  )
}
