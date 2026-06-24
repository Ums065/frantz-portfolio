export interface VentureCard {
  title: string
  copy: string
  tag: string
  media: string
  highlights: string[]
  mediaClass?: string
}

export type VisionNodeKind = 'schools' | 'stores' | 'restaurants' | 'businesses' | 'network' | 'opportunity'

export interface VisionNode {
  label: string
  kind: VisionNodeKind
}

export const buildingNowBase = "/assets/What I'm Building Now"

export const ventureCards: VentureCard[] = [
  {
    title: 'Frantz Coutard',
    copy: 'Entrepreneur, innovator, and advocate building technology that strengthens communities.',
    tag: 'My Journey Continues',
    media: `${buildingNowBase}/1.png`,
    highlights: ['Entrepreneur', 'Innovator', 'Advocate', 'Community'],
    mediaClass: 'proj__media--portrait',
  },
  {
    title: 'TrendCatch EDU',
    copy: 'A digital platform helping schools access grants, resources, and opportunity.',
    tag: 'Empowering Communities',
    media: `${buildingNowBase}/2.png`,
    highlights: ['Grants', 'Schools', 'Teachers', 'Parents', 'Students'],
  },
  {
    title: 'Leave It Better Than You Found It',
    copy: 'A movement for future problem solvers building better communities.',
    tag: 'Educational Movement',
    media: `${buildingNowBase}/3.png`,
    highlights: ['Problem Solvers', 'Innovation', 'Leadership', 'Future Ready'],
    mediaClass: 'proj__media--glow',
  },
  {
    title: 'Referral Partner Program',
    copy: 'Empowering youth to build income through sales, partnerships, and referrals.',
    tag: 'Launching October 17, 2026',
    media: `${buildingNowBase}/4.png`,
    highlights: ['Sales Training', 'Business Leads', 'Partnerships', 'Income'],
  },
  {
    title: 'Shelf Link',
    copy: 'Helping local and independent brands launch and grow in retail stores.',
    tag: 'Launching October 3, 2026',
    media: `${buildingNowBase}/5.png`,
    highlights: ['Product Launch', 'Retail Partners', 'Growth', 'Distribution'],
  },
  {
    title: 'TrendCatch Network',
    copy: 'The operating system for local commerce, local ads, and instant savings.',
    tag: 'Launching July 25, 2026',
    media: `${buildingNowBase}/6.png`,
    highlights: ['Local Ads', 'Coupons', 'Savings', 'Community'],
    mediaClass: 'proj__media--network',
  },
  {
    title: 'TrendCatch Gives Back Inc.',
    copy: 'Technology for community awareness, clean water, public safety, and sustainability.',
    tag: 'Non-Profit Initiative',
    media: `${buildingNowBase}/7.png`,
    highlights: ['Education', 'Surveys', 'Sustainability', 'Awareness'],
  },
  {
    title: 'TrendCatch Player',
    copy: 'Powering any screen with remote content updates and live engagement.',
    tag: 'Proprietary Technology',
    media: `${buildingNowBase}/8.png`,
    highlights: ['Any Screen', 'Remote Control', 'Global', 'Real-Time'],
  },
]

export const ventureVision = {
  title: 'The Vision',
  copy: 'Building technology that strengthens communities through commerce, education, and opportunity.',
  media: `${buildingNowBase}/9.png`,
}

export const ventureVisionNodes: VisionNode[] = [
  { label: 'Schools', kind: 'schools' },
  { label: 'Grocery Stores', kind: 'stores' },
  { label: 'Restaurants', kind: 'restaurants' },
  { label: 'Small Businesses', kind: 'businesses' },
  { label: 'Digital Network', kind: 'network' },
  { label: 'Opportunity', kind: 'opportunity' },
]

export function VisionNodeIcon({ kind }: { kind: VisionNode['kind'] }) {
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
