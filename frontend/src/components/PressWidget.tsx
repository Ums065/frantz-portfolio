import { useEffect, useState } from 'react'
import { api, type PressItem } from '../lib/api'

/* Home "Featured In / Press" widget: a button that opens a popup grid of the
   CEO's press — articles, YouTube/Instagram videos, and photos. YouTube plays
   inline; photos enlarge; articles/Instagram open in a new tab. Thumbnails are
   auto-resolved server-side when the item is added in admin. */

const ytId = (url?: string | null): string | null => {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}
const KIND_TAG: Record<string, string> = { youtube: '▶ Video', instagram: '⧉ Instagram', website: '📰 Article', video: '▶ Video', photo: '🖼 Photo' }

export default function PressWidget() {
  const [items, setItems] = useState<PressItem[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<PressItem | null>(null)

  useEffect(() => {
    api.get<{ items: PressItem[] }>('press').then((d) => setItems(Array.isArray(d.items) ? d.items : [])).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setActive(null); setOpen(false) } }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  if (items.length === 0) return null

  const openItem = (it: PressItem) => {
    if (it.kind === 'youtube' || it.kind === 'photo') { setActive(it); return }
    if (it.url) window.open(it.url, '_blank', 'noopener')
  }
  const thumb = (it: PressItem) => it.thumbnail_url || (ytId(it.url) ? `https://img.youtube.com/vi/${ytId(it.url)}/hqdefault.jpg` : '')

  return (
    <>
      {/* Floating trigger, pinned just above the language toggle so it's always visible. */}
      <button type="button" className="press-fab" onClick={() => setOpen(true)} title="Press & Media">
        <span className="press-fab__star" aria-hidden="true">★</span>
        <span className="press-fab__txt">Featured In</span>
        <span className="press-fab__count">{items.length}</span>
      </button>

      {open && (
        <div className="press-modal" onClick={(e) => { if (e.target === e.currentTarget) { setActive(null); setOpen(false) } }} role="dialog" aria-modal="true" aria-label="Press and media">
          <div className="press-modal__inner">
            <button type="button" className="press-modal__x" onClick={() => { setActive(null); setOpen(false) }} aria-label="Close">✕</button>
            <h3 className="gold-text" style={{ marginTop: 0 }}>Press &amp; Media</h3>

            {active ? (
              <div className="press-viewer">
                <button type="button" className="btn btn--sm press-viewer__back" onClick={() => setActive(null)}>← Back to all</button>
                {active.kind === 'youtube' && ytId(active.url)
                  ? <div className="press-viewer__video"><iframe src={`https://www.youtube.com/embed/${ytId(active.url)}`} title={active.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
                  : <div className="press-viewer__photo"><img src={thumb(active)} alt={active.title} /></div>}
                <h4>{active.title}</h4>
                {active.source_name && <p className="press-card__src">{active.source_name}</p>}
              </div>
            ) : (
              <div className="press-grid">
                {items.map((it) => (
                  <button type="button" className="press-card" key={it.id} onClick={() => openItem(it)} title={it.title}>
                    <span className="press-card__thumb">
                      {thumb(it) ? <img src={thumb(it)} alt={it.title} loading="lazy" /> : <span className="press-card__ph">{KIND_TAG[it.kind] || 'Media'}</span>}
                      {(it.kind === 'youtube' || it.kind === 'video') && <span className="press-card__play" aria-hidden="true">▶</span>}
                    </span>
                    <span className="press-card__tag">{KIND_TAG[it.kind] || 'Media'}</span>
                    <span className="press-card__title">{it.title}</span>
                    {it.source_name && <span className="press-card__src">{it.source_name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
