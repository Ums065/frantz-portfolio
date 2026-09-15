import type { RefObject } from 'react'

/* Questions to ask a business owner, offered where the student writes the
   visit up.

   They are suggestions, not a form: a student can take one, take the lot, or
   ignore them and write freely. Tapping one drops it into the notes with an
   empty answer line underneath and puts the cursor there, so the prompt turns
   straight into writing rather than something else to read.

   The list is also the answer to "what do I even ask?", which is the part of
   a first visit that stops a nervous student cold. */

export const INTERVIEW_QUESTIONS = [
  'What is the journey of your business?',
  'How did you get the idea to start this business?',
  'What was your motivation behind starting the business?',
  'What inspired you to choose this particular business?',
  'What makes your business different from others?',
  'What are the most popular products or services you offer?',
  'What do you enjoy most about running your business?',
  'What has been the biggest challenge you have faced so far?',
  'What is your vision for the future of your business?',
  'What advice would you give to someone who wants to start a similar business?',
]

/** Drop text into a textarea at the cursor, keeping undo and the caret sane. */
function insertInto(el: HTMLTextAreaElement | null, text: string) {
  if (!el) return
  /* Insert where the cursor is — but only if the cursor is really there. A
     textarea that has never been focused reports position 0, so a student who
     typed nothing yet, or who typed and then clicked away, would have the
     question pushed in above their notes instead of after them. */
  const focused = document.activeElement === el
  const start = focused ? (el.selectionStart ?? el.value.length) : el.value.length
  const end = focused ? (el.selectionEnd ?? el.value.length) : el.value.length
  const before = el.value.slice(0, start)
  const after = el.value.slice(end)
  // Leave a blank line between blocks, but never pile them up at the top.
  const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'

  el.focus()
  el.setSelectionRange(start, end) // focus can move the caret; put it back
  const payload = lead + text
  // execCommand keeps the browser's own undo stack, so a student can press
  // Ctrl+Z on an inserted question like on anything else they typed. Falling
  // back to setting value directly where it is not supported.
  let inserted = false
  try {
    inserted = document.execCommand('insertText', false, payload)
  } catch { inserted = false }
  if (!inserted) {
    el.value = before + payload + after
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  // Park the cursor on the empty answer line.
  const caret = before.length + payload.length
  el.setSelectionRange(caret, caret)
  el.scrollTop = el.scrollHeight
}

export default function InterviewQuestions({ targetRef }: { targetRef: RefObject<HTMLTextAreaElement | null> }) {
  const addOne = (q: string) => insertInto(targetRef.current, `Q: ${q}\nA: `)
  const addAll = () => insertInto(targetRef.current, INTERVIEW_QUESTIONS.map((q) => `Q: ${q}\nA: `).join('\n\n'))

  return (
    /* <details> rather than a state toggle: it opens and closes with the
       keyboard on its own, and works before any JavaScript has run. */
    <details className="ns-qbank">
      <summary>
        <span className="ns-qbank__title">Questions you can ask the owner</span>
        <span className="ns-qbank__count">{INTERVIEW_QUESTIONS.length}</span>
      </summary>
      <p className="ns-qbank__lead">
        Tap a question to drop it into <strong>Student Notes</strong> with a blank line for the answer.
        Use as many or as few as you like — your own questions count just as much.
      </p>
      <ol className="ns-qbank__list">
        {INTERVIEW_QUESTIONS.map((q) => (
          <li key={q}>
            <button type="button" onClick={() => addOne(q)} title="Add this question to your notes">
              <span>{q}</span>
              <em aria-hidden="true">+ Add</em>
            </button>
          </li>
        ))}
      </ol>
      <div className="ns-qbank__foot">
        <button type="button" className="btn btn--sm" onClick={addAll}>Add all {INTERVIEW_QUESTIONS.length} to my notes</button>
        <span>You still write the answers in your own words.</span>
      </div>
    </details>
  )
}
