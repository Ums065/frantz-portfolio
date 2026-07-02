/* Judge reference content — condensed from the Official Judge's Handbook
   (Leave It Better Than You Found It NY Student Summer Challenge, Sections 1-18).
   Shown inside the Judge dashboard so judges can look up any rule at any time. */

export interface HandbookSection {
  title: string
  points: string[]
}

export const HANDBOOK_SECTIONS: HandbookSection[] = [
  {
    title: 'Your Role & Core Principle',
    points: [
      'Review each submission fairly, independently, and consistently using only the Official Scoring Rubric.',
      'Every student deserves a fair opportunity — judge the work, not the student’s school, background, popularity, or connections.',
      'The founder (Frantz Coutard) does not select winners; winners come from independent judging + score certification.',
      'You may review written reports, video presentations, business interview forms, problem statements, solutions, supporting photos/materials, and community impact.',
    ],
  },
  {
    title: 'Code of Ethics & Professional Standards',
    points: [
      'Fairness: evaluate using only the official rubric; no personal opinions or outside influence.',
      'Impartiality: never let name, school, race, religion, gender, politics, sponsors, or popularity affect a score.',
      'Independence: do not compare scores with other judges or try to influence another judge during scoring.',
      'Never accept gifts/favors, promise awards, or alter scores for improper reasons.',
      'Treat every participant with respect; comments must be professional and about the work.',
    ],
  },
  {
    title: 'Conflict of Interest & Recusal',
    points: [
      'Disclose any family, educational, business, financial, personal, or sponsor relationship that could affect impartiality.',
      'If a conflict exists (or even appears to): notify administration and recuse — do not review, discuss, or score that submission.',
      'Use the “Recuse” button on a submission to remove it from your queue and alert administration.',
      'When in doubt, disclose.',
    ],
  },
  {
    title: 'Confidentiality',
    points: [
      'All submissions are confidential: student names, schools, videos, reports, business info, photos, ideas, scores, and rankings.',
      'Do not photograph/screenshot submissions or post any competition content on social media.',
      'Do not contact students, parents, teachers, schools, businesses, or sponsors — all communication goes through administration.',
      'Confidentiality continues even after judging concludes and winners are announced.',
    ],
  },
  {
    title: 'Judging Procedure (Step by Step)',
    points: [
      '1. Open the assigned submission and review it in full before scoring.',
      '2. Verify required documentation is present (business name, interview date, phone, owner signature, problem, solution).',
      '3. Review the written report, watch the video, and review supporting evidence (photos, business card, screenshots, flyers).',
      '4. Complete the scorecard across all six categories.',
      '5. Add optional professional comments focused on the work.',
      '6. Review all categories, then submit — this certifies you reviewed independently and fairly.',
      'Eligibility decisions are administrative — not the judge’s responsibility.',
    ],
  },
  {
    title: 'Scoring Philosophy',
    points: [
      'Evaluate the quality of thinking, not production budget — a simple presentation with a great idea can outscore a polished one with weak ideas.',
      'Reward practical, realistic solutions that could genuinely help the business.',
      'Innovation is not only technology — creative marketing, partnerships, sustainability, and operations count.',
      'Community impact matters: consider benefit beyond the single business.',
      'Recognize original thinking and genuine student effort.',
    ],
  },
  {
    title: 'Official Scoring Rubric (135 total)',
    points: [
      'Problem Identification — 20: real, clearly explained problem with understanding & evidence. (17-20 excellent, 13-16 good, 8-12 average, 0-7 needs work)',
      'Quality of Solution — 50 (most weighted): practicality, feasibility, cost, business value, sustainability. (45-50 outstanding, 35-44 very good, 25-34 good, 0-24 needs work)',
      'Creativity & Innovation — 20: originality, fresh ideas, new approaches. (17-20 exceptional, 13-16 very creative, 8-12 some, 0-7 little)',
      'Supporting Evidence — 10: business card, signature, photos, screenshots, research. (9-10 excellent, 7-8 good, 4-6 limited, 0-3 very little)',
      'Community Impact — 20: benefit to customers, employees, neighborhood, economy, environment. (17-20 exceptional, 13-16 strong, 8-12 moderate, 0-7 limited)',
      'Presentation — 15: organization, professionalism, communication, confidence, clarity. (13-15 outstanding, 10-12 very good, 6-9 adequate, 0-5 needs work)',
    ],
  },
  {
    title: 'Business Interview Verification',
    points: [
      'Confirm the interview includes: business name, interview date, phone number, owner/manager signature, a clear problem, and student recommendations.',
      'The owner signature confirms only that the interview happened and was voluntary — not that they endorse the ideas.',
      'Judges do NOT contact businesses or investigate independently — business verification is done by administration.',
      'If documentation looks incomplete or questionable, report it and keep reviewing objectively.',
    ],
  },
  {
    title: 'Integrity & Fraud',
    points: [
      'If you suspect forged signatures, fabricated interviews, plagiarism, false info, or AI misuse: document it, report through the dashboard, keep confidentiality, and continue evaluating objectively.',
      'Do not investigate on your own or make assumptions.',
      'AI may be used as permitted — evaluate the student’s own thinking, understanding, and creativity; AI should support, not replace, their ideas.',
    ],
  },
  {
    title: 'Tie-Breaking & Winners',
    points: [
      'Final Competition Score = Automatic Dashboard Points + Average Judge Score.',
      'Ties break in order: Quality of Solution → Community Impact → Creativity & Innovation → Problem Identification → Presentation.',
      'Judges’ scoring decisions are final unless a documented administrative error affected scoring.',
      'Results stay confidential until officially announced.',
    ],
  },
]

