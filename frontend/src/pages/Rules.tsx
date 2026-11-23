import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useSeo } from '../hooks/useSeo'

/* The one Official Rules page. Every other surface (hero, role forms, FAQ, article,
   PDFs) links here instead of re-stating the rules. Dates come from the server's saved
   Challenge settings (new-school/overview), so changing the deadline in Admin changes
   this page too; the constants below are only the fallback while that loads. */

const FALLBACK = {
  deadline: '2027-03-31',
  winners: '2027-05-12',
  version: 'SIC-2026-11-23',
}

/** A bare YYYY-MM-DD is a calendar day, not a moment: read it as local so it never shifts a day. */
function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function Rules() {
  const [deadline, setDeadline] = useState(FALLBACK.deadline)
  const [winners, setWinners] = useState(FALLBACK.winners)
  const [version, setVersion] = useState(FALLBACK.version)

  useSeo({
    title: 'Official Rules',
    description: 'Student Impact Challenge official rules: who can enter (ages 10-20), what to submit, key dates, awards and how entries are judged.',
  })

  useEffect(() => {
    api.get<any>('new-school/overview')
      .then((d) => {
        const c = d?.challenge || {}
        if (c.deadline) setDeadline(String(c.deadline))
        if (c.winners_announced) setWinners(String(c.winners_announced))
        if (c.rules_version) setVersion(String(c.rules_version))
      })
      .catch(() => { /* fallback dates stay */ })
  }, [])

  return (
    <section className="block legal-page">
      <div className="wrap">
        <div className="legal-page__head reveal in">
          <span className="eyebrow">Student Impact Challenge</span>
          <h1>Official Rules</h1>
          <p className="legal-page__meta">Rules version {version} · Last updated November 23, 2026</p>
          <p className="legal-page__intro">
            “Leave It Better Than You Found It.” Interview 10 people from local businesses, public agencies, or community
            organizations. Use what you learn to choose one local problem and propose a solution. Submit your final video
            and written summary by {longDate(deadline)}.
          </p>
          <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn--solid" to="/register/student">Start as a Student</Link>
            <Link className="btn" to="/register/parent">Give Parent Consent</Link>
            <Link className="btn" to="/register/school">Register Your School</Link>
            <Link className="btn" to="/register/teacher">Join as an Educator</Link>
            <button className="btn" type="button" data-auth="login">Sign In</button>
          </p>
        </div>

        <div className="legal-page__body glass reveal in">
          <section className="legal-section">
            <h2>1. Key dates (Eastern Time)</h2>
            <ul>
              <li>Registration and final submissions close: <strong>{longDate(deadline)}, 11:59 PM Eastern Time</strong>. The last day counts in full.</li>
              <li>Judging: April 1 – April 30, 2027.</li>
              <li>Winners announced: <strong>{longDate(winners)}</strong>.</li>
              <li>Award ceremony: May 27, 2027.</li>
              <li>All times are New York time (America/New_York). The website, the countdown, receipts and the submission system all use that same clock.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>2. Who can enter</h2>
            <ul>
              <li>Students aged <strong>10 to 20</strong>, from elementary school through college. Age is worked out from the date of birth you give when you register.</li>
              <li><strong>Under 18:</strong> a parent or guardian must give consent (using the student ID or QR link) and the student needs their teacher’s approval.</li>
              <li><strong>Ages 18–20:</strong> you register on your own. No parent or guardian details are needed.</li>
              <li>Your school should be picked from the school list. If it isn’t listed, choose “School not listed? Register under TrendCatch EDU”. Our team reviews the school and sets it up, and a teacher is assigned after that review. Registering this way does not skip any approval.</li>
              <li>Teachers/educators and school leaders register separately and approve the students in their school.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. What counts as an entry</h2>
            <ul>
              <li><strong>10 interviews</strong> with people from local businesses, public agencies, or community organizations. Each one is logged in your dashboard (who, which organization, date).</li>
              <li><strong>One problem</strong> in your community that your interviews pointed to.</li>
              <li><strong>One solution</strong> that is practical and could make a measurable difference.</li>
              <li><strong>Final submission:</strong> a video of up to 1 minute 30 seconds and a one-page written summary covering the problem, your proposed solution and the expected impact. Both uploads are required. In the project form, each written answer (problem, why it matters, solution, how it helps, expected impact) must be 50 to 500 words.</li>
              <li>The final submission unlocks once your teacher has approved you and you have logged 10 interviews. Submitting twice does not create two entries.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Awards</h2>
            <p>Cash, scholarships and in-kind prizes are listed separately. Amounts are the totals split across the places shown.</p>
            <ul>
              <li><strong>Student scholarships ($10,000 total):</strong> 1st $5,000 · 2nd $3,000 · 3rd $2,000.</li>
              <li><strong>School impact grants ($25,000 total):</strong> 1st $15,000 · 2nd $7,500 · 3rd $2,500.</li>
              <li><strong>Educator award (in-kind):</strong> the 1st-place educator receives an all-expense vacation for two.</li>
              <li>Additional prizes and recognition may be announced by the organizer. Nothing is promised until it appears on this page.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>5. How entries are judged</h2>
            <ul>
              <li>Only verified entries are ranked: approved by a teacher, with 10 logged interviews and a complete submission.</li>
              <li>Each school’s top three entries go forward to the judges. Judges score every entry with a scoring rubric and the final ranking is reviewed by the organizer before winners are announced.</li>
              <li><strong>Final score</strong> = the entry’s automatic points (interviews, materials and submission) + any admin bonus + the average of the judges’ scores. Higher is better.</li>
              <li><strong>Ties</strong> are broken in this order: automatic points, then performance score, then number of interviews, then whether a final project was submitted, then name (A–Z).</li>
              <li>School and teacher boards rank by the number of submitted projects, then teacher-approved students, then number of students.</li>
              <li>Entries that break these rules (for example copied work, or interviews that were not done) can be disqualified.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>6. Your privacy</h2>
            <ul>
              <li>Public pages show totals and anonymous rankings only. Students’ names appear publicly only for announced winners.</li>
              <li>Taking part does not give permission to publish a student’s name, photo or video. Any publicity permission is separate and optional.</li>
              <li>Read the <Link to="/privacy">Privacy Notice</Link> and the <Link to="/terms">Terms of Use</Link>. To ask for your data to be corrected or removed, use the <Link to="/contact">contact page</Link>.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>7. Organizer</h2>
            <p>The Student Impact Challenge is run by TrendCatch Gives Back Inc. (a 501(c)(3) nonprofit), founded by Frantz Coutard. Questions: <Link to="/contact">contact us</Link>.</p>
          </section>
        </div>
      </div>
    </section>
  )
}
