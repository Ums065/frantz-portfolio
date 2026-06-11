import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { awards as staticAwards, type Award } from '../lib/awards'
import { api, type AwardRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'

/* DB rows → the Award shape the page renders. */
function mapRow(r: AwardRow): Award {
  return {
    id: String(r.id),
    name: r.title,
    year: r.year ?? '',
    level: (r.level ?? 'Business') as Award['level'],
    presenter: r.presenter ?? undefined,
    short: r.short_text ?? '',
    detail: r.description ?? '',
    image: r.image ?? '',
    featured: !!r.is_featured,
  }
}

const portrait = '/assets/awards/frantz-coutard.webp'

const heroStats = [
  { big: '10+', label: 'Major Recognitions', ico: 'trophy' },
  { big: 'COUNTY · STATE · FEDERAL', label: 'Recognitions', ico: 'gov', small: true },
  { big: '2023–2026', label: 'Recognition Journey', ico: 'cal' },
  { big: 'NATIONAL', label: 'Level Recognition', ico: 'star' },
]

const impact = [
  { big: '2018', label: 'Founded TrendCatch Digital Advertising' },
  { big: '2022', label: 'Founded TrendCatch Gives Back' },
  { big: '2023', label: 'Featured by Queens Chamber of Commerce' },
  { big: '2024', label: 'Presidential Lifetime Achievement Award' },
  { big: '10+', label: 'Major Recognitions' },
  { big: '300+', label: 'Local Retail Partners' },
  { big: 'Thousands', label: 'Community Members Served' },
]

const leaders = [
  'President of the United States',
  'United States Senate',
  'New York State Assembly',
  'Nassau County Executive',
  'Nassau County Legislature',
  'Queens Chamber of Commerce',
  'Kedner Stiven Foundation',
]

function StatIcon({ name }: { name: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } as const
  if (name === 'trophy') return <svg {...common}><path d="M8 5h8v4a4 4 0 01-8 0z" /><path d="M8 6H5v1.5a3 3 0 003 3M16 6h3v1.5a3 3 0 01-3 3" /><path d="M12 13v3M9 20h6M10 16h4l.7 4h-5.4z" /></svg>
  if (name === 'gov') return <svg {...common}><path d="M4 9l8-5 8 5M5 9v9M19 9v9M9 9v9M15 9v9M3 21h18" /></svg>
  if (name === 'cal') return <svg {...common}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
  return <svg {...common}><path d="M12 3l2.5 6.2 6.7.5-5.1 4.3 1.6 6.5L12 17.6 6.3 20.5l1.6-6.5-5.1-4.3 6.7-.5z" /></svg>
}

function AwardCard({ award, onOpen }: { award: Award; onOpen: (a: Award) => void }) {
  return (
    <article className="glass award-card reveal">
      <button className="award-card__frame" onClick={() => onOpen(award)} aria-label={`View ${award.name}`}>
        <img src={award.image} alt={award.name} loading="lazy" decoding="async" />
        <span className="award-card__year">{award.year}</span>
      </button>
      <div className="award-card__body">
        <span className="award-card__level">{award.level}</span>
        <h3>{award.name}</h3>
        <p>{award.short}</p>
        <button className="award-card__link" onClick={() => onOpen(award)}>
          View Details
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </article>
  )
}

export default function Awards() {
  const [active, setActive] = useState<Award | null>(null)
  const [awards, setAwards] = useState<Award[]>(staticAwards)

  useSeo({ title: 'Awards & Recognition', description: 'Recognized by community, county, state, federal, and national organizations — from the Queens Chamber (2023) to the Presidential Lifetime Achievement Award and the U.S. Senate.', image: '/assets/awards/frantz-coutard.png' })
  useEffect(() => { window.scrollTo(0, 0) }, [])

  // Load from the DB; fall back to the bundled static list if the API is down.
  useEffect(() => {
    api.get<{ awards: AwardRow[] }>('awards')
      .then((d) => { if (d.awards?.length) setAwards(d.awards.map(mapRow)) })
      .catch(() => {})
  }, [])

  const featuredAwards = awards.filter((a) => a.featured)

  useEffect(() => {
    document.body.style.overflow = active ? 'hidden' : ''
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [active])

  return (
    <main className="page awards-page">
      {/* ---------- Hero ---------- */}
      <section className="awards-hero">
        <div className="awards-hero__photo">
          <img src={portrait} alt="Frantz Coutard" loading="eager" decoding="async" />
        </div>
        <div className="wrap awards-hero__inner">
          <div className="awards-hero__copy">
            <h1 className="awards-hero__title">AWARDS &amp;<br /><span className="gold-text">RECOGNITION</span></h1>
            <p className="awards-hero__sub">Recognized by Community, County, State, Federal, and National Organizations</p>
            <div className="awards-hero__roles">
              <span>Entrepreneur</span><span className="dot">&bull;</span>
              <span>Technology Innovator</span><span className="dot">&bull;</span>
              <span>Community Builder</span><span className="dot">&bull;</span>
              <span>Public Servant</span>
            </div>
            <p className="awards-hero__lead">
              Since 2023, Frantz Coutard has received honors recognizing his work in entrepreneurship,
              technology innovation, economic empowerment, community leadership, and public service.
            </p>
            <div className="awards-hero__stats glass">
              {heroStats.map((s) => (
                <div className="ah-stat" key={s.label}>
                  <span className="ah-stat__ico"><StatIcon name={s.ico} /></span>
                  <b className={s.small ? 'sm' : ''}>{s.big}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
            <a href="#journey" className="btn btn--solid awards-hero__cta">
              View Awards Timeline
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Recognition Journey ---------- */}
      <section className="block" id="journey">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Recognition Journey</h2><span className="ln r" /></div>
            <p className="sub">A growing record of recognition — 2023 to 2026.</p>
          </div>
          <div className="timeline reveal in">
            <div className="timeline__rail" />
            {awards.map((a) => (
              <button className="tl-node" key={a.id} onClick={() => setActive(a)}>
                <span className="tl-node__year">{a.year}</span>
                <span className="tl-node__dot" />
                <span className="tl-node__label">{a.name.replace(' — ', ' — \n')}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Featured Awards ---------- */}
      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Featured Awards</h2><span className="ln r" /></div>
            <p className="sub">The highest honors across federal, state, and national recognition.</p>
          </div>
          <div className="featured-grid">
            {featuredAwards.map((a) => (
              <AwardCard key={a.id} award={a} onOpen={setActive} />
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Award Gallery ---------- */}
      <section className="block">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Award Gallery</h2><span className="ln r" /></div>
            <p className="sub">Every citation, resolution, and honor — click any to read the story.</p>
          </div>
          <div className="gallery-grid">
            {awards.map((a) => (
              <AwardCard key={a.id} award={a} onOpen={setActive} />
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Impact by the Numbers ---------- */}
      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Impact by the Numbers</h2><span className="ln r" /></div>
          </div>
          <div className="impact-grid reveal">
            {impact.map((s) => (
              <div className="impact-tile glass" key={s.label}>
                <b>{s.big}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- A Legacy of Impact ---------- */}
      <section className="block">
        <div className="wrap">
          <div className="legacy-grid">
            <div className="legacy">
              <div className="eyebrow reveal">A Legacy of Impact</div>
              <h2 className="reveal gold-text" style={{ marginTop: 14 }}>More Than Awards<span className="l2">A Mission</span></h2>
              <p className="reveal d1">These recognitions represent more than awards. They represent a mission — rooted in faith, innovation, entrepreneurship, service, and community empowerment.</p>
              <p className="reveal d1">From building TrendCatch Digital Advertising in 2018 to launching TrendCatch Network in 2026, Frantz continues to develop technology platforms designed to strengthen communities, expand economic opportunity, empower entrepreneurs, support nonprofits, enhance education, and create meaningful impact for future generations.</p>
              <p className="reveal d2" style={{ color: '#ece6d8', fontFamily: 'var(--f-serif)', fontSize: 18 }}>Guided by faith, inspired by family, and driven by purpose — leaving behind something greater than himself.</p>
              <div className="reveal d3 about-cta"><Link className="btn btn--solid" to="/about">Read the Full Story</Link></div>
            </div>
            <div className="legacy__photo reveal in">
              <img src="/assets/Frantz-gallery3.webp" alt="Frantz Coutard in a legacy portrait" loading="lazy" decoding="async" />
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Recognized by leaders ---------- */}
      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Recognized by Community, County, State &amp; Federal Leaders</h2><span className="ln r" /></div>
            <p className="sub">Few entrepreneurs can demonstrate recognition across every level of leadership.</p>
          </div>
          <div className="leaders-row reveal">
            {leaders.map((l) => (
              <div className="leader" key={l}>
                <span className="leader__seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3}><circle cx="12" cy="11" r="6" /><path d="M12 8l.9 1.9 2.1.3-1.5 1.5.35 2.1L12 13.9l-1.9.9.35-2.1L9 11.2l2.1-.3z" fill="currentColor" stroke="none" /><path d="M8.5 17l-1 4 4.5-2 4.5 2-1-4" /></svg></span>
                <span className="leader__name">{l}</span>
              </div>
            ))}
          </div>
          <div className="leaders-cta reveal d1">
            <button className="btn btn--solid" data-request="Book Frantz to Speak">Book Frantz to Speak</button>
            <button className="btn" data-request="Partner With Frantz">Partner With Frantz</button>
          </div>
        </div>
      </section>

      {/* ---------- Award detail modal ---------- */}
      {active && (
        <div className="award-modal" onClick={(e) => e.target === e.currentTarget && setActive(null)}>
          <div className="award-modal__inner glass">
            <button className="award-modal__close" onClick={() => setActive(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <div className="award-modal__img"><img src={active.image} alt={active.name} /></div>
            <div className="award-modal__body">
              <span className="award-card__level">{active.level} · {active.year}</span>
              <h3 className="gold-text">{active.name}</h3>
              {active.presenter && <div className="award-modal__by">{active.presenter}</div>}
              <p>{active.detail}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
