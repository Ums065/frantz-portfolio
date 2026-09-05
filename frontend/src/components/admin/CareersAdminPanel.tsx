import { useCallback, useEffect, useState } from 'react'
import { api, type CareerApplication, type CareerJobAdmin } from '../../lib/api'
import Pager from '../Pager'

/* Admin side of the public careers board.

   Two things happen here: postings are reviewed (an admin's own post goes live
   immediately; a sponsor's or business's waits here), and applications are read
   and answered. Every status change emails the person it concerns, so nobody is
   left guessing — which means the mail worker cron has to be running. */

const TYPES = [
  ['full_time', 'Full time'], ['part_time', 'Part time'], ['contract', 'Contract'],
  ['internship', 'Internship'], ['volunteer', 'Volunteer'], ['freelance', 'Freelance'],
]
const MODES = [['onsite', 'On site'], ['remote', 'Remote'], ['hybrid', 'Hybrid']]
const APP_STATUSES = ['submitted', 'shortlisted', 'accepted', 'declined']

const emptyJob = {
  id: 0, org_name: '', title: '', employment_type: 'full_time', work_mode: 'onsite',
  location: '', compensation: '', summary: '', description: '', responsibilities: '',
  requirements: '', skills: '', min_age: 18, apply_deadline: '',
  questions: [] as { question: string; required: boolean }[],
}
type JobForm = typeof emptyJob

export default function CareersAdminPanel() {
  const [tab, setTab] = useState<'jobs' | 'applications'>('jobs')
  return (
    <div>
      <p className="msub" style={{ marginTop: 0 }}>
        The public jobs board at <code>/careers</code>. Anyone can read it; applying needs an
        account and an age of 18 or over. Postings you create here go live straight away —
        postings from a sponsor or business wait in <strong>Pending</strong> until you approve them.
      </p>
      <div className="admin-ov-tabs" style={{ margin: "14px 0 18px" }}>
        <button className={`admin-ov-tab${tab === "jobs" ? " is-active" : ""}`} onClick={() => setTab('jobs')}>Job postings</button>
        <button className={`admin-ov-tab${tab === "applications" ? " is-active" : ""}`} onClick={() => setTab('applications')}>Applications</button>
      </div>
      {tab === 'jobs' ? <JobsTab /> : <ApplicationsTab />}
    </div>
  )
}

/* ---------------- Postings ---------------- */

