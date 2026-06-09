import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSeo } from '../hooks/useSeo'
import { platforms } from '../lib/platforms'
import PlatformCard from '../components/PlatformCard'

const portrait = '/assets/awards/frantz-coutard.png'
const halfFace = '/assets/frantz-half-face.png'

const beliefs = [
  'Technology should empower people.',
  'Communities should have access to opportunity.',
  'Entrepreneurship should create pathways to economic mobility.',
  'Faith should guide purpose.',
  'Success should be measured by the lives impacted.',
]

const journeyMilestones = [
  {
    year: '1997',
    title: 'Arrived in the United States',
    copy: 'Frantz immigrated from Haiti with no English and a deep belief that faith, discipline, and persistence could create a better future.',
  },
  {
    year: 'June 2018',
    title: 'Fatherhood reshaped the mission',
    copy: 'The birth of Julia L\'Or Coutard deepened his purpose, strengthened his focus on legacy, and made him even more committed to building for the next generation.',
  },
  {
    year: 'November 2018',
    title: 'TrendCatch Digital Advertising launches',
    copy: 'He started with a clear problem to solve: local businesses needed affordable visibility inside the communities they served.',
  },
  {
    year: 'January 2026',
    title: 'TrendCatch Network is born',
    copy: 'After years of learning and development, the vision expanded into a broader ecosystem built around commerce, connection, and community impact.',
  },
]

export default function About() {
  useSeo({
    title: 'About',
    description: 'Faith, family, and purpose - the story of Frantz Coutard, award-winning entrepreneur, technology innovator, and community advocate.',
    image: '/assets/awards/frantz-coutard.png',
  })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="page about-page">
      {/* ---------- Hero ---------- */}
      <section className="page-hero">
        <div className="wrap page-hero__grid">
          <div className="page-hero__photo reveal in">
            <img src={portrait} alt="Frantz Coutard" />
          </div>
          <div className="page-hero__copy">
            <div className="eyebrow reveal in">About Frantz Coutard</div>
            <h1 className="page-hero__title gold-text reveal in">Faith. Family.<br />Purpose.</h1>
            <div className="page-hero__roles reveal in d1">
              <span>CEO &amp; Founder, TrendCatch Network</span><span className="dot">&bull;</span>
              <span>Founder &amp; President, TrendCatch Gives Back Inc.</span>
            </div>
            <p className="page-hero__lead reveal in d1">
              Award-winning entrepreneur, technology innovator, and community advocate building
              platforms that strengthen communities, expand opportunity, and improve lives.
            </p>
            <div className="page-hero__chips reveal in d2">
              <span className="chip">Award-Winning Entrepreneur</span>
              <span className="chip">Technology Innovator</span>
              <span className="chip">Community Advocate</span>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Faith, Family & Purpose ---------- */}
      <section className="block">
        <div className="wrap">
          <div className="legacy-grid">
            <div className="legacy__photo legacy__photo--square reveal">
              <img src="/assets/Frantz.PNG" alt="Frantz Coutard portrait" />
            </div>
            <div className="legacy">
              <div className="eyebrow reveal">Faith, Family &amp; Purpose</div>
              <h2 className="reveal gold-text" style={{ marginTop: 14 }}>
                A Man of Faith<span className="l2">First</span>
              </h2>
              <p className="reveal d1">
                Above all else, Frantz Coutard is a man of faith. As a practicing Catholic, he believes every opportunity, accomplishment, challenge, and blessing in his life has been made possible through God&apos;s grace and guidance.
              </p>
              <p className="reveal d1">
                He is a devoted husband and proud father. In June 2018, Frantz welcomed his first and only child, Julia L&apos;Or Coutard - a moment that transformed his perspective and deepened his commitment to building systems and opportunities for future generations. Today he proudly embraces the role of a Girl Dad.
              </p>
              <p className="reveal d2" style={{ color: '#ece6d8', fontFamily: 'var(--f-serif)', fontSize: 18 }}>
                Success is not simply about building wealth - it is about creating opportunities, empowering people, and leaving behind something greater than oneself.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- The Entrepreneurial Journey ---------- */}
      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">The Entrepreneurial Journey</h2><span className="ln r" /></div>
            <p className="sub">From Haiti to building an ecosystem for communities.</p>
          </div>
          <div className="prose reveal">
            <p>Born in Haiti and immigrating to the United States in 1997, Frantz arrived without speaking English and experienced firsthand the challenges immigrant and underserved families face. Through perseverance, determination, and faith, he developed a passion for entrepreneurship, technology, community development, and innovation.</p>
            <p>In November 2018, Frantz launched <b>TrendCatch Digital Advertising</b> with a simple but powerful mission: to help local businesses gain affordable visibility within their own communities. What began as a digital advertising company quickly evolved into something much larger.</p>
            <p>Over the next several years, he studied consumer behavior, local commerce, retail ecosystems, community engagement, technology infrastructure, and the challenges facing small businesses. Through that journey, he recognized that local communities needed far more than advertising. They needed an ecosystem. They needed technology. They needed connection. They needed opportunity.</p>
            <p>In <b>January 2026</b>, after more than six years of development, learning, and community engagement, <b>TrendCatch Network</b> was officially born.</p>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Milestones ---------- */}
      <section className="block">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Key Milestones</h2><span className="ln r" /></div>
            <p className="sub">A short timeline that connects the personal story to the public mission.</p>
          </div>
          <div className="about-timeline">
            {journeyMilestones.map((item, index) => (
              <article className={`glass about-timeline__card reveal d${(index % 3) + 1}`} key={item.year + item.title}>
                <span className="about-timeline__year">{item.year}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Platforms ---------- */}
      <section className="block">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">What He's Building</h2><span className="ln r" /></div>
            <p className="sub">An ecosystem of platforms designed to empower communities.</p>
          </div>
          <div className="platform-grid">
            {platforms.map((p, i) => (
              <PlatformCard key={p.name} platform={p} delay={(i % 3) + 1} />
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      {/* ---------- Legacy / beliefs ---------- */}
      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">The Legacy He Is Building</h2><span className="ln r" /></div>
          </div>
          <div className="beliefs reveal">
            {beliefs.map((b) => (
              <div className="belief" key={b}>
                <span className="belief__star"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.5 6.2 6.7.5-5.1 4.3 1.6 6.5L12 17.6 6.3 20.5l1.6-6.5-5.1-4.3 6.7-.5z" /></svg></span>
                <span>{b}</span>
              </div>
            ))}
          </div>
          <p className="legacy-close reveal d1">
            Through TrendCatch Network, TrendCatch Player Technology, Unlock A Cause, TrendCatch EDU, ShelfLink, and TrendCatch Gives Back Inc., Frantz is building technology platforms that strengthen communities, support economic growth, create opportunities, and improve lives. Guided by God, inspired by family, and committed to service - his mission is to leave behind something greater than himself.
          </p>
          <div className="sig-line reveal d1" style={{ textAlign: 'center' }}>Frantz Coutard</div>
          <div className="reveal d2 about-cta">
            <Link className="btn btn--solid" to="/awards">View Awards &amp; Recognition</Link>
            <Link className="btn" to="/#speaking">Book Frantz to Speak</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
