/* The Fellow Team panel's sections, grouped the way the job divides.
   Kept out of the panel itself because the admin shell renders this list in its
   sidebar (Fellow mode) while the panel stays lazy-loaded — importing it from
   the panel would pull the whole panel into the initial bundle. */

export type FTab =
  | 'today' | 'analytics' | 'activity' | 'reports'
  | 'assign' | 'schools' | 'pipeline' | 'proposals' | 'research'
  | 'targets' | 'materials' | 'templates' | 'training' | 'certification'
  | 'accounts'

export const FTAB_LABEL: Record<FTab, string> = {
  today: 'Today', analytics: 'Analytics', activity: 'Activity Feed', reports: 'Daily Reports',
  assign: 'Tasks', schools: 'School Verification', pipeline: 'All Prospects', proposals: 'Proposals',
  research: 'Research Entries', targets: 'Targets', materials: 'Materials', templates: 'Outreach Templates',
  training: 'Training', certification: 'Certification', accounts: 'Fellow Accounts',
}

/* One plain-language line per section, so nobody has to open a tab to find out
   what it is. Shown under the heading of the open section and as the hover
   tooltip on every nav button, on both the panel's own nav and the admin
   sidebar in Fellow mode. */
export const FTAB_HELP: Record<FTab, string> = {
  today: 'What the team did today: live activity counts and where each Fellow stands.',
  analytics: 'The whole-team picture — the sponsorship funnel, alerts worth acting on, and how activity is trending this week and month.',
  activity: 'Every call, email and note the team has logged, searchable and filterable. The record, not a snapshot.',
  reports: 'The end-of-day reports Fellows write. Read the blockers — that is where someone needs you.',
  assign: 'Assign work to Fellows, talk to them on each task, and sign it off. Anything they hand in or get stuck on shows here first.',
  schools: 'How far the team has got through the master school list, by region and by Fellow — including who verifies by phone versus desk research.',
  pipeline: 'Every real prospect the team is working, who owns it and what it is worth. Sample data is never counted here.',
  proposals: 'Sponsorship proposals a Fellow submitted. They stay blocked until you approve or decline one.',
  research: 'Partners, funders, creators and research notes the Fellows collected. Review each one, or push a verified school contact into your Schools data.',
  targets: 'The daily numbers a Fellow is aiming for — calls, emails, research. Set one figure for the team or a different one per person.',
  materials: 'The approved decks, one-pagers and links Fellows are allowed to send to sponsors. If it is not here, they should not be sending it.',
  templates: 'The email, phone and LinkedIn scripts Fellows work from. Edit these and every Fellow gets the new wording.',
  training: 'The Training Academy modules Fellows read, and syncing newly added documents in.',
  certification: 'The exam question bank, and which Fellows have passed. A Fellow needs 80% to certify.',
  accounts: 'Who is on the team and what each of them is carrying, plus the form to add another Fellow.',
}

export const FTAB_GROUPS: { label: string; tabs: FTab[] }[] = [
  { label: 'The team', tabs: ['today', 'analytics', 'activity', 'reports'] },
  { label: 'Their work', tabs: ['assign', 'schools', 'pipeline', 'proposals', 'research'] },
  { label: 'Set the rules', tabs: ['targets', 'materials', 'templates', 'training', 'certification'] },
  { label: 'People', tabs: ['accounts'] },
]