export interface FaqItem {
  q: string
  a: string
}

export const JUDGE_FAQ: FaqItem[] = [
  { q: 'What is my primary responsibility?', a: 'Evaluate each assigned submission fairly, independently, and consistently using the Official Scoring Rubric. Eligibility and administration are handled by Competition Administration.' },
  { q: 'Should I score every project the same way?', a: 'Yes. Every participant is evaluated with the same rubric regardless of school, neighborhood, age, gender, race, religion, background, or presentation style.' },
  { q: 'May I contact a student?', a: 'No. Judges must not contact students, parents, teachers, schools, businesses, or sponsors. All communication goes through Competition Administration.' },
  { q: 'May I contact a business to verify an interview?', a: 'No. Business verification is handled exclusively by Competition Administration.' },
  { q: 'What if documentation is missing?', a: 'Continue reviewing based on the materials provided, note the concern, report it through the dashboard, and follow official procedures. Eligibility decisions are administrative.' },
  { q: 'What if I suspect fraud?', a: 'Document the concern, report it to administration, maintain confidentiality, and continue evaluating objectively. Do not investigate independently.' },
  { q: 'What if I know a student?', a: 'Immediately disclose the relationship and recuse — do not score the submission until guidance is provided.' },
  { q: 'What if I open a project assigned to another judge?', a: 'Close it immediately and notify administration if necessary.' },
  { q: 'What if technical issues occur?', a: 'Save your work if possible, contact Competition Administration, and complete the evaluation as soon as practical.' },
  { q: 'Can I change my score after submitting?', a: 'Generally scores become final. If you entered a score in error, notify administration immediately.' },
  { q: 'Should I reward expensive presentations?', a: 'No. The competition recognizes ideas, not financial resources. Production value should not replace substance.' },
  { q: 'How should I evaluate AI-assisted work?', a: 'Students may use AI as permitted. Evaluate original thinking, understanding, practicality, and creativity. AI should support, not replace, the student’s ideas.' },
  { q: 'What if I disagree with another judge?', a: 'Differences in scoring are expected. Judges evaluate independently and should not discuss individual scores during judging.' },
  { q: 'What if I cannot complete assignments?', a: 'Notify Competition Administration as soon as possible.' },
  { q: 'Can I discuss submissions after the competition?', a: 'No, unless authorized. Competition materials remain confidential.' },
  { q: 'Can I mentor a participant?', a: 'Avoid mentoring participants whose work you may evaluate. Disclose any mentoring relationship.' },
  { q: 'What if a project deserves special recognition?', a: 'You may recommend special recognition through administration. Recommendations are advisory.' },
  { q: 'Can sponsors influence judging?', a: 'No. Sponsors provide support but do not influence outcomes.' },
  { q: 'Who selects winners?', a: 'Winners are determined through independent judging, official scoring, administrative verification, and final score certification. The founder does not personally select winners.' },
  { q: 'What should I remember above everything else?', a: 'Every submission represents a student who stepped beyond the classroom to engage with real businesses and community challenges. Judge fairly, consistently, and professionally.' },
]

export const JUDGE_SUPPORT = { site: 'FrantzCoutard.com', email: 'info@frantzcoutard.com', phone: '516-697-6962' }
