import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import OfferChat from './OfferChat'

/* Sponsor-side job management: post a job (advanced, up to 12 questions, min-age
   gate) + manage the applications that come in. A posted job goes to the admin
   for approval, then becomes visible globally to eligible students. Accepting an
   application shares the résumé and opens a 1:1 chat (reusing OfferChat). */

const MAX_QUESTIONS = 12

export interface SponsorJob {
  id: number
  title: string
  description: string
  location: string
  stipend: string
  skills: string
  min_age: number
  attachment_url: string
  status: 'pending' | 'approved' | 'declined' | 'closed'
  admin_note: string
  questions: { key: string; question: string }[]
  app_count?: number
  app_new?: number
  created_ts: number
}

interface JobApplication {
  id: number
  job_id: number
  job_title: string
  student_name: string
  school_name: string
  answers: { key: string; question: string; answer: string }[]
  resume_url: string
  status: 'submitted' | 'accepted' | 'declined'
  decline_reason: string
  awaiting_parent?: boolean
  unread: number
  created_ts: number
}

const STATUS_TINT: Record<string, string> = {
  pending: 'rgba(212,175,90,0.16)', approved: 'rgba(120,200,140,0.18)',
  declined: 'rgba(220,130,130,0.18)', closed: 'rgba(160,160,160,0.15)',
  submitted: 'rgba(120,180,255,0.16)', accepted: 'rgba(120,200,140,0.18)',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting approval', approved: 'Live', declined: 'Not approved', closed: 'Closed',
  submitted: 'New', accepted: 'Accepted',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 10px', color: 'var(--ivory)', background: STATUS_TINT[status] || 'rgba(255,255,255,0.08)', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

const fmt = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const isImage = (u: string) => /\.(png|jpe?g|webp|gif)$/i.test(u)

/* ------------------------- Post a Job ------------------------- */
export function PostJobPanel({ jobs, reload }: { jobs: SponsorJob[]; reload: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [stipend, setStipend] = useState('')
  const [skills, setSkills] = useState('')
  const [minAge, setMinAge] = useState(12)
  const [questions, setQuestions] = useState<string[]>([''])
  const [attachUrl, setAttachUrl] = useState('')
  const [attachName, setAttachName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  const setQ = (i: number, v: string) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? v : q)))
  const addQ = () => setQuestions((qs) => (qs.length < MAX_QUESTIONS ? [...qs, ''] : qs))
  const removeQ = (i: number) => setQuestions((qs) => (qs.length > 1 ? qs.filter((_, idx) => idx !== i) : qs))

  const pickFile = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const { url } = await api.upload<{ url: string }>('new-school/upload', file)
      setAttachUrl(url); setAttachName(file.name)
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not attach the file.') } finally { setUploading(false) }
  }

  const post = async () => {
    if (!title.trim() || !description.trim() || busy) return
    setBusy(true)
    try {
      const qs = questions.map((q) => ({ question: q.trim() })).filter((q) => q.question !== '')
      await api.post('ecosystem/sponsor/jobs', { title, description, location, stipend, skills, min_age: minAge, questions: qs, attachment_url: attachUrl })
      window.fcToast?.('Job submitted — the team will review it shortly.')
      setTitle(''); setDescription(''); setLocation(''); setStipend(''); setSkills(''); setMinAge(12); setQuestions(['']); setAttachUrl(''); setAttachName('')
      reload()
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not post the job.') } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', color: 'var(--ivory)', fontSize: 14, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--muted)', margin: '0 0 5px', fontWeight: 600 }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={lbl}>Job title *</label>
          <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Social Media Intern" />
        </div>
        <div>
          <label style={lbl}>Description *</label>
          <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the role involves, what you're looking for…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 12 }}>
          <div><label style={lbl}>Location</label><input style={inp} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote / NYC…" /></div>
          <div><label style={lbl}>Stipend / pay</label><input style={inp} value={stipend} onChange={(e) => setStipend(e.target.value)} placeholder="$15/hr, unpaid…" /></div>
          <div>
            <label style={lbl}>Minimum age</label>
            <input style={inp} type="number" min={12} max={99} value={minAge} onChange={(e) => setMinAge(Math.max(12, Math.min(99, Number(e.target.value) || 12)))} />
          </div>
        </div>
        <div>
          <label style={lbl}>Skills (comma separated)</label>
          <input style={inp} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Writing, Canva, teamwork…" />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ color: 'var(--gold-light)', fontSize: 13.5 }}>Application questions</strong>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{questions.length}/{MAX_QUESTIONS} · applicants answer each in ≤200 words</span>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {questions.map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: 13, width: 20, textAlign: 'right' }}>{i + 1}.</span>
              <input style={{ ...inp, flex: 1 }} value={q} onChange={(e) => setQ(i, e.target.value)} placeholder={`Question ${i + 1}`} />
              <button type="button" onClick={() => removeQ(i)} disabled={questions.length === 1} title="Remove" style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--muted)', cursor: questions.length === 1 ? 'default' : 'pointer', padding: '8px 11px', opacity: questions.length === 1 ? 0.4 : 1 }}>✕</button>
            </div>
          ))}
        </div>
        {questions.length < MAX_QUESTIONS && (
          <button type="button" className="btn btn--sm" style={{ marginTop: 10 }} onClick={addQ}>+ Add question</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="btn btn--sm" style={{ cursor: uploading ? 'default' : 'pointer' }}>
          {uploading ? '…' : attachName ? `📎 ${attachName}` : '📎 Attach flyer / JD (optional)'}
          <input type="file" accept="image/*,.pdf,.doc,.docx" hidden disabled={uploading} onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
        {attachName && <button type="button" onClick={() => { setAttachUrl(''); setAttachName('') }} style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer' }}>Remove</button>}
        <button className="btn btn--solid" style={{ marginLeft: 'auto' }} disabled={busy || !title.trim() || !description.trim()} onClick={() => void post()}>{busy ? 'Posting…' : 'Post job for approval'}</button>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <strong style={{ color: 'var(--gold-light)', fontSize: 13.5 }}>Your posted jobs</strong>
        {jobs.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>You haven't posted any jobs yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {jobs.map((j) => <PostedJobRow key={j.id} job={j} reload={reload} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function PostedJobRow({ job, reload }: { job: SponsorJob; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try {
      await api.post(`ecosystem/sponsor/job/${job.id}/status`, { status: job.status === 'approved' ? 'closed' : 'approved' })
      window.fcToast?.(job.status === 'approved' ? 'Job closed.' : 'Job reopened.')
      reload()
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not update the job.') } finally { setBusy(false) }
  }
  return (
    <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--ivory)', fontSize: 14.5, minWidth: 0, overflowWrap: 'anywhere' }}>{job.title}</strong>
        <StatusPill status={job.status} />
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 5 }}>
        Min age {job.min_age} · {job.questions.length} question{job.questions.length === 1 ? '' : 's'} · {job.app_count || 0} application{(job.app_count || 0) === 1 ? '' : 's'}
        {(job.app_new || 0) > 0 && <span style={{ color: 'var(--gold-light)', fontWeight: 700 }}> · {job.app_new} new</span>}
        {' · '}{fmt(job.created_ts)}
      </div>
      {job.status === 'declined' && job.admin_note && <p style={{ color: '#e0a0a0', fontSize: 12.5, margin: '8px 0 0' }}>Reason: {job.admin_note}</p>}
      {(job.status === 'approved' || job.status === 'closed') && (
        <button className="btn btn--sm" style={{ marginTop: 10 }} disabled={busy} onClick={() => void toggle()}>
          {busy ? '…' : job.status === 'approved' ? 'Close job' : 'Reopen job'}
        </button>
      )}
    </div>
  )
}

