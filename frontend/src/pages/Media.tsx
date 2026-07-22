import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mediaShowcase, testimonialFallbacks } from '../lib/brandContent'
import { api, type PublicGalleryItemRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'

const mediaKitUrl = '/docs/media_kit.pdf'

const isExternal = (url: string) => /^https?:\/\//i.test(url)
const isAsset = (url: string) => /^\/assets\//i.test(url)

interface MediaRow {
  id: number
  title: string
  type: string
  summary: string | null
  body: string | null
  image: string | null
  link_url: string | null
  published_at: string | null
  is_featured: number
  sort_order: number
}

interface TestimonialRow {
  id: number
  quote: string
  author_name: string
  author_title: string | null
  company: string | null
  image: string | null
  is_featured: number
  sort_order: number
}

export default function Media() {
  const [media, setMedia] = useState<MediaRow[]>([])
  const [testimonials, setTestimonials] = useState<TestimonialRow[]>([])
  const [galleryItems, setGalleryItems] = useState<PublicGalleryItemRow[]>([])
  const [loadErr, setLoadErr] = useState(false)

  useSeo({
    title: 'Media Center',
    description: 'Press kits, interview assets, photos, video clips, and testimonial highlights for Frantz Coutard.',
    image: '/assets/gallery-speaking-stage.webp',
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    api.get<{ media: MediaRow[] }>('media')
      .then((d) => { setMedia(Array.isArray(d.media) ? d.media : []); setLoadErr(false) })
      .catch(() => { setMedia([]); setLoadErr(true) })
    api.get<{ testimonials: TestimonialRow[] }>('testimonials')
      .then((d) => setTestimonials(Array.isArray(d.testimonials) ? d.testimonials : []))
      .catch(() => setTestimonials([]))
    api.get<{ items: PublicGalleryItemRow[] }>('gallery')
      .then((d) => setGalleryItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setGalleryItems([]))
  }, [])

  const safeMedia = Array.isArray(media) ? media : []
  const safeTestimonials = Array.isArray(testimonials) ? testimonials : []

  const items = safeMedia.length
    ? safeMedia
    : mediaShowcase.map((item, index) => ({
        id: index + 1,
        title: item.title,
        type: item.type,
        summary: item.summary,
        body: item.detail,
        image: item.image,
        link_url: item.href,
        published_at: item.published,
        is_featured: item.featured ? 1 : 0,
        sort_order: index + 1,
      }))

  const quotes = safeTestimonials.length
    ? safeTestimonials
    : testimonialFallbacks.map((item, index) => ({
        id: index + 1,
        quote: item.quote,
        author_name: item.name,
        author_title: item.title,
        company: item.company,
        image: item.image,
        is_featured: index === 0 ? 1 : 0,
        sort_order: index + 1,
      }))

  const featured = items.find((item) => item.is_featured) || items[0]
  const galleryImages = galleryItems.filter((item) => item.media_kind === 'image')
  const galleryVideos = galleryItems.filter((item) => item.media_kind === 'video')

  const renderLink = (url: string | null | undefined, label: string) => {
    const href = url || '/blog'
    if (isAsset(href)) {
      return (
        <a className="read" href={href} download>
          {label}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
        </a>
      )
    }
    if (isExternal(href)) {
      return (
        <a className="read" href={href} target="_blank" rel="noopener noreferrer">
          {label}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M9 7h8v8" /></svg>
        </a>
      )
    }
    return (
      <Link className="read" to={href}>
        {label}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>
    )
  }

  return (
    <main className="page">
      {loadErr && <div className="wrap"><p style={{ color: '#e08a8a', textAlign: 'center', fontSize: 13, margin: '12px auto 0' }}>Couldn’t load media right now — please refresh the page.</p></div>}
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Media Center</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Press, Photos, and Clips</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto' }}>
            A focused place for producers, journalists, and partners to find the right assets fast.
          </p>
        </div>
      </section>

      <section className="block" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="action-grid">
            <article className="glass action-card reveal d1">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M8 13h8M8 17h6" /></svg></div>
              <h3>Request A Media Kit</h3>
              <p>Request bios, photographs, and official talking points for interviews, features, and coverage.</p>
              <button className="btn btn--solid" data-request="Media Kit Request">Request Media Kit</button>
            </article>
            <article className="glass action-card reveal d2">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" /><path d="M19 11a7 7 0 01-14 0M12 18v3" /></svg></div>
              <h3>Book An Interview</h3>
              <p>Podcasts, TV segments, print interviews, and panel appearances can all start from the same request flow.</p>
              <button className="btn" data-request="Interview Request">Request Interview</button>
            </article>
            <article className="glass action-card reveal d3">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v6l9 4 9-4V7" /><circle cx="18" cy="17" r="3" /></svg></div>
              <h3>Event Coverage</h3>
              <p>Request access to a speaking event, community gathering, or launch when you need live coverage.</p>
              <button className="btn" data-request="Event Coverage Request">Request Coverage</button>
            </article>
            <article className="glass action-card reveal d4">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg></div>
              <h3>Download Media Kit</h3>
              <p>Grab the official downloadable kit with bio notes, story context, and speaking topics.</p>
              <a className="btn btn--solid" href={mediaKitUrl} download>Download Kit</a>
            </article>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Featured Assets</h2><span className="ln r" /></div>
            <p className="sub">Highlights from the growing media archive.</p>
          </div>
          <div className="blog-list-grid media-list">
            {(featured ? [featured, ...items.filter((item) => item.id !== featured.id)] : items).map((item) => (
              <article className="glass blog-card reveal" key={item.id}>
                <div className="blog-card__img"><img src={item.image || '/assets/abstract-gold-network.webp'} alt={item.title || 'Media asset'} loading="lazy" decoding="async" /></div>
                <div className="blog-card__body">
                  <div className="kicker"><span className="cat">{item.type}</span><span>&bull;</span><span>{item.published_at || 'Current'}</span></div>
                  <h3>{item.title}</h3>
                  <p>{item.summary || item.body || 'Media content coming soon.'}</p>
                  <div className="item-actions">
                    {renderLink(item.link_url, isAsset(item.link_url || '') ? 'Download Asset' : 'View Asset')}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Photo &amp; Video Library</h2><span className="ln r" /></div>
            <p className="sub">Approved community gallery uploads with visible contributor credit.</p>
          </div>
          {galleryImages.length > 0 ? (
            <div className="gallery gallery--uniform reveal">
              {galleryImages.map((item) => (
                <div
                  className="cell"
                  data-cap={`${item.display_title} ? ${item.credit_name}${item.credit_organization ? ` ? ${item.credit_organization}` : ''}`}
                  data-lightbox-src={item.file_url}
                  data-lightbox-cap={`${item.display_title} ? ${item.credit_name}`}
                  data-lightbox-alt={item.display_title}
                  key={item.id}
                  role="button"
                  tabIndex={0}
                >
                  <img src={item.file_url} alt={item.display_title} loading="lazy" decoding="async" />
                  <span className="tagk">Approved Photo</span>
                  <div className="cap">{item.display_title} ? {item.credit_name}{item.credit_organization ? ` ? ${item.credit_organization}` : ''}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="sponsor-note">No approved gallery photos yet.</p>
          )}
          {galleryVideos.length > 0 && (
            <div className="blog-list-grid media-list" style={{ marginTop: 24 }}>
              {galleryVideos.map((item) => (
                <article className="glass blog-card reveal" key={item.id}>
                  <div className="blog-card__img" style={{ display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg, rgba(20,18,12,0.96), rgba(10,10,10,0.96))' }}>
                    <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3z" /></svg>
                  </div>
                  <div className="blog-card__body">
                    <div className="kicker"><span className="cat">Approved Video</span><span>&bull;</span><span>{item.credit_name}</span></div>
                    <h3>{item.display_title}</h3>
                    <p>{item.credit_organization ? `${item.credit_name} ? ${item.credit_organization}` : item.credit_name}</p>
                    <div className="item-actions">
                      <a className="read" href={item.file_url} target="_blank" rel="noreferrer">
                        Open Video
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M9 7h8v8" /></svg>
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">What People Say</h2><span className="ln r" /></div>
            <p className="sub">Testimonials and partner notes that support the story.</p>
          </div>
          <div className="platform-grid media-testimonial-grid">
            {quotes.map((quote, index) => (
              <article className="platform glass reveal" key={quote.id}>
                <span className="platform__tag">{index === 0 ? 'Featured Quote' : 'Testimonial'}</span>
                <h3>{quote.author_name}</h3>
                <p style={{ fontStyle: 'italic', color: '#d9d3c7' }}>&ldquo;{quote.quote}&rdquo;</p>
                <p>{quote.author_title ? `${quote.author_title}${quote.company ? `, ${quote.company}` : ''}` : quote.company || 'Community partner'}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
