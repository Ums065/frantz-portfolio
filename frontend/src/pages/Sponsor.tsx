import EcosystemPortal, { S, StatTile, DownloadList, type PortalConfig } from './portal/EcosystemPortal'

/* Sponsor Portal — an investment-style view: sponsorship tier + recognition,
   live challenge impact, award-ceremony details, and downloadable reports. */

const config: PortalConfig = {
  role: 'sponsor',
  title: 'Sponsor Portal',
  tagline: 'Fund measurable community impact. Track the students, schools, and businesses your sponsorship reaches.',
  orgLabel: 'Organization name',
  extraFields: [
    { key: 'tier', label: 'Sponsorship tier', kind: 'select', options: ['Founding', 'Presenting', 'Supporting', 'Community'] },
    { key: 'recognition_level', label: 'Recognition level', placeholder: 'e.g. Gold' },
  ],
  renderDashboard: (data) => {
    const p = data?.profile
    const imp = data?.impact || {}
    const cer = data?.ceremony || {}
    const hasCer = cer.date || cer.venue || cer.description || cer.link
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
          <StatTile label="Students" value={imp.students ?? 0} />
          <StatTile label="Schools" value={imp.schools ?? 0} />
          <StatTile label="Businesses" value={imp.businesses ?? 0} />
          <StatTile label="Solutions" value={imp.solutions ?? 0} />
        </div>

        <section style={S.card}>
          <div style={S.eyebrow}>Your Sponsorship</div>
          <p style={{ color: '#d8d3c6', margin: '8px 0 0', lineHeight: 1.7 }}>
            Tier: <strong className="gold-text">{p?.details?.tier || '—'}</strong> · Recognition: <strong>{p?.details?.recognition_level || '—'}</strong>
          </p>
          {p?.about && <p style={{ color: 'var(--muted)', marginBottom: 0 }}>{p.about}</p>}
        </section>

        {hasCer && (
          <section style={S.card}>
            <div style={S.eyebrow}>Award Ceremony</div>
            <p style={{ color: '#d8d3c6', margin: '8px 0 0', lineHeight: 1.7 }}>
              {cer.date && <><strong>{cer.date}</strong><br /></>}
              {cer.venue && <>{cer.venue}<br /></>}
              {cer.description}
            </p>
            {cer.link && <a className="btn btn--sm" style={{ marginTop: 10 }} href={cer.link} target="_blank" rel="noreferrer">Ceremony details →</a>}
          </section>
        )}

        <section style={S.card}>
          <div style={{ ...S.eyebrow, marginBottom: 12 }}>Impact Reports & Downloads</div>
          <DownloadList items={data?.reports || []} />
        </section>
      </div>
    )
  },
}

export default function Sponsor() { return <EcosystemPortal config={config} /> }
