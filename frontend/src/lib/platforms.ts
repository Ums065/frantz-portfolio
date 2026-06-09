/* The platform ecosystem Frantz is building - shared by the About page
   and the Home ventures highlight section. */

export interface Platform {
  name: string
  tag: string
  copy: string
  link?: string
}

export const platforms: Platform[] = [
  {
    name: 'TrendCatch Network',
    tag: 'Local Commerce Operating System',
    copy:
      'An integrated technology ecosystem connecting businesses, consumers, schools, nonprofits, and retailers - helping communities discover local businesses, access deals and discounts, launch campaigns and coupons, increase visibility, create consumer connections, generate referral income, deepen community engagement, and improve performance with AI.',
  },
  {
    name: 'TrendCatch Player Technology',
    tag: 'Innovation Layer',
    copy:
      'A developing platform referenced in the broader TrendCatch ecosystem, built to support interactive participation, loyalty, and future community-facing experiences.',
  },
  {
    name: 'Unlock A Cause',
    tag: 'Community Impact & Awareness',
    copy:
      'A live nonprofit platform turning public-health and social causes into neighborhood billboard campaigns - connecting residents to local resources through QR codes, on a community-funded sponsorship model.',
    link: 'https://unlockacause.org',
  },
  {
    name: 'TrendCatch EDU',
    tag: 'Education & Communication OS',
    copy:
      'An operating system helping schools engage students, parents, and educators - with communication tools, AI literacy, career readiness, and entrepreneurship exposure for the next generation.',
  },
  {
    name: 'ShelfLink',
    tag: 'Retail Operating System & Marketplace',
    copy:
      'Connecting product creators, food entrepreneurs, and local brands with retailers and supermarkets - creating an accessible pathway onto retail shelves and supporting small business growth.',
  },
  {
    name: 'TrendCatch Gives Back Inc.',
    tag: 'Nonprofit Organization',
    copy:
      'A nonprofit dedicated to empowering underserved communities through education, technology access, community outreach, sponsorships, and economic opportunity - ensuring innovation reaches everyone.',
  },
]
