import EcosystemPortal, { S, type PortalConfig } from './portal/EcosystemPortal'

/* Volunteer Portal — for professionals who want to help without becoming a
   sponsor or judge (mentors, coaches, speakers, advisors, event volunteers). */

const config: PortalConfig = {
  role: 'volunteer',
  title: 'Volunteer Portal',
  tagline: 'Give your time and expertise — as a mentor, coach, speaker, advisor, or event volunteer.',
  extraFields: [
    { key: 'volunteer_type', label: 'How you’d like to help', kind: 'select', options: ['Mentor', 'Interview Coach', 'Career Speaker', 'Business Advisor', 'Event Volunteer', 'Award Ceremony Volunteer'] },
    { key: 'areas', label: 'Areas of expertise', kind: 'text', placeholder: 'Marketing, finance, tech…', full: true },
    { key: 'availability', label: 'Availability', kind: 'text', placeholder: 'Weekends, evenings…', full: true },
  ],
  renderDashboard: (data) => {
    const d = data?.profile?.details || {}
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={S.card}>
          <div style={S.eyebrow}>Thank You for Volunteering</div>
          <p style={{ color: '#d8d3c6', margin: '8px 0 0', lineHeight: 1.7 }}>
            Your offer to help is what turns this challenge into a real community. The team will reach out with opportunities that fit your interests.
          </p>
        </section>
        <section style={S.card}>
          <div style={{ ...S.eyebrow, marginBottom: 10 }}>Your Volunteer Profile</div>
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, columnGap: 12, margin: 0, color: '#d8d3c6' }}>
            <dt style={{ color: 'var(--muted)' }}>Role</dt><dd style={{ margin: 0 }}>{d.volunteer_type || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Expertise</dt><dd style={{ margin: 0 }}>{d.areas || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Availability</dt><dd style={{ margin: 0 }}>{d.availability || '—'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Contact</dt><dd style={{ margin: 0 }}>{data?.profile?.contact_name || '—'}{data?.profile?.contact_phone ? ` · ${data.profile.contact_phone}` : ''}</dd>
          </dl>
        </section>
      </div>
    )
  },
}

export default function Volunteer() { return <EcosystemPortal config={config} /> }
