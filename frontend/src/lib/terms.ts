// Terms & Conditions content + versions. Single source of truth for the agreement
// checkboxes (registration role terms + general platform + website Terms/Privacy) and
// the public legal pages. Checkbox `id`s are persisted with each acceptance — do not
// rename casually.

export const CHALLENGE_TERMS_VERSION = 'Interim Terms v1 – June 2026'
export const WEBSITE_TERMS_VERSION = 'Interim Website Terms v1'
export const TERMS_EFFECTIVE_DATE = 'June 27, 2026'

const ORG = 'Frantz Coutard, Trend Catch Network, Inc., TrendCatch Gives Back, sponsors, or any affiliated organization'

export type TermsKind = 'student' | 'parent' | 'teacher' | 'school' | 'website'

export type TermsItem =
  | { type: 'text'; heading?: string; intro?: string; bullets?: string[] }
  | { type: 'check'; id: string; label: string }

export interface TermsCheckbox { id: string; label: string }

// ---- Shared blocks reused by every challenge-registration role ----

const GENERAL_PLATFORM_ITEMS: TermsItem[] = [
  {
    type: 'text',
    heading: 'General Platform Terms (All Users)',
    intro: 'By creating an account, I understand that:',
    bullets: [
      'Access to the website/dashboard is provided for challenge participation.',
      'Users are responsible for information and content they submit.',
      'False, inappropriate, harmful, or unauthorized content may result in removal or account restrictions.',
      'The platform may update participation rules, policies, and terms.',
      'Final Terms of Service and Privacy Policy may replace or update these interim terms.',
    ],
  },
  { type: 'check', id: 'general_platform', label: 'I acknowledge and agree.' },
]

const WEBSITE_ITEM: TermsItem = {
  type: 'check',
  id: 'website_terms',
  label: 'I have read and agree to the Terms of Use and Privacy Notice.',
}

// ---- Per-role challenge terms ----

