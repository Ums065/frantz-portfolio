import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import EcosystemPortal, { S, StatTile, Section, EcoDocuments, EcoRequests, EcoAnnouncements, RequestButton, type PortalConfig } from './portal/EcosystemPortal'

/* Volunteer Portal — contribute time & expertise: opportunities, assignments,
   event registration, hours & recognition, certificates and resources.
   Volunteers are NOT judges unless separately approved and assigned. */

const OPPORTUNITIES = [
  'Student Mentoring', 'Business Interview Coaching', 'Career Presentations', 'Event Support',
  'Registration Assistance', 'Awards Ceremony Support', 'Community Outreach', 'Photography & Videography', 'Logistics Support',
]

interface EcoReqLite { req_type: string; message: string; status: string }
interface EcoAssign { id: number; title: string; detail: string; assign_date: string | null; status: string; created_ts: number }

/* A — apply gives feedback and shows an "Applied" state (no silent duplicates). */
function OpportunityList({ role, reload, requests }: { role: string; reload: () => void; requests: EcoReqLite[] }) {
  const [busy, setBusy] = useState('')
  const appliedFor = new Set(
    requests.filter((r) => r.req_type === 'opportunity' && r.message.startsWith('Interested in: '))
      .map((r) => r.message.replace('Interested in: ', '').trim())
  )
  const apply = async (opp: string) => {
    setBusy(opp)
    try {
      await api.post(`ecosystem/${role}/request`, { req_type: 'opportunity', message: `Interested in: ${opp}` })
      window.fcToast?.(`Applied for "${opp}" — sent to the program team.`)
      reload()
    } catch {
      window.fcToast?.('Could not send your application. Please try again.')
    } finally { setBusy('') }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
      {OPPORTUNITIES.map((o) => {
        const applied = appliedFor.has(o)
        return (
          <div key={o} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <span style={{ color: 'var(--ivory)', fontSize: 13 }}>{o}</span>
            {applied
              ? <span style={{ fontSize: 12.5, color: 'var(--gold-light)', fontWeight: 700, whiteSpace: 'nowrap' }}>Applied ✓</span>
              : <button className="btn btn--sm" disabled={busy === o} onClick={() => apply(o)}>{busy === o ? '…' : 'Apply'}</button>}
          </div>
        )
      })}
    </div>
  )
}

/* C — assignments the admin handed to this volunteer. */
function AssignmentList({ items }: { items?: EcoAssign[] }) {
  if (!items || items.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No assignments yet. When the program team assigns you to an event, a student, or a task, it will appear here.</p>
  }
  const tone = (s: string) => s === 'completed' ? 'var(--muted)' : s === 'cancelled' ? '#e08a8a' : 'var(--gold-light)'
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((a) => (
        <div key={a.id} style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', opacity: a.status === 'cancelled' ? 0.6 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--ivory)', fontSize: 14 }}>{a.title}</strong>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, color: tone(a.status) }}>{a.status}</span>
          </div>
          {(a.assign_date) && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>📅 {a.assign_date}</div>}
          {a.detail && <p style={{ color: '#d8d3c6', fontSize: 13, margin: '6px 0 0', lineHeight: 1.55 }}>{a.detail}</p>}
        </div>
      ))}
    </div>
  )
}

/* D — real upcoming events with a per-event "Register to help" button. */
function EventCalendar({ role, reload, requests }: { role: string; reload: () => void; requests: EcoReqLite[] }) {
  const [events, setEvents] = useState<{ id: number; title: string; location: string; event_date: string }[]>([])
  const [busy, setBusy] = useState(0)
  useEffect(() => {
    api.get<{ events: { id: number; title: string; location: string; event_date: string; is_past: number }[] }>('events')
      .then((d) => setEvents((d.events || []).filter((e) => !e.is_past).slice(0, 6)))
      .catch(() => setEvents([]))
  }, [])
  const registeredFor = new Set(
    requests.filter((r) => r.req_type === 'event' && r.message.startsWith('Register to help: '))
      .map((r) => r.message.replace('Register to help: ', '').trim())
  )
  const register = async (ev: { id: number; title: string }) => {
    setBusy(ev.id)
    try {
      await api.post(`ecosystem/${role}/request`, { req_type: 'event', message: `Register to help: ${ev.title}` })
      window.fcToast?.(`Registered to help at "${ev.title}".`)
      reload()
    } catch { window.fcToast?.('Could not register. Please try again.') } finally { setBusy(0) }
  }
  if (events.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No upcoming events right now. Check the <a href="/events" style={{ color: 'var(--gold-light)' }}>Events page</a> soon.</p>
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {events.map((ev) => {
        const done = registeredFor.has(ev.title)
        return (
          <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
            <div>
              <div style={{ color: 'var(--ivory)', fontSize: 13.5, fontWeight: 600 }}>{ev.title}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{[ev.event_date, ev.location].filter(Boolean).join(' · ')}</div>
            </div>
            {done
              ? <span style={{ fontSize: 12.5, color: 'var(--gold-light)', fontWeight: 700, whiteSpace: 'nowrap' }}>Registered ✓</span>
              : <button className="btn btn--sm" disabled={busy === ev.id} onClick={() => register(ev)}>{busy === ev.id ? '…' : 'Register to help'}</button>}
          </div>
        )
      })}
    </div>
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
  renderDashboard: (data, reload) => {
    const p = data?.profile
    const d = p?.details || {}
    const requests: EcoReqLite[] = (data?.requests as EcoReqLite[]) || []
    const hours = Number(d.hours || 0), evs = Number(d.events_supported || 0), students = Number(d.students_mentored || 0)
    const hasRecognition = hours > 0 || evs > 0 || students > 0
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Section title="Volunteer Recognition">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14 }}>
            <StatTile label="Hours Logged" value={hours} />
            <StatTile label="Events Supported" value={evs} />
            <StatTile label="Students Mentored" value={students} />
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 0' }}>
            {hasRecognition
              ? 'Your hours and contributions are tracked by the program team. Certificates are issued at milestones.'
              : 'Your hours and contributions will appear here once the program team records your first assignment.'}
          </p>
        </Section>

        <Section title="Volunteer Profile" right={<RequestButton role="volunteer" reqType="availability" label="Update Availability" reload={reload} />}>
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, columnGap: 12, margin: 0, color: '#d8d3c6', fontSize: 13.5 }}>
            <dt style={{ color: 'var(--muted)' }}>Role</dt><dd style={{ margin: 0 }}>{d.volunteer_type || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Expertise</dt><dd style={{ margin: 0 }}>{d.areas || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Availability</dt><dd style={{ margin: 0 }}>{d.availability || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Contact</dt><dd style={{ margin: 0 }}>{p?.contact_name || '—'}{p?.contact_phone ? ` · ${p.contact_phone}` : ''}</dd>
          </dl>
        </Section>

        <Section title="My Assignments">
          <AssignmentList items={data?.assignments as EcoAssign[] | undefined} />
        </Section>

        <Section title="Volunteer Opportunities">
          <OpportunityList role="volunteer" reload={reload} requests={requests} />
        </Section>

        <Section title="Upcoming Events">
          <EventCalendar role="volunteer" reload={reload} requests={requests} />
        </Section>

        <Section title="Certificates & Handbook"><EcoDocuments docs={data?.documents} /></Section>
        <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
        <Section title="My Requests"><EcoRequests items={data?.requests} role="volunteer" reload={reload} /></Section>
      </div>
    )
  },
}

export default function Volunteer() { return <EcosystemPortal config={config} /> }
