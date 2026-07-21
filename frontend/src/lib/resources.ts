/* Single source of truth for the public, downloadable PDF library.
   Consumed by the /resources page and the New School dashboard "Handbooks" tab,
   so both always show the same list. Every PDF lives in frontend/public/docs/
   and is served at /docs/<name>.pdf (Vite copies public/ into dist/ on build).

   Only public-facing documents belong here — internal files (security audit,
   email-system notes, the website spec, the scoring guide) are intentionally
   excluded so they never surface on a public page. */

export type ResourceCategory = 'handbooks' | 'newschool' | 'media' | 'partnership'

export interface ResourceDoc {
  label: string
  url: string
  description: string
  category: ResourceCategory
  /** Also surfaced inside the New School dashboard "Handbooks" tab. */
  newSchool?: boolean
}

/** Human-friendly section titles for grouping on the /resources page. */
export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  handbooks: 'Official Handbooks',
  newschool: 'New School Program',
  media: 'Media & Press Kits',
  partnership: 'Partnership & Sponsorship',
}

/** Order categories are shown in on the /resources page. */
export const RESOURCE_CATEGORY_ORDER: ResourceCategory[] = ['handbooks', 'newschool', 'media', 'partnership']

export const RESOURCES: ResourceDoc[] = [
  {
    label: 'Awards & Recognition Summary Handbook',
    url: '/docs/awards_recognition_summary_handbook.pdf',
    description: 'Official summary of the awards program and how recognition is earned across the challenge.',
    category: 'handbooks',
    newSchool: true,
  },
  {
    label: 'School & Teacher Award Summary Handbook',
    url: '/docs/school_teacher_award_summary_handbook.pdf',
    description: 'Guide for schools and teachers on award categories, criteria, and the recognition process.',
    category: 'handbooks',
    newSchool: true,
  },
  {
    label: 'New School Program Guide',
    url: '/docs/new_school_functionality.pdf',
    description: 'How the New School program works — roles, workflow, and dashboards for principals, teachers, students, and parents.',
    category: 'newschool',
    newSchool: true,
  },
  {
    label: 'Leave It Better Media Kit 2026',
    url: '/docs/leave_it_better_media_kit_2026.pdf',
    description: 'Program overview, mission, and key facts about the Leave It Better Than You Found It challenge.',
    category: 'newschool',
    newSchool: true,
  },
  {
    label: 'Media Kit',
    url: '/docs/media_kit.pdf',
    description: 'Press kit with brand assets, bio, and coverage highlights for journalists and partners.',
    category: 'media',
  },
  {
    label: 'Partnership Kit',
    url: '/docs/partnership_kit.pdf',
    description: 'How organizations can partner with the program and the opportunities available.',
    category: 'partnership',
  },
  {
    label: 'Founding Sponsor Kit',
    url: '/docs/founding_sponsor_kit.pdf',
    description: 'Founding sponsor benefits, tiers, and how sponsorship supports students and schools.',
    category: 'partnership',
  },
  {
    label: 'Founding Sponsor Media Kit',
    url: '/docs/founding_sponsor_media_kit.pdf',
    description: 'Media-ready overview for prospective founding sponsors.',
    category: 'partnership',
  },
]

/** Documents surfaced inside the New School dashboard "Handbooks" tab. */
export const NEW_SCHOOL_RESOURCES = RESOURCES.filter((r) => r.newSchool)
