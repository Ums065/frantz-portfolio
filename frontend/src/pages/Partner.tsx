import { useState } from 'react'
import EcosystemPortal, {
  S, Section, DownloadList, EcoDocuments, EcoRequests, EcoAnnouncements, EcoAssignments,
  EcoEventCalendar, EcoMessages, LogoUploader, RequestButton, unseenAnnCount, markAnnSeen, unseenReqCount, markReqSeen, type EcoReq, type EcoAssign, type PortalConfig,
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
      <input readOnly value={link} style={{ ...S.input, flex: '1 1 200px', minWidth: 0 }} onFocus={(e) => e.currentTarget.select()} />
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
        const ref = data?.referral || { code: '', count: 0, by_role: {}, list: [] }
        const list: Array<{ name: string; role: string; joined_ts: number }> = Array.isArray(ref.list) ? ref.list : []
        const fmtJoined = (ts: number) => { if (!ts) return ''; try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
        const roleLabel = (r: string) => (r || 'member').replace(/_/g, ' ')
        return (
          <>
            <Section title="Referral Center">
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Share your link to refer schools, businesses, sponsors, volunteers and judges. Sign-ups that use it are attributed to your organization.</p>
              <ReferralCard code={ref.code || ''} />
            </Section>
            <Section title={`People You've Referred (${ref.count ?? list.length})`}>
              {list.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No referrals yet. Share your link above — everyone who signs up with it appears here.</p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {list.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px' }}>
                      <span style={{ color: 'var(--ivory)', fontWeight: 600, fontSize: 13.5, flex: 1, minWidth: 0 }}>{p.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--gold-light)', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 999, padding: '2px 9px' }}>{roleLabel(p.role)}</span>
                      {p.joined_ts > 0 && <span style={{ color: 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmtJoined(p.joined_ts)}</span>}
                    </div>
                  ))}
                </div>
              )}
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
      key: 'messages',
      label: 'Messages',
      badge: (data) => Number(data?.messages_unread || 0),
      render: (_data, reload) => (
        <Section title="Messages with the program team">
          <EcoMessages fetchUrl="ecosystem/partner/messages" sendUrl="ecosystem/partner/message" sendPayload={(body) => ({ body })} mine="user" onLoaded={reload} />
        </Section>
      ),
    },
    {
      key: 'announcements',
      label: 'Announcements',
      badge: (data) => unseenAnnCount('partner', data?.announcements),
      onActivate: (data) => { markAnnSeen('partner', data?.announcements) },
      render: (data) => (
        <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
      ),
    },
    {
      key: 'updates',
      label: 'My Requests',
      badge: (data) => unseenReqCount('partner', data?.requests),
      onActivate: (data) => { markReqSeen('partner', data?.requests) },
      render: (data, reload) => (
        <Section title="Notifications — Your Requests"><EcoRequests items={data?.requests} role="partner" reload={reload} /></Section>
      ),
    },
  ],
}

export default function Partner() { return <EcosystemPortal config={config} /> }
