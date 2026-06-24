import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ventureCards, ventureVision, ventureVisionNodes, VisionNodeIcon } from '../lib/buildingNow'
import { useSeo } from '../hooks/useSeo'

export default function Projects() {
  useSeo({
    title: 'Projects',
    description: "TrendCatch Network, TrendCatch Player Technology, TrendCatch Gives Back, and Unlock A Cause - the flagship projects driving Frantz Coutard's ecosystem.",
    image: '/assets/project-trendcatch-network.webp',
  })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Projects &amp; Innovation</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>The Work in Motion</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto' }}>
            Four flagship platforms - one ecosystem built around local commerce, community impact, and legacy.
          </p>
        </div>
      </section>

            <section className="block" id="ventures">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">What I&apos;m Building Now</h2><span className="ln r" /></div>
            <p className="sub">Building technology, education, and opportunity that empowers communities and creates a better future.</p>
          </div>
          <div className="venture-grid venture-grid--editorial">
            {ventureCards.map((project, index) => (
              <article className={`glass proj venture-card venture-card--editorial reveal d${(index % 4) + 1}`} key={project.title}>
                <div className={`proj__media ${project.mediaClass ?? ''}`.trim()}>
                  <img src={project.media} alt={project.title} loading="lazy" decoding="async" />
                </div>
                <div className="venture-card__body">
                  <h3>{project.title}</h3>
                  <p>{project.copy}</p>
                  <div className="venture-card__chips" aria-label={`${project.title} highlights`}>
                    {project.highlights.map((item) => (
                      <span key={`${project.title}-${item}`}>{item}</span>
                    ))}
                  </div>
                  <span className="tag">{project.tag}</span>
                </div>
              </article>
            ))}
          </div>
          <article className="venture-vision glass reveal">
            <img className="venture-vision__image" src={ventureVision.media} alt={ventureVision.title} loading="lazy" decoding="async" />
            <div className="venture-vision__veil" />
            <div className="venture-vision__content">
              <div className="venture-vision__crest">FC</div>
              <div className="venture-vision__copy">
                <h3>{ventureVision.title}</h3>
                <p>{ventureVision.copy}</p>
              </div>
              <div className="venture-vision__nodes" aria-label="Vision sectors">
                {ventureVisionNodes.map((node) => (
                  <div className="venture-vision__node" key={node.label}>
                    <span className="venture-vision__node-icon"><VisionNodeIcon kind={node.kind} /></span>
                    <span>{node.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">How To Engage</h2><span className="ln r" /></div>
            <p className="sub">Different projects need different partners. Start in the right place.</p>
          </div>
          <div className="action-grid">
            <article className="glass action-card reveal d1">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 22V7M12 7S11 3 8.5 3 6 6 12 7zM12 7s1-4 3.5-4S18 6 12 7z" /></svg></div>
              <h3>Partnership Inquiry</h3>
              <p>Bring sponsorships, collaborations, or strategic support to one of the flagship projects.</p>
              <button className="btn btn--solid" data-request="Partnership / Collaboration Inquiry">Request Details</button>
            </article>
            <article className="glass action-card reveal d2">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" /><path d="M19 11a7 7 0 01-14 0M12 18v3" /></svg></div>
              <h3>Book A Conversation</h3>
              <p>Use the speaking route when you want Frantz to present the vision live, on stage, or in a panel setting.</p>
              <button className="btn" data-request="Book Frantz to Speak">Book Frantz</button>
            </article>
            <article className="glass action-card reveal d3">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M8 13h8M8 17h6" /></svg></div>
              <h3>Follow The News</h3>
              <p>Read the latest updates, launches, and milestones to see where each project is heading next.</p>
              <Link className="btn" to="/blog">Open Blog</Link>
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}
