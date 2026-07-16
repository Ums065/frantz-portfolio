import { useState } from 'react'
import EcosystemPortal, { S, StatTile, Section, DownloadList, EcoDocuments, EcoRequests, EcoAnnouncements, EcoAssignments, LogoUploader, RequestButton, type EcoAssign, type PortalConfig } from './portal/EcosystemPortal'

/* Partner Portal — helps grow the movement: toolkit + marketing resources,
   a referral link with analytics, events, certificates and announcements.
   Partners never judge, fund, or see confidential participant data. */

function ReferralCard({ code }: { code: string }) {
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${code}`
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input readOnly value={link} style={{ ...S.input, flex: 1, minWidth: 240 }} onFocus={(e) => e.currentTarget.select()} />
      <button className="btn btn--sm btn--solid" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
    </div>
  )
}

const config: PortalConfig = {
  role: 'partner',
  title: 'Partner Portal',
  tagline: 'Expand the program’s reach. Access your toolkit, refer schools, businesses, sponsors, volunteers and judges, and track your impact.',
  orgLabel: 'Organization name',
  extraFields: [
    { key: 'partner_type', label: 'Partner type', kind: 'select', options: ['School', 'College / University', 'Chamber of Commerce', 'Bank', 'Community Org', 'Nonprofit', 'Government Agency', 'Technology Company', 'Workforce Development', 'Youth Organization', 'Faith-Based', 'Educational Association'] },
  ],
  renderDashboard: (data, reload) => {
    const p = data?.profile
    const d = p?.details || {}
    const ref = data?.referral || { code: '', count: 0, by_role: {} }
    const by = ref.by_role || {}
    const assignments = (data?.assignments as EcoAssign[] | undefined) || []
    const pendingAssignments = assignments.filter((a) => a.status.toLowerCase() === 'active').length
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Section title="Referral Analytics">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14 }}>
            <StatTile label="Total Referred" value={ref.count ?? 0} />
            <StatTile label="Sponsors" value={by.sponsor ?? 0} />
            <StatTile label="Partners" value={by.partner ?? 0} />
            <StatTile label="Media" value={by.media ?? 0} />
            <StatTile label="Volunteers" value={by.volunteer ?? 0} />
            <StatTile label="Businesses" value={by.business ?? 0} />
            <StatTile label="Members" value={by.member ?? 0} />
          </div>
        </Section>

        <Section title="Referral Center">
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Share your link to refer schools, businesses, sponsors, volunteers and judges. Sign-ups that use it are attributed to your organization.</p>
          <ReferralCard code={ref.code || ''} />
        </Section>

        <Section title="Organization Branding">
          <LogoUploader role="partner" current={d.logo_url} reload={reload} />
        </Section>

        <Section title="Partner Toolkit"><DownloadList items={data?.toolkit} /></Section>
        <Section title="Marketing Resources"><DownloadList items={data?.marketing} /></Section>

        <Section title="Events Calendar" right={<RequestButton role="partner" reqType="event" label="Register for an Event" reload={reload} />}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>See upcoming challenge events on the <a href="/events" style={{ color: 'var(--gold-light)' }}>Events page</a>, and register your organization to attend.</p>
        </Section>

        <Section title="Certificates & Recognition"><EcoDocuments docs={data?.documents} /></Section>

        <Section title={`My Assignments${pendingAssignments ? ` · ${pendingAssignments} awaiting you` : ''}`}>
          <EcoAssignments items={assignments} role="partner" reload={reload} />
        </Section>

        <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
        <Section title="Notifications — Your Requests"><EcoRequests items={data?.requests} role="partner" reload={reload} /></Section>
      </div>
    )
  },
}

export default function Partner() { return <EcosystemPortal config={config} /> }
