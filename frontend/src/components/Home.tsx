import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type EventItem, type Post } from '../lib/api'
import ContactSection from './ContactSection'
import { SocialIcon } from './SocialIcons'
import { socials } from '../lib/social'
import { useSeo } from '../hooks/useSeo'
import { platforms } from '../lib/platforms'
import { merchPreviewItems } from '../lib/merch'
import PlatformCard from './PlatformCard'

const logo = '/assets/fc-monogram.svg'
const portrait = '/assets/frantz-portrait.webp'
const halfFace = portrait
const signatureWordmark = '/assets/brand-signature-white.webp'
const brandMarks = '/assets/brand-marks-grid.webp'
const abstractNetwork = '/assets/abstract-gold-network.webp'
const projectTrendcatch = '/assets/project-trendcatch-network.webp'
const projectGivesBack = '/assets/project-gives-back.webp'
const awardPresidential = '/assets/award-presidential-medal.webp'
const awardSenate = '/assets/award-senate-medal.webp'
const awardCounty = '/assets/award-county-medal.webp'
const gallerySpeaking = '/assets/gallery-speaking-stage.webp'
const merchCap = '/assets/merch-cap.webp'
const merchCollectible = '/assets/merch-collectible.webp'
const gallery1 = '/assets/Frantz-gallery1.webp'
const gallery2 = '/assets/Frantz-gallery2.webp'
const gallery3 = '/assets/Frantz-gallery3.webp'
const gallery4 = '/assets/Frantz-gallery4.webp'
const gallery5 = '/assets/Frantz-gallery5.webp'
const gallery6 = '/assets/Frantz-gallery6.webp'
const gallery7 = '/assets/Frantz-gallery7.webp'
const gallery8 = '/assets/Frantz-gallery8.webp'
const gallery9 = '/assets/Frantz-gallery9.webp'

const Check = () => (
  <span className="chk">
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="9" r="7.5" strokeOpacity={0.4} />
      <path d="M5.5 9.2l2.3 2.3L12.5 6.5" />
    </svg>
  </span>
)

const monthAbbr = (d: string) => new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short' })
const dayNum = (d: string) => new Date(d + 'T00:00:00').getDate()
const fmtMonthYear = (d: string) => new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short', year: 'numeric' })

interface BuildProject {
  title: string
  copy: string
  tag: string
  media: string
  mediaClass: string
  tagClass?: string
  link?: string
}

const projectUnlock = '/assets/project-unlock-cause.webp'

const buildProjects: BuildProject[] = [
  {
    title: 'TrendCatch Network',
    copy: 'The operating system for local commerce and community connections.',
    tag: 'Launching July 25, 2026',
    media: projectTrendcatch,
    mediaClass: 'proj__media--network',
  },
  {
    title: 'Unlock A Cause',
    copy: 'A community-impact platform turning public-health and social causes into neighborhood billboard campaigns — connecting residents to local resources through QR codes.',
    tag: 'Live Now',
    tagClass: 'live',
    link: 'https://unlockacause.org',
    media: projectUnlock,
    mediaClass: 'proj__media--brand',
  },
  {
    title: 'TrendCatch Gives Back',
    copy: 'Creating opportunities. Empowering families. Strengthening communities.',
    tag: 'Making an Impact Daily',
    tagClass: 'live',
    media: projectGivesBack,
    mediaClass: 'proj__media--glow',
  },
  {
    title: 'TrendCatch Player Technology',
    copy: 'A developing engagement layer within the TrendCatch ecosystem for interactive participation, loyalty, and future community-facing experiences.',
    tag: 'In Development',
    media: abstractNetwork,
    mediaClass: 'proj__media--glow',
  },
  {
    title: 'New School Functionality',
    copy: 'A challenge registration system for students, parents, schools, and teachers with QR consent, interview tracking, and scholarship submissions.',
    tag: 'In Development',
    media: projectTrendcatch,
    mediaClass: 'proj__media--network',
    link: '/new-school',
  },
]

