import { useMemo, useState } from 'react'
import { SCHOLARSHIP_QUESTIONS, SCHOLARSHIP_WORD_LIMIT, SCHOLARSHIP_WORD_MIN, countWords, type ScholarshipQuestion } from '../lib/scholarship'

export type ScholarshipAnswer = { key: string; question: string; answer: string }

type Props = {
  initialAnswers?: ScholarshipAnswer[]
  busy?: boolean
  onComplete: (answers: ScholarshipAnswer[]) => void
}

// One-question-at-a-time scholarship intake. The next question only appears
// after the current one is answered (within the word limit).
export default function ScholarshipWizard({ initialAnswers = [], busy = false, onComplete }: Props) {
  const questions = SCHOLARSHIP_QUESTIONS
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const q of questions) {
      seed[q.key] = initialAnswers.find((a) => a.key === q.key)?.answer || ''
    }
    return seed
  })

  const current: ScholarshipQuestion = questions[step]
  const value = values[current.key] || ''
  const words = useMemo(() => countWords(value), [value])
  const overLimit = words > SCHOLARSHIP_WORD_LIMIT
  const underMin = words < SCHOLARSHIP_WORD_MIN
  const canAdvance = !underMin && !overLimit
  const isLast = step === questions.length - 1

  const setValue = (text: string) => setValues((prev) => ({ ...prev, [current.key]: text }))

  const finish = () => {
    if (!canAdvance) return
    const answers: ScholarshipAnswer[] = questions.map((q) => ({
      key: q.key,
      question: q.question,
      answer: (values[q.key] || '').trim(),
    }))
    onComplete(answers)
  }

  return (
    <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-scholar">
      <div className="ns-dash-card__head">
        <span className="eyebrow">Scholarship Questions</span>
        <span className="ns-board__badge">Step {step + 1} of {questions.length}</span>
      </div>

      <p className="ns-scholar__intro">
        Before you start your work, please answer a few questions. Your answers go to the
        admin team and are shown with every interview and project you submit. Answer one
        question at a time — the next one appears after you finish.
      </p>

      <div className="ns-scholar__progress" aria-hidden="true">
        {questions.map((q, i) => (
          <span key={q.key} className={`ns-scholar__dot ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`} />
        ))}
      </div>

      <div className="ns-scholar__q">
        <h3>{current.question}</h3>
        <p>{current.helper}</p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={7}
          placeholder="Type your answer here…"
          autoFocus
        />
        <div className={`ns-scholar__count ${overLimit || underMin ? 'is-over' : ''}`}>
          {words} words (min {SCHOLARSHIP_WORD_MIN}, max {SCHOLARSHIP_WORD_LIMIT})
          {underMin && <span> — please write at least {SCHOLARSHIP_WORD_MIN} words.</span>}
          {overLimit && <span> — please shorten your answer.</span>}
        </div>
      </div>

      <div className="ns-scholar__nav">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || busy}
        >
          Previous
        </button>
        {isLast ? (
          <button type="button" className="btn btn--solid" onClick={finish} disabled={!canAdvance || busy}>
            {busy ? 'Saving…' : 'Finish & Submit'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--solid"
            onClick={() => canAdvance && setStep((s) => Math.min(questions.length - 1, s + 1))}
            disabled={!canAdvance || busy}
          >
            Next Question
          </button>
        )}
      </div>
    </article>
  )
}
