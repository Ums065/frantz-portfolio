import { useState } from 'react'
import EcosystemPortal, { S, StatTile, DownloadList, type PortalConfig } from './portal/EcosystemPortal'

/* Partner Portal — help grow the movement: a referral link + referred-signup
   count, and a downloadable partner toolkit. */

function ReferralCard({ code, count }: { code: string; count: number }) {
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${code}`
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }
  return (
    <section style={S.card}>
      <div style={{ ...S.eyebrow, marginBottom: 10 }}>Your Referral Link</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input readOnly value={link} style={{ ...S.input, flex: 1, minWidth: 240 }} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn btn--sm btn--solid" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>Share this link. Sign-ups that use it are attributed to your organization.</p>
    </section>
  )
}

const config: PortalConfig = {
  role: 'partner',
  title: 'Partner Portal',
  tagline: 'Expand the program’s reach. Access your partner toolkit and track the sign-ups you refer.',
  orgLabel: 'Organization name',
  extraFields: [
    { key: 'partner_type', label: 'Partner type', kind: 'select', options: ['School', 'Chamber of Commerce', 'Bank', 'Media', 'University', 'Community Org', 'Nonprofit', 'Technology', 'Government'] },
  ],
  renderDashboard: (data) => {
    const ref = data?.referral || { code: '', count: 0 }
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
          <StatTile label="Referred Sign-ups" value={ref.count ?? 0} />
          <StatTile label="Partner Type" value={data?.profile?.details?.partner_type || '—'} />
        </div>
        <ReferralCard code={ref.code || ''} count={ref.count || 0} />
        <section style={S.card}>
          <div style={{ ...S.eyebrow, marginBottom: 12 }}>Partner Toolkit</div>
          <DownloadList items={data?.toolkit || []} />
        </section>
      </div>
    )
  },
}

export default function Partner() { return <EcosystemPortal config={config} /> }
