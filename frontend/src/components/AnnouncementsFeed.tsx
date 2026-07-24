import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/* Global announcements feed shown on every dashboard. Self-fetching from
   GET announcements (audience 'all' + anything targeted to the viewer's role).
   Renders an optional media attachment (image / video / PDF). */

export interface Announcement {
  id: number
  title: string
  body: string
  media_url: string
  created_ts: number
}

const fmt = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const isVideo = (u: string) => /\.(mp4|webm|mov|mkv|m4v)$/i.test(u)
const isPdf = (u: string) => /\.pdf$/i.test(u)

/** Renders one announcement's media attachment by type. */
function AnnouncementMedia({ url }: { url: string }) {
  if (!url) return null
  const box: React.CSSProperties = { marginTop: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', maxWidth: 520 }
  if (isVideo(url)) return <video src={url} controls preload="metadata" style={{ ...box, width: '100%', display: 'block' }} />
  if (isPdf(url)) return <a className="btn btn--sm" href={url} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: 'inline-flex' }}>📄 View attached PDF</a>
  return <img src={url} alt="Announcement attachment" loading="lazy" style={{ ...box, width: '100%', display: 'block', objectFit: 'cover' }} />
}

const ANN_SEEN_KEY = 'fc_ann_seen_global'

/* Global announcement badge: fetches announcements once, counts how many are
   newer than the highest id the user has viewed (persisted in localStorage). */
export function useAnnouncementBadge() {
  const [anns, setAnns] = useState<Announcement[]>([])
  const [seen, setSeen] = useState<number>(() => {
    try { return Number(localStorage.getItem(ANN_SEEN_KEY) || 0) } catch { return 0 }
  })
  useEffect(() => {
    let active = true
    api.get<{ announcements: Announcement[] }>('announcements')
      .then((d) => { if (active) setAnns(Array.isArray(d.announcements) ? d.announcements : []) })
      .catch(() => { /* silent */ })
    return () => { active = false }
  }, [])
  const maxId = anns.reduce((m, a) => Math.max(m, a.id || 0), 0)
  const unseen = anns.filter((a) => (a.id || 0) > seen).length
  const markSeen = () => {
    try { localStorage.setItem(ANN_SEEN_KEY, String(maxId)) } catch { /* ignore */ }
    setSeen(maxId)
  }
  return { items: anns, unseen, markSeen }
}

export default function AnnouncementsFeed({ items }: { items?: Announcement[] }) {
  const [anns, setAnns] = useState<Announcement[]>(items ?? [])
  const [loading, setLoading] = useState(!items)

  useEffect(() => {
    if (items) { setAnns(items); return }
    let active = true
    api.get<{ announcements: Announcement[] }>('announcements')
      .then((d) => { if (active) setAnns(Array.isArray(d.announcements) ? d.announcements : []) })
      .catch(() => { /* silent: empty feed */ })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [items])

  return (
    <section className="glass" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 16, padding: 'clamp(16px,3vw,22px)', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 14px' }}>Announcements</h2>
      {loading ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>
        : anns.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No announcements yet.</p>
          : (
            <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
              {anns.map((a) => (
                <article key={a.id} style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ color: 'var(--ivory)', fontSize: 14.5 }}>{a.title}</strong>
                    <span style={{ color: 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmt(a.created_ts)}</span>
                  </div>
                  {a.body && <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.body}</p>}
                  <AnnouncementMedia url={a.media_url} />
                </article>
              ))}
            </div>
          )}
    </section>
  )
}
