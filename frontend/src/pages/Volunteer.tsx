import { useState } from 'react'
import { api } from '../lib/api'
import EcosystemPortal, {
  Section, EcoDocuments, EcoRequests, EcoAnnouncements, EcoAssignments, EcoStatusPill,
  EcoEventCalendar, EcoMessages, RequestButton, unseenAnnCount, markAnnSeen, unseenReqCount, markReqSeen, type EcoReq, type EcoAssign, type PortalConfig,
} from './portal/EcosystemPortal'

/* Volunteer Portal — contribute time & expertise: opportunities, assignments,
   event registration, hours & recognition, certificates and resources.
   Business-style tabbed layout (sidebar + stat tiles) via the shared shell.
   Volunteers are NOT judges unless separately approved and assigned. */

const OPPORTUNITIES = [
  'Student Mentoring', 'Business Interview Coaching', 'Career Presentations', 'Event Support',
  'Registration Assistance', 'Awards Ceremony Support', 'Community Outreach', 'Photography & Videography', 'Logistics Support',
]

// Certificate milestones (hours). Progress toward the next one is shown so
// volunteers can see how close they are to being recognised.
const MILESTONES = [10, 25, 50, 100, 200]

const fmtDate = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }

/* Apply for an opportunity — shows the live application status (not just "applied"). */
function OpportunityList({ reload, requests }: { reload: () => void; requests: EcoReq[] }) {
  const [busy, setBusy] = useState('')
  const statusByOpp = new Map<string, string>()
  requests.filter((r) => r.req_type === 'opportunity' && r.message.startsWith('Interested in: '))
    .forEach((r) => statusByOpp.set(r.message.replace('Interested in: ', '').trim(), r.status))
  const apply = async (opp: string) => {
    setBusy(opp)
    try {
      await api.post('ecosystem/volunteer/request', { req_type: 'opportunity', message: `Interested in: ${opp}` })
      window.fcToast?.(`Applied for "${opp}" — sent to the program team.`)
      reload()
    } catch { window.fcToast?.('Could not send your application. Please try again.') } finally { setBusy('') }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 10 }}>
      {OPPORTUNITIES.map((o) => {
        const status = statusByOpp.get(o)
        return (
          <div key={o} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <span style={{ color: 'var(--ivory)', fontSize: 13, minWidth: 0 }}>{o}</span>
            {status ? <EcoStatusPill status={status} /> : <button className="btn btn--sm" disabled={busy === o} onClick={() => apply(o)}>{busy === o ? '…' : 'Apply'}</button>}
          </div>
        )
      })}
    </div>
  )
}

/* Certificate milestone progress toward the next recognition tier. */
function MilestoneProgress({ hours }: { hours: number }) {
  const next = MILESTONES.find((m) => m > hours)
  const prev = [...MILESTONES].reverse().find((m) => m <= hours) || 0
  const topTier = !next
  const pct = topTier ? 100 : Math.round(((hours - prev) / (next - prev)) * 100)
  return (
    <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--ivory)', fontSize: 13.5 }}>🎖️ Next certificate</strong>
        <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{topTier ? 'Top tier reached — thank you!' : `${hours} / ${next} hours · ${next - hours} to go`}</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.09)', borderRadius: 6, marginTop: 10, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'linear-gradient(90deg, var(--gold), var(--gold-light))', borderRadius: 6, transition: 'width 700ms cubic-bezier(.2,.8,.2,1)' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {MILESTONES.map((m) => (
          <span key={m} style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 9px', color: hours >= m ? '#1c1a14' : 'var(--muted)', background: hours >= m ? 'linear-gradient(135deg, var(--gold), var(--gold-light))' : 'rgba(255,255,255,0.05)', border: hours >= m ? 'none' : '1px solid var(--line)' }}>{m}h{hours >= m ? ' ✓' : ''}</span>
        ))}
      </div>
    </div>
  )
}

/* Contribution history — a timeline derived from responded assignments. */
function ContributionTimeline({ items }: { items?: EcoAssign[] }) {
  const events = (items || [])
    .filter((a) => ['accepted', 'completed', 'declined'].includes(a.status.toLowerCase()) && a.responded_ts > 0)
    .sort((a, b) => b.responded_ts - a.responded_ts).slice(0, 8)
  if (events.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Your contribution history will build up here as you accept and complete assignments.</p>
  }
  const dot = (s: string) => s === 'completed' ? '#8fd6a3' : s === 'declined' ? '#e08a8a' : 'var(--gold)'
  const verb = (s: string) => s === 'completed' ? 'Completed' : s === 'declined' ? 'Declined' : 'Accepted'
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: '0 0 0 14px', display: 'grid', gap: 12, borderLeft: '1px solid var(--line)' }}>
      {events.map((a) => (
        <li key={a.id} style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: -19, top: 3, width: 8, height: 8, borderRadius: '50%', background: dot(a.status.toLowerCase()) }} />
          <div style={{ fontSize: 13, color: 'var(--ivory)', fontWeight: 600 }}>{verb(a.status.toLowerCase())} · {a.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{fmtDate(a.responded_ts)}</div>
        </li>
      ))}
    </ol>
  )
}

