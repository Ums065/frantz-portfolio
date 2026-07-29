import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Pill, Modal, EcoTable, EcoStatChips } from './EcosystemAdminPanel'
import OfferChat from '../OfferChat'

/* Admin review of sponsor job posts. A sponsor's job stays hidden until an admin
   approves it here; only then does it reach eligible students globally. Table +
   filters + a detail modal (with oversight of each accepted application's chat). */

interface AdminJob {
  id: number
  title: string
  description: string
  location: string
  stipend: string
  skills: string
  min_age: number
  attachment_url: string
  status: string
  admin_note: string
  questions: { key: string; question: string }[]
  sponsor_name: string
  app_count: number
  created_ts: number
}

interface AdminApplication {
  id: number
  student_name: string
  school_name: string
  answers: { key: string; question: string; answer: string }[]
  status: string
  created_ts: number
}

const fmt = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const clamp = { display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'var(--muted)' } as React.CSSProperties

export default function SponsorJobsAdminPanel() {
  const [rows, setRows] = useState<AdminJob[]>([])
  const [open, setOpen] = useState<AdminJob | null>(null)
  const [err, setErr] = useState('')
  const load = () => api.get<{ jobs: AdminJob[] }>('admin/sponsor-jobs').then((d) => setRows(d.jobs || [])).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load jobs.'))
  useEffect(() => { void load() }, [])

  const by = (s: string) => rows.filter((r) => r.status === s).length
  const bulkApprove = async (ids: number[]) => {
    const todo = ids.filter((id) => rows.find((r) => r.id === id)?.status === 'pending')
    let failed = 0
    for (const id of todo) { try { await api.put(`admin/sponsor-job/${id}`, { status: 'approved', admin_note: '' }) } catch { failed++ } }
    void load()
    window.fcToast?.(failed ? `${failed} of ${todo.length} could not be approved.` : `Approved ${todo.length}.`)
  }
  const bulkDecline = async (ids: number[]) => {
    const note = window.prompt('Reason to send to the sponsor for these declines (required):', '')
    if (note == null || note.trim() === '') { window.fcToast?.('A reason is required to decline.'); return }
    const todo = ids.filter((id) => rows.find((r) => r.id === id)?.status === 'pending')
    let failed = 0
    for (const id of todo) { try { await api.put(`admin/sponsor-job/${id}`, { status: 'declined', admin_note: note.trim() }) } catch { failed++ } }
    void load()
    window.fcToast?.(failed ? `${failed} of ${todo.length} could not be declined.` : `Declined ${todo.length}.`)
  }

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid var(--line)', borderRadius: 12, padding: '13px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gold)' }}>What this tab is for</div>
        <p style={{ color: '#d8d3c6', fontSize: 13, lineHeight: 1.6, margin: '5px 0 0' }}>
          Jobs posted by <strong>sponsors</strong>. Each stays hidden until you approve it — then it becomes visible to every
          student whose age meets the job's minimum. Review the questions and minimum age, then Approve or Decline (with a reason).
          The sponsor is emailed your decision.
        </p>
      </div>
      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}

      <EcoStatChips items={[
        { label: 'Total', value: rows.length },
        { label: 'Pending', value: by('pending'), tone: 'gold' },
        { label: 'Live', value: by('approved'), tone: 'green' },
        { label: 'Declined', value: by('declined'), tone: 'red' },
      ]} />

      <EcoTable<AdminJob>
        head={['#', 'Sponsor', 'Job', 'Min age', 'Qs', 'Apps', 'Status', 'Date', '']}
        rows={rows}
        searchText={(r) => `${r.sponsor_name} ${r.title} ${r.description} ${r.skills}`}
        searchPlaceholder="Search sponsor jobs…"
        filters={[
          { label: 'statuses', options: ['pending', 'approved', 'declined', 'closed'], valueOf: (r) => r.status },
        ]}
        rowId={(r) => r.id}
        bulkActions={[
          { label: 'Approve selected', onClick: bulkApprove },
          { label: 'Decline selected', danger: true, onClick: bulkDecline },
        ]}
        renderRow={(r, checkbox, index) => (
          <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
            {checkbox}
            <td className="admin-table__idx">{index}</td>
            <td data-label="Sponsor" style={{ fontWeight: 600 }}>{r.sponsor_name}</td>
            <td data-label="Job" className="admin-cell--wrap"><span style={clamp}>{r.title}</span></td>
            <td data-label="Min age">{r.min_age}</td>
            <td data-label="Qs">{r.questions.length}</td>
            <td data-label="Apps">{r.app_count}</td>
            <td data-label="Status"><Pill status={r.status} /></td>
            <td data-label="Date" style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmt(r.created_ts)}</td>
            <td><button className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setOpen(r) }}>Review</button></td>
          </tr>
        )}
      />

      {open && <JobModal job={open} onClose={() => setOpen(null)} onDone={(list) => { setRows(list); setOpen(null) }} />}
    </div>
  )
}

