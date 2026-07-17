import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import EcosystemPortal, {
  Section, DownloadList, EcoDocuments, EcoRequests, EcoAnnouncements, EcoAssignments,
  EcoStatusPill, EcoMessages, LogoUploader, RequestButton, unseenAnnCount, markAnnSeen, unseenReqCount, markReqSeen, type EcoReq, type EcoAssign, type PortalConfig,
} from './portal/EcosystemPortal'

/* Media Portal — a press room for journalists & outlets: official statistics,
   press/media kit, photo & video library, founder bio, event coverage +
   credentials, interview requests, and assignments from the program team.
   Media never see student submissions, judge info, or unpublished/financial data.
   Business-style tabbed layout (sidebar + stat tiles) via the shared shell. */

/* Upcoming events with a per-event "Register to attend" button + live status. */
function MediaEventCalendar({ requests, reload }: { requests: EcoReq[]; reload: () => void }) {
  const [events, setEvents] = useState<{ id: number; title: string; location: string; event_date: string }[]>([])
  const [busy, setBusy] = useState(0)
  useEffect(() => {
    api.get<{ events: { id: number; title: string; location: string; event_date: string; is_past: number }[] }>('events')
      .then((d) => setEvents((d.events || []).filter((e) => !e.is_past).slice(0, 8)))
      .catch(() => setEvents([]))
  }, [])
  const statusByEvent = new Map<string, string>()
  requests.filter((r) => r.req_type === 'event' && r.message.startsWith('Attend: '))
    .forEach((r) => statusByEvent.set(r.message.replace('Attend: ', '').trim(), r.status))
  const register = async (ev: { id: number; title: string }) => {
    setBusy(ev.id)
    try {
      await api.post('ecosystem/media/request', { req_type: 'event', message: `Attend: ${ev.title}` })
      window.fcToast?.(`Requested to cover "${ev.title}".`)
      reload()
    } catch { window.fcToast?.('Could not register. Please try again.') } finally { setBusy(0) }
  }
  if (events.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No upcoming events right now. Check the <a href="/events" style={{ color: 'var(--gold-light)' }}>Events page</a> soon.</p>
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {events.map((ev) => {
        const status = statusByEvent.get(ev.title)
        return (
          <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--ivory)', fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{ev.title}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{[ev.event_date, ev.location].filter(Boolean).join(' · ')}</div>
            </div>
            {status
              ? <EcoStatusPill status={status} />
              : <button className="btn btn--sm" disabled={busy === ev.id} onClick={() => register(ev)}>{busy === ev.id ? '…' : 'Request to cover'}</button>}
          </div>
        )
      })}
    </div>
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
  statTiles: (data) => {
    const imp = data?.impact || {}
    return [
      { label: 'Students', value: imp.students ?? 0 },
      { label: 'Schools', value: imp.schools ?? 0 },
      { label: 'Businesses', value: imp.businesses ?? 0 },
      { label: 'Solutions', value: imp.solutions ?? 0 },
    ]
  },
  tabs: [
    {
      key: 'presskit',
      label: 'Press & Media Kit',
      render: (data) => (
        <>
          <Section title="Press Kit & Media Kit">
            <DownloadList items={data?.presskit} />
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 0' }}>Bios, official talking points, story context and headshots — approved for publication.</p>
          </Section>
          <Section title="Photo & Video Library / Downloads">
            <EcoDocuments docs={data?.documents} />
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 0' }}>Approved images, logos and clips issued to your outlet by the program team.</p>
          </Section>
        </>
      ),
    },
    {
      key: 'coverage',
      label: 'Coverage & Events',
      render: (data, reload) => (
        <>
          <Section title="Media Credentials" right={<RequestButton role="media" reqType="credentials" label="Apply for Credentials" reload={reload} />}>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Apply for official press credentials to attend and cover challenge events. The program team reviews each request.</p>
          </Section>
          <Section title="Upcoming Events">
            <MediaEventCalendar requests={(data?.requests as EcoReq[]) || []} reload={reload} />
          </Section>
        </>
      ),
    },
    {
      key: 'interviews',
      label: 'Interviews',
      badge: (data) => ((data?.requests as EcoReq[]) || []).filter((r) => r.req_type === 'interview' && r.status === 'pending').length,
      render: (data, reload) => {
        const interviews = ((data?.requests as EcoReq[]) || []).filter((r) => r.req_type === 'interview')
        return (
          <Section title="Interview Requests" right={<RequestButton role="media" reqType="interview" label="Request an Interview" reload={reload} solid />}>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>Request an interview with Frantz — podcast, TV, print or panel. Track each request's status below; the program team follows up.</p>
            <EcoRequests items={interviews} role="media" reload={reload} />
          </Section>
        )
      },
    },
    {
      key: 'assignments',
      label: 'My Assignments',
      badge: (data) => ((data?.assignments as EcoAssign[]) || []).filter((a) => a.status.toLowerCase() === 'active').length,
      render: (data, reload) => (
        <Section title="My Assignments">
          <EcoAssignments items={data?.assignments as EcoAssign[] | undefined} role="media" reload={reload} />
        </Section>
      ),
    },
    {
      key: 'profile',
      label: 'Profile & Branding',
      render: (data, reload) => {
        const p = data?.profile
        const d = p?.details || {}
        return (
          <>
            <Section title="Outlet Profile">
              <dl className="eco-dl" style={{ color: '#d8d3c6', fontSize: 13.5 }}>
                <dt style={{ color: 'var(--muted)' }}>Outlet</dt><dd style={{ margin: 0 }}>{p?.org_name || d.outlet || '—'}</dd>
                <dt style={{ color: 'var(--muted)' }}>Beat</dt><dd style={{ margin: 0 }}>{d.beat || '—'}</dd>
                <dt style={{ color: 'var(--muted)' }}>Contact</dt><dd style={{ margin: 0 }}>{p?.contact_name || '—'}{p?.contact_phone ? ` · ${p.contact_phone}` : ''}</dd>
                <dt style={{ color: 'var(--muted)' }}>Website</dt><dd style={{ margin: 0 }}>{p?.website ? <a href={p.website} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-light)' }}>{p.website}</a> : '—'}</dd>
              </dl>
            </Section>
            <Section title="Branding"><LogoUploader role="media" current={d.logo_url} reload={reload} /></Section>
            <Section title="Founder Biography">
              <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
                Frantz Coutard — founder of the “Leave It Better Than You Found It” movement, connecting New York students with local businesses to solve real community problems. Full approved biography and headshots are available in the press kit.
              </p>
            </Section>
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
          <EcoMessages fetchUrl="ecosystem/media/messages" sendUrl="ecosystem/media/message" sendPayload={(body) => ({ body })} mine="user" onLoaded={reload} />
        </Section>
      ),
    },
    {
      key: 'updates',
      label: 'Updates',
      badge: (data) => unseenAnnCount('media', data?.announcements) + unseenReqCount('media', data?.requests),
      onActivate: (data) => { markAnnSeen('media', data?.announcements); markReqSeen('media', data?.requests) },
      render: (data, reload) => (
        <>
          <Section title="Announcements"><EcoAnnouncements items={data?.announcements} /></Section>
          <Section title="All My Requests"><EcoRequests items={data?.requests} role="media" reload={reload} /></Section>
        </>
      ),
    },
  ],
}

export default function MediaPortal() { return <EcosystemPortal config={config} /> }