const config: PortalConfig = {
  role: 'volunteer',
  title: 'Volunteer Portal',
  tagline: 'Give your time and expertise — as a mentor, coach, speaker, advisor, or event volunteer.',
  extraFields: [
    { key: 'volunteer_type', label: 'How you’d like to help', kind: 'select', options: ['Mentor', 'Interview Coach', 'Career Speaker', 'Business Advisor', 'Event Volunteer', 'Award Ceremony Volunteer'] },
    { key: 'areas', label: 'Areas of expertise', kind: 'text', placeholder: 'Marketing, finance, tech…', full: true },
    { key: 'availability', label: 'Availability', kind: 'text', placeholder: 'Weekends, evenings…', full: true },
  ],
  statTiles: (data) => {
    const d = data?.profile?.details || {}
    return [
      { label: 'Hours Logged', value: Number(d.hours || 0) },
      { label: 'Events Supported', value: Number(d.events_supported || 0) },
      { label: 'Students Mentored', value: Number(d.students_mentored || 0) },
    ]
  },
  tabs: [
    {
      key: 'recognition',
      label: 'Recognition',
      render: (data) => {
        const d = data?.profile?.details || {}
        const hours = Number(d.hours || 0)
        const hasRec = hours > 0 || Number(d.events_supported || 0) > 0 || Number(d.students_mentored || 0) > 0
        return (
          <>
            <Section title="Volunteer Recognition">
              <MilestoneProgress hours={hours} />
              <p style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 0' }}>
                {hasRec ? 'Your hours and contributions are tracked by the program team. Certificates are issued at each milestone.' : 'Your hours and contributions will appear here once the program team records your first assignment.'}
              </p>
            </Section>
            <Section title="Contribution History"><ContributionTimeline items={data?.assignments as EcoAssign[] | undefined} /></Section>
          </>
        )
      },
    },
    {
      key: 'opportunities',
      label: 'Opportunities',
      render: (data, reload) => (
        <Section title="Volunteer Opportunities"><OpportunityList reload={reload} requests={(data?.requests as EcoReq[]) || []} /></Section>
      ),
    },
    {
      key: 'events',
      label: 'Events',
      render: (data, reload) => (
        <Section title="Upcoming Events"><EcoEventCalendar role="volunteer" requests={(data?.requests as EcoReq[]) || []} reload={reload} label="Register to help" prefix="Register to help: " /></Section>
      ),
    },
    {
      key: 'assignments',
      label: 'My Assignments',
      badge: (data) => ((data?.assignments as EcoAssign[]) || []).filter((a) => a.status.toLowerCase() === 'active').length,
      render: (data, reload) => (
        <Section title="My Assignments"><EcoAssignments items={data?.assignments as EcoAssign[] | undefined} role="volunteer" reload={reload} /></Section>
      ),
    },
    {
      key: 'profile',
      label: 'Profile',
      render: (data, reload) => {
        const p = data?.profile
        const d = p?.details || {}
        return (
          <Section title="Volunteer Profile" right={<RequestButton role="volunteer" reqType="availability" label="Update Availability" reload={reload} />}>
            <dl className="eco-dl" style={{ color: '#d8d3c6', fontSize: 13.5 }}>
              <dt style={{ color: 'var(--muted)' }}>Role</dt><dd style={{ margin: 0 }}>{d.volunteer_type || '—'}</dd>
              <dt style={{ color: 'var(--muted)' }}>Expertise</dt><dd style={{ margin: 0 }}>{d.areas || '—'}</dd>
              <dt style={{ color: 'var(--muted)' }}>Availability</dt><dd style={{ margin: 0 }}>{d.availability || '—'}</dd>
              <dt style={{ color: 'var(--muted)' }}>Contact</dt><dd style={{ margin: 0 }}>{p?.contact_name || '—'}{p?.contact_phone ? ` · ${p.contact_phone}` : ''}</dd>
            </dl>
          </Section>
        )
      },
    },
    {
      key: 'messages',
      label: 'Messages',
      badge: (data) => Number(data?.messages_unread || 0),
      render: (_data, reload) => (
        <Section title="Messages with the program team">
          <EcoMessages fetchUrl="ecosystem/volunteer/messages" sendUrl="ecosystem/volunteer/message" sendPayload={(body) => ({ body })} mine="user" onLoaded={reload} />
        </Section>
      ),
    },
    {
      key: 'updates',
      label: 'Updates',
      badge: (data) => unseenAnnCount('volunteer', data?.announcements) + unseenReqCount('volunteer', data?.requests),
      onActivate: (data) => { markAnnSeen('volunteer', data?.announcements); markReqSeen('volunteer', data?.requests) },
      render: (data, reload) => (
        <>
          <Section title="Certificates & Handbook"><EcoDocuments docs={data?.documents} /></Section>
          <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
          <Section title="My Requests"><EcoRequests items={data?.requests} role="volunteer" reload={reload} /></Section>
        </>
      ),
    },
  ],
}

export default function Volunteer() { return <EcosystemPortal config={config} /> }
