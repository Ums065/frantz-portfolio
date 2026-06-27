import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type EventItem, type Post, type PublicGalleryItemRow } from '../lib/api'
import ContactSection from './ContactSection'
import { SocialIcon } from './SocialIcons'
import { socials } from '../lib/social'
import { useSeo } from '../hooks/useSeo'
import { platforms } from '../lib/platforms'
import { merchPreviewItems } from '../lib/merch'
import { BRAND_LOGO, FRANTZ_SIGNATURE } from '../lib/brandAssets'
import PlatformCard from './PlatformCard'

const logo = BRAND_LOGO
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
const formatCount = (value: unknown) => new Intl.NumberFormat('en-US').format(Number(value || 0))

interface VentureCard {
  title: string
  copy: string
  tag: string
  media: string
  highlights: string[]
  mediaClass?: string
}

const buildingNowBase = "/assets/What I'm Building Now"

type VisionNode = {
  label: string
  kind: 'schools' | 'stores' | 'restaurants' | 'businesses' | 'network' | 'opportunity'
}

const ventureCards: VentureCard[] = [
  {
    title: 'Frantz Coutard',
    copy: 'Entrepreneur, innovator, and advocate building technology that strengthens communities.',
    tag: 'My Journey Continues',
    media: `${buildingNowBase}/1.webp`,
    highlights: ['Entrepreneur', 'Innovator', 'Advocate', 'Community'],
    mediaClass: 'proj__media--portrait',
  },
  {
    title: 'TrendCatch EDU',
    copy: 'A digital platform helping schools access grants, resources, and opportunity.',
    tag: 'Empowering Communities',
    media: `${buildingNowBase}/2.webp`,
    highlights: ['Grants', 'Schools', 'Teachers', 'Parents', 'Students'],
  },
  {
    title: 'Leave It Better Than You Found It',
    copy: 'A movement for future problem solvers building better communities.',
    tag: 'Educational Movement',
    media: `${buildingNowBase}/3.webp`,
    highlights: ['Problem Solvers', 'Innovation', 'Leadership', 'Future Ready'],
    mediaClass: 'proj__media--glow',
  },
  {
    title: 'Referral Partner Program',
    copy: 'Empowering youth to build income through sales, partnerships, and referrals.',
    tag: 'Launching October 17, 2026',
    media: `${buildingNowBase}/4.webp`,
    highlights: ['Sales Training', 'Business Leads', 'Partnerships', 'Income'],
  },
  {
    title: 'Shelf Link',
    copy: 'Helping local and independent brands launch and grow in retail stores.',
    tag: 'Launching October 3, 2026',
    media: `${buildingNowBase}/5.webp`,
    highlights: ['Product Launch', 'Retail Partners', 'Growth', 'Distribution'],
  },
  {
    title: 'TrendCatch Network',
    copy: 'The operating system for local commerce, local ads, and instant savings.',
    tag: 'Launching July 25, 2026',
    media: `${buildingNowBase}/6.webp`,
    highlights: ['Local Ads', 'Coupons', 'Savings', 'Community'],
    mediaClass: 'proj__media--network',
  },
  {
    title: 'TrendCatch Gives Back Inc.',
    copy: 'Technology for community awareness, clean water, public safety, and sustainability.',
    tag: 'Non-Profit Initiative',
    media: `${buildingNowBase}/7.webp`,
    highlights: ['Education', 'Surveys', 'Sustainability', 'Awareness'],
  },
  {
    title: 'TrendCatch Player',
    copy: 'Powering any screen with remote content updates and live engagement.',
    tag: 'Proprietary Technology',
    media: `${buildingNowBase}/8.webp`,
    highlights: ['Any Screen', 'Remote Control', 'Global', 'Real-Time'],
  },
]

const ventureVision = {
  title: 'The Vision',
  copy: 'Building technology that strengthens communities through commerce, education, and opportunity.',
  media: `${buildingNowBase}/9.webp`,
}

