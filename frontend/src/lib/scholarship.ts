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

export const SCHOLARSHIP_QUESTIONS: ScholarshipQuestion[] = [
  {
    key: 'deserve',
    question: 'Why should you receive this scholarship?',
    helper: 'Tell us what makes you a great choice in your own words.',
  },
  {
    key: 'story',
    question: 'What is your story?',
    helper: 'Tell us about yourself, your family, and where you come from.',
  },
  {
    key: 'goals',
    question: 'What are your dreams and goals?',
    helper: 'Share what you hope to do, and how this scholarship would help you get there.',
  },
  {
    key: 'problem',
    question: 'What problem in your community do you care about the most?',
    helper: 'Explain the problem and why it matters to you.',
  },
  {
    key: 'change',
    question: 'How will you use this challenge to make things better?',
    helper: 'Tell us how you want to help other people with what you learn.',
  },
]

export function countWords(text: string): number {
  const trimmed = (text || '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
