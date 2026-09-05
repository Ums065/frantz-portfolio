import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

/* Sharing, the "Good Read" button, and read tracking for a blog article.
   Tracking is anonymous: the browser keeps a random id in localStorage and the
   server stores only a hash of it, so there is no account and nothing
   identifying. Time is counted only while the tab is actually visible, and
   reported with sendBeacon on the way out so it survives the page closing. */

const VISITOR_KEY = 'fc_visitor_id'

export function visitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY)
    if (!v) {
      v = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      localStorage.setItem(VISITOR_KEY, v)
    }
    return v
  } catch {
    // Private mode or storage blocked: stay anonymous, just do not persist.
    return ''
  }
}

interface Engagement { likes: number; liked: boolean; reads: number; readers: number }

/** Counts visible time on the article and reports it once, on the way out. */
export function useReadTracking(postId: number | undefined, bodyRef: React.RefObject<HTMLElement | null>) {
  const readId = useRef(0)
  const seconds = useRef(0)
  const lastTick = useRef<number | null>(null)
  const reachedEnd = useRef(false)
  const sent = useRef(false)

  useEffect(() => {
    if (!postId) return
    const visitor = visitorId()
    readId.current = 0
    seconds.current = 0
    reachedEnd.current = false
    sent.current = false
    lastTick.current = document.visibilityState === 'visible' ? Date.now() : null

    api.post<{ read_id: number }>(`posts/${postId}/read`, { visitor, referrer: document.referrer || '' })
      .then((d) => { readId.current = d.read_id || 0 })
      .catch(() => {})

    // Only count time the tab is actually in front of the reader.
    const accumulate = () => {
      if (lastTick.current !== null) {
        seconds.current += Math.round((Date.now() - lastTick.current) / 1000)
        lastTick.current = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') lastTick.current = Date.now()
      else { accumulate(); report() }
    }
    // "Finished" means the end of the article scrolled into view.
    const obs = bodyRef.current
      ? new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) reachedEnd.current = true
        }, { rootMargin: '0px 0px -20% 0px' })
      : null
    if (obs && bodyRef.current?.lastElementChild) obs.observe(bodyRef.current.lastElementChild)

    const report = () => {
      if (!readId.current || sent.current) return
      accumulate()
      if (seconds.current < 1) return
      const payload = JSON.stringify({
        read_id: readId.current, visitor, seconds: seconds.current, reached_end: reachedEnd.current,
      })
      try {
        // Beacon survives the page unloading; fetch usually does not.
        const url = `${api.base}/posts/${postId}/read-time`
        if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
        else void api.post(`posts/${postId}/read-time`, JSON.parse(payload))
      } catch { /* nothing worth breaking the page over */ }
    }
    const onLeave = () => { sent.current = false; report(); sent.current = true }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onLeave)
      obs?.disconnect()
      onLeave() // navigating away inside the SPA counts too
    }
  }, [postId, bodyRef])
}

/* ---------------- Sharing ---------------- */

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>
  )
}
const PATHS = {
  whatsapp: 'M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.1-4.6A8.5 8.5 0 1 1 21 11.5Z',
  x: 'M4 4l16 16M20 4L4 20',
  facebook: 'M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H7v3h2v9h3v-9h2.4l.6-3H12V6.8c0-.5.4-.8.9-.8H15z',
  linkedin: 'M4.5 9v11M4.5 5.5v.01M10 20V9m0 4a4 4 0 0 1 8 0v7',
  sms: 'M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z',
  email: 'M3 5h18v14H3zM3 6l9 7 9-7',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  share: 'M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
}

