import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type EventItem } from '../lib/api'
import { loadSavedItems, toggleSavedItem } from '../lib/memberStorage'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'

const monthAbbr = (d: string) => new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short' })
const dayNum = (d: string) => new Date(d + 'T00:00:00').getDate()
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const calendarUrl = (e: EventItem) => {
  const start = e.event_date.split('-').join('')
  const text = encodeURIComponent(e.title)
  const details = encodeURIComponent(`${e.role || 'Event'} - ${e.location || 'Location pending'}`)
  const location = encodeURIComponent(e.location || '')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${start}&details=${details}&location=${location}`
}

export default function Events() {
  const { user } = useAuth()
  const [events, setEvents] = useState<EventItem[]>([])
  const [savedEvents, setSavedEvents] = useState<string[]>([])
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null)
  const [rsvpName, setRsvpName] = useState('')
  const [rsvpEmail, setRsvpEmail] = useState('')
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'maybe' | 'interested'>('going')
  const [rsvpNotes, setRsvpNotes] = useState('')
  const [rsvpBusy, setRsvpBusy] = useState(false)
  const [rsvpError, setRsvpError] = useState('')
  const [rsvpSuccess, setRsvpSuccess] = useState('')

  useSeo({ title: 'Events', description: 'Where to find Frantz Coutard next - keynotes, panels, and community gatherings.' })

  useEffect(() => {
    window.scrollTo(0, 0)
    api.get<{ events: EventItem[] }>('events')
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setEvents([]))
    setSavedEvents(loadSavedItems('event').map((item) => item.id))
  }, [])

  const safeEvents = Array.isArray(events) ? events : []

  useEffect(() => {
    if (!activeEvent) return
    setRsvpName(user?.full_name || '')
    setRsvpEmail(user?.email || '')
    setRsvpStatus('going')
    setRsvpNotes('')
    setRsvpError('')
    setRsvpSuccess('')
  }, [activeEvent, user])

  const toggleEvent = (event: EventItem) => {
    const next = toggleSavedItem('event', {
      id: String(event.id),
      title: event.title,
      href: '/events',
      meta: `${event.location || 'Location pending'} · ${fmtDate(event.event_date)}`,
    })
    setSavedEvents(next.map((item) => item.id))
    window.fcToast?.(next.some((item) => item.id === String(event.id)) ? 'Event saved to your dashboard.' : 'Removed from saved events.')
  }

  const submitRsvp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeEvent) return
    setRsvpBusy(true)
    setRsvpError('')
    setRsvpSuccess('')
    try {
      const res = await api.post<{ message: string; confirmation_code: string }>('event-rsvp', {
        event_id: activeEvent.id,
        full_name: rsvpName,
        email: rsvpEmail,
        status: rsvpStatus,
        notes: rsvpNotes,
      })
      setRsvpSuccess(`${res.message} Confirmation code: ${res.confirmation_code}`)
      window.fcToast?.('RSVP confirmed.')
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : 'RSVP failed.')
    } finally {
      setRsvpBusy(false)
    }
  }

  const upcoming = safeEvents.filter((e) => !e.is_past)
  const past = safeEvents.filter((e) => e.is_past)

  const Row = (e: EventItem) => {
    const saved = savedEvents.includes(String(e.id))
    return (
      <div className="glass event-row" key={e.id}>
        <div className="date"><div className="m">{monthAbbr(e.event_date)}</div><div className="d">{dayNum(e.event_date)}</div></div>
        <div>
          <h3>{e.title}</h3>
          <div className="loc">{e.location}</div>
          <div className="role">{e.role}</div>
          <div className="role" style={{ marginTop: 6 }}>{e.rsvp_count ?? 0} RSVPs</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={saved ? 'btn btn--sm btn--solid' : 'btn btn--sm'}
            onClick={() => toggleEvent(e)}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
          <a className="btn btn--sm" href={calendarUrl(e)} target="_blank" rel="noopener noreferrer">Calendar</a>
          <button className="btn btn--sm btn--solid" onClick={() => setActiveEvent(e)}>{e.is_past ? 'View RSVP' : 'RSVP'}</button>
          {e.is_past && <span className="past">Past</span>}
        </div>
      </div>
    )
  }

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Events &amp; Appearances</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Where to Find Frantz</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto' }}>
            Keynotes, panels, and community gatherings. Come say hello.
          </p>
          <div className="page-hero__chips reveal in d2" style={{ justifyContent: 'center', marginTop: 18 }}>
            <span className="chip">{savedEvents.length} saved</span>
            <span className="chip">{upcoming.length} upcoming</span>
            <span className="chip">{past.length} past appearances</span>
          </div>
          <div className="profile-actions" style={{ justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            <Link className="btn btn--solid btn--sm" to="/community">Join Community</Link>
            <button className="btn btn--sm" data-request="Speaking Engagement">Book Frantz</button>
          </div>
        </div>
      </section>

      {activeEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 220,
            background: 'rgba(4,4,4,0.82)',
            backdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
          onClick={(e) => e.target === e.currentTarget && setActiveEvent(null)}
        >
          <form
            className="glass"
            onSubmit={submitRsvp}
            style={{
              width: '100%',
              maxWidth: 640,
              padding: 30,
              borderRadius: 18,
              position: 'relative',
            }}
          >
            <button
              type="button"
              className="award-modal__close"
              style={{ position: 'absolute', right: 14, top: 14 }}
              onClick={() => setActiveEvent(null)}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Event RSVP</div>
            <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', marginBottom: 10 }}>{activeEvent.title}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              {fmtDate(activeEvent.event_date)} - {activeEvent.location || 'Location pending'}
            </p>
            <div className="fgrid">
              <div className="field col2">
                <label>Full Name</label>
                <input type="text" required value={rsvpName} onChange={(ev) => setRsvpName(ev.target.value)} />
              </div>
              <div className="field col2">
                <label>Email</label>
                <input type="email" required value={rsvpEmail} onChange={(ev) => setRsvpEmail(ev.target.value)} />
              </div>
              <div className="field col2">
                <label>Status</label>
                <select value={rsvpStatus} onChange={(ev) => setRsvpStatus(ev.target.value as 'going' | 'maybe' | 'interested')} style={{ width: '100%' }}>
                  <option value="going">Going</option>
                  <option value="maybe">Maybe</option>
                  <option value="interested">Interested</option>
                </select>
              </div>
              <div className="field col2">
                <label>Notes</label>
                <textarea className="fld-area" value={rsvpNotes} onChange={(ev) => setRsvpNotes(ev.target.value)} placeholder="Accessibility notes, guests, or questions" />
              </div>
            </div>
            {rsvpError && <p style={{ color: '#e08a8a', fontSize: 13, marginTop: 10 }}>{rsvpError}</p>}
            {rsvpSuccess && <p style={{ color: 'var(--green-bright)', fontSize: 13, marginTop: 10 }}>{rsvpSuccess}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20 }}>
              <a className="btn btn--sm" href={calendarUrl(activeEvent)} target="_blank" rel="noopener noreferrer">Add to Calendar</a>
              <button type="button" className="btn btn--sm" onClick={() => setActiveEvent(null)}>Close</button>
              <button className="btn btn--sm btn--solid" type="submit" disabled={rsvpBusy}>{rsvpBusy ? 'Submitting...' : 'Confirm RSVP'}</button>
            </div>
          </form>
        </div>
      )}

      <section className="block" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="events-page-list reveal">
            {upcoming.length > 0 ? upcoming.map(Row) : <p style={{ textAlign: 'center', color: 'var(--muted)' }}>No upcoming events scheduled - check back soon.</p>}
          </div>

          {past.length > 0 && (
            <>
              <div className="block__head reveal" style={{ marginTop: 60 }}>
                <div className="section-title"><span className="ln l" /><h2 className="gold-text">Past Appearances</h2><span className="ln r" /></div>
              </div>
              <div className="events-page-list reveal">{past.map(Row)}</div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
