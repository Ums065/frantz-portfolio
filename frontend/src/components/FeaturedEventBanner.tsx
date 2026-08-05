import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type EventItem } from '../lib/api'

/* Home-page featured event banner: a rotating carousel of admin-spotlighted
   events with a live countdown, RSVP count, Add-to-Calendar, custom CTA,
   video/image slideshow, per-event accent colour, auto-expiry and view/click
   analytics. All fields are optional and degrade gracefully. */

const ACCENTS: Record<string, { main: string; soft: string }> = {
  gold:   { main: '#d4af37', soft: 'rgba(212,175,55,0.22)' },
  blue:   { main: '#4a90e2', soft: 'rgba(74,144,226,0.22)' },
  green:  { main: '#3fbf7f', soft: 'rgba(63,191,127,0.22)' },
  purple: { main: '#a06cd5', soft: 'rgba(160,108,213,0.22)' },
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtFullDate = (d: string) => new Date(d + 'T00:00:00').toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const monthAbbr = (d: string) => new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short' })
const dayNum = (d: string) => new Date(d + 'T00:00:00').getDate()

const galleryToArray = (g: EventItem['gallery_images']): string[] => {
  if (Array.isArray(g)) return g
  if (typeof g === 'string' && g.trim()) { try { const a = JSON.parse(g); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}

/** Best-effort parse of a free-text time like "6:00 PM" / "18:30" onto a date. */
function eventDateTime(ev: EventItem): Date {
  const base = new Date(ev.event_date + 'T00:00:00')
  const t = (ev.event_time || '').trim()
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (m) {
    let h = parseInt(m[1], 10)
    const min = m[2] ? parseInt(m[2], 10) : 0
    const ap = m[3]?.toLowerCase()
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    base.setHours(h, min, 0, 0)
  }
  return base
}

function toYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (m) return `https://www.youtube.com/embed/${m[1]}`
  const vim = url.match(/vimeo\.com\/(\d+)/)
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`
  return null
}

function gcalLink(ev: EventItem): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = eventDateTime(ev)
  const hasTime = !!(ev.event_time && ev.event_time.trim())
  const end = ev.end_date ? new Date(ev.end_date + 'T00:00:00') : new Date(start)
  if (hasTime && !ev.end_date) end.setHours(start.getHours() + 2, start.getMinutes())
  let dates: string
  if (hasTime) {
    const f = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
    dates = `${f(start)}/${f(end)}`
  } else {
    // all-day: end date is exclusive, so add a day
    const endEx = new Date(end); endEx.setDate(endEx.getDate() + 1)
    const f = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    dates = `${f(start)}/${f(endEx)}`
  }
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates })
  if (ev.description) p.set('details', ev.description)
  if (ev.location) p.set('location', ev.location)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

interface Countdown { days: number; hours: number; mins: number; secs: number; done: boolean }
function useCountdown(target: Date): Countdown {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const diff = target.getTime() - now
  if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0, done: true }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    mins: Math.floor((diff / 60000) % 60),
    secs: Math.floor((diff / 1000) % 60),
    done: false,
  }
}

function track(id: number, type: 'view' | 'click') {
  api.post(`events/${id}/track`, { type }).catch(() => {})
}

function CountdownRow({ ev }: { ev: EventItem }) {
  const c = useCountdown(useMemo(() => eventDateTime(ev), [ev.id, ev.event_date, ev.event_time]))
  if (c.done) return <div className="feat-event__countdown feat-event__countdown--live">● Happening now</div>
  const units: [number, string][] = [[c.days, 'days'], [c.hours, 'hrs'], [c.mins, 'min'], [c.secs, 'sec']]
  return (
    <div className="feat-event__countdown" role="timer" aria-label="Time until event">
      {units.map(([v, l]) => (
        <span className="feat-event__cd-unit" key={l}><b>{String(v).padStart(2, '0')}</b><span>{l}</span></span>
      ))}
    </div>
  )
}

function Media({ ev }: { ev: EventItem }) {
  const embed = ev.video_url ? toYouTubeEmbed(ev.video_url) : null
  const images = useMemo(
    () => [ev.image_url, ...galleryToArray(ev.gallery_images)].filter(Boolean) as string[],
    [ev.id, ev.image_url, ev.gallery_images],
  )
  const [idx, setIdx] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  useEffect(() => { setIdx(0); setLightbox(null) }, [ev.id])
  useEffect(() => {
    if (embed || ev.video_url || images.length < 2) return
    const t = window.setInterval(() => setIdx((i) => (i + 1) % images.length), 4000)
    return () => window.clearInterval(t)
  }, [embed, ev.video_url, images.length])

  if (embed) {
    return (
      <div className="feat-event__media feat-event__media--video">
        <iframe src={embed} title={ev.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    )
  }
  if (ev.video_url) {
    return (
      <div className="feat-event__media feat-event__media--video">
        <video src={ev.video_url} controls poster={ev.image_url || undefined} />
      </div>
    )
  }
  if (images.length === 0) return null
  return (
    <div className="feat-event__media">
      <button type="button" className="feat-event__img-btn" onClick={() => setLightbox(images[idx])} aria-label="View full image" title="Click to view full image">
        <img src={images[idx]} alt={ev.title} loading="lazy" decoding="async" />
        <span className="feat-event__zoom" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></svg>
        </span>
      </button>
      <span className="feat-event__date-chip" aria-hidden="true">
        <span className="m">{monthAbbr(ev.event_date)}</span>
        <span className="d">{dayNum(ev.event_date)}</span>
      </span>
      {images.length > 1 && (
        <div className="feat-event__img-dots" role="tablist" aria-label="Event images">
          {images.map((_, i) => (
            <button key={i} type="button" className={i === idx ? 'on' : ''} aria-label={`Image ${i + 1}`} aria-selected={i === idx} onClick={() => setIdx(i)} />
          ))}
        </div>
      )}
      {lightbox && <ImageLightbox src={lightbox} title={ev.title} onClose={() => setLightbox(null)} />}
    </div>
  )
}

/** Full-screen image viewer with a download button. Closes on backdrop click or Esc. */
function ImageLightbox({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  const filename = (src.split('/').pop() || 'event-image').split('?')[0]
  return (
    <div className="feat-lightbox" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label={`${title} image`}>
      <div className="feat-lightbox__inner">
        <img src={src} alt={title} />
        <div className="feat-lightbox__bar">
          <a className="btn btn--solid" href={src} download={filename}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ marginRight: 6, verticalAlign: '-3px' }}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            Download
          </a>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
      <button type="button" className="feat-lightbox__x" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}

function EventCard({ ev }: { ev: EventItem }) {
  const accent = ACCENTS[ev.accent || 'gold'] || ACCENTS.gold
  const ctaLabel = ev.cta_label?.trim() || 'RSVP / View Details'
  const ctaUrl = ev.cta_url?.trim() || '/events'
  const external = /^https?:\/\//i.test(ctaUrl)
  const rsvp = ev.rsvp_count ?? 0
  const style = { ['--fe-accent' as string]: accent.main, ['--fe-accent-soft' as string]: accent.soft } as React.CSSProperties

  // Count a view once when this card mounts (i.e. becomes the visible slide).
  useEffect(() => { track(ev.id, 'view') }, [ev.id])

  const ctaInner = <>{ctaLabel}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg></>

  return (
    <article className={`feat-event__card${ev.image_url || ev.video_url ? '' : ' feat-event__card--noimg'}`} style={style}>
      <span className="feat-event__glow" aria-hidden="true" />
      <Media ev={ev} />
      <div className="feat-event__body">
        <span className="feat-event__badge"><span className="feat-event__star">★</span> {ev.badge_label?.trim() || 'Featured Event'}</span>
        <h2 className="gold-text">{ev.title}</h2>
        <div className="feat-event__meta">
          <span className="feat-event__meta-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
            {fmtFullDate(ev.event_date)}{ev.event_time ? ` · ${ev.event_time}` : ''}
          </span>
          {ev.location && (
            <span className="feat-event__meta-item">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
              {ev.location}
            </span>
          )}
          {rsvp > 0 && (
            <span className="feat-event__meta-item feat-event__going">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></svg>
              {rsvp} going
            </span>
          )}
        </div>
        <CountdownRow ev={ev} />
        {ev.description && <p className="feat-event__desc">{ev.description}</p>}
        <div className="feat-event__actions">
          {external
            ? <a className="btn btn--solid feat-event__cta" href={ctaUrl} target="_blank" rel="noreferrer" onClick={() => track(ev.id, 'click')}>{ctaInner}</a>
            : <Link className="btn btn--solid feat-event__cta" to={ctaUrl} onClick={() => track(ev.id, 'click')}>{ctaInner}</Link>}
          <a className="btn feat-event__ical" href={gcalLink(ev)} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4M12 12v5M9.5 14.5h5" /></svg>
            Add to Calendar
          </a>
        </div>
      </div>
    </article>
  )
}

export default function FeaturedEventBanner({ events }: { events: EventItem[] }) {
  const today = todayISO()
  const featured = useMemo(
    () => (Array.isArray(events) ? events : []).filter((e) => {
      if (!e.is_featured || e.is_past) return false
      if (e.publish_at && e.publish_at > today) return false          // scheduled for later
      const ends = e.end_date || e.event_date
      if (ends && ends < today) return false                          // auto-expire past events
      return true
    }),
    [events, today],
  )

  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => { if (idx >= featured.length) setIdx(0) }, [featured.length, idx])
  useEffect(() => {
    if (paused || featured.length < 2) return
    const t = window.setInterval(() => setIdx((i) => (i + 1) % featured.length), 8000)
    return () => window.clearInterval(t)
  }, [paused, featured.length])

  if (featured.length === 0) return null
  const current = featured[Math.min(idx, featured.length - 1)]

  return (
    <section className="block feat-event" id="featured-event" data-screen-label="Event">
      <div className="wrap">
        <div
          className="feat-event__carousel reveal in"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <EventCard ev={current} key={current.id} />
          {featured.length > 1 && (
            <>
              <button type="button" className="feat-event__nav feat-event__nav--prev" aria-label="Previous event"
                onClick={() => setIdx((i) => (i - 1 + featured.length) % featured.length)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <button type="button" className="feat-event__nav feat-event__nav--next" aria-label="Next event"
                onClick={() => setIdx((i) => (i + 1) % featured.length)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>
              </button>
              <div className="feat-event__dots" role="tablist" aria-label="Featured events">
                {featured.map((e, i) => (
                  <button key={e.id} type="button" className={i === idx ? 'on' : ''} aria-label={`Event ${i + 1}`} aria-selected={i === idx} onClick={() => setIdx(i)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
