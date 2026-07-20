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
/* The four milestone dots, evenly spaced. The rail fills to EXACTLY the dot of
   the current stage (never past it): while waiting for the admin the line
   reaches the Admin dot and stops; once the admin approves it advances to the
   Student dot, and so on. The current dot is highlighted; earlier dots show a
   check; a rejected flow paints its stopping dot red. */
const STEP_LABELS = ['Admin Review', 'Student', 'Parent Consent', 'Confirmed']
// Dot centres as a % of the rail width (each dot centred in its quarter).
const STEP_CENTERS = [12.5, 37.5, 62.5, 87.5]
// Which dot is the "current" one for each backend stage key.
const STEP_INDEX: Record<string, number> = {
  awaiting_admin: 0, info_needed: 0,
  awaiting_student: 1,
  awaiting_parent: 2,
  confirmed: 3,
  rejected_admin: 0, declined_student: 1, declined_parent: 2,
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Offer created by business',
  admin_approved: 'Approved by admin',
  admin_rejected: 'Rejected by admin',
  admin_info: 'Admin requested more information',
  business_reply: 'Business replied with more info',
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
  const rejected = !!stage.rejected
  const terminalDone = stage.key === 'confirmed'
  const activeIndex = STEP_INDEX[stage.key] ?? 0
  // Fill the rail up to the current dot's centre (past the last dot to the end
  // when the whole flow is confirmed). Never overshoots the active dot.
  const fillPct = terminalDone ? 100 : STEP_CENTERS[activeIndex]
  const displayPct = terminalDone ? 100 : [25, 50, 75, 100][activeIndex]
  // A rejected flow paints the ENTIRE progressed rail red (from the start up to
  // the declined dot), so the whole tracker reads as "failed" at a glance rather
  // than gold-then-a-small-red-hop.
  const goldPct = rejected ? 0 : fillPct
  const redFromPct = 0
  const redToPct = STEP_CENTERS[activeIndex]

  return (
    <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>
      <style>{'@keyframes fc-step-pulse{0%,100%{box-shadow:0 0 0 0 rgba(230,205,127,0.55)}50%{box-shadow:0 0 0 6px rgba(230,205,127,0)}}'}</style>
      {/* Header: stage badge + live % */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <StageBadge stage={stage} />
        {!rejected && <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{displayPct}% complete</span>}
      </div>

      {/* Step rail: the fill stops at the current dot; that dot is highlighted. */}
      <div style={{ position: 'relative', padding: '2px 0' }}>
        <div style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,0.09)', borderRadius: 4 }}>
          {/* Gold portion — completed steps. */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: `${goldPct}%`,
            background: 'linear-gradient(90deg, var(--gold), var(--gold-light))',
            borderRadius: 4, transition: 'width 700ms cubic-bezier(.2,.8,.2,1)',
          }} />
          {/* Red portion — only the failing hop into the declined step. */}
          {rejected && (
            <div style={{
              position: 'absolute', left: `${redFromPct}%`, top: 0, bottom: 0, width: `${Math.max(0, redToPct - redFromPct)}%`,
              background: 'linear-gradient(90deg, #d98a8a, #c96f6f)',
              borderRadius: 4, transition: 'width 700ms cubic-bezier(.2,.8,.2,1)',
            }} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -13 }}>
          {STEP_LABELS.map((label, i) => {
            const isDone = terminalDone ? i <= activeIndex : i < activeIndex
            const isActive = !rejected && !terminalDone && i === activeIndex
            const isRejectedHere = rejected && i === activeIndex
            // On a rejected flow, the already-completed dots turn red too so the
            // whole progressed portion is consistently red.
            const doneCol = rejected ? '#e08a8a' : 'var(--gold)'
            const bg = isRejectedHere ? '#e08a8a' : isDone ? doneCol : isActive ? 'var(--gold-light)' : 'rgba(255,255,255,0.16)'
            const ring = isRejectedHere ? '#e08a8a' : (isDone || isActive) ? doneCol : 'rgba(255,255,255,0.2)'
            const lit = isDone || isActive || isRejectedHere
            return (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <span style={{
                  width: isActive ? 20 : 18, height: isActive ? 20 : 18, borderRadius: '50%', background: bg,
                  border: `2px solid ${ring}`,
                  boxShadow: isDone || isRejectedHere ? `0 0 8px ${bg}` : 'none',
                  animation: isActive ? 'fc-step-pulse 1.8s ease-in-out infinite' : 'none',
                  transition: 'all 500ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#1c1a14', fontWeight: 900,
                }}>{isDone ? '✓' : isRejectedHere ? '✕' : ''}</span>
                <span style={{
                  fontSize: 10.5, marginTop: 6,
                  color: rejected && lit ? '#e8c9c9' : lit ? 'var(--ivory)' : 'var(--muted)',
                  fontWeight: isActive || isRejectedHere ? 700 : lit ? 600 : 400, textAlign: 'center', lineHeight: 1.2,
                }}>{label}</span>
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
