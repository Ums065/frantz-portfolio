import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { projectShowcase } from '../lib/brandContent'
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

      <section className="block" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="building-grid">
            <div className="proj-row">
              {projectShowcase.map((project, index) => (
                <article className={`glass proj reveal d${(index % 3) + 1}`} key={project.title}>
                  <div className="proj__media">
                    <img src={project.image} alt="" loading="lazy" decoding="async" />
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.detail}</p>
                  <span className={`tag${project.status.toLowerCase().includes('live') ? ' live' : ''}`.trim()}>{project.status}</span>
                  <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
                    {project.highlights.map((point) => (
                      <div key={point} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#ddd6c8', fontSize: 13 }}>
                        <span style={{ color: 'var(--green-bright)', lineHeight: 1 }}>•</span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                  <Link className="proj__link" to={project.href || '/community'}>
                    {project.action}
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M9 7h8v8" /></svg>
                  </Link>
                </article>
              ))}
            </div>

            <aside className="glass stats reveal d2">
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4 17s5-8 13-8 13 8 13 8-5 8-13 8-13-8-13-8z" /><circle cx="17" cy="17" r="3.4" /></svg></span><div><b>{projectShowcase.length}</b><span>Flagship projects</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M8 24h18M8 18h18M8 12h12" /></svg></span><div><b>2</b><span>Live initiatives</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="17" cy="13" r="6" /><path d="M10 26c1.8-4 4.7-6 7-6s5.2 2 7 6" /></svg></span><div><b>Community</b><span>People first</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M10 6v22" /><path d="M10 7h13l-2.5 4 2.5 4H10" fill="currentColor" fillOpacity={0.12} /></svg></span><div><b>Legacy</b><span>Future ready</span></div></div>
              <div style={{ gridColumn: '1 / -1', paddingTop: 10 }}>
                <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.8 }}>
                  The project system is built to scale. Each platform has a different audience, but the same core rule: create value that stays connected to people and place.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                  <Link className="btn btn--solid" to="/community">Join the Community</Link>
                  <Link className="btn" to="/media">See Media Center</Link>
                </div>
              </div>
            </aside>
          </div>
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