const ventureVisionNodes: VisionNode[] = [
  { label: 'Schools', kind: 'schools' },
  { label: 'Grocery Stores', kind: 'stores' },
  { label: 'Restaurants', kind: 'restaurants' },
  { label: 'Small Businesses', kind: 'businesses' },
  { label: 'Digital Network', kind: 'network' },
  { label: 'Opportunity', kind: 'opportunity' },
]

const awardHighlights = [
  {
    title: 'Presidential Lifetime Achievement Award',
    copy: 'Awarded through AmeriCorps and the Office of the President of the United States â€” one of the nationâ€™s highest volunteer service honors.',
    image: '/assets/awards/presidential-lifetime.webp',
  },
  {
    title: 'United States Senate Recognition',
    copy: 'Presented by U.S. Senator Charles E. Schumer for entrepreneurial achievement and community leadership.',
    image: '/assets/awards/us-senate.webp',
  },
  {
    title: 'NY State Legislative Resolution No. 998',
    copy: 'A permanent public record from the New York State Assembly honoring innovation and community impact.',
    image: '/assets/awards/ny-resolution-998.webp',
  },
  {
    title: 'Dr. Martin Luther King Jr. Visionary Award',
    copy: 'For visionary leadership, innovation, and commitment to community advancement and equality.',
    image: '/assets/awards/mlk-visionary.webp',
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
  { name: 'Unlock A Cause', image: abstractNetwork },
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

const homeFaqItems = [
  {
    question: "What is this site about?",
    answer: "It brings together the founder story, projects, awards, media, mentorship, and ways to connect with the brand.",
  },
  {
    question: "How do I join the community?",
    answer: "Use the Join the Community area on the home page to log in or register. The community experience now lives on the homepage instead of a separate page.",
  },
  {
    question: "How can I book Frantz?",
    answer: "Use the speaking, interview, mentorship, or event request buttons to start the conversation.",
  },
] as const


type HomeChallengeTabKey = 'overview' | 'rewards' | 'workflow' | 'community'

type HomeChallengeTab = {
  key: HomeChallengeTabKey
  title: string
  hint: string
  badge: string
  eyebrow: string
  heading: string
  detail: string
  points: string[]
  stats: Array<{ label: string; value: string }>
  cards: Array<{ title: string; detail: string }>
}

const homeChallengeTabs: HomeChallengeTab[] = [
  {
    key: 'overview',
    title: 'Overview',
    hint: 'Real problems, real work',
    badge: '01',
    eyebrow: 'What It Is',
    heading: 'Students build solutions that matter.',
    detail: 'Students ages 11-19 interview 10 local businesses, identify a community problem, and create a final project with measurable impact.',
    points: ['10 local business interviews', 'Parent consent and school approval', 'Final project submission', 'Live rankings and progress tracking'],
    stats: [
      { label: 'Ages', value: '11-19' },
      { label: 'Grades', value: '6-12' },
      { label: 'Interviews', value: '10 businesses' },
      { label: 'Submission', value: 'Final project' },
    ],
    cards: [
      { title: 'Interview', detail: 'Gather real feedback from local business owners.' },
      { title: 'Problem', detail: 'Turn interviews into one clear challenge worth solving.' },
      { title: 'Solution', detail: 'Build a practical plan students can actually ship.' },
      { title: 'Impact', detail: 'Show results with scores, rankings, and reviews.' },
    ],
  },
  {
    key: 'rewards',
    title: 'Rewards',
    hint: 'Scholarships + grants',
    badge: '02',
    eyebrow: 'What Students Win',
    heading: 'Scholarships, school grants, and educator recognition.',
    detail: 'The challenge rewards effort, leadership, and real-world impact with scholarships, school grants, and public recognition.',
    points: ['Student scholarships up to $10,000', 'School impact grant up to $25,000', 'Educator award and public recognition', 'Winner announcements and leaderboard visibility'],
    stats: [
      { label: 'Scholarship Pool', value: '$35K+' },
      { label: 'Student Max', value: '$10K' },
      { label: 'School Grant', value: '$25K' },
      { label: 'Results', value: 'Live ranking' },
    ],
    cards: [
      { title: 'Student scholarships', detail: 'Reward the next generation of leaders and problem-solvers.' },
      { title: 'School impact grant', detail: 'Fund participation and strengthen access for more students.' },
      { title: 'Educator award', detail: 'Recognize the adults who make the work possible.' },
      { title: 'Public recognition', detail: 'Celebrate the movement on the page and beyond.' },
    ],
  },
  {
    key: 'workflow',
    title: 'Workflow',
    hint: 'Register -> approve -> submit',
    badge: '03',
    eyebrow: 'How It Works',
    heading: 'Every role has a clear path.',
    detail: 'Students, parents, schools, and teachers each have a dedicated step so the challenge stays organized from registration to final submission.',
    points: ['Role-based registration', 'QR consent for parents', 'School and teacher dashboards', 'Final submission and review'],
    stats: [
      { label: 'Roles', value: '4' },
      { label: 'Dashboards', value: 'Live' },
      { label: 'Approvals', value: 'Tracked' },
      { label: 'Rankings', value: 'Built in' },
    ],
    cards: [
      { title: 'Student', detail: 'Creates the participant profile and starts the challenge.' },
      { title: 'Parent', detail: 'Approves participation through the consent flow.' },
      { title: 'School', detail: 'Tracks readiness, rankings, and school participation.' },
      { title: 'Teacher', detail: 'Reviews student progress and classroom participation.' },
    ],
  },
  {
    key: 'community',
    title: 'Community',
    hint: 'Schools + partners',
    badge: '04',
    eyebrow: 'Who Is Involved',
    heading: 'The challenge works because the whole community shows up.',
    detail: 'Schools, educators, parents, sponsors, and local business partners all help students turn insight into action.',
    points: ['Schools bring the challenge into the building', 'Educators guide and mentor teams', 'Parents approve and support participation', 'Sponsors fuel scholarships and grants'],
    stats: [
      { label: 'Groups', value: '6' },
      { label: 'Partners', value: 'Local' },
      { label: 'Support', value: 'Shared' },
      { label: 'Mission', value: 'Impact' },
    ],
    cards: [
      { title: 'Schools', detail: 'Host the program and keep participation moving.' },
      { title: 'Educators', detail: 'Coach student teams and track classroom progress.' },
      { title: 'Parents', detail: 'Support students through consent and encouragement.' },
      { title: 'Sponsors', detail: 'Make scholarships, grants, and recognition possible.' },
    ],
  },
] as const

// Role-based registration CTAs for the challenge section. Each deep-links to the
// matching registration form on /new-school, where the role tab is preselected.
const challengeRegisterRoles = [
  { role: 'student', label: 'Register as a Student' },
  { role: 'parent', label: 'Register as a Parent' },
  { role: 'school', label: 'Register as a School' },
  { role: 'teacher', label: 'Register as a Teacher' },
] as const

function VisionNodeIcon({ kind }: { kind: VisionNode['kind'] }) {
  switch (kind) {
    case 'schools':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M3 10 12 5l9 5-9 5-9-5Z" /><path d="M7 12.5v3.5c0 1.4 2.2 3 5 3s5-1.6 5-3v-3.5" /><path d="M21 10v6" /></svg>
    case 'stores':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M4 10h16l-1.4 9H5.4L4 10Z" /><path d="M9 10V8a3 3 0 1 1 6 0v2" /></svg>
    case 'restaurants':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M7 4v7" /><path d="M10 4v7" /><path d="M7 7h3" /><path d="M8.5 11v9" /><path d="M16 4c1.7 1.7 1.7 5.3 0 7v9" /></svg>
    case 'businesses':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M4 19V9l8-5 8 5v10" /><path d="M9 19v-4h6v4" /><path d="M9 10h.01M15 10h.01" /></svg>
    case 'network':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>
    case 'opportunity':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M4 19h16" /><path d="M7 15V9" /><path d="M12 15V5" /><path d="M17 15v-3" /></svg>
  }
}

export default function Home() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [galleryUploads, setGalleryUploads] = useState<PublicGalleryItemRow[]>([])
  const [challengeOverview, setChallengeOverview] = useState<any>(null)
  const [challengeTab, setChallengeTab] = useState<HomeChallengeTabKey>('overview')

  useSeo({ title: '', description: 'Founder & CEO of TrendCatch Network and President of TrendCatch Gives Back Inc. Building technology that connects businesses, communities, and opportunity.' })

  useEffect(() => {
    api.get<{ events: EventItem[] }>('events')
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setEvents([]))
    api.get<{ posts: Post[] }>('posts')
      .then((d) => setPosts(Array.isArray(d.posts) ? d.posts : []))
      .catch(() => setPosts([]))
    api.get<{ items: PublicGalleryItemRow[] }>('gallery')
      .then((d) => setGalleryUploads(Array.isArray(d.items) ? d.items : []))
      .catch(() => setGalleryUploads([]))
    api.get<any>('new-school/overview')
      .then((data) => setChallengeOverview(data))
      .catch(() => setChallengeOverview(null))
  }, [])

  const safeEvents = Array.isArray(events) ? events : []
  const safePosts = Array.isArray(posts) ? posts : []
  const featured = safePosts.find((p) => p.is_featured) || safePosts[0]
  const rest = safePosts.filter((p) => p !== featured).slice(0, 2)
  const activeChallenge = homeChallengeTabs.find((tab) => tab.key === challengeTab) || homeChallengeTabs[0]
  const challengeSummary = challengeOverview?.summary || {}
  const challengeCounterItems = [
    { label: 'Schools joined', value: formatCount(challengeSummary.schools ?? challengeOverview?.schools?.length ?? 0) },
    { label: 'Teachers joined', value: formatCount(challengeSummary.teachers ?? challengeOverview?.teachers?.length ?? 0) },
    { label: 'Students joined', value: formatCount(challengeSummary.students ?? 0) },
    { label: 'Parents joined', value: formatCount(challengeSummary.parents ?? 0) },
  ]
  const approvedGalleryImages = galleryUploads
    .filter((item) => item.media_kind === 'image')
    .slice(0, 9)
    .map((item, index) => ({
      cls: 'cell',
      tag: 'Approved Upload',
      cap: `${item.display_title} | ${item.credit_name}${item.credit_organization ? ` | ${item.credit_organization}` : ''}`,
      image: item.file_url,
      key: `gallery-upload-${item.id}-${index}`,
    }))
  const homeGalleryItems = approvedGalleryImages.length
    ? approvedGalleryImages
    : galleryItems.map((item, index) => ({ ...item, key: `gallery-static-${index}` }))

  return (
    <>
      <section className="hero" id="home">
        <div className="hero__ghost"><img src={portrait} alt="" decoding="async" /></div>
        <canvas id="particles" />
        <div className="hero__portrait"><img src={halfFace} alt="Frantz Coutard portrait" decoding="async" fetchPriority="high" /></div>
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
            <Link className="btn" to="/new-school">View Challenges</Link>
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

      <section className="block block--alt" id="challenge" data-screen-label="Challenge">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title">
              <span className="ln l" />
              <h2 className="gold-text">Student Impact Challenge</h2>
              <span className="ln r" />
            </div>
            <p className="sub">Scholarships, school grants, educator awards, and the workflow that ties it all together.</p>
          </div>

          <div className="challenge-overview reveal in">
            <div className="challenge-counter">
              <div className="challenge-counter__head">
                <span className="eyebrow">Global Counter</span>
                <p>Live participation across schools, teachers, students, and parents.</p>
              </div>
              <div className="ns-stat-tiles challenge-stats">
                {challengeCounterItems.map((item) => (
                  <div className="glass ns-stat-tile" key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="challenge-tabs-shell">
              <div className="challenge-tabs-shell__head">
                <span className="eyebrow">Tap a tab to explore</span>
                <p>Overview, rewards, workflow, and community roles.</p>
              </div>
              <div className="ns-record-tabs" role="tablist" aria-label="Student Impact Challenge tabs">
                {homeChallengeTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`ns-record-tabs__btn challenge-tabs__btn ${challengeTab === tab.key ? 'is-active' : ''}`}
                    role="tab"
                    aria-selected={challengeTab === tab.key}
                    onClick={() => setChallengeTab(tab.key)}
                  >
                    <strong>{tab.title}</strong>
                    <span>{tab.hint}</span>
                    <em>{tab.badge}</em>
                  </button>
                ))}
              </div>
            </div>

            <article className="glass ns-record-panel challenge-panel reveal in">
              <div className="challenge-panel__copy">
                <span className="eyebrow">{activeChallenge.eyebrow}</span>
                <h3>{activeChallenge.heading}</h3>
                <p>{activeChallenge.detail}</p>
                <ul className="topic-list">
                  {activeChallenge.points.map((point) => (
                    <li key={point}><Check />{point}</li>
                  ))}
                </ul>
                <div className="challenge-actions">
                  {challengeRegisterRoles.map((role, i) => (
                    <Link
                      key={role.role}
                      className={`btn btn--sm ${i === 0 ? 'btn--solid' : ''}`}
                      to={`/new-school?register=${role.role}#registration`}
                    >
                      {role.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="challenge-panel__side">
                <div className="ns-stat-tiles challenge-mini-stats">
                  {activeChallenge.stats.map((stat) => (
                    <div className="glass ns-stat-tile" key={stat.label}>
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
                <div className="ns-gains challenge-features">
                  {activeChallenge.cards.map((card) => (
                    <article className="glass ns-gain" key={card.title}>
                      <span className="ns-gain__marker" aria-hidden="true" />
                      <strong>{card.title}</strong>
                      <p>{card.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            </article>
          </div>
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

      <section className="block ecosystem" id="ecosystem" data-screen-label="Ecosystem">
        <span className="ecosystem__bg" aria-hidden="true" />
        <div className="wrap">
          <div className="block__head reveal">
            <div className="ceo-badge gold-shimmer">CEO &amp; Founder</div>
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">The Vision</h2><span className="ln r" /></div>
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
              <img className="sig-line signature-mark reveal d2" src={FRANTZ_SIGNATURE} alt="Frantz Coutard signature" loading="lazy" decoding="async" />
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
                  <img className="phone__bg" src={abstractNetwork} alt="" loading="lazy" decoding="async" />
                  <div className="mono-sm"><img src={logo} alt="" loading="lazy" decoding="async" /></div>
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
              <img className="pin-badge" src={logo} alt="FC lapel pin" loading="lazy" decoding="async" />
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
            {homeGalleryItems.map((c, i) => (
              <div
                className={c.cls}
                data-cap={c.cap}
                data-lightbox-src={c.image}
                data-lightbox-cap={c.cap}
                data-lightbox-alt={c.cap}
                key={c.key || i}
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
            <button className="btn btn--solid" data-gallery-upload>+ Add Content to Gallery</button>
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

      <section className="block faq-section block--alt" id="faq" data-screen-label="FAQ">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Frequently Asked Questions</h2><span className="ln r" /></div>
            <p className="sub">Quick answers for visitors, partners, and community members.</p>
          </div>
          <div className="faq-grid reveal">
            {homeFaqItems.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <div className="faq-item__answer"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
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
