import { useCallback, useEffect, useState } from 'react'
import { api, type CareerApplication, type CareerJobAdmin } from '../lib/api'
import { JobFields } from './admin/CareersAdminPanel'

/* A sponsor's or business's own postings on the public careers board.

   The same form the admin uses, so both sides ask for the same things. What
   differs is what happens on save: a partner's posting goes to Pending and an
   admin has to approve it before it appears on the site, because the site's
   name is on it. Editing an approved posting sends it back for review too. */

const emptyJob = {
  id: 0, org_name: '', title: '', employment_type: 'full_time', work_mode: 'onsite',
  location: '', compensation: '', summary: '', description: '', responsibilities: '',
  requirements: '', skills: '', min_age: 18, apply_deadline: '',
  questions: [] as { question: string; required: boolean }[],
}
type JobForm = typeof emptyJob

const STATUS_NOTE: Record<string, string> = {
  pending: 'Waiting for an admin to review it. It is not on the site yet.',
  approved: 'Live on the careers page.',
  declined: 'Not published.',
  closed: 'Closed — no longer taking applications.',
}

export default function CareerPostingsManager({ orgName }: { orgName?: string }) {
  const [rows, setRows] = useState<CareerJobAdmin[]>([])
  const [editing, setEditing] = useState<JobForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openApps, setOpenApps] = useState<CareerJobAdmin | null>(null)

  const load = useCallback(() => {
    api.get<{ jobs: CareerJobAdmin[] }>('careers/mine')
      .then((d) => setRows(d.jobs || []))
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    try {
      const r = editing.id
        ? await api.put<{ message: string }>(`careers/job/${editing.id}`, editing)
        : await api.post<{ message: string }>('careers/mine', editing)
      window.fcToast?.(r.message)
      setEditing(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') } finally { setBusy(false) }
  }

  const toggleClose = async (j: CareerJobAdmin) => {
    await api.post(`careers/job/${j.id}/close`, { action: j.status === 'closed' ? 'reopen' : 'close' })
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <p className="msub" style={{ margin: 0, maxWidth: 560 }}>
          Post a role to the public careers page. An admin reviews it first, then it appears at
          <code> /careers</code> where anyone 18 or over can apply.
        </p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyJob, org_name: orgName || '' })}>+ Post a Role</button>
      </div>

      <div className="career-admin-list">
        {rows.map((j) => (
          <div className="glass career-admin-row" key={j.id}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span className={`career-tag career-tag--${j.status}`}>{j.status}</span>
              <strong style={{ display: 'block', marginTop: 6 }}>{j.title}</strong>
              <span className="msub">{STATUS_NOTE[j.status] || ''}</span>
              {j.decline_reason && <div className="msub" style={{ color: '#e08a8a' }}>Admin note: {j.decline_reason}</div>}
            </div>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <strong style={{ fontSize: 18 }}>{j.applications}</strong>
              <div className="msub">applications</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn--sm" onClick={() => setOpenApps(j)} disabled={!j.applications}>Applications</button>
              <button className="btn btn--sm" onClick={() => setEditing({
                id: j.id, org_name: j.org_name, title: j.title, employment_type: j.employment_type,
                work_mode: j.work_mode, location: j.location || '', compensation: j.compensation || '',
                summary: j.summary || '', description: j.description || '', responsibilities: j.responsibilities || '',
                requirements: j.requirements || '', skills: j.skills || '', min_age: j.min_age,
                apply_deadline: j.apply_deadline || '', questions: j.questions || [],
              })}>Edit</button>
              {j.status !== 'pending' && j.status !== 'declined' && (
                <button className="btn btn--sm" onClick={() => toggleClose(j)}>{j.status === 'closed' ? 'Reopen' : 'Close'}</button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="msub">You have not posted a role yet.</p>}
      </div>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editing.id ? 'Edit posting' : 'Post a role'}</h3>
            <p className="msub">An admin reviews this before it appears on the site.</p>
            <JobFields job={editing} onChange={(patch) => setEditing((j) => (j ? { ...j, ...patch } : j))} />
            {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn--solid" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Submit for review'}</button>
              <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {openApps && <ApplicationsModal job={openApps} onClose={() => setOpenApps(null)} />}
    </div>
  )
}

function ApplicationsModal({ job, onClose }: { job: CareerJobAdmin; onClose: () => void }) {
  const [rows, setRows] = useState<CareerApplication[]>([])
  const load = useCallback(() => {
    api.get<{ applications: CareerApplication[] }>(`careers/job/${job.id}/applications`)
      .then((d) => setRows(d.applications || []))
      .catch(() => setRows([]))
  }, [job.id])
  useEffect(() => { load() }, [load])

  const mark = async (id: number, status: string) => {
    const note = window.prompt('Anything to add for the applicant? (goes in the email — leave blank for none)') ?? ''
    await api.post(`careers/application/${id}/status`, { status, note })
    load()
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>{job.title}</h3>
        <p className="msub">{rows.length} application{rows.length === 1 ? '' : 's'}</p>
        {rows.map((a) => (
          <div className="glass" key={a.id} style={{ padding: 14, borderRadius: 12, marginTop: 12 }}>
            <span className={`career-tag career-tag--${a.status}`}>{a.status}</span>
            <strong style={{ display: 'block', marginTop: 6 }}>{a.full_name}</strong>
            <div className="msub">{a.email}{a.phone ? ` · ${a.phone}` : ''}{a.location ? ` · ${a.location}` : ''}</div>
            {a.cover_note && <p className="career-prose">{a.cover_note}</p>}
            {a.answers.map((x, i) => (
              <div key={i}><h4 className="career-h4">{x.question}</h4><p className="career-prose">{x.answer || '—'}</p></div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {a.resume_url && <a className="btn btn--sm" href={a.resume_url} target="_blank" rel="noreferrer">Open CV</a>}
              {a.portfolio_url && <a className="btn btn--sm" href={a.portfolio_url} target="_blank" rel="noreferrer">Portfolio</a>}
              {a.status === 'submitted' && <button className="btn btn--sm" onClick={() => mark(a.id, 'shortlisted')}>Shortlist</button>}
              {a.status !== 'accepted' && <button className="btn btn--sm btn--solid" onClick={() => mark(a.id, 'accepted')}>Accept</button>}
              {a.status !== 'declined' && <button className="btn btn--sm" style={{ borderColor: '#7a3b3b', color: '#e08a8a' }} onClick={() => mark(a.id, 'declined')}>Decline</button>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="msub">Nobody has applied yet.</p>}
      </div>
    </div>
  )
}