function JobModal({ job, onClose, onDone }: { job: AdminJob; onClose: () => void; onDone: (list: AdminJob[]) => void }) {
  const [note, setNote] = useState(job.admin_note || '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [apps, setApps] = useState<AdminApplication[]>([])
  const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--ivory)', fontSize: 13, boxSizing: 'border-box' }

  useEffect(() => {
    api.get<{ applications: AdminApplication[] }>(`admin/sponsor-job/${job.id}/applications`)
      .then((d) => setApps(Array.isArray(d.applications) ? d.applications : [])).catch(() => setApps([]))
  }, [job.id])

  const act = async (status: string) => {
    if (status === 'declined' && note.trim() === '') { setErr('A reason is required when declining.'); return }
    setErr(''); setBusy(status)
    try { const d = await api.put<{ jobs: AdminJob[] }>(`admin/sponsor-job/${job.id}`, { status, admin_note: note }); onDone(d.jobs || []) }
    catch (e) { setBusy(''); setErr(e instanceof Error ? e.message : 'Could not update the job.') }
  }

  const meta: Array<[string, string | number | undefined]> = [
    ['Location', job.location], ['Stipend', job.stipend], ['Skills', job.skills], ['Minimum age', job.min_age],
  ]

  return (
    <Modal title={`${job.title} · ${job.sponsor_name}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Pill status={job.status} />
        {job.attachment_url && <a className="btn btn--sm" href={job.attachment_url} target="_blank" rel="noreferrer">📎 Attachment</a>}
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 'auto' }}>{fmt(job.created_ts)}</span>
      </div>

      {job.description && <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>{job.description}</p>}

      <dl className="eco-dl" style={{ fontSize: 13, margin: '12px 0', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
        {meta.filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}><dt style={{ color: 'var(--muted)' }}>{k}</dt><dd style={{ margin: 0, color: 'var(--ivory)' }}>{v}</dd></div>
        ))}
      </dl>

      {job.questions.length > 0 && (
        <div style={{ margin: '0 0 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '0 0 6px' }}>Application questions</div>
          <ol style={{ margin: 0, paddingLeft: 20, color: '#d8d3c6', fontSize: 13, display: 'grid', gap: 4 }}>
            {job.questions.map((q, i) => <li key={q.key || i}>{q.question}</li>)}
          </ol>
        </div>
      )}

      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '12px 0 5px' }}>
        Note to the sponsor <span style={{ textTransform: 'none', color: 'var(--muted)', fontWeight: 400 }}>(required to decline)</span>
      </label>
      <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The sponsor sees this note…" />
      {err && <p style={{ color: '#ff9a9a', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {([['approved', 'Approve'], ['declined', 'Decline']] as const).map(([st, l]) => {
          const needsNote = st === 'declined' && !note.trim()
          return <button key={st} className={`btn btn--sm${job.status === st ? ' btn--solid' : ''}`} disabled={!!busy || needsNote} title={needsNote ? 'Add a reason first' : ''} onClick={() => act(st)}>{busy === st ? '…' : l}{job.status === st ? ' ✓' : ''}</button>
        })}
      </div>

      {/* Oversight: accepted applications + their sponsor ⇄ student chats. */}
      {apps.length > 0 && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '0 0 8px' }}>Applications ({apps.length})</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {apps.map((a) => (
              <div key={a.id} style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--ivory)', fontSize: 13.5 }}>{a.student_name}{a.school_name ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {a.school_name}</span> : null}</strong>
                  <Pill status={a.status} />
                </div>
                {a.status === 'accepted' && <OfferChat base={`admin/sponsor-application/${a.id}`} role="admin" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
