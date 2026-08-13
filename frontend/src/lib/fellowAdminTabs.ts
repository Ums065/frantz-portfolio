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

export const FTAB_GROUPS: { label: string; tabs: FTab[] }[] = [
  { label: 'The team', tabs: ['today', 'analytics', 'activity', 'reports'] },
  { label: 'Their work', tabs: ['assign', 'schools', 'pipeline', 'proposals', 'research'] },
  { label: 'Set the rules', tabs: ['targets', 'materials', 'templates', 'training', 'certification'] },
  { label: 'People', tabs: ['accounts'] },
]
