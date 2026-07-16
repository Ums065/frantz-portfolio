import { useState } from 'react'
import EcosystemPortal, {
  S, StatTile, Section, DownloadList, EcoDocuments, EcoRequests, EcoAnnouncements, EcoAssignments,
  EcoEventCalendar, LogoUploader, RequestButton, unseenAnnCount, markAnnSeen, type EcoReq, type EcoAssign, type PortalConfig,
} from './portal/EcosystemPortal'

/* Partner Portal — helps grow the movement: toolkit + marketing resources,
   a referral link with analytics, events, certificates and announcements.
   Partners never judge, fund, or see confidential participant data.
   Business-style tabbed layout (sidebar + stat tiles) via the shared shell. */

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
  statTiles: (data) => {
    const ref = data?.referral || { count: 0, by_role: {} }
    const by = ref.by_role || {}
    return [
      { label: 'Total Referred', value: ref.count ?? 0 },
      { label: 'Sponsors', value: by.sponsor ?? 0 },
      { label: 'Businesses', value: by.business ?? 0 },
      { label: 'Volunteers', value: by.volunteer ?? 0 },
      { label: 'Media', value: by.media ?? 0 },
    ]
  },
  tabs: [
    {
      key: 'referrals',
      label: 'Referrals',
      render: (data) => {
        const ref = data?.referral || { code: '', count: 0, by_role: {} }
        const by = ref.by_role || {}
        return (
          <>
            <Section title="Referral Center">
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Share your link to refer schools, businesses, sponsors, volunteers and judges. Sign-ups that use it are attributed to your organization.</p>
              <ReferralCard code={ref.code || ''} />
            </Section>
            <Section title="Referral Breakdown">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
                <StatTile label="Partners" value={by.partner ?? 0} />
                <StatTile label="Members" value={by.member ?? 0} />
                <StatTile label="Sponsors" value={by.sponsor ?? 0} />
                <StatTile label="Media" value={by.media ?? 0} />
                <StatTile label="Volunteers" value={by.volunteer ?? 0} />
                <StatTile label="Businesses" value={by.business ?? 0} />
              </div>
            </Section>
          </>
        )
      },
    },
    {
      key: 'toolkit',
      label: 'Toolkit',
      render: (data) => (
        <>
          <Section title="Partner Toolkit"><DownloadList items={data?.toolkit} /></Section>
          <Section title="Marketing Resources"><DownloadList items={data?.marketing} /></Section>
        </>
      ),
    },
    {
      key: 'events',
      label: 'Events',
      render: (data, reload) => (
        <Section title="Events Calendar">
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Register your organization to attend upcoming challenge events.</p>
          <EcoEventCalendar role="partner" requests={(data?.requests as EcoReq[]) || []} reload={reload} label="Register to attend" prefix="Attend: " />
        </Section>
      ),
    },
    {
      key: 'assignments',
      label: 'My Assignments',
      badge: (data) => ((data?.assignments as EcoAssign[]) || []).filter((a) => a.status.toLowerCase() === 'active').length,
      render: (data, reload) => (
        <Section title="My Assignments"><EcoAssignments items={data?.assignments as EcoAssign[] | undefined} role="partner" reload={reload} /></Section>
      ),
    },
    {
      key: 'branding',
      label: 'Certificates & Branding',
      render: (data, reload) => {
        const d = data?.profile?.details || {}
        return (
          <>
            <Section title="Organization Branding"><LogoUploader role="partner" current={d.logo_url} reload={reload} /></Section>
            <Section title="Certificates & Recognition"><EcoDocuments docs={data?.documents} /></Section>
          </>
        )
      },
    },
    {
      key: 'updates',
      label: 'Updates',
      badge: (data) => unseenAnnCount('partner', data?.announcements),
      onActivate: (data) => markAnnSeen('partner', data?.announcements),
      render: (data, reload) => (
        <>
          <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
          <Section title="Notifications — Your Requests"><EcoRequests items={data?.requests} role="partner" reload={reload} /></Section>
        </>
      ),
    },
  ],
}

export default function Partner() { return <EcosystemPortal config={config} /> }
