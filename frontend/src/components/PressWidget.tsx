import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type PressItem } from '../lib/api'

/* Home "Featured In / Press" widget: a floating button that opens the CEO's
   press — articles, YouTube/Instagram videos and photos. YouTube plays inline,
   photos enlarge, articles open in a new tab. Thumbnails are resolved
   server-side when an item is added in admin. */

const ytId = (url?: string | null): string | null => {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}

/* Inline glyphs rather than emoji: emoji render differently on every platform
   and cannot take the gold accent colour. */
function KindIcon({ kind, size = 13 }: { kind: string; size?: number }) {
  const p = {
    youtube: <><path d="M3 6.5h18v11H3zM10 9.5l5 2.5-5 2.5z" /></>,
    video: <><path d="M3 6.5h18v11H3zM10 9.5l5 2.5-5 2.5z" /></>,
    instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="4" /><circle cx="17" cy="7" r="1" /></>,
    website: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    photo: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5.5-5 4 3.5L17 13l3 3" /></>,
  }[kind] ?? <><circle cx="12" cy="12" r="8" /></>
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{p}</svg>
  )
}
const KIND_LABEL: Record<string, string> = {
  youtube: 'Video', video: 'Video', instagram: 'Instagram', website: 'Article', photo: 'Photo',
}
/* Grouping for the filter chips — Instagram sits with video, an article is an article. */
const KIND_GROUP: Record<string, 'video' | 'article' | 'photo'> = {
  youtube: 'video', video: 'video', instagram: 'video', website: 'article', photo: 'photo',
}
const GROUP_LABEL: Record<string, string> = { video: 'Video', article: 'Press', photo: 'Photos' }

export default function PressWidget() {
  const [items, setItems] = useState<PressItem[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<PressItem | null>(null)
  const [filter, setFilter] = useState<'all' | 'video' | 'article' | 'photo'>('all')
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    api.get<{ items: PressItem[] }>('press').then((d) => setItems(Array.isArray(d.items) ? d.items : [])).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // Escape steps back out of a video before closing the whole thing.
      if (e.key !== 'Escape') return
      if (active) setActive(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, active])

  const groups = useMemo(() => {
    const g = new Set(items.map((i) => KIND_GROUP[i.kind] || 'article'))
    return (['video', 'article', 'photo'] as const).filter((k) => g.has(k))
  }, [items])
  const shown = filter === 'all' ? items : items.filter((i) => (KIND_GROUP[i.kind] || 'article') === filter)
  /* The outlets themselves are the credential, so name them under the title. */
  const outlets = useMemo(
    () => Array.from(new Set(items.map((i) => (i.source_name || '').trim()).filter(Boolean))).slice(0, 6),
    [items],
  )

  if (items.length === 0) return null

  const openItem = (it: PressItem) => {
    if (it.kind === 'youtube' || it.kind === 'photo') { setActive(it); return }
    if (it.url) window.open(it.url, '_blank', 'noopener')
  }
  const thumb = (it: PressItem) => it.thumbnail_url || (ytId(it.url) ? `https://img.youtube.com/vi/${ytId(it.url)}/hqdefault.jpg` : '')
  const close = () => { setActive(null); setOpen(false) }

  return (
    <>
      {/* Floating trigger, pinned just above the language toggle. */}
      <button type="button" className="press-fab" onClick={() => setOpen(true)} title="Press & Media">
        <span className="press-fab__star" aria-hidden="true">★</span>
        <span className="press-fab__txt">Featured In</span>
        <span className="press-fab__count">{items.length}</span>
      </button>

      {open && (
        <div className="press-modal" onClick={(e) => { if (e.target === e.currentTarget) close() }}
          role="dialog" aria-modal="true" aria-label="Press and media">
          <div className="press-modal__inner">
            <button type="button" className="press-modal__x" ref={closeRef} onClick={close} aria-label="Close">✕</button>

            <header className="press-head">
              <span className="press-head__eyebrow">As seen in</span>
              <h3 className="press-head__title">Press &amp; Media</h3>
              <p className="press-head__sub">
                {items.length} feature{items.length === 1 ? '' : 's'} across broadcast, print and social.
              </p>
              {outlets.length > 0 && (
                <div className="press-outlets">
                  {outlets.map((o) => <span key={o} className="press-outlet">{o}</span>)}
                  {items.length > outlets.length && <span className="press-outlet press-outlet--more">+ more</span>}
                </div>
              )}
            </header>

            {active ? (
              <div className="press-viewer">
                <button type="button" className="btn btn--sm press-viewer__back" onClick={() => setActive(null)}>← Back to all</button>
                {active.kind === 'youtube' && ytId(active.url)
                  ? (
                    <div className="press-viewer__video">
                      <iframe src={`https://www.youtube.com/embed/${ytId(active.url)}?rel=0`} title={active.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                  )
                  : <div className="press-viewer__photo"><img src={thumb(active)} alt={active.title} /></div>}
                <div className="press-viewer__meta">
                  <div>
                    <h4>{active.title}</h4>
                    {active.source_name && <p className="press-card__src">{active.source_name}</p>}
                  </div>
                  {active.url && (
                    <a className="btn btn--sm" href={active.url} target="_blank" rel="noreferrer">Open original ↗</a>
                  )}
                </div>
              </div>
            ) : (
              <>
                {groups.length > 1 && (
                  <div className="press-chips" role="tablist" aria-label="Filter press by type">
                    <button type="button" role="tab" aria-selected={filter === 'all'}
                      className={`press-chip${filter === 'all' ? ' is-active' : ''}`} onClick={() => setFilter('all')}>
                      All <em>{items.length}</em>
                    </button>
                    {groups.map((g) => {
                      const n = items.filter((i) => (KIND_GROUP[i.kind] || 'article') === g).length
                      return (
                        <button key={g} type="button" role="tab" aria-selected={filter === g}
                          className={`press-chip${filter === g ? ' is-active' : ''}`} onClick={() => setFilter(g)}>
                          {GROUP_LABEL[g]} <em>{n}</em>
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="press-grid">
                  {shown.map((it, i) => (
                    <button type="button" className="press-card" key={it.id} onClick={() => openItem(it)} title={it.title}
                      style={{ ['--i' as string]: String(Math.min(i, 11)) }}>
                      <span className="press-card__thumb">
                        {thumb(it)
                          ? <img src={thumb(it)} alt={it.title} loading="lazy" />
                          : <span className="press-card__ph"><KindIcon kind={it.kind} size={22} /></span>}
                        <span className="press-card__veil" aria-hidden="true" />
                        <span className="press-card__kind"><KindIcon kind={it.kind} />{KIND_LABEL[it.kind] || 'Media'}</span>
                        {(it.kind === 'youtube' || it.kind === 'video') && <span className="press-card__play" aria-hidden="true">▶</span>}
                      </span>
                      <span className="press-card__title">{it.title}</span>
                      {it.source_name && <span className="press-card__src">{it.source_name}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