export function ShareRow({ title, url, compact, postId }: { title: string; url: string; compact?: boolean; postId?: number }) {
  const [copied, setCopied] = useState(false)
  // Which channel was used, so "how do people find it" has an answer. We can
  // only see the click — whether they went through with it happens off-page.
  const track = (channel: string) => {
    if (!postId) return
    void api.post(`posts/${postId}/share`, { channel }).catch(() => {})
  }
  const t = encodeURIComponent(title)
  const u = encodeURIComponent(url)
  const links: { key: keyof typeof PATHS; label: string; href: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
    { key: 'sms', label: 'Text', href: `sms:?&body=${t}%20${u}` },
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { key: 'email', label: 'Email', href: `mailto:?subject=${t}&body=${t}%0A%0A${u}` },
  ]
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      track('copy')
      setCopied(true)
      window.fcToast?.('Link copied.')
      setTimeout(() => setCopied(false), 1800)
    } catch { window.fcToast?.('Could not copy the link.') }
  }
  // On a phone, the operating system's own share sheet beats a row of icons.
  const native = async () => {
    try { await navigator.share?.({ title, url }); track('native') } catch { /* dismissed */ }
  }
  const canNative = typeof navigator !== 'undefined' && !!navigator.share

  return (
    <div className={`share-row${compact ? ' share-row--compact' : ''}`}>
      {!compact && <span className="share-row__label">Share this</span>}
      <div className="share-row__btns">
        {canNative && (
          <button type="button" className="share-btn share-btn--native" onClick={native} title="Share…">
            <Icon d={PATHS.share} /><span>Share</span>
          </button>
        )}
        {links.map((l) => (
          <a key={l.key} className="share-btn" href={l.href}
            target={l.href.startsWith('http') ? '_blank' : undefined}
            rel={l.href.startsWith('http') ? 'noreferrer' : undefined}
            title={`Share on ${l.label}`} aria-label={`Share on ${l.label}`}
            onClick={() => track(l.key)}>
            <Icon d={PATHS[l.key]} /><span>{l.label}</span>
          </a>
        ))}
        <button type="button" className="share-btn" onClick={copy} title="Copy link" aria-label="Copy link">
          <Icon d={PATHS.copy} /><span>{copied ? 'Copied' : 'Copy link'}</span>
        </button>
      </div>
    </div>
  )
}

/* ---------------- Good Read ---------------- */

export function GoodRead({ postId, initial }: { postId: number; initial?: Engagement }) {
  const [likes, setLikes] = useState(initial?.likes ?? 0)
  const [liked, setLiked] = useState(!!initial?.liked)
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(false)

  useEffect(() => {
    setLikes(initial?.likes ?? 0)
    setLiked(!!initial?.liked)
  }, [initial])

  const toggle = useCallback(async () => {
    setBusy(true)
    // Answer instantly, correct from the server.
    const optimistic = !liked
    setLiked(optimistic)
    setLikes((n) => Math.max(0, n + (optimistic ? 1 : -1)))
    if (optimistic) { setPop(true); setTimeout(() => setPop(false), 500) }
    try {
      const r = await api.post<{ liked: boolean; likes: number }>(`posts/${postId}/like`, { visitor: visitorId() })
      setLiked(r.liked); setLikes(r.likes)
    } catch {
      setLiked(!optimistic)
      setLikes((n) => Math.max(0, n + (optimistic ? -1 : 1)))
      window.fcToast?.('Could not save that just now.')
    } finally { setBusy(false) }
  }, [liked, postId])

  return (
    <button type="button" className={`goodread${liked ? ' is-on' : ''}${pop ? ' is-pop' : ''}`}
      onClick={toggle} disabled={busy} aria-pressed={liked}
      title={liked ? 'You marked this a good read' : 'Mark this a good read'}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7 11l3.6-7.2A1.5 1.5 0 0 1 13 4.4V9h5.3a2 2 0 0 1 2 2.4l-1.3 6.4a2 2 0 0 1-2 1.6H7" />
      </svg>
      <span>Good read</span>
      {likes > 0 && <em>{likes}</em>}
    </button>
  )
}

/* ---------------- Reading time ---------------- */

/** Rounded-up minutes at 200 words a minute — the usual reading pace. Shown
 *  before the click, and it is what makes the dwell figure mean anything:
 *  "4 min read, people stay 45s" says far more than "45s". */
export function readingMinutes(text: string): number {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

export function ReadingTime({ text, className }: { text: string; className?: string }) {
  const m = readingMinutes(text)
  return <span className={className}>{m} min read</span>
}

/* ---------------- Reading progress ---------------- */

/** A hairline that fills as the article scrolls. Reuses the same scroll the
 *  read tracking already listens to, so it costs nothing extra. */
export function ReadingProgress() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const h = document.documentElement.scrollHeight - window.innerHeight
        setPct(h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])
  return (
    <div className="read-progress" role="progressbar" aria-label="Reading progress"
      aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}
