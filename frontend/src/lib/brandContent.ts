export interface ProjectFeature {
  title: string
  status: string
  summary: string
  detail: string
  image: string
  highlights: string[]
  metrics: Array<{ label: string; value: string }>
  action: string
  href?: string
}

export interface MediaFeature {
  title: string
  type: string
  summary: string
  detail: string
  image: string
  href: string
  published: string
  featured?: boolean
}

export interface CommunityUpdate {
  title: string
  category: string
  summary: string
  detail: string
  action: string
  href: string
}

export interface MemberPerk {
  title: string
  summary: string
  badge: string
}

export interface TestimonialFallback {
  quote: string
  name: string
  title: string
  company: string
  image: string
}

export const projectShowcase: ProjectFeature[] = [
  {
    title: 'TrendCatch Network',
    status: 'Launching July 25, 2026',
    summary: 'The operating system for local commerce and community connections.',
    detail: 'A connected ecosystem that helps businesses, schools, nonprofits, residents, and retailers work from the same playbook. The goal is simple: keep value local and make access to opportunity easier to reach.',
    image: '/assets/project-trendcatch-network.webp',
    highlights: [
      'Local commerce infrastructure',
      'Community-driven discovery',
      'Recurring neighborhood engagement',
    ],
    metrics: [
      { label: 'Focus', value: 'Commerce' },
      { label: 'Audience', value: 'Communities' },
      { label: 'Status', value: 'In rollout' },
    ],
    action: 'Explore the platform vision',
    href: '/community',
  },
  {
    title: 'Unlock A Cause',
    status: 'Live now',
    summary: 'Community-impact billboards and QR campaigns that connect residents to local resources.',
    detail: 'A public-good platform designed to convert awareness into action. Each campaign links a cause, a neighborhood, and a practical resource in one simple flow.',
    image: '/assets/project-unlock-cause.webp',
    highlights: [
      'Cause-based activation',
      'Neighborhood QR journeys',
      'Sponsored community outreach',
    ],
    metrics: [
      { label: 'Model', value: 'Nonprofit' },
      { label: 'Reach', value: 'Local' },
      { label: 'Status', value: 'Live' },
    ],
    action: 'Request partnership details',
    href: '/media',
  },
  {
    title: 'TrendCatch Gives Back',
    status: 'Daily impact',
    summary: 'A nonprofit initiative focused on opportunity, access, and neighborhood support.',
    detail: 'The community arm of the ecosystem. It exists to connect families with resources, support education and outreach, and keep service at the center of the brand.',
    image: '/assets/project-gives-back.webp',
    highlights: [
      'Community support',
      'Resource distribution',
      'Event and giveaway activations',
    ],
    metrics: [
      { label: 'Focus', value: 'Service' },
      { label: 'Format', value: 'Nonprofit' },
      { label: 'Status', value: 'Ongoing' },
    ],
    action: 'Join the movement',
    href: '/community',
  },
  {
    title: 'TrendCatch Player Technology',
    status: 'In development',
    summary: 'A developing engagement layer within the TrendCatch ecosystem.',
    detail: 'A future-facing platform concept designed to extend the brand into interactive participation, loyalty, and community-led digital experiences.',
    image: '/assets/abstract-gold-network.webp',
    highlights: [
      'Interactive engagement',
      'Loyalty and rewards',
      'Community-led experiences',
    ],
    metrics: [
      { label: 'Focus', value: 'Engagement' },
      { label: 'Format', value: 'Platform' },
      { label: 'Status', value: 'Concept' },
    ],
    action: 'Follow future updates',
    href: '/community',
  },
]

