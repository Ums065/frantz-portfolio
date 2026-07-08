import { useState } from 'react'
import { api } from '../lib/api'
import EcosystemPortal, { S, StatTile, Section, EcoDocuments, EcoRequests, EcoAnnouncements, RequestButton, type PortalConfig } from './portal/EcosystemPortal'

/* Volunteer Portal — contribute time & expertise: opportunities, assignments,
   event registration, hours & recognition, certificates and resources.
   Volunteers are NOT judges unless separately approved and assigned. */

const OPPORTUNITIES = [
  'Student Mentoring', 'Business Interview Coaching', 'Career Presentations', 'Event Support',
  'Registration Assistance', 'Awards Ceremony Support', 'Community Outreach', 'Photography & Videography', 'Logistics Support',
]

function OpportunityList({ role, reload }: { role: string; reload: () => void }) {
  const [busy, setBusy] = useState('')
  const apply = async (opp: string) => {
    setBusy(opp)
    try { await api.post(`ecosystem/${role}/request`, { req_type: 'opportunity', message: `Interested in: ${opp}` }); reload() } catch { /* ignore */ } finally { setBusy('') }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
      {OPPORTUNITIES.map((o) => (
        <div key={o} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
          <span style={{ color: 'var(--ivory)', fontSize: 13 }}>{o}</span>
          <button className="btn btn--sm" disabled={busy === o} onClick={() => apply(o)}>{busy === o ? '…' : 'Apply'}</button>
        </div>
      ))}
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
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Section title="Volunteer Recognition">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14 }}>
            <StatTile label="Hours Logged" value={Number(d.hours || 0)} />
            <StatTile label="Events Supported" value={Number(d.events_supported || 0)} />
            <StatTile label="Students Mentored" value={Number(d.students_mentored || 0)} />
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 0' }}>Your hours and contributions are tracked and recognized by the program team. Badges and certificates are issued as you reach milestones.</p>
        </Section>

        <Section title="Volunteer Profile" right={<RequestButton role="volunteer" reqType="availability" label="Update Availability" reload={reload} />}>
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, columnGap: 12, margin: 0, color: '#d8d3c6', fontSize: 13.5 }}>
            <dt style={{ color: 'var(--muted)' }}>Role</dt><dd style={{ margin: 0 }}>{d.volunteer_type || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Expertise</dt><dd style={{ margin: 0 }}>{d.areas || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Availability</dt><dd style={{ margin: 0 }}>{d.availability || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Contact</dt><dd style={{ margin: 0 }}>{p?.contact_name || '—'}{p?.contact_phone ? ` · ${p.contact_phone}` : ''}</dd>
          </dl>
        </Section>

        <Section title="Volunteer Opportunities">
          <OpportunityList role="volunteer" reload={reload} />
        </Section>

        <Section title="Event Calendar" right={<RequestButton role="volunteer" reqType="event" label="Register for an Event" reload={reload} />}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>See upcoming events on the <a href="/events" style={{ color: 'var(--gold-light)' }}>Events page</a> and sign up to help.</p>
        </Section>

        <Section title="Certificates & Handbook"><EcoDocuments docs={data?.documents} /></Section>
        <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
        <Section title="My Assignments & Requests"><EcoRequests items={data?.requests} /></Section>
      </div>
    )
  },
}

export default function Volunteer() { return <EcosystemPortal config={config} /> }
