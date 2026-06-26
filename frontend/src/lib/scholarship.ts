// Scholarship intake questions. Each student answers these once, in order,
// before they can log interviews or submit their project. Plain, friendly
// wording for non-technical students. The 500-word limit is enforced both in
// the wizard and on the server (NS_SCHOLARSHIP_WORD_LIMIT).

export type ScholarshipQuestion = {
  key: string
  question: string
  helper: string
}

export const SCHOLARSHIP_WORD_LIMIT = 500
export const SCHOLARSHIP_WORD_MIN = 20

export const SCHOLARSHIP_QUESTIONS: ScholarshipQuestion[] = [
  {
    key: 'deserve',
    question: 'Why do you believe you deserve this scholarship?',
    helper: 'Tell us what makes you a great choice in your own words.',
  },
  {
    key: 'story',
    question: "What's your story?",
    helper: 'Tell us about yourself, your family, and where you come from.',
  },
  {
    key: 'goals',
    question: 'What are your biggest dreams and ambitions?',
    helper: 'Share what you hope to achieve in life.',
  },
  {
    key: 'problem',
    question: 'What change would you like to see in your community?',
    helper: 'Describe the change you care about and why it matters to you.',
  },
  {
    key: 'change',
    question: 'How will this scholarship help you achieve your goals?',
    helper: 'Tell us how this support would move you closer to your dreams.',
  },
]

export function countWords(text: string): number {
  const trimmed = (text || '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
