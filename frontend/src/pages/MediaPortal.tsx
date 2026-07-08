import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import EcosystemPortal, { S, StatTile, Section, DownloadList, EcoDocuments, EcoRequests, EcoAnnouncements, LogoUploader, RequestButton, type PortalConfig } from './portal/EcosystemPortal'

/* Media Portal — a press room: credentials, press kit, photos/logos, founder
   bio, official statistics, event calendar and interview requests. Media never
   see student submissions, judge info, or unpublished/financial data. */

function InterviewRequest({ org }: { org: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await api.post('request', { request_type: 'Media Interview', full_name: name, email, organization: org, message })
      setDone(true); setMessage('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send your request.') }
    finally { setBusy(false) }
  }
  if (done) return <p style={{ color: 'var(--gold-light)', margin: 0 }}>Request received — the team will be in touch shortly.</p>
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div><label style={S.label}>Your name *</label><input style={S.input} required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label style={S.label}>Email *</label><input style={S.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      <div><label style={S.label}>What are you looking for?</label><textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Interview, quotes, b-roll, event access…" /></div>
      {err && <span style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</span>}
      <button className="btn btn--solid btn--sm" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? 'Sending…' : 'Request Interview'}</button>
    </form>
  )
}

const config: PortalConfig = {
  role: 'media',
  title: 'Media Portal',
  tagline: 'Tell the story accurately. Access press releases, the media kit, approved photos and logos, official statistics, and request interviews.',
  orgLabel: 'Outlet / publication',
  extraFields: [
    { key: 'outlet', label: 'Outlet', placeholder: 'e.g. NY1' },
    { key: 'beat', label: 'Beat / coverage area', placeholder: 'Education, local news…' },
  ],
  renderDashboard: (data, reload) => {
    const p = data?.profile
    const d = p?.details || {}
    const imp = data?.impact || {}
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Section title="Challenge Statistics">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14 }}>
            <StatTile label="Students" value={imp.students ?? 0} />
            <StatTile label="Schools" value={imp.schools ?? 0} />
            <StatTile label="Businesses" value={imp.businesses ?? 0} />
            <StatTile label="Solutions" value={imp.solutions ?? 0} />
          </div>
        </Section>

        <Section title="Media Credentials" right={<RequestButton role="media" reqType="credentials" label="Apply for Credentials" reload={reload} />}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Apply for official press credentials to attend and cover challenge events.</p>
        </Section>

        <Section title="Press Kit & Media Kit"><DownloadList items={data?.presskit} /></Section>
        <Section title="Photo & Video Library / Downloads"><EcoDocuments docs={data?.documents} /></Section>

        <Section title="Founder Biography">
          <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
            Frantz Coutard — founder of the “Leave It Better Than You Found It” movement, connecting New York students with local businesses to solve real community problems. Full approved biography and headshots are available in the press kit above.
          </p>
        </Section>

        <Section title="Event Calendar" right={<RequestButton role="media" reqType="event" label="Register to Attend" reload={reload} />}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>See upcoming public events on the <a href="/events" style={{ color: 'var(--gold-light)' }}>Events page</a>.</p>
        </Section>

        <Section title="Interview Requests"><InterviewRequest org={p?.org_name || d.outlet || ''} /></Section>

        <Section title="Branding"><LogoUploader role="media" current={d.logo_url} reload={reload} /></Section>
        <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
        <Section title="Notifications — Your Requests"><EcoRequests items={data?.requests} /></Section>
      </div>
    )
  },
}

export default function MediaPortal() { return <EcosystemPortal config={config} /> }