export const TERMS_LAYOUT: Record<TermsKind, TermsItem[]> = {
  student: [
    { type: 'text', heading: 'Student Registration Agreement' },
    {
      type: 'check',
      id: 'student_voluntary',
      label: 'I agree to participate in the “Leave It Better Than You Found It” Challenge voluntarily.',
    },
    {
      type: 'text',
      intro: 'I understand:',
      bullets: [
        'This challenge is an educational program designed to encourage creativity, leadership, entrepreneurship, and problem-solving.',
        `I am participating voluntarily and I am not an employee, contractor, salesperson, agent, or representative of ${ORG}.`,
        'I do not have authority to make promises, agreements, or commitments on behalf of the organization.',
        'Any business interviews I complete are for educational research and challenge participation only.',
        'I agree to be respectful, professional, and safe while participating.',
        'I understand that submissions may be reviewed for challenge participation, awards, recognition, and program purposes.',
        'If I am under 18 years old, I understand my parent/legal guardian must approve my participation.',
      ],
    },
    {
      type: 'check',
      id: 'student_rules',
      label: 'I agree to follow the challenge rules and participation guidelines.',
    },
    ...GENERAL_PLATFORM_ITEMS,
    WEBSITE_ITEM,
  ],

  parent: [
    { type: 'text', heading: 'Parent / Guardian Consent' },
    {
      type: 'check',
      id: 'parent_authorize',
      label: 'I confirm that I am the parent or legal guardian of the student participant and authorize my child to participate in the “Leave It Better Than You Found It” Challenge.',
    },
    {
      type: 'text',
      intro: 'I understand and agree:',
      bullets: [
        'Participation is voluntary.',
        `My child is not employed by or working for ${ORG}.`,
        'My child may participate in activities including educational research, business interviews, project creation, and challenge submissions.',
        'I understand students are responsible for conducting themselves safely and appropriately.',
        'I give permission for my child to create an account and participate through the online platform.',
        'I understand submissions may include written projects, photos, videos, ideas, and presentations.',
        'I grant permission for approved submissions, achievements, and recognition moments to be displayed or shared for educational, promotional, and program-related purposes.',
        'I acknowledge participant information may be collected and used to operate the challenge, improve the program, communicate updates, measure impact, and administer awards.',
      ],
    },
    {
      type: 'check',
      id: 'parent_approve',
      label: 'I approve my child’s participation and agree to the program guidelines.',
    },
    ...GENERAL_PLATFORM_ITEMS,
    WEBSITE_ITEM,
  ],

  teacher: [
    { type: 'text', heading: 'Teacher Registration Agreement' },
    {
      type: 'check',
      id: 'teacher_acknowledge',
      label: 'I acknowledge my participation as an educator supporting the “Leave It Better Than You Found It” Challenge.',
    },
    {
      type: 'text',
      intro: 'I understand:',
      bullets: [
        'The program is designed to support student innovation, leadership, entrepreneurship, and community problem-solving.',
        'My participation is voluntary.',
        'I agree to follow program guidelines.',
        'I understand students participate voluntarily with appropriate permissions.',
        'I may assist students with guidance, encouragement, and educational support.',
        'I understand the platform may collect participation information to operate and improve the program.',
      ],
    },
    {
      type: 'check',
      id: 'teacher_guidelines',
      label: 'I agree to the educator participation guidelines.',
    },
    ...GENERAL_PLATFORM_ITEMS,
    WEBSITE_ITEM,
  ],

  school: [
    { type: 'text', heading: 'School / Principal Registration Agreement' },
    {
      type: 'check',
      id: 'school_interest',
      label: 'On behalf of my school, I acknowledge interest in participating in the “Leave It Better Than You Found It” Challenge.',
    },
    {
      type: 'text',
      intro: 'The school understands:',
      bullets: [
        'This is an educational innovation and community impact initiative.',
        'Student participation requires appropriate permissions.',
        'The program encourages students to develop leadership, technology, communication, entrepreneurship, and problem-solving skills.',
        'Challenge rules, eligibility requirements, and participation guidelines apply.',
        'The organization reserves the right to review submissions, manage participation, and maintain program integrity.',
      ],
    },
    {
      type: 'check',
      id: 'school_guidelines',
      label: 'I acknowledge the school participation guidelines.',
    },
    ...GENERAL_PLATFORM_ITEMS,
    WEBSITE_ITEM,
  ],

  website: [WEBSITE_ITEM],
}

export function checkboxesFor(kind: TermsKind): TermsCheckbox[] {
  return TERMS_LAYOUT[kind]
    .filter((item): item is Extract<TermsItem, { type: 'check' }> => item.type === 'check')
    .map((item) => ({ id: item.id, label: item.label }))
}

export function versionFor(kind: TermsKind): string {
  return kind === 'website' ? WEBSITE_TERMS_VERSION : CHALLENGE_TERMS_VERSION
}

// ---- Public legal pages ----

export type LegalSlug = 'terms' | 'privacy' | 'content-disclaimer'

export interface LegalSection { heading?: string; paragraphs?: string[]; bullets?: string[] }
export interface LegalDoc {
  title: string
  version: string
  effectiveDate: string
  intro: string[]
  sections: LegalSection[]
}