const awardHighlights = [
  {
    title: 'Presidential Lifetime Achievement Award',
    copy: 'Awarded through AmeriCorps and the Office of the President of the United States — one of the nation’s highest volunteer service honors.',
    image: '/assets/awards/presidential-lifetime.png',
  },
  {
    title: 'United States Senate Recognition',
    copy: 'Presented by U.S. Senator Charles E. Schumer for entrepreneurial achievement and community leadership.',
    image: '/assets/awards/us-senate.png',
  },
  {
    title: 'NY State Legislative Resolution No. 998',
    copy: 'A permanent public record from the New York State Assembly honoring innovation and community impact.',
    image: '/assets/awards/ny-resolution-998.png',
  },
  {
    title: 'Dr. Martin Luther King Jr. Visionary Award',
    copy: 'For visionary leadership, innovation, and commitment to community advancement and equality.',
    image: '/assets/awards/mlk-visionary.png',
  },
]

const galleryItems = [
  { cls: 'cell', tag: 'Gallery 01', cap: 'Founder keynote spotlight', image: gallery1 },
  { cls: 'cell', tag: 'Gallery 02', cap: 'Portrait and presence', image: gallery2 },
  { cls: 'cell', tag: 'Gallery 03', cap: 'Public recognition moment', image: gallery3 },
  { cls: 'cell', tag: 'Gallery 04', cap: 'Signature brand detail', image: gallery4 },
  { cls: 'cell', tag: 'Gallery 05', cap: 'Community-first spotlight', image: gallery5 },
  { cls: 'cell', tag: 'Gallery 06', cap: 'Media and press frame', image: gallery6 },
  { cls: 'cell', tag: 'Gallery 07', cap: 'Movement and outreach', image: gallery7 },
  { cls: 'cell', tag: 'Gallery 08', cap: 'Founder portrait study', image: gallery8 },
  { cls: 'cell', tag: 'Gallery 09', cap: 'Legacy visual close-up', image: gallery9 },
]

const partnerItems = [
  { name: 'TrendCatch Network', image: projectTrendcatch },
  { name: 'TrendCatch Gives Back', image: projectGivesBack },
  { name: 'Unlock A Cause', image: projectUnlock },
  { name: 'Legacy Honors', image: awardPresidential },
  { name: 'Community Partners', image: awardCounty },
  { name: 'Collection Studio', image: merchCap },
  { name: 'Media Allies', image: gallerySpeaking },
  { name: 'Brand System', image: brandMarks },
  { name: 'Signature House', image: signatureWordmark },
  { name: 'Future Builders', image: abstractNetwork },
  { name: 'Official Collection', image: merchCollectible },
  { name: 'Leadership Circle', image: awardSenate },
] as const