export const mediaShowcase: MediaFeature[] = [
  {
    title: 'Founder keynote reel',
    type: 'Video',
    summary: 'Highlights from speaking engagements centered on innovation, entrepreneurship, and local impact.',
    detail: 'A premium reel for event producers, journalists, and community partners who want a quick view of the stage presence and message.',
    image: '/assets/gallery-speaking-stage.webp',
    href: '/blog',
    published: '2026-06',
    featured: true,
  },
  {
    title: 'Official media kit download',
    type: 'Press release',
    summary: 'A downloadable bio kit with talking points, platform context, and booking information.',
    detail: 'Built for producers, journalists, and event teams who need the official story in one place.',
    image: '/assets/brand-signature-white.webp',
    href: '/assets/media-kit/frantz-coutard-media-kit.txt',
    published: '2026-06',
  },
  {
    title: 'Press and recognition archive',
    type: 'Press release',
    summary: 'Articles, awards, and public records that document the journey to date.',
    detail: 'Use this area when you need official source material, public-facing milestones, or a fast way to find the right citation.',
    image: '/assets/award-presidential-medal.webp',
    href: '/awards',
    published: '2026-05',
  },
  {
    title: 'Interview and podcast assets',
    type: 'Interview',
    summary: 'Brand-ready photos and message points for hosts and producers.',
    detail: 'The media kit path is built for timely booking requests, interview prep, and quick turnaround production needs.',
    image: '/assets/brand-signature-white.webp',
    href: '/community',
    published: '2026-05',
  },
  {
    title: 'Photo gallery selection',
    type: 'Gallery',
    summary: 'Stage, community, and brand imagery chosen for editorial use.',
    detail: 'A curated gallery that supports campaigns, announcements, and promotional materials without losing the premium visual direction.',
    image: '/assets/brand-marks-grid.webp',
    href: '/projects',
    published: '2026-04',
  },
  {
    title: 'TV and feature clips',
    type: 'Video',
    summary: 'Short-form clips that make it easy to embed the story in a broadcast or digital package.',
    detail: 'This section is intended to grow into a more complete media center as interviews and appearances are added.',
    image: '/assets/abstract-gold-network.webp',
    href: '/events',
    published: '2026-04',
  },
]

export const communityUpdates: CommunityUpdate[] = [
  {
    title: 'Founder updates are now part of the member experience',
    category: 'Founder note',
    summary: 'Members will receive periodic updates about new launches, events, and opportunities.',
    detail: 'This is the first step toward a richer community layer with alerts, member-only notes, and early access to announcements.',
    action: 'Open the dashboard',
    href: '/dashboard',
  },
  {
    title: 'VIP invitations and giveaways are being organized',
    category: 'Member perks',
    summary: 'The dashboard keeps track of saved items, perks, and future invite drops.',
    detail: 'A member-centric workflow is now available for people who want to stay close to the brand and receive the right content at the right time.',
    action: 'Join the community',
    href: '/dashboard',
  },
  {
    title: 'Discussion and resource areas are next',
    category: 'Roadmap',
    summary: 'The next phase expands into private content, resources, and structured community discussion.',
    detail: 'That work is modeled as a natural extension of the dashboard rather than a separate isolated experience.',
    action: 'Read the news',
    href: '/blog',
  },
]

export const memberPerks: MemberPerk[] = [
  {
    title: 'VIP invitations',
    summary: 'Early invites to launches, limited events, and private brand moments.',
    badge: 'VIP',
  },
  {
    title: 'Giveaway access',
    summary: 'Track giveaway entries and member-only promotions in one place.',
    badge: 'Bonus',
  },
  {
    title: 'Merch discounts',
    summary: 'Member pricing for featured drops and purpose-driven collection items.',
    badge: 'Save',
  },
  {
    title: 'Founder updates',
    summary: 'Short notes on new launches, milestones, and community direction.',
    badge: 'Update',
  },
  {
    title: 'Private resources',
    summary: 'Downloadable guides and exclusive content as the community platform grows.',
    badge: 'Private',
  },
]

export const testimonialFallbacks: TestimonialFallback[] = [
  {
    quote: 'The strategy is practical, community-first, and built with real execution in mind.',
    name: 'Community Partner',
    title: 'Program Lead',
    company: 'Local Impact Group',
    image: '/assets/award-senate-medal.webp',
  },
  {
    quote: 'Frantz brings a clear message, strong presence, and a focus on helping people move forward.',
    name: 'Event Producer',
    title: 'Booking Director',
    company: 'Leadership Summit',
    image: '/assets/gallery-speaking-stage.webp',
  },
  {
    quote: 'The brand system is premium, but the mission stays human. That combination stands out.',
    name: 'Brand Advisor',
    title: 'Creative Strategist',
    company: 'Studio Partner',
    image: '/assets/brand-signature-white.webp',
  },
]
