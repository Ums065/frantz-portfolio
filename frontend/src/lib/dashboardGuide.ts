// Role-specific dashboard onboarding: a guided tour of each tab + a rule book.
// Shown automatically on a user's first visit and reopenable anytime.

export interface GuideSlide { title: string; intro?: string; points: string[] }
export interface RoleGuide { welcome: string; slides: GuideSlide[]; rules: string[] }
export interface FaqItem { q: string; a: string }

const FAQ_SHARED: FaqItem[] = [
  { q: 'How do I message the admin team?', a: 'Use the Chat tab in your dashboard to message the admin directly. You can clear the chat from your own view at any time.' },
  { q: 'Is my information private?', a: 'Yes. Your details are used only to run the challenge. Project content is reviewed by admin; teachers and schools see counts, not private content.' },
  { q: 'I can’t see something I expected — what now?', a: 'Access unlocks as approvals complete. If something still looks wrong, message the admin from the Chat tab.' },
]

export const DASHBOARD_FAQ: Record<string, FaqItem[]> = {
  student: [
    { q: 'When can I submit my project?', a: 'After your teacher approves you and you’ve logged your business interviews, the final project unlocks in the Activity tab.' },
    { q: 'What is my 8-digit code for?', a: 'It’s your unique student ID. Share it only with your parent/guardian so they can link to you.' },
    { q: 'How do points work?', a: 'You earn points from interviews and submissions, plus bonus points the admin awards when your project is approved.' },
    ...FAQ_SHARED,
  ],
  parent: [
    { q: 'Why is my dashboard locked?', a: 'It unlocks once your child confirms the link to you and their teacher approves it.' },
    { q: 'How do I link to my child?', a: 'Register using your child’s 8-digit student code. They confirm you, then the teacher approves.' },
    ...FAQ_SHARED,
  ],
  teacher: [
    { q: 'How do I approve a student?', a: 'In Approvals → Students, verify the student belongs to your school and click Approve. That activates their account.' },
    { q: 'How do parent approvals work?', a: 'Once a student confirms a parent, the parent appears in Approvals → Parent Approvals for you to approve or reject.' },
    { q: 'Can I see student project content?', a: 'No — project/interview content is reviewed by admin. You see counts and approval status only.' },
    ...FAQ_SHARED,
  ],
  school: [
    { q: 'What do I approve as principal?', a: 'You approve teachers who register under your school. Approved teachers then manage and approve their own students.' },
    { q: 'How does my school get on the leaderboard?', a: 'Your standing grows as your students complete interviews and submissions.' },
    ...FAQ_SHARED,
  ],
}

const SHARED_RULES = [
  'Use real, accurate information. False or misleading details can lead to removal.',
  'Be respectful and professional with everyone you interact with on the platform.',
  'You are not an employee or representative of the organization — you participate voluntarily.',
  'Keep your login private. You are responsible for activity on your account.',
  'Content you submit may be reviewed for participation, awards, and program purposes.',
  'Final Terms of Service & Privacy Policy may update these interim rules at any time.',
]

