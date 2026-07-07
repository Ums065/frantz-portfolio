import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import EcosystemPortal, { S, StatTile, DownloadList, type PortalConfig } from './portal/EcosystemPortal'

/* Media Portal — a press room: challenge statistics, a downloadable press kit,
   and an interview-request form (reuses the public requests intake). */

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
  tagline: 'Tell the story. Access the press kit, challenge statistics, and request interviews.',
  orgLabel: 'Outlet / publication',
  extraFields: [
    { key: 'outlet', label: 'Outlet', placeholder: 'e.g. NY1' },
    { key: 'beat', label: 'Beat / coverage area', placeholder: 'Education, local news…' },
  ],
  renderDashboard: (data) => {
    const imp = data?.impact || {}
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
          <StatTile label="Students" value={imp.students ?? 0} />
          <StatTile label="Schools" value={imp.schools ?? 0} />
          <StatTile label="Businesses" value={imp.businesses ?? 0} />
          <StatTile label="Solutions" value={imp.solutions ?? 0} />
        </div>
        <section style={S.card}>
          <div style={{ ...S.eyebrow, marginBottom: 12 }}>Press Kit & Assets</div>
          <DownloadList items={data?.presskit || []} />
        </section>
        <section style={S.card}>
          <div style={{ ...S.eyebrow, marginBottom: 12 }}>Request an Interview</div>
          <InterviewRequest org={data?.profile?.org_name || ''} />
        </section>
      </div>
    )
  },
}

export default function MediaPortal() { return <EcosystemPortal config={config} /> }