export default function Home() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [posts, setPosts] = useState<Post[]>([])

  useSeo({ title: '', description: 'Founder & CEO of TrendCatch Network and President of TrendCatch Gives Back Inc. Building technology that connects businesses, communities, and opportunity.' })

  useEffect(() => {
    api.get<{ events: EventItem[] }>('events')
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setEvents([]))
    api.get<{ posts: Post[] }>('posts')
      .then((d) => setPosts(Array.isArray(d.posts) ? d.posts : []))
      .catch(() => setPosts([]))
  }, [])

  const safeEvents = Array.isArray(events) ? events : []
  const safePosts = Array.isArray(posts) ? posts : []
  const featured = safePosts.find((p) => p.is_featured) || safePosts[0]
  const rest = safePosts.filter((p) => p !== featured).slice(0, 2)

  return (
    <>
      <section className="hero" id="home">
        <div className="hero__ghost"><img src={portrait} alt="" decoding="async" /></div>
        <canvas id="particles" />
        <div className="hero__portrait"><img src={halfFace} alt="Frantz Coutard portrait" decoding="async" /></div>
        <div className="hero__content">
          <div className="hero__mono"><img src={logo} alt="" decoding="async" /></div>
          <h1 className="hero__name">Frantz Coutard</h1>
          <div className="hero__roles">
            <span>Technology Innovator</span><span className="dot">&bull;</span>
            <span>Visionary</span><span className="dot">&bull;</span>
            <span>Community Builder</span>
          </div>

          <div className="hero__badges">
            <div className="badge">
              <span className="seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} style={{ color: 'var(--gold)' }}><circle cx="12" cy="11" r="5" /><path d="M12 8.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 10.6l2-.3z" fill="currentColor" stroke="none" /><path d="M8 18c-2 .4-3 2-3 3M16 18c2 .4 3 2 3 3" /></svg></span>
              <div><b>Presidential Lifetime</b><span>Achievement Award</span></div>
            </div>
            <div className="badge">
              <span className="seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} style={{ color: 'var(--gold)' }}><circle cx="12" cy="12" r="8" /><path d="M12 7.5l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" fill="currentColor" stroke="none" /></svg></span>
              <div><b>U.S. Senate</b><span>Recognition</span></div>
            </div>
            <div className="badge">
              <span className="seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} style={{ color: 'var(--gold)' }}><path d="M4 8l3 3 5-6 5 6 3-3-1.5 10H5.5z" fill="currentColor" fillOpacity={0.15} /><path d="M4 8l3 3 5-6 5 6 3-3-1.5 10H5.5z" /><circle cx="4" cy="8" r="1.2" fill="currentColor" /><circle cx="20" cy="8" r="1.2" fill="currentColor" /><circle cx="12" cy="5" r="1.2" fill="currentColor" /></svg></span>
              <div><b>Award Winning</b><span>Entrepreneur</span></div>
            </div>
          </div>

          <div className="hero__titles">
            Founder &amp; CEO of TrendCatch Network<br />
            Founder &amp; President of TrendCatch Gives Back Inc.
          </div>

          <p className="hero__mission">Building technology that connects businesses, communities, and opportunity.</p>

          <div className="hero__ctas">
            <button className="btn" data-toast="Vision reel coming soon.">Watch the Vision</button>
            <button className="btn btn--solid" onClick={() => document.getElementById('speaking')?.scrollIntoView()}>Book Frantz to Speak</button>
            <Link className="btn" to="/new-school">Open New School</Link>
            <button className="btn" data-auth="register">
              <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M17 8h5M19.5 5.5v5" /></svg></span>Join the Community
            </button>
          </div>
        </div>
        <div className="scroll-cue"><div className="mouse" /><span>Scroll</span></div>
      </section>

      <section className="recog" aria-label="Recognized by">
        <div className="wrap">
          <div className="recog__inner reveal">
            <span className="recog__label">Recognized By</span>
            <div className="recog__items">
              <div className="recog__item">
                <span className="recog__seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3}><circle cx="12" cy="11" r="5" /><path d="M12 8.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 10.6l2-.3z" fill="currentColor" stroke="none" /><path d="M8 18c-2 .4-3 2-3 3M16 18c2 .4 3 2 3 3" /></svg></span>
                <span className="recog__txt">Presidential Lifetime<br /><b>Achievement Award</b></span>
              </div>
              <div className="recog__item">
                <span className="recog__seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3}><path d="M12 3l9 4v5c0 5-4 8-9 9-5-1-9-4-9-9V7z" /><path d="M9 12l2 2 4-4" /></svg></span>
                <span className="recog__txt">United States<br /><b>Senate Recognition</b></span>
              </div>
              <div className="recog__item">
                <span className="recog__seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3}><path d="M4 9l8-5 8 5M5 9v9M19 9v9M9 9v9M15 9v9M3 21h18" /></svg></span>
                <span className="recog__txt">NY State Assembly<br /><b>Resolution No. 998</b></span>
              </div>
              <div className="recog__item">
                <span className="recog__seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3}><path d="M12 3l2.5 6.2 6.7.5-5.1 4.3 1.6 6.5L12 17.6 6.3 20.5l1.6-6.5-5.1-4.3 6.7-.5z" /></svg></span>
                <span className="recog__txt">Dr. MLK Jr.<br /><b>Visionary Award</b></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="block" id="about">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">What I'm Building Now</h2><span className="ln r" /></div>
          </div>
          <div className="building-grid">
            <div className="proj-row">
              {buildProjects.map((project, index) => (
                <article className={`glass proj reveal d${index + 1}`} key={project.title}>
                  <div className={`proj__media ${project.mediaClass}`}>
                    <img src={project.media} alt="" loading="lazy" decoding="async" />
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.copy}</p>
                  <span className={`tag ${project.tagClass ?? ''}`.trim()}>{project.tag}</span>
                  {project.link && (
                    project.link.startsWith('/') ? (
                      <Link className="proj__link" to={project.link}>
                        Visit {project.title}
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M9 7h8v8" /></svg>
                      </Link>
                    ) : (
                      <a className="proj__link" href={project.link} target="_blank" rel="noopener noreferrer">
                        Visit {project.title}
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M9 7h8v8" /></svg>
                      </a>
                    )
                  )}
                </article>
              ))}
            </div>

            <div className="glass stats reveal d2">
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="13" cy="12" r="3.5" /><circle cx="23" cy="13" r="2.8" /><path d="M6 26c0-4 3-7 7-7s7 3 7 7M20 26c0-3 1.5-5.5 4.5-5.5S29 22 29 25" /></svg></span><div><b data-count="100" data-suffix="+">100+</b><span>Community Campaigns</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 6a7 7 0 017 7c0 5-7 13-7 13s-7-8-7-13a7 7 0 017-7z" /><circle cx="17" cy="13" r="2.6" /></svg></span><div><b data-count="50" data-suffix="+">50+</b><span>Digital Locations</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4 17s5-8 13-8 13 8 13 8-5 8-13 8-13-8-13-8z" /><circle cx="17" cy="17" r="3.4" /></svg></span><div><b>Millions</b><span>Community Impressions</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="11" cy="11" r="3" /><circle cx="23" cy="11" r="3" /><path d="M5 25c0-4 2.5-6.5 6-6.5S17 21 17 25M17 25c0-4 2.5-6.5 6-6.5S29 21 29 25" /></svg></span><div><b data-count="10" data-suffix="K+">10K+</b><span>Families Impacted</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M10 6v22" /><path d="M10 7h13l-2.5 4 2.5 4H10" fill="currentColor" fillOpacity={0.12} /></svg></span><div><b>2018</b><span>TrendCatch Founded</span></div></div>
              <div className="stat"><span className="si"><svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M11 7h12v4a6 6 0 01-12 0z" /><path d="M11 8H7v2a4 4 0 004 4M23 8h4v2a4 4 0 01-4 4" /><path d="M17 17v4M13 26h8M15 21h4l1 5h-6z" /></svg></span><div><b>2024</b><span>Presidential Lifetime Award</span></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="block ecosystem" id="ecosystem" data-screen-label="Ecosystem">
        <span className="ecosystem__bg" aria-hidden="true" />
        <div className="wrap">
          <div className="block__head reveal">
            <div className="ceo-badge gold-shimmer">CEO &amp; Founder</div>
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">THE VENTURES</h2><span className="ln r" /></div>
            <p className="sub">Building technology, education, and community-driven platforms designed to create opportunity and lasting impact.</p>
          </div>
          <div className="platform-grid">
            {platforms.map((p, i) => (
              <PlatformCard key={p.name} platform={p} delay={(i % 3) + 1} />
            ))}
          </div>
        </div>
      </section>

      <section className="block" id="awards">
        <div className="wrap">
          <div className="legacy-grid" style={{ marginBottom: 80 }}>
            <div className="legacy__photo legacy__photo--square reveal">
              <img src="/assets/Frantz.webp" alt="Frantz Coutard portrait" loading="lazy" decoding="async" />
            </div>
            <div className="legacy">
              <h2 className="reveal gold-text">From Community<span className="l2">To Legacy</span></h2>
              <p className="reveal d1">An immigrant with a dream. A leader with a purpose. A visionary building technology that creates opportunity and transforms lives.</p>
              <p className="reveal d1">From humble beginnings to building companies, nonprofit initiatives, and technology platforms that serve communities and empower the future.</p>
              <p className="reveal d2" style={{ color: '#ece6d8', fontFamily: 'var(--f-serif)', fontSize: 18 }}>This is more than business. This is my purpose. This is my legacy.</p>
              <div className="sig-line reveal d2">Frantz Coutard</div>
              <div className="reveal d3"><Link className="btn btn--solid" to="/about">Read My Story</Link></div>
            </div>
          </div>

          <div className="awards-card glass reveal">
            <div className="ttl">
              <div className="section-title" style={{ justifyContent: 'flex-start', gap: 18 }}><h2 className="gold-text" style={{ fontSize: 24 }}>Awards &amp; Recognitions</h2><span className="ln r" style={{ width: 90 }} /></div>
              <Link className="btn btn--sm" to="/awards">View All</Link>
            </div>
            <div className="awards-list">
              {awardHighlights.map((a) => (
                <div className="award" key={a.title}>
                  <span className="award-photo">
                    <img src={a.image} alt="" loading="lazy" decoding="async" />
                    <span className="am medal"><svg viewBox="0 0 54 54" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18, color: 'var(--gold)' }}><circle cx="27" cy="22" r="13" /><path d="M22 37l-3 9 8-4 8 4-3-9" /></svg></span>
                  </span>
                  <div><h4>{a.title}</h4><p>{a.copy}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block" id="speaking">
        <div className="wrap">
          <div className="tri">
            <div className="glass col reveal d1">
              <h3 className="gold-text">Book Frantz to Speak</h3>
              <div className="tag-line">Inspiring. Informative. Impactful.</div>
              <ul className="topic-list">
                {['Technology Innovation', 'Entrepreneurship & Business Growth', 'Community Leadership', 'Building From Nothing to Something', 'The Future of Local Commerce', 'Immigrant Success Stories', 'Technology For Good'].map((t) => (
                  <li key={t}><Check />{t}</li>
                ))}
              </ul>
              <button className="btn btn--solid" data-request="Speaking Engagement">Request Speaking Engagement</button>
            </div>

            <div className="glass col reveal d2" id="events">
              <h3 className="gold-text">Upcoming Events</h3>
              <div className="tag-line">Where to find Frantz next</div>
              <div className="events-list" style={{ flexGrow: 1 }}>
                {safeEvents.filter((e) => !e.is_past).map((e) => (
                  <div className="event" key={e.id}>
                    <div className="date"><div className="m">{monthAbbr(e.event_date)}</div><div className="d">{dayNum(e.event_date)}</div></div>
                    <div><h4>{e.title}</h4><div className="loc">{e.location}</div><div className="role">{e.role}</div></div>
                  </div>
                ))}
              </div>
              <Link className="btn" style={{ marginTop: 18 }} to="/events">View All Events</Link>
            </div>

            <div className="glass col reveal d3" id="community">
              <h3 className="gold-text">Join the Community</h3>
              <div className="tag-line">Exclusive Access. Real Impact.</div>
              <ul className="topic-list" style={{ gap: 11 }}>
                {['Exclusive Updates & Announcements', 'VIP Event Invitations', 'Early Access to New Projects', 'Giveaways & Special Offers', 'Behind the Scenes Access', 'Community Impact Opportunities'].map((t) => (
                  <li key={t}><Check />{t}</li>
                ))}
              </ul>
              <div className="phone">
                <div className="phone__screen">
                  <img className="phone__bg" src={abstractNetwork} alt="" />
                  <div className="mono-sm"><img src={logo} alt="" /></div>
                  <b>Welcome to<br />the Community</b>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn" style={{ flex: 1 }} data-auth="login">Login</button>
                <button className="btn btn--solid" style={{ flex: 1 }} data-auth="register">Register Now</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block" id="pin" data-screen-label="The Pin">
        <div className="wrap">
          <div className="pin-grid">
            <div className="pin-visual reveal">
              <img className="pin-badge" src={logo} alt="FC lapel pin" />
              <div className="pin-note">Product shot - the official FC lapel pin</div>
            </div>
            <div className="pin-copy">
              <div className="eyebrow reveal">Wear the Movement</div>
              <h2 className="reveal gold-text" style={{ marginTop: 14 }}>The Pin On My Lapel<br />Is a Promise</h2>
              <p className="reveal d1">Every time I step on a stage or into a boardroom, I wear the FC pin on my suit. It is more than a logo - it is a symbol of community, opportunity, and the legacy we are building together.</p>
              <p className="reveal d1">When you wear the pin, you carry that same promise. You stand with a movement that puts people first and technology in service of them.</p>
              <div className="pin-steps reveal d2">
                <div className="pin-step"><span className="num">01</span><span>Claim your official FC pin</span></div>
                <div className="pin-step"><span className="num">02</span><span>Wear it. Represent the mission</span></div>
                <div className="pin-step"><span className="num">03</span><span>Join the legacy in person</span></div>
              </div>
              <div className="reveal d3"><button className="btn btn--solid" data-request="Claim Your FC Pin">Claim Your Pin</button></div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt" id="press" data-screen-label="Press & Media">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Press &amp; Media Center</h2><span className="ln r" /></div>
            <p className="sub">For journalists, producers, and media partners.</p>
          </div>
          <div className="action-grid">
            <article className="glass action-card reveal d1">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M8 13h8M8 17h6" /></svg></div>
              <h3>Request a Media Kit</h3>
              <p>Download official bios, high-resolution photography, brand assets, and fact sheets for Frantz Coutard and TrendCatch.</p>
              <button className="btn" data-request="Media Kit Request">Request Media Kit</button>
            </article>
            <article className="glass action-card reveal d2">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" /><path d="M19 11a7 7 0 01-14 0M12 18v3" /></svg></div>
              <h3>Request an Interview</h3>
              <p>Invite Frantz for a podcast, broadcast, print, or panel interview. Tell us your outlet, format, and timeline.</p>
              <button className="btn" data-request="Interview Request">Request Interview</button>
            </article>
            <article className="glass action-card reveal d3">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v6l9 4 9-4V7" /><circle cx="18" cy="17" r="3" /></svg></div>
              <h3>Event Coverage</h3>
              <p>Press credentials for upcoming appearances and events Frantz is attending. Request coverage access for a specific date.</p>
              <button className="btn" data-request="Event Coverage Request">Request Coverage</button>
            </article>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block" id="gallery" data-screen-label="Media Gallery">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Media Gallery</h2><span className="ln r" /></div>
            <p className="sub">Moments from the movement - speaking, community, and impact.</p>
          </div>
          <div className="gallery gallery--uniform reveal">
            {galleryItems.map((c, i) => (
              <div
                className={c.cls}
                data-cap={c.cap}
                data-lightbox-src={c.image}
                data-lightbox-cap={c.cap}
                data-lightbox-alt={c.cap}
                key={i}
                role="button"
                tabIndex={0}
              >
                <img src={c.image} alt={c.cap} loading="lazy" decoding="async" />
                <span className="tagk">{c.tag}</span>
                <div className="cap">{c.cap}</div>
              </div>
            ))}
          </div>
          <div className="gallery-admin reveal">
            <button className="btn btn--solid" data-request="Submit Media to Gallery">+ Add Content to Gallery</button>
            <div className="hint">Team members can submit approved photos and video for the website.</div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt" id="blog" data-screen-label="Blog & News">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Blog, News &amp; Articles</h2><span className="ln r" /></div>
            <p className="sub">Insights from Frantz - plus technology news that shapes our communities.</p>
          </div>
          <div className="blog-grid">
            {featured && (
              <article className="glass post feature reveal d1">
                <div className="post__img"><img src={featured.cover_image || abstractNetwork} alt="" loading="lazy" decoding="async" /></div>
                <div className="post__body">
                  <div className="kicker"><span className="cat">{featured.category}</span><span>&bull;</span><span>{fmtMonthYear(featured.published_at)}</span></div>
                  <h3>{featured.title}</h3>
                  <p>{featured.excerpt}</p>
                  <Link className="read" to={`/blog/${featured.id}`}>Read Article <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
                </div>
              </article>
            )}
            {rest.map((p, i) => (
              <article className={`glass post reveal d${i + 2}`} key={p.id}>
                <div className="post__img"><img src={p.cover_image || (i === 0 ? signatureWordmark : brandMarks)} alt="" loading="lazy" decoding="async" /></div>
                <div className="post__body">
                  <div className="kicker"><span className="cat">{p.category}</span><span>&bull;</span><span>{fmtMonthYear(p.published_at)}</span></div>
                  <h3>{p.title}</h3>
                  <p>{p.excerpt}</p>
                  <Link className="read" to={`/blog/${p.id}`}>Read Article <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
                </div>
              </article>
            ))}
          </div>
          <div className="reveal" style={{ textAlign: 'center', marginTop: 42 }}><Link className="btn" to="/blog">View All Articles</Link></div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block" id="promos" data-screen-label="Announcements & Win">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Announcements &amp; Giveaways</h2><span className="ln r" /></div>
            <p className="sub">Stay close to the brand - and win big.</p>
          </div>
          <div className="promo-grid">
            <article className="glass promo reveal d1">
              <span className="ptag green">Live Giveaway</span>
              <h3>Win a Founder's Mentorship Session</h3>
              <p>We're giving away a private 1-on-1 strategy session with Frantz. Enter free - community members get bonus entries.</p>
              <div className="countdown" data-deadline="2026-07-25T00:00:00">
                <div className="cu"><b data-cd="d">--</b><span>Days</span></div>
                <div className="cu"><b data-cd="h">--</b><span>Hrs</span></div>
                <div className="cu"><b data-cd="m">--</b><span>Min</span></div>
                <div className="cu"><b data-cd="s">--</b><span>Sec</span></div>
              </div>
              <button className="btn btn--solid" data-request="Giveaway Entry">Enter the Giveaway</button>
            </article>
            <article className="glass promo reveal d2">
              <span className="ptag">Challenge</span>
              <h3>Enter to Win: Compete &amp; Win Challenges</h3>
              <p>Compete in community and innovation challenges for big prizes and real opportunities - funding, features, and a seat at the table.</p>
              <ul className="topic-list" style={{ margin: '4px 0 22px' }}>
                <li><Check />Cash prizes &amp; grants</li>
                <li><Check />Feature on the TrendCatch platform</li>
                <li><Check />Direct access &amp; opportunities</li>
              </ul>
              <button className="btn btn--solid" data-request="Challenge Entry">Compete Now</button>
            </article>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block" id="merch" data-screen-label="Collection">
        <div className="wrap">
          <div className="block__head reveal">
          <div className="section-title"><span className="ln l" /><h2 className="gold-text">Frantz Coutard Collection</h2><span className="ln r" /></div>
            <p className="sub">Premium merchandise. Purpose driven.</p>
          </div>
          <div className="merch-grid reveal">
            {merchPreviewItems.map((item) => (
              <Link className="glass merch" to="/store" key={item.id}>
                <div className="merch__img">
                  <img src={item.image} alt={item.title} loading="lazy" decoding="async" />
                </div>
                <div className="merch__body">
                  <h4>{item.title}</h4>
                  <div className="price">Shop Now</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="reveal" style={{ textAlign: 'center', marginTop: 28 }}>
            <Link className="btn btn--solid" to="/store">Shop the Collection</Link>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt" id="broker" data-screen-label="Broker Academy">
        <div className="wrap">
          <div className="pin-grid">
            <div className="pin-copy">
              <div className="eyebrow reveal">TrendCatch Broker Academy</div>
              <h2 className="reveal gold-text" style={{ marginTop: 14 }}>Become a Marketing<br />&amp; Advertiser Broker</h2>
              <p className="reveal d1">Build your own business on top of ours. The Broker Academy trains and certifies marketing &amp; advertising brokers for the TrendCatch platform - with the tools, playbooks, and support to earn.</p>
              <ul className="topic-list reveal d2" style={{ margin: '6px 0 26px', maxWidth: 460 }}>
                <li><Check />Free training &amp; official certification</li>
                <li><Check />Recurring commission on accounts you bring</li>
                <li><Check />Marketing assets &amp; broker dashboard</li>
              </ul>
              <div className="reveal d3"><button className="btn btn--solid" data-request="Broker Academy Application">Apply to Become a Broker</button></div>
            </div>
            <div className="glass action-card reveal d2" style={{ padding: '34px 32px' }}>
              <div className="meta">3-Step Path</div>
              <div className="pin-steps" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="pin-step"><span className="num">01</span><span style={{ maxWidth: 'none' }}>Apply &amp; register your interest</span></div>
                <div className="pin-step"><span className="num">02</span><span style={{ maxWidth: 'none' }}>Complete the certification program</span></div>
                <div className="pin-step"><span className="num">03</span><span style={{ maxWidth: 'none' }}>Get listed &amp; start earning as a broker</span></div>
              </div>
              <p style={{ marginTop: 18, color: 'var(--muted)', fontSize: 13 }}>Open to marketers, agencies, and ambitious entrepreneurs. No prior platform experience required.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block" id="mentorship" data-screen-label="Mentorship">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Mentorship With Frantz</h2><span className="ln r" /></div>
            <p className="sub">Learn directly from a founder who built from nothing to something.</p>
          </div>
          <div className="action-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 320px),1fr))' }}>
            <article className="glass action-card reveal d1">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></svg></div>
              <div className="meta">Book a Session</div>
              <h3>Book Frantz as Your Business Mentor</h3>
              <p>Reserve a private mentorship session for strategy, growth, fundraising, or building your venture from the ground up.</p>
              <button className="btn btn--solid" data-request="Book a Mentorship Session">Book a Session</button>
            </article>
            <article className="glass action-card reveal d2">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 16l-5 2.7 1-5.5-4-3.9 5.5-.8z" /></svg></div>
              <div className="meta">Apply Free</div>
              <h3>Apply to Win Free Mentorship</h3>
              <p>Each cohort we select community members for complimentary mentorship. Share your story and your goals to apply.</p>
              <button className="btn" data-request="Free Mentorship Application">Apply for Free Mentorship</button>
            </article>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt" id="engage" data-screen-label="Sponsor & Invite">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Partner With the Brand</h2><span className="ln r" /></div>
            <p className="sub">Sponsor the mission - or invite Frantz to your event.</p>
          </div>
          <div className="action-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 320px),1fr))' }}>
            <article className="glass action-card reveal d1">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 22V7M12 7S11 3 8.5 3 6 6 12 7zM12 7s1-4 3.5-4S18 6 12 7z" /></svg></div>
              <h3>Become a Sponsor</h3>
              <p>Align your company with a movement millions have engaged with. Request a sponsorship package for events, campaigns, and platforms.</p>
              <button className="btn btn--solid" data-request="Sponsorship Request">Request to Sponsor</button>
            </article>
            <article className="glass action-card reveal d2">
              <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M9 15l2 2 4-4" /></svg></div>
              <h3>Invite Frantz to Your Event</h3>
              <p>Hosting a summit, gala, panel, or community event? Send the details and invite Frantz to attend or appear.</p>
              <button className="btn" data-request="Invite Frantz to an Event">Send an Invitation</button>
            </article>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block" id="partners" data-screen-label="Partners">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Partners &amp; Collaborators</h2><span className="ln r" /></div>
            <p className="sub">The organizations and leaders building alongside us.</p>
          </div>
          <div className="partners-row reveal">
            {partnerItems.map((p) => (
              <div className="partner partner--visual" key={p.name}>
                <img src={p.image} alt={p.name} loading="lazy" decoding="async" />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
          <div className="partners-cta reveal"><button className="btn btn--solid" data-request="Partnership / Collaboration Inquiry">Become a Partner</button></div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block block--alt" id="social" data-screen-label="Social">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Follow the Journey</h2><span className="ln r" /></div>
            <p className="sub">Connect with Frantz across every platform.</p>
          </div>
          <div className="social-grid reveal">
            {socials.map((s) => (
              <article className="glass social-card" key={s.key}>
                <div className="sico" style={{ background: s.bg, color: '#fff' }}><SocialIcon k={s.key} /></div>
                <div className="plat">{s.label}</div>
                <div className="handle">{s.handle}</div>
                {s.href
                  ? <a className="btn btn--sm" href={s.href} target="_blank" rel="noopener noreferrer">{s.cta}</a>
                  : <button className="btn btn--sm" data-toast={`${s.label} link coming soon.`}>{s.cta}</button>}
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <ContactSection />
    </>
  )
}