// Full "Interim Website Terms of Use & Privacy Notice" — used by /terms and /privacy.
const WEBSITE_TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'Website Purpose',
    paragraphs: ['FrantzCoutard.com provides information related to:'],
    bullets: [
      'Frantz Coutard’s founder journey and personal story', 'Technology projects', 'Community initiatives',
      'Entrepreneurship programs', 'Educational challenges', 'Speaking opportunities', 'Mentorship opportunities',
      'Media requests', 'Awards and recognitions', 'Articles and updates', 'Events', 'Merchandise',
      'Partnerships and collaborations',
    ],
  },
  {
    heading: 'Intellectual Property & Content Ownership',
    paragraphs: [
      'All website content is owned by or used with permission by Frantz Coutard and/or affiliated organizations.',
      'Visitors may view website materials for personal informational purposes. Users may not copy, reproduce, sell, distribute, modify, falsely represent, or commercially use website content without written permission.',
    ],
  },
  {
    heading: 'Name, Image & Brand Protection',
    paragraphs: [
      'The Frantz Coutard name, likeness, images, personal brand, speeches, quotes, appearances, and related materials may not be used without authorization.',
      'Unauthorized use suggesting endorsement, partnership, affiliation, or approval is prohibited.',
    ],
  },
  {
    heading: 'Artificial Intelligence Generated Content Notice',
    paragraphs: [
      'Some images, graphics, concepts, designs, or creative materials displayed on this website may be created, modified, enhanced, or supported using artificial intelligence technology.',
      'AI-assisted materials are used for creative, educational, visualization, and promotional purposes.',
    ],
  },
  {
    heading: 'Awards, Recognition & Project Information',
    paragraphs: [
      'Information regarding awards, recognitions, accomplishments, projects, companies, and initiatives is provided for informational and historical purposes. The website may be updated as projects and initiatives continue to develop.',
    ],
  },
  {
    heading: 'Partner Names, Logos & Third-Party References',
    paragraphs: ['This website may display names, logos, images, organizations, companies, schools, sponsors, community partners, media organizations, or collaborators. References may represent recognition, participation, collaboration, historical involvement, community activities, or partnerships.',
      'Display of third-party names or logos does not automatically create ownership, endorsement, sponsorship, or affiliation unless specifically stated. All third-party trademarks remain property of their respective owners.'],
  },
  {
    heading: 'Speaking, Mentorship & Booking Requests',
    paragraphs: ['Visitors may submit requests for speaking engagements, mentorship, interviews, media appearances, collaborations, and events. Submitting a request does not guarantee acceptance, availability, scheduling, or participation. All requests are subject to review and approval.'],
  },
  {
    heading: 'User Submitted Information',
    paragraphs: ['Users may voluntarily submit information through contact forms, registration forms, challenge applications, booking requests, media requests, and program participation forms. By submitting information, users confirm that the information provided is accurate and submitted voluntarily.'],
  },
  {
    heading: 'Submitted Content',
    paragraphs: ['If users submit stories, photos, videos, ideas, projects, testimonials, messages, or other materials, they grant permission for submitted content to be reviewed, displayed, shared, and used for website, educational, promotional, community, reporting, and program-related purposes.'],
  },
  {
    heading: 'Data Collection & Communication',
    paragraphs: ['The website may collect information necessary to respond to requests, operate programs, manage registrations, communicate updates, improve services, measure impact, and provide opportunities.'],
    bullets: ['Name', 'Contact information', 'Organization information', 'Submitted messages', 'Participation information', 'Website activity'],
  },
  {
    heading: 'Website Changes',
    paragraphs: ['We reserve the right to update website content, modify features, change programs, update information, remove content, and adjust availability at any time.'],
  },
  {
    heading: 'Limitation of Responsibility',
    paragraphs: ['FrantzCoutard.com provides information, opportunities, and resources. Users are responsible for their own decisions, participation, submissions, and actions. The website does not guarantee specific outcomes, results, opportunities, awards, partnerships, or business results.'],
  },
  {
    heading: 'Future Updates',
    paragraphs: ['These interim Terms of Use are provided while complete legal documents are being prepared. Continued use of the website after updates means users agree to the most current terms available.'],
  },
  {
    heading: 'Contact',
    paragraphs: ['Info@frantzcoutard.com — FrantzCoutard.com'],
  },
]

