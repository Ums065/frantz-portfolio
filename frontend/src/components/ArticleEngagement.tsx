import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

/* Sharing, the "Good Read" button, and read tracking for a blog article.
   Tracking is anonymous: the browser keeps a random id in localStorage and the
   server stores only a hash of it, so there is no account and nothing
   identifying. Time is counted only while the tab is actually visible, and
   reported with sendBeacon on the way out so it survives the page closing. */

const VISITOR_KEY = 'fc_visitor_id'
const newId = () => (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/* Held in memory when storage is blocked, so the buttons still work for this
   visit. It used to return '' there, and the server rejects an empty id — which
   meant Good Read simply failed for anyone in a private window. */
let memoryVisitor = ''

export function visitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY)
    if (!v) {
      v = newId()
      localStorage.setItem(VISITOR_KEY, v)
    }
    return v
  } catch {
    // Private mode or storage blocked: anonymous and not persisted, but usable.
    if (!memoryVisitor) memoryVisitor = newId()
    return memoryVisitor
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

/* One button. Pressing it opens the list of places to share to, rather than
   spraying eight icons across the page before anyone has asked to share.

   The brand marks are the real ones (the official single-colour logos), not
   approximations — a cross standing in for the X logo reads as "close", which
   is the opposite of what the button does. Brand paths are filled shapes;
   the generic ones (mail, message, link) stay as line icons and are drawn at
   the same weight so the menu still looks like one set. */

interface IconSpec { d: string; filled?: boolean }

const ICONS: Record<string, IconSpec> = {
  whatsapp: {
    filled: true,
    d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488',
  },
  x: {
    filled: true,
    d: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  },
  facebook: {
    filled: true,
    d: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  linkedin: {
    filled: true,
    d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z',
  },
  telegram: {
    filled: true,
    d: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  },
  reddit: {
    filled: true,
    d: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286A.723.723 0 0 0 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199a1.999 1.999 0 1 1-1.947 2.46v.002a2.37 2.37 0 0 0-2.032 2.341v.007c1.777.067 3.4.567 4.686 1.363a2.802 2.802 0 1 1 3.058 4.587c-.16 3.146-3.622 5.66-7.86 5.66-4.226 0-7.68-2.5-7.859-5.633a2.802 2.802 0 1 1 3.021-4.618c1.276-.79 2.881-1.291 4.64-1.365v-.01a3.226 3.226 0 0 1 2.854-3.202 2 2 0 0 1 1.44-1.591Zm-.752 8.531a1.201 1.201 0 0 0-.834 2.06 1.201 1.201 0 1 0 .834-2.06Zm-7.316.005a1.201 1.201 0 1 0 .786 2.078 1.201 1.201 0 0 0-.786-2.078Zm.985 5.6a.31.31 0 0 0-.222.53c.928.927 2.716.999 3.234.999.517 0 2.306-.072 3.233-.999a.31.31 0 1 0-.438-.438c-.586.585-1.83.79-2.795.79-.966 0-2.21-.205-2.796-.79a.31.31 0 0 0-.216-.092Z',
  },
  email: { d: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM3.6 6.7l7.5 5.6a1.5 1.5 0 0 0 1.8 0l7.5-5.6' },
  sms: { d: 'M20 15.5a2 2 0 0 1-2 2H8l-4 3.5v-14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2zM8 9h8M8 12.5h5' },
  copy: { d: 'M10 13a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 11a4 4 0 0 0-5.66 0l-3 3A4 4 0 0 0 11 19.66l1-1' },
  share: { d: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M12 15V3M8.5 6.5 12 3l3.5 3.5' },
  check: { d: 'M4 12.5 9 17.5 20 6.5' },
}

function Icon({ name, size = 17 }: { name: keyof typeof ICONS | string; size?: number }) {
  const spec = ICONS[name] ?? ICONS.share
  return spec.filled
    ? (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d={spec.d} />
      </svg>
    )
    : (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d={spec.d} />
      </svg>
    )
}

interface ShareTarget { key: string; label: string; href?: string; brand?: string }

export function ShareButton({ title, url, postId, compact, align = 'left' }: {
  title: string
  url: string
  postId?: number
  compact?: boolean
  /** Which edge the menu lines up with — 'right' near the end of a row. */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const btn = useRef<HTMLButtonElement | null>(null)

  // Which channel was used, so "how do people find it" has an answer. We can
  // only see the click — whether they went through with it happens off-page.
  const track = (channel: string) => {
    if (!postId) return
    void api.post(`posts/${postId}/share`, { channel }).catch(() => {})
  }

  const t = encodeURIComponent(title)
  const u = encodeURIComponent(url)
  const targets: ShareTarget[] = [
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}`, brand: '#25D366' },
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, brand: '#1877F2' },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, brand: '#0A66C2' },
    { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}`, brand: '#26A5E4' },
    { key: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}`, brand: '#FF4500' },
    { key: 'sms', label: 'Text message', href: `sms:?&body=${t}%20${u}` },
    { key: 'email', label: 'Email', href: `mailto:?subject=${t}&body=${t}%0A%0A${u}` },
  ]

  // Close on a click elsewhere or on Escape, and hand focus back to the button
  // so a keyboard user is not dropped at the top of the page.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      track('copy')
      setCopied(true)
      window.fcToast?.('Link copied.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.fcToast?.('Could not copy the link.')
    }
    setOpen(false)
  }

  // On a phone the operating system's own sheet beats any menu we can draw,
  // so it is offered — but never instead of the menu, because a browser that
  // has navigator.share is not necessarily a phone.
  const native = async () => {
    setOpen(false)
    try { await navigator.share?.({ title, url }); track('native') } catch { /* dismissed */ }
  }
  const canNative = typeof navigator !== 'undefined' && !!navigator.share

  return (
    <div className={`share${compact ? ' share--compact' : ''}${align === 'right' ? ' share--right' : ''}`} ref={wrap}>
      <button type="button" ref={btn} className="share__btn" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)} title="Share this">
        <Icon name="share" size={compact ? 15 : 17} />
        <span>Share</span>
      </button>

      {open && (
        <div className="share__menu" role="menu" aria-label="Share this">
          {canNative && (
            <button type="button" role="menuitem" className="share__item" onClick={native}>
              <span className="share__ico"><Icon name="share" /></span>Share via…
            </button>
          )}
          {targets.map((s) => (
            <a key={s.key} role="menuitem" className="share__item" href={s.href}
              target={s.href?.startsWith('http') ? '_blank' : undefined}
              rel={s.href?.startsWith('http') ? 'noreferrer' : undefined}
              onClick={() => { track(s.key); setOpen(false) }}>
              <span className="share__ico" style={s.brand ? { color: s.brand } : undefined}>
                <Icon name={s.key} />
              </span>
              {s.label}
            </a>
          ))}
          <button type="button" role="menuitem" className="share__item" onClick={copy}>
            <span className="share__ico"><Icon name={copied ? 'check' : 'copy'} /></span>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------------- Good Read ---------------- */

/* The state lives in a hook, not in the button, because an article shows the
   button twice — under the headline and at the end. Two copies of the same
   state meant liking at the top left the bottom one saying nothing had
   happened. One hook, two buttons, one truth. */
export interface GoodReadState {
  likes: number
  liked: boolean
  busy: boolean
  pop: boolean
  toggle: () => void
}

export function useGoodRead(postId: number | undefined, initial?: Engagement): GoodReadState {
  const [likes, setLikes] = useState(0)
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(false)

  // Depend on the values, not on the object: a parent that rebuilds the object
  // each render would otherwise reset the count on every keystroke elsewhere.
  const seedLikes = initial?.likes ?? 0
  const seedLiked = !!initial?.liked
  useEffect(() => { setLikes(seedLikes); setLiked(seedLiked) }, [seedLikes, seedLiked, postId])

  const toggle = useCallback(async () => {
    if (!postId || busy) return
    setBusy(true)
    // Answer instantly, then let the server have the last word.
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    if (next) { setPop(true); setTimeout(() => setPop(false), 520) }
    try {
      const r = await api.post<{ liked: boolean; likes: number }>(`posts/${postId}/like`, { visitor: visitorId() })
      setLiked(!!r.liked)
      setLikes(Math.max(0, Number(r.likes) || 0))
    } catch {
      setLiked(!next)
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)))
      window.fcToast?.('Could not save that just now.')
    } finally { setBusy(false) }
  }, [busy, liked, postId])

  return { likes, liked, busy, pop, toggle }
}

export function GoodRead({ state, compact }: { state: GoodReadState; compact?: boolean }) {
  const { likes, liked, busy, pop, toggle } = state
  return (
    <button type="button"
      className={`goodread${liked ? ' is-on' : ''}${pop ? ' is-pop' : ''}${compact ? ' goodread--compact' : ''}`}
      onClick={toggle} disabled={busy} aria-pressed={liked}
      title={liked ? 'You marked this a good read' : 'Mark this a good read'}>
      <svg width={compact ? 15 : 17} height={compact ? 15 : 17} viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 10.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1h3Z" />
        <path d="M7 10.5 11 2.6a.9.9 0 0 1 .8-.5A2.7 2.7 0 0 1 14.5 5v3.6h4.3a2 2 0 0 1 1.96 2.4l-1.3 6.4A2.5 2.5 0 0 1 17 19.4H7" />
      </svg>
      <span>Good read</span>
      {likes > 0 && <em>{likes}</em>}
    </button>
  )
}

/** Self-contained Good Read, for a list where each card owns its own state.
 *  The article page uses useGoodRead directly instead, because there the same
 *  state has to drive two buttons. */
export function GoodReadButton({ postId, likes, liked, compact }: {
  postId: number
  likes?: number
  liked?: boolean
  compact?: boolean
}) {
  const state = useGoodRead(postId, { likes: likes ?? 0, liked: !!liked, reads: 0, readers: 0 })
  return <GoodRead state={state} compact={compact} />
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