export const DASHBOARD_GUIDE: Record<string, RoleGuide> = {
  student: {
    welcome: 'Welcome to your Student dashboard. Here is how it works.',
    slides: [
      { title: 'Overview', intro: 'Your home base.', points: [
        'See your approval status and your next milestone at a glance.',
        'Once your teacher approves you, your account unlocks and you can start submitting.',
        'Your unique 8-digit student code lives here — share it only with your parent/guardian.',
      ] },
      { title: 'Confirm your parent', points: [
        'When a parent registers with your code, a "Parent Confirmation" card appears here.',
        'Confirm if it is really your parent/guardian, or reject if you don’t recognise them.',
        'After you confirm, your teacher gives the final approval.',
      ] },
      { title: 'Activity', intro: 'Where the work happens.', points: [
        'Log your business interviews — aim for 10 to unlock the final project.',
        'Submit your final project (problem, solution, video + written summary) to the admin.',
        'Admin reviews your project, scores it, and awards bonus points.',
      ] },
      { title: 'Rankings', points: [
        'Track your position on the school and teacher leaderboards.',
        'Points come from your interviews, submissions, and admin bonus points.',
      ] },
      { title: 'Alerts', points: [
        'All approvals, reviews, and updates show up here.',
        'Mark items as read once you have seen them.',
      ] },
    ],
    rules: [
      ...SHARED_RULES,
      'Business interviews are for educational research and challenge participation only.',
      'If you are under 18, your parent/guardian must approve your participation.',
    ],
  },

  parent: {
    welcome: 'Welcome. Your dashboard unlocks after your child confirms you and their teacher approves.',
    slides: [
      { title: 'Overview', points: [
        'See your linked child’s participation status and progress.',
        'Your access activates once the student confirms the link and the teacher approves it.',
      ] },
      { title: 'Profile', points: [
        'Review the student you are linked to and your relationship details.',
        'Your child’s participant ID is shown for reference.',
      ] },
      { title: 'Rankings', points: [
        'Follow your child’s position on the school and teacher leaderboards.',
      ] },
      { title: 'Alerts', points: [
        'Approvals and program updates about your child appear here.',
      ] },
    ],
    rules: [
      'You confirm you are the parent/legal guardian of the linked student.',
      'Participation is voluntary; your child is not employed by the organization.',
      ...SHARED_RULES,
    ],
  },

  teacher: {
    welcome: 'Welcome, educator. Here is how to manage your students and parents.',
    slides: [
      { title: 'Overview', points: [
        'See your assigned students and a snapshot of their progress.',
      ] },
      { title: 'Approvals → Students', intro: 'You are the approval gate for students.', points: [
        'Verify the student belongs to your school, then Approve (or Reject).',
        'Approving activates the student’s account so they can submit interviews and projects.',
      ] },
      { title: 'Approvals → Parent Approvals', points: [
        'After a student confirms a parent, that parent appears in this tab.',
        'Verify and Approve to unlock the parent’s dashboard (or Reject).',
      ] },
      { title: 'Records & Rankings', points: [
        'Browse student records, interviews, and submissions (counts only — not private content).',
        'See your students’ leaderboard standings.',
      ] },
      { title: 'Alerts', points: [
        'Confirmations, approvals, and program updates appear here.',
      ] },
    ],
    rules: [
      'You support students with guidance and approvals; participation is voluntary.',
      'Only approve students who genuinely belong to your school.',
      'Student project content is reviewed by admin — teachers see counts, not private content.',
      ...SHARED_RULES,
    ],
  },

  school: {
    welcome: 'Welcome, Principal. Here is your school control center.',
    slides: [
      { title: 'Overview', points: [
        'See your school’s overall participation and readiness at a glance.',
      ] },
      { title: 'Approvals → Teachers', intro: 'You approve teachers.', points: [
        'Verify and Approve teachers who register under your school.',
        'Approved teachers can then manage and approve their students.',
      ] },
      { title: 'Records & Rankings', points: [
        'Browse your school’s students, teachers, and submission counts.',
        'Track your school’s standing on the leaderboard.',
      ] },
      { title: 'Alerts', points: [
        'Registrations and approval activity for your school show here.',
      ] },
    ],
    rules: [
      'You act on behalf of your school and confirm interest in the challenge.',
      'Approve only teachers who genuinely represent your school.',
      'Student participation requires the appropriate permissions and approvals.',
      ...SHARED_RULES,
    ],
  },

  admin: {
    welcome: 'Welcome, Admin. Here is your platform control center.',
    slides: [
      { title: 'Data', points: [
        'View schools, students, parents, approvals, and submissions across the platform.',
      ] },
      { title: 'Reviews', intro: 'You review final projects.', points: [
        'Approve or reject student project submissions.',
        'Set scores and award bonus points (student and teacher).',
      ] },
      { title: 'Rankings & Alerts', points: [
        'Monitor global leaderboards and platform-wide notifications.',
      ] },
    ],
    rules: [
      'Handle participant data responsibly and only for program purposes.',
      'Approvals, scores, and bonus points are recorded against your account.',
      ...SHARED_RULES,
    ],
  },
}