// Simpler "Website Terms of Use & Content Notice" — used by /content-disclaimer.
const CONTENT_NOTICE_SECTIONS: LegalSection[] = [
  { heading: 'Content Ownership', paragraphs: ['All content displayed on this website, including but not limited to text, images, videos, designs, graphics, presentations, branding, project descriptions, and creative materials, is owned by or authorized for use by Frantz Coutard and affiliated organizations.', 'Content may not be copied, modified, distributed, sold, or used commercially without written permission.'] },
  { heading: 'Personal Brand & Image Rights', paragraphs: ['The name, image, likeness, biography, story, quotes, presentations, and personal branding of Frantz Coutard may not be used in a way that falsely suggests authorization, partnership, sponsorship, or endorsement.'] },
  { heading: 'Projects & Future Development Information', paragraphs: ['Information about companies, technology concepts, platforms, programs, and future initiatives is provided for informational and educational purposes. Projects, features, timelines, and availability may change as development continues.'] },
  { heading: 'Artificial Intelligence Content Notice', paragraphs: ['Some images, graphics, visuals, or creative materials displayed on this website may be created, enhanced, or supported using artificial intelligence tools. These materials may be used for creative visualization, storytelling, marketing, and educational purposes.'] },
  { heading: 'Awards, Media & Recognition', paragraphs: ['Awards, recognitions, articles, appearances, and achievements displayed on this website are shared to highlight professional history, community involvement, and milestones.'] },
  { heading: 'Partner Logos & Third-Party References', paragraphs: ['This website may display names, logos, images, brands, organizations, schools, businesses, sponsors, or partners. Such references may represent collaborations, participation, recognition, historical involvement, or community initiatives.', 'All trademarks and logos remain the property of their respective owners. Display of a name or logo does not automatically imply ownership, endorsement, sponsorship, or partnership unless specifically stated.'] },
  { heading: 'Speaking, Media & Collaboration Requests', paragraphs: ['Visitors may submit requests for speaking engagements, media opportunities, mentorship, partnerships, events, and collaborations. All requests are subject to review and approval. Submission of a request does not guarantee acceptance.'] },
  { heading: 'External Links', paragraphs: ['This website may include links or references to other websites, companies, organizations, or platforms. We are not responsible for third-party websites or content.'] },
  { heading: 'Updates', paragraphs: ['Website information, projects, events, and terms may be updated at any time as initiatives continue to grow. Additional terms may apply to specific programs, registrations, platforms, challenges, or services.'] },
  { heading: 'Contact', paragraphs: ['Info@frantzcoutard.com'] },
]

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: 'Terms of Use & Privacy Notice',
    version: WEBSITE_TERMS_VERSION,
    effectiveDate: TERMS_EFFECTIVE_DATE,
    intro: [
      'Welcome to FrantzCoutard.com. This website was created to share the story, projects, technology initiatives, community work, speaking opportunities, educational programs, and future developments associated with Frantz Coutard.',
      'By accessing this website, submitting information, registering, or using any available features, you acknowledge and agree to these interim Terms of Use. These terms may be updated or replaced by a complete Terms of Service and Privacy Policy in the future.',
    ],
    sections: WEBSITE_TERMS_SECTIONS,
  },
  privacy: {
    title: 'Privacy Notice',
    version: WEBSITE_TERMS_VERSION,
    effectiveDate: TERMS_EFFECTIVE_DATE,
    intro: [
      'This Privacy Notice is part of the interim Terms of Use & Privacy Notice for FrantzCoutard.com and explains how information you submit is collected and used.',
      'See the “User Submitted Information”, “Submitted Content”, and “Data Collection & Communication” sections below.',
    ],
    sections: WEBSITE_TERMS_SECTIONS,
  },
  'content-disclaimer': {
    title: 'Website Terms of Use & Content Notice',
    version: WEBSITE_TERMS_VERSION,
    effectiveDate: TERMS_EFFECTIVE_DATE,
    intro: [
      'Thank you for visiting FrantzCoutard.com. This website shares information about Frantz Coutard’s journey, projects, technology initiatives, community impact, speaking engagements, educational programs, awards, media, partnerships, and future developments.',
      'By accessing this website, visitors acknowledge the following:',
    ],
    sections: CONTENT_NOTICE_SECTIONS,
  },
}