/* ------------------------- Applications ------------------------- */
export function ApplicationsPanel({ jobs }: { jobs: SponsorJob[] }) {
  const approved = jobs.filter((j) => j.status === 'approved' || j.status === 'closed')
  const [jobId, setJobId] = useState<number>(approved[0]?.id || 0)
  const [apps, setApps] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(false)

  // When jobs arrive (or the selected job disappears), fall back to the first
  // approved job so the panel never sits on an invalid/0 selection.
  useEffect(() => {
    if (approved.length === 0) { if (jobId !== 0) setJobId(0); return }
    if (!approved.some((j) => j.id === jobId)) setJobId(approved[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs])

  useEffect(() => {
    if (!jobId) { setApps([]); return }
    let alive = true
    setLoading(true)
    api.get<{ applications: JobApplication[] }>(`ecosystem/sponsor/job/${jobId}/applications`)
      .then((d) => { if (alive) setApps(Array.isArray(d.applications) ? d.applications : []) })
      .catch(() => { if (alive) setApps([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [jobId])

  const reloadApps = () => {
    if (!jobId) return
    api.get<{ applications: JobApplication[] }>(`ecosystem/sponsor/job/${jobId}/applications`)
      .then((d) => setApps(Array.isArray(d.applications) ? d.applications : [])).catch(() => { /* silent */ })
  }

  if (approved.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Post and get a job approved to start receiving applications.</p>
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Job:</label>
        <select value={jobId} onChange={(e) => setJobId(Number(e.target.value))} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', color: 'var(--ivory)', fontSize: 14, maxWidth: '100%' }}>
          {approved.map((j) => <option key={j.id} value={j.id}>{j.title} ({j.app_count || 0})</option>)}
        </select>
      </div>
      {loading ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>
        : apps.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No applications yet for this job.</p>
          : <div style={{ display: 'grid', gap: 12 }}>{apps.map((a) => <ApplicationCard key={a.id} app={a} reload={reloadApps} />)}</div>}
    </div>
  )
}

function ApplicationCard({ app, reload }: { app: JobApplication; reload: () => void }) {
  const [busy, setBusy] = useState('')
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')

  const respond = async (decision: 'accept' | 'decline', why = '') => {
    setBusy(decision)
    try {
      await api.post(`ecosystem/sponsor/application/${app.id}/respond`, { decision, reason: why })
      window.fcToast?.(decision === 'accept' ? 'Application accepted — you can now chat.' : 'Application declined.')
      setDeclineOpen(false); setReason(''); reload()
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not update the application.') } finally { setBusy('') }
  }

  return (
    <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--ivory)', fontSize: 14.5 }}>{app.student_name}{app.school_name ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {app.school_name}</span> : null}</strong>
        <StatusPill status={app.status} />
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {app.answers.map((qa, i) => (
          <div key={qa.key || i}>
            <div style={{ color: 'var(--gold-light)', fontSize: 12.5, fontWeight: 600 }}>{qa.question}</div>
            <div style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 2 }}>{qa.answer}</div>
          </div>
        ))}
      </div>
      {app.status === 'accepted' && app.resume_url && (
        isImage(app.resume_url)
          ? <a href={app.resume_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10 }}><img src={app.resume_url} alt="résumé" style={{ maxHeight: 120, borderRadius: 8, border: '1px solid var(--line)' }} /></a>
          : <a className="btn btn--sm" href={app.resume_url} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: 'inline-flex' }}>📄 View résumé</a>
      )}
      {app.status === 'declined' && app.decline_reason && <p style={{ color: '#e0a0a0', fontSize: 12.5, margin: '10px 0 0' }}>Reason given: {app.decline_reason}</p>}

      {app.status === 'submitted' && !declineOpen && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn--sm btn--solid" disabled={!!busy} onClick={() => void respond('accept')}>{busy === 'accept' ? '…' : 'Accept'}</button>
          <button className="btn btn--sm" disabled={!!busy} onClick={() => setDeclineOpen(true)}>Decline</button>
        </div>
      )}
      {app.status === 'submitted' && declineOpen && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shared with the student)…" style={{ width: '100%', minHeight: 60, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', color: 'var(--ivory)', fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--sm btn--solid" disabled={busy === 'decline' || !reason.trim()} onClick={() => void respond('decline', reason)}>{busy === 'decline' ? '…' : 'Confirm decline'}</button>
            <button className="btn btn--sm" onClick={() => { setDeclineOpen(false); setReason('') }}>Cancel</button>
          </div>
        </div>
      )}

      {app.status === 'accepted' && app.awaiting_parent && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--gold-light)', background: 'rgba(212,175,90,0.1)', border: '1px solid rgba(212,175,90,0.25)', borderRadius: 8, padding: '9px 12px' }}>
          ⏳ Waiting for the student's parent/guardian to give consent. Chat and résumé unlock once they approve (the student is under 18).
        </p>
      )}
      {app.status === 'accepted' && !app.awaiting_parent && <OfferChat base={`ecosystem/sponsor/application/${app.id}`} role="sponsor" />}
    </div>
  )
}
