/* Awards & recognition data — sourced from the official
   "Frantz Coutard — Recognition & Awards" dossier.
   Images live in /public/assets/awards. Shared by the Home
   highlights strip and the dedicated /awards page. */

export interface Award {
  id: string
  name: string
  year: string
  level: 'National' | 'Federal' | 'State' | 'County' | 'Nonprofit' | 'Business'
  presenter?: string
  short: string
  detail: string
  image: string
  featured?: boolean
}

const A = '/assets/awards'

export const awards: Award[] = [
  {
    id: 'queens-chamber',
    name: 'Queens Chamber of Commerce — Featured Entrepreneur',
    year: '2023',
    level: 'Business',
    presenter: 'Queens Chamber Member News',
    short: 'Featured for revolutionizing local advertising through TrendCatch Digital Advertising.',
    detail:
      'Featured in Queens Chamber Member News for revolutionizing local advertising through TrendCatch Digital Advertising — highlighting an innovative approach to affordable advertising for local businesses and a vision for a stronger local business ecosystem. An important milestone in the evolution of what would become TrendCatch Network.',
    image: `${A}/queens-chamber.png`,
  },
  {
    id: 'presidential-lifetime',
    name: 'Presidential Lifetime Achievement Award',
    year: '2024',
    level: 'National',
    presenter: 'AmeriCorps & the Office of the President of the United States',
    short: 'One of the nation’s highest volunteer service honors, for lifelong community service.',
    detail:
      'Awarded through AmeriCorps and the Office of the President of the United States — one of the nation’s highest volunteer service recognitions, honoring a lifelong commitment to community service, leadership, volunteerism, and efforts to strengthen communities through innovation and civic engagement.',
    image: `${A}/presidential-lifetime.png`,
    featured: true,
  },
  {
    id: 'ny-assembly',
    name: 'New York State Assembly Recognition',
    year: '2024',
    level: 'State',
    presenter: 'Assemblywoman Michaelle C. Solages',
    short: 'Recognized for entrepreneurship, innovation, and improving lives across Long Island and New York.',
    detail:
      'Recognized for entrepreneurship, innovation, leadership, and dedication to improving the lives of residents throughout Long Island and New York. The citation highlights a commitment to helping small businesses gain visibility, creating opportunities through technology, and strengthening local economies.',
    image: `${A}/ny-assembly.png`,
    featured: true,
  },
  {
    id: 'nassau-executive',
    name: 'Nassau County Executive Citation',
    year: '2024',
    level: 'County',
    presenter: 'County Executive Bruce Blakeman',
    short: 'For dedicated leadership, public service, and commitment to community advancement.',
    detail:
      'Awarded by Nassau County Executive Bruce Blakeman in recognition of dedicated leadership, public service, and commitment to community advancement — honoring contributions to local communities and efforts to improve the lives of others through service and leadership.',
    image: `${A}/nassau-executive.png`,
  },
  {
    id: 'nassau-cultural',
    name: 'Nassau County Executive Cultural Recognition',
    year: '2024',
    level: 'County',
    presenter: 'County Executive Bruce Blakeman',
    short: 'Honoring contributions to cultural diversity and the Haitian and Creole communities.',
    detail:
      'Honored by Nassau County Executive Bruce Blakeman for contributions to cultural diversity, community engagement, and support of the Haitian and Creole communities — acknowledging a role in promoting community unity, cultural awareness, and public engagement.',
    image: `${A}/nassau-cultural.png`,
  },
  {
    id: 'nassau-legislature',
    name: 'Nassau County Legislature Citation',
    year: '2025',
    level: 'County',
    presenter: 'Legislator Carrie Solages',
    short: 'For outstanding leadership and contributions to the Haitian community.',
    detail:
      'Recognized for outstanding leadership and contributions to the Haitian community. Presented during the Jazz Créole Festival in recognition of community service, advocacy, and efforts that positively impacted residents throughout Nassau County.',
    image: `${A}/nassau-legislature.png`,
  },
  {
    id: 'kedner-stiven',
    name: 'Kedner Stiven Foundation Leadership Award',
    year: '2025',
    level: 'Nonprofit',
    presenter: 'Kedner Stiven Foundation',
    short: 'For outstanding leadership and commitment to the Haitian-American community.',
    detail:
      'Awarded for outstanding leadership and unwavering commitment to the Haitian-American community — honoring efforts to inspire others, create opportunities, support community development, and advocate for positive social impact.',
    image: `${A}/kedner-stiven.png`,
  },
  {
    id: 'mlk-visionary',
    name: 'Dr. Martin Luther King Jr. Visionary Award',
    year: '2026',
    level: 'National',
    short: 'For visionary leadership, innovation, and community advancement.',
    detail:
      'Awarded in recognition of visionary leadership, innovation, community advancement, and commitment to the principles championed by Dr. Martin Luther King Jr. — celebrating work empowering communities through technology, entrepreneurship, economic opportunity, and social impact, and recognizing leadership that contributes to unity, progress, equality, and community transformation.',
    image: `${A}/mlk-visionary.png`,
    featured: true,
  },
  {
    id: 'us-senate',
    name: 'United States Senate Recognition',
    year: '2026',
    level: 'Federal',
    presenter: 'U.S. Senator Charles E. Schumer',
    short: 'Federal recognition for entrepreneurial achievement and community leadership.',
    detail:
      'Recognized by the United States Senate, presented by U.S. Senator Charles E. Schumer, for entrepreneurial achievement, community leadership, and receiving the Dr. Martin Luther King Jr. Visionary Award. This federal recognition acknowledges impact on local communities through innovation, entrepreneurship, and public service.',
    image: `${A}/us-senate.png`,
    featured: true,
  },
  {
    id: 'ny-resolution-998',
    name: 'New York State Legislative Resolution No. 998',
    year: '2026',
    level: 'State',
    presenter: 'New York State Assembly',
    short: 'A permanent public record honoring entrepreneurship, technology, and community impact.',
    detail:
      'Officially honored by the New York State Assembly through Legislative Resolution No. 998 — a permanent public record recognizing TrendCatch Digital Advertising, TrendCatch Network, TrendCatch Player Technology, Unlock A Cause, Workforce Development Initiatives, and Community Empowerment Programs, and a dedication to empowering underserved communities.',
    image: `${A}/ny-resolution-998.png`,
    featured: true,
  },
]

export const featuredAwards = awards.filter((a) => a.featured)

/* Chronological timeline for the Recognition Journey rail (2023 → 2026). */
export const timeline = awards.map((a) => ({
  year: a.year,
  label: a.name.replace(' — ', ' '),
  id: a.id,
}))

export const portrait = `${A}/frantz-coutard.png`
