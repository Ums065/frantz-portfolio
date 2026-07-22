/* Shared config for the Youth Community Impact Fellow research workspace.
   Both the Fellow dashboard (data entry) and the admin Research panel read this
   so the categories, labels, and which fields show per category never drift. */

export type ResearchCategory =
  | 'school_contact'
  | 'partner_prospect'
  | 'funder'
  | 'content_creator'
  | 'research_note'

/** The writable fields on a research entry (matches the API `research_entries`). */
export type ResearchField =
  | 'title'
  | 'organization'
  | 'contact_name'
  | 'email'
  | 'phone'
  | 'website'
  | 'location'
  | 'source_url'
  | 'notes'

export interface ResearchEntry {
  id: number
  fellow_user_id: number
  assignment_id: number | null
  category: ResearchCategory
  title: string
  organization: string
  contact_name: string
  email: string
  phone: string
  website: string
  location: string
  source_url: string
  notes: string
  status: 'submitted' | 'verified' | 'approved' | 'rejected' | 'duplicate'
  admin_note: string
  pushed_school_id: number | null
  fellow_name?: string
  created_ts: number
  updated_ts: number
}

export interface CategoryConfig {
  key: ResearchCategory
  label: string
  tabLabel: string
  /** One-line guidance shown above the form, mirroring the offer letter's tasks. */
  blurb: string
  /** Ordered fields shown for this category. `title` is always required. */
  fields: { name: ResearchField; label: string; placeholder?: string; textarea?: boolean }[]
}

const F = {
  organization: { name: 'organization' as const, label: 'Organization' },
  contact_name: { name: 'contact_name' as const, label: 'Contact person' },
  email: { name: 'email' as const, label: 'Email' },
  phone: { name: 'phone' as const, label: 'Phone' },
  website: { name: 'website' as const, label: 'Website / link' },
  source_url: { name: 'source_url' as const, label: 'Source URL', placeholder: 'Where you found this' },
  notes: { name: 'notes' as const, label: 'Notes', textarea: true },
}

export const RESEARCH_CATEGORIES: CategoryConfig[] = [
  {
    key: 'school_contact',
    label: 'School Contacts',
    tabLabel: 'Schools',
    blurb: 'Verify contact information for New York schools. Enter the school name, principal/administrator, email, phone, district, and website.',
    fields: [
      { name: 'title', label: 'School name' },
      { name: 'contact_name', label: 'Principal / administrator' },
      { name: 'email', label: 'Admin email' },
      { name: 'phone', label: 'Main phone' },
      { name: 'website', label: 'School website' },
      { name: 'location', label: 'District / borough' },
      F.source_url,
      F.notes,
    ],
  },
  {
    key: 'partner_prospect',
    label: 'Partner Prospects',
    tabLabel: 'Partners',
    blurb: 'Research organizations like the YMCA, Boys & Girls Clubs, and other youth-serving groups that could become future partners.',
    fields: [
      { name: 'title', label: 'Organization name' },
      F.contact_name,
      F.email,
      F.phone,
      F.website,
      { name: 'location', label: 'Area served' },
      F.source_url,
      { name: 'notes', label: 'Why a good partner', textarea: true },
    ],
  },
  {
    key: 'funder',
    label: 'Funders & Foundations',
    tabLabel: 'Funders',
    blurb: 'Find companies and foundations that support youth, education, and community initiatives.',
    fields: [
      { name: 'title', label: 'Company / foundation' },
      F.website,
      F.email,
      { name: 'location', label: 'Location' },
      F.source_url,
      { name: 'notes', label: 'What they fund', textarea: true },
    ],
  },
  {
    key: 'content_creator',
    label: 'Content Creators',
    tabLabel: 'Creators',
    blurb: 'Identify positive youth content creators who may help spread awareness about the challenge.',
    fields: [
      { name: 'title', label: 'Creator name / handle' },
      { name: 'website', label: 'Channel / profile link' },
      { name: 'location', label: 'Platform (YouTube, IG…)' },
      F.source_url,
      { name: 'notes', label: 'Audience / why relevant', textarea: true },
    ],
  },
  {
    key: 'research_note',
    label: 'Research Notes',
    tabLabel: 'Research',
    blurb: 'Research topics like youth employment and the challenges facing small businesses. Capture the topic and your findings.',
    fields: [
      { name: 'title', label: 'Topic' },
      F.source_url,
      { name: 'notes', label: 'Findings', textarea: true },
    ],
  },
]

export const CATEGORY_LABEL: Record<ResearchCategory, string> = RESEARCH_CATEGORIES.reduce(
  (acc, c) => { acc[c.key] = c.label; return acc },
  {} as Record<ResearchCategory, string>,
)

export const EMPTY_ENTRY_FORM = {
  title: '', organization: '', contact_name: '', email: '', phone: '',
  website: '', location: '', source_url: '', notes: '',
}
