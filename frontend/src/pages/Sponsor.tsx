import EcosystemPortal, {
  Section, DownloadList, EcoDocuments, EcoRequests, EcoAnnouncements, EcoAssignments,
  LogoUploader, RequestButton, unseenAnnCount, markAnnSeen, type EcoAssign, type PortalConfig,
} from './portal/EcosystemPortal'

/* Sponsor Portal — an investment portal: package + recognition, branding, live
   impact, documents (invoices/agreements), award ceremony, renewal + meeting
   requests. Sponsors fund the program but never judge, score, or pick winners.
   Business-style tabbed layout (sidebar + stat tiles) via the shared shell. */

const config: PortalConfig = {
  role: 'sponsor',
  title: 'Sponsor Portal',
  tagline: 'Fund measurable community impact. Track the students, schools, and businesses your sponsorship reaches.',
  orgLabel: 'Organization name',
  extraFields: [
    { key: 'tier', label: 'Sponsorship tier', kind: 'select', options: ['Founding', 'Presenting', 'Supporting', 'Community'] },
    { key: 'recognition_level', label: 'Recognition level', placeholder: 'e.g. Gold' },
  ],
  statTiles: (data) => {
    const imp = data?.impact || {}
    return [
      { label: 'Students', value: imp.students ?? 0 },
      { label: 'Schools', value: imp.schools ?? 0 },
      { label: 'Businesses', value: imp.businesses ?? 0 },
      { label: 'Problems', value: imp.problems ?? 0 },
      { label: 'Solutions', value: imp.solutions ?? 0 },
      { label: 'Scholarships', value: imp.scholarships ?? 0 },
    ]
  },
  tabs: [
    {
      key: 'sponsorship',
      label: 'Sponsorship',
      render: (data) => {
        const p = data?.profile
        const d = p?.details || {}
        const cer = data?.ceremony || {}
        const hasCer = cer.date || cer.venue || cer.description || cer.link
        return (
          <>
            <Section title="Sponsorship Package">
              <p style={{ color: '#d8d3c6', margin: 0, lineHeight: 1.7 }}>
                Tier: <strong className="gold-text">{d.tier || '—'}</strong> · Recognition: <strong>{d.recognition_level || '—'}</strong>
              </p>
              {p?.about && <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>{p.about}</p>}
            </Section>
            {hasCer && (
              <Section title="Event Invitations">
                <p style={{ color: '#d8d3c6', margin: 0, lineHeight: 1.7 }}>
                  {cer.date && <><strong>{cer.date}</strong><br /></>}
                  {cer.venue && <>{cer.venue}<br /></>}
                  {cer.description}
                </p>
                {cer.link && <a className="btn btn--sm" style={{ marginTop: 10 }} href={cer.link} target="_blank" rel="noreferrer">Ceremony details →</a>}
              </Section>
            )}
          </>
        )
      },
    },
    {
      key: 'documents',
      label: 'Documents & Reports',
      render: (data) => (
        <>
          <Section title="Documents & Agreements">
            <EcoDocuments docs={data?.documents} />
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 0' }}>Invoices, receipts, tax documents and your sponsorship agreement are issued here by the program team.</p>
          </Section>
          <Section title="Reports & Analytics"><DownloadList items={data?.reports} /></Section>
        </>
      ),
    },
    {
      key: 'assignments',
      label: 'My Assignments',
      badge: (data) => ((data?.assignments as EcoAssign[]) || []).filter((a) => a.status.toLowerCase() === 'active').length,
      render: (data, reload) => (
        <Section title="My Assignments"><EcoAssignments items={data?.assignments as EcoAssign[] | undefined} role="sponsor" reload={reload} /></Section>
      ),
    },
    {
      key: 'renewal',
      label: 'Renewal Center',
      render: (_data, reload) => (
        <Section title="Renewal Center" right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><RequestButton role="sponsor" reqType="meeting" label="Request Meeting" reload={reload} /><RequestButton role="sponsor" reqType="renewal" label="Renew Sponsorship" reload={reload} solid /></div>}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Ready to continue your impact, or want to talk options? Request a renewal or a meeting with the program team.</p>
        </Section>
      ),
    },
    {
      key: 'branding',
      label: 'Branding',
      render: (data, reload) => {
        const d = data?.profile?.details || {}
        return (
          <Section title="Recognition & Branding">
            <LogoUploader role="sponsor" current={d.logo_url} reload={reload} />
            <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '10px 0 0' }}>Your logo appears on the program's Our Partners page and sponsor recognition materials.</p>
          </Section>
        )
      },
    },
    {
      key: 'updates',
      label: 'Updates',
      badge: (data) => unseenAnnCount('sponsor', data?.announcements),
      onActivate: (data) => markAnnSeen('sponsor', data?.announcements),
      render: (data, reload) => (
        <>
          <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
          <Section title="Notifications — Your Requests"><EcoRequests items={data?.requests} role="sponsor" reload={reload} /></Section>
        </>
      ),
    },
  ],
}

export default function Sponsor() { return <EcosystemPortal config={config} /> }