function JobsTab() {
  const [rows, setRows] = useState<CareerJobAdmin[]>([])
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<JobForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const per = 20

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), per: String(per) })
    if (status) p.set('status', status)
    if (q.trim()) p.set('q', q.trim())
    api.get<{ jobs: CareerJobAdmin[]; total: number; counts: { status: string; n: number }[] }>(`admin/careers/jobs?${p}`)
      .then((d) => { setRows(d.jobs || []); setTotal(d.total || 0); setCounts(d.counts || []) })
      .catch(() => setRows([]))
  }, [page, status, q])
  useEffect(() => { const t = setTimeout(load, q.trim() ? 300 : 0); return () => clearTimeout(t) }, [load, q])

  const review = async (id: number, decision: string) => {
    let reason = ''
    if (decision === 'declined') {
      reason = window.prompt('Tell the poster why (they receive this by email):') || ''
      if (!reason.trim()) return
    }
    await api.put(`admin/careers/job/${id}/review`, { status: decision, reason })
    window.fcToast?.(`Job ${decision}.`)
    load()
  }
  const remove = async (id: number) => {
    if (!confirm('Delete this posting AND every application to it? This cannot be undone.')) return
    await api.del(`admin/careers/job/${id}`)
    load()
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`careers/job/${editing.id}`, editing)
      else await api.post('admin/careers/job', editing)
      setEditing(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') } finally { setBusy(false) }
  }

  const countOf = (s: string) => counts.find((c) => c.status === s)?.n ?? 0
  const pending = countOf('pending')

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="blog-cats">
          {['', 'pending', 'approved', 'declined', 'closed'].map((s) => (
            <button key={s || 'all'} type="button"
              className={`blog-cat${status === s ? ' is-active' : ''}`}
              onClick={() => { setStatus(s); setPage(1) }}>
              {s === '' ? 'All' : s[0].toUpperCase() + s.slice(1)} <em>{s === '' ? total : countOf(s)}</em>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="blog-search" type="search" value={q} placeholder="Search title or organisation…"
            onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyJob })}>+ Post a Job</button>
        </div>
      </div>

      {pending > 0 && status !== 'pending' && (
        <p className="msub" style={{ color: 'var(--gold-light)' }}>
          {pending} posting{pending === 1 ? '' : 's'} waiting for your review.
        </p>
      )}

      <div className="career-admin-list">
        {rows.map((j) => (
          <div className="glass career-admin-row" key={j.id}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="career-card__top">
                <span className={`career-tag career-tag--${j.status}`}>{j.status}</span>
                <span className="career-tag career-tag--soft">{TYPES.find((t) => t[0] === j.employment_type)?.[1] || j.employment_type}</span>
                {j.closed && <span className="career-tag career-tag--closed">closed</span>}
              </div>
              <strong style={{ display: 'block', marginTop: 6 }}>{j.title}</strong>
              <span className="msub">
                {j.org_name}
                {j.poster_name ? ` · posted by ${j.poster_name} (${j.poster_role})` : ' · posted by admin'}
                {j.location ? ` · ${j.location}` : ''}
              </span>
              {j.decline_reason && <div className="msub" style={{ color: '#e08a8a' }}>Declined: {j.decline_reason}</div>}
            </div>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <strong style={{ fontSize: 18 }}>{j.applications}</strong>
              <div className="msub">applications{j.new_applications ? ` · ${j.new_applications} new` : ''}</div>
              <div className="msub">{j.views} views</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {j.status === 'pending' && <button className="btn btn--sm btn--solid" onClick={() => review(j.id, 'approved')}>Approve</button>}
              {j.status === 'pending' && <button className="btn btn--sm" onClick={() => review(j.id, 'declined')}>Decline</button>}
              {j.status === 'approved' && <button className="btn btn--sm" onClick={() => review(j.id, 'closed')}>Close</button>}
              {j.status === 'closed' && <button className="btn btn--sm" onClick={() => review(j.id, 'approved')}>Reopen</button>}
              <button className="btn btn--sm" onClick={() => setEditing({
                id: j.id, org_name: j.org_name, title: j.title, employment_type: j.employment_type,
                work_mode: j.work_mode, location: j.location || '', compensation: j.compensation || '',
                summary: j.summary || '', description: j.description || '', responsibilities: j.responsibilities || '',
                requirements: j.requirements || '', skills: j.skills || '', min_age: j.min_age,
                apply_deadline: j.apply_deadline || '', questions: j.questions || [],
              })}>Edit</button>
              <button className="btn btn--sm" style={{ borderColor: '#7a3b3b', color: '#e08a8a' }} onClick={() => remove(j.id)}>Delete</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="msub">No postings here yet.</p>}
      </div>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / per))} total={total} unit="postings" onPage={setPage} />

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editing.id ? 'Edit posting' : 'Post a job'}</h3>
            <JobFields job={editing} onChange={(patch) => setEditing((j) => (j ? { ...j, ...patch } : j))} />
            {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn--solid" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** The posting form. Shared with the sponsor/business side so both sides ask
 *  for exactly the same things. */
export function JobFields({ job, onChange }: { job: JobForm; onChange: (patch: Partial<JobForm>) => void }) {
  const setQ = (i: number, patch: Partial<{ question: string; required: boolean }>) =>
    onChange({ questions: job.questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) })

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '2 1 260px' }}><label>Role title</label>
          <input type="text" required value={job.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Community Programs Coordinator" /></div>
        <div className="field" style={{ flex: '1 1 200px' }}><label>Organisation</label>
          <input type="text" value={job.org_name} onChange={(e) => onChange({ org_name: e.target.value })} placeholder="Who is hiring" /></div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 150px' }}><label>Type</label>
          <select value={job.employment_type} onChange={(e) => onChange({ employment_type: e.target.value })}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="field" style={{ flex: '1 1 150px' }}><label>Where</label>
          <select value={job.work_mode} onChange={(e) => onChange({ work_mode: e.target.value })}>
            {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="field" style={{ flex: '1 1 150px' }}><label>Location</label>
          <input type="text" value={job.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="Brooklyn, NY" /></div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 180px' }}><label>Pay / stipend</label>
          <input type="text" value={job.compensation} onChange={(e) => onChange({ compensation: e.target.value })} placeholder="$22-26/hr, or Unpaid" /></div>
        <div className="field" style={{ flex: '1 1 120px' }}><label>Minimum age</label>
          <input type="number" min={18} max={75} value={job.min_age} onChange={(e) => onChange({ min_age: Number(e.target.value) })} />
          <span className="field-hint">18 is the floor on this board — younger opportunities belong in the student dashboard.</span></div>
        <div className="field" style={{ flex: '1 1 160px' }}><label>Applications close</label>
          <input type="date" value={job.apply_deadline} onChange={(e) => onChange({ apply_deadline: e.target.value })} />
          <span className="field-hint">Optional. After this date it drops off the board.</span></div>
      </div>
      <div className="field"><label>One-line summary</label>
        <input type="text" maxLength={400} value={job.summary} onChange={(e) => onChange({ summary: e.target.value })} placeholder="Shown on the card, before anyone clicks." /></div>
      <div className="field"><label>About the role</label>
        <textarea className="fld-area" style={{ minHeight: 120 }} value={job.description} onChange={(e) => onChange({ description: e.target.value })} /></div>
      <div className="field"><label>What they would do</label>
        <textarea className="fld-area" value={job.responsibilities} onChange={(e) => onChange({ responsibilities: e.target.value })} placeholder="One per line." /></div>
      <div className="field"><label>What you are looking for</label>
        <textarea className="fld-area" value={job.requirements} onChange={(e) => onChange({ requirements: e.target.value })} placeholder="One per line." /></div>
      <div className="field"><label>Skills (comma separated)</label>
        <input type="text" value={job.skills} onChange={(e) => onChange({ skills: e.target.value })} placeholder="Outreach, Google Workspace, Public speaking" /></div>

      <div className="field">
        <label>Application questions</label>
        <span className="field-hint">Up to 8. Keep them short — a long form loses good applicants.</span>
        {job.questions.map((qq, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input type="text" style={{ flex: 1 }} value={qq.question} onChange={(e) => setQ(i, { question: e.target.value })} />
            <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={qq.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> required
            </label>
            <button className="btn btn--sm" type="button" onClick={() => onChange({ questions: job.questions.filter((_, k) => k !== i) })}>Remove</button>
          </div>
        ))}
        {job.questions.length < 8 && (
          <button className="btn btn--sm" type="button" style={{ marginTop: 8 }}
            onClick={() => onChange({ questions: [...job.questions, { question: '', required: true }] })}>+ Add question</button>
        )}
      </div>
    </>
  )
}

/* ---------------- Applications ---------------- */

function ApplicationsTab() {
  const [rows, setRows] = useState<CareerApplication[]>([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState<CareerApplication | null>(null)
  const per = 20

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), per: String(per) })
    if (status) p.set('status', status)
    if (q.trim()) p.set('q', q.trim())
    api.get<{ applications: CareerApplication[]; total: number }>(`admin/careers/applications?${p}`)
      .then((d) => { setRows(d.applications || []); setTotal(d.total || 0) })
      .catch(() => setRows([]))
  }, [page, status, q])
  useEffect(() => { const t = setTimeout(load, q.trim() ? 300 : 0); return () => clearTimeout(t) }, [load, q])

  const mark = async (id: number, next: string) => {
    // Cancel must cancel. This used to send the decision (and the email) anyway,
    // because a cancelled prompt returns null and null coalesced to "no note".
    const note = window.prompt(`Mark this application ${next}? Add a note for the applicant if you want one — it goes in the email.`)
    if (note === null) return
    await api.post(`careers/application/${id}/status`, { status: next, note })
    window.fcToast?.(`Marked ${next}.`)
    setOpen(null); load()
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="blog-cats">
          {['', ...APP_STATUSES].map((s) => (
            <button key={s || 'all'} type="button" className={`blog-cat${status === s ? ' is-active' : ''}`}
              onClick={() => { setStatus(s); setPage(1) }}>
              {s === '' ? 'All' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <input className="blog-search" type="search" value={q} placeholder="Search name or email…"
          onChange={(e) => { setQ(e.target.value); setPage(1) }} />
      </div>

      <div className="career-admin-list">
        {rows.map((a) => (
          <div className="glass career-admin-row" key={a.id}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span className={`career-tag career-tag--${a.status}`}>{a.status}</span>
              <strong style={{ display: 'block', marginTop: 6 }}>{a.full_name}</strong>
              <span className="msub">{a.job_title} · {a.org_name}</span>
              <div className="msub">{a.email}{a.phone ? ` · ${a.phone}` : ''}{a.age_at_apply ? ` · ${a.age_at_apply}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn--sm" onClick={() => setOpen(a)}>Read</button>
              {a.resume_url && <a className="btn btn--sm" href={a.resume_url} target="_blank" rel="noreferrer">CV</a>}
              {a.status === 'submitted' && <button className="btn btn--sm" onClick={() => mark(a.id, 'shortlisted')}>Shortlist</button>}
              {a.status !== 'accepted' && <button className="btn btn--sm btn--solid" onClick={() => mark(a.id, 'accepted')}>Accept</button>}
              {a.status !== 'declined' && <button className="btn btn--sm" style={{ borderColor: '#7a3b3b', color: '#e08a8a' }} onClick={() => mark(a.id, 'declined')}>Decline</button>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="msub">No applications yet.</p>}
      </div>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / per))} total={total} unit="applications" onPage={setPage} />

      {open && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <button type="button" className="close" onClick={() => setOpen(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text" style={{ marginBottom: 2 }}>{open.full_name}</h3>
            <p className="msub">Applied for {open.job_title} · {open.org_name}</p>
            <p className="msub">
              {open.email}{open.phone ? ` · ${open.phone}` : ''}{open.location ? ` · ${open.location}` : ''}
              {open.age_at_apply ? ` · age ${open.age_at_apply}` : ''}
            </p>
            {open.cover_note && <><h4 className="career-h4">Their note</h4><p className="career-prose">{open.cover_note}</p></>}
            {open.answers.map((a, i) => (
              <div key={i}><h4 className="career-h4">{a.question}</h4><p className="career-prose">{a.answer || '—'}</p></div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {open.resume_url && <a className="btn btn--sm" href={open.resume_url} target="_blank" rel="noreferrer">Open CV</a>}
              {open.portfolio_url && <a className="btn btn--sm" href={open.portfolio_url} target="_blank" rel="noreferrer">Portfolio</a>}
              <button className="btn btn--sm" onClick={() => mark(open.id, 'shortlisted')}>Shortlist</button>
              <button className="btn btn--sm btn--solid" onClick={() => mark(open.id, 'accepted')}>Accept</button>
              <button className="btn btn--sm" style={{ borderColor: '#7a3b3b', color: '#e08a8a' }} onClick={() => mark(open.id, 'declined')}>Decline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
