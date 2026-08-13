import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import FcIcon from './FcIcon'
import Pager from './Pager'

/* Chasing student registrations by calling the SCHOOL. A Fellow sees a student's
   name, participant id, grade and where each approval has got to — never a
   minor's phone, email, address, date of birth, age or parent contact. The
   server filters the roster through the same whitelist the teacher view uses,
   so this screen cannot show more than it is allowed to even by mistake. */

interface SchoolRow {
  id: number; school_name: string; school_district?: string; main_phone?: string
  principal_name?: string; administrator_name?: string; administrator_email?: string
  administrator_phone?: string; status?: string; claim_status?: string
  student_count: number; pending_count: number; last_call?: string | null
}
interface StudentRow {
  id: number; full_name: string; participant_id?: string; grade_level?: string
  parent_consent_status?: string; school_approval_status?: string
  teacher_approval_status?: string; submission_status?: string; overall_status?: string
}
interface CallRow { id: number; spoke_to?: string; outcome: string; note?: string; follow_up_date?: string | null; created_at: string; fellow_name?: string }

const label = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const OUTCOME_LABEL: Record<string, string> = {
  reached: 'Spoke to someone', left_message: 'Left a message', no_answer: 'No answer',
  wrong_number: 'Wrong number', call_back: 'Asked me to call back', not_interested: 'Not interested',
}
const STATUS_TONE: Record<string, string> = { approved: '#6be29a', pending: '#e0a86c', rejected: '#e08a8a' }

function StatusPill({ value }: { value?: string }) {
  const tone = STATUS_TONE[value || ''] || undefined
  return (
    <span className="fc-stage-pill" style={tone ? { color: tone, borderColor: tone + '55', background: tone + '18' } : undefined}>
      {label(value || 'unknown')}
    </span>
  )
}

export default function StudentVerification() {
  const [rows, setRows] = useState<SchoolRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [pendingOnly, setPendingOnly] = useState(true)
  const [neverCalled, setNeverCalled] = useState(false)
  const [hasStudents, setHasStudents] = useState(true)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)
  const per = 25

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), per: String(per) })
    if (q.trim()) qs.set('q', q.trim())
    if (pendingOnly) qs.set('pending_only', '1')
    if (neverCalled) qs.set('never_called', '1')
    if (hasStudents) qs.set('has_students', '1')
    setLoading(true)
    api.get<{ schools: SchoolRow[]; total: number }>(`fellow/student-verify?${qs}`)
      .then((d) => { setRows(d.schools || []); setTotal(d.total || 0) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [page, q, pendingOnly, neverCalled, hasStudents])
  useEffect(() => {
    const t = setTimeout(load, q.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const pages = Math.max(1, Math.ceil(total / per))

  return (
    <div>
      <div className="fc-guide">
        <div className="fc-guide__head">
          <span className="fc-guide__icon"><FcIcon name="phone" size={24} /></span>
          <div className="fc-guide__txt">
            <h3>Student Verification</h3>
            <p>Schools whose students are still waiting on an approval. You call the school office — never a student — and record what they said.</p>
          </div>
        </div>
        <ol className="fc-guide__steps">
          <li><span>1</span>Work down the list: most students waiting first, then whoever has gone longest without a call.</li>
          <li><span>2</span>Open a school to see which students are stuck and at which step, then ring the office number.</li>
          <li><span>3</span>Log what happened. It counts towards your daily call target automatically.</li>
        </ol>
        <p className="msub" style={{ fontSize: 12, margin: '10px 0 0', paddingTop: 10, borderTop: '1px solid rgba(201,168,76,.16)' }}>
          You will not see a student's phone number, email, address or parent's details anywhere here — you do not need them, and they are not yours to hold.
        </p>
      </div>

      <div className="sv-filters">
        <input className="fc-input" type="search" style={{ flex: '1 1 200px' }} value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Search school, district or principal…" />
        <label className="msub" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={pendingOnly} onChange={(e) => { setPendingOnly(e.target.checked); setPage(1) }} />
          Only schools with students waiting
        </label>
        <label className="msub" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={hasStudents} onChange={(e) => { setHasStudents(e.target.checked); setPage(1) }} />
          Has students
        </label>
        <label className="msub" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={neverCalled} onChange={(e) => { setNeverCalled(e.target.checked); setPage(1) }} />
          Never called
        </label>
        <span className="msub" style={{ fontSize: 12.5 }}>{total} school{total === 1 ? '' : 's'}</span>
      </div>

      {loading ? <p className="msub">Loading schools…</p> : total === 0 ? (
        <div className="fc-empty">
          <span><FcIcon name="check" size={34} /></span>
          <h4>Nothing waiting</h4>
          <p className="msub">No school matches those filters. If "only schools with students waiting" is on, that means every student has been approved — clear the filters to see the rest.</p>
        </div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--stack">
              <thead><tr><th>School</th><th>Students</th><th>Waiting</th><th>Office number</th><th>Last call</th></tr></thead>
              <tbody>{rows.map((s) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(s.id)}>
                  <td data-label="School">
                    <strong>{s.school_name}</strong>
                    <div className="msub" style={{ fontSize: 12 }}>{[s.school_district, s.principal_name].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td data-label="Students">{s.student_count}</td>
                  <td data-label="Waiting">
                    {s.pending_count > 0
                      ? <strong style={{ color: '#e0a86c' }}>{s.pending_count}</strong>
                      : <span className="msub">none</span>}
                  </td>
                  <td data-label="Office number">{s.main_phone || <span style={{ color: '#e0a86c' }}>no number on file</span>}</td>
                  <td data-label="Last call" className="msub">{s.last_call ? String(s.last_call).slice(0, 10) : 'never'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Pager page={page} pages={pages} total={total} unit="schools" onPage={setPage} />
        </>
      )}

      {openId && <SchoolCallPanel id={openId} onClose={() => setOpenId(null)} onLogged={load} />}
    </div>
  )
}

function SchoolCallPanel({ id, onClose, onLogged }: { id: number; onClose: () => void; onLogged: () => void }) {
  const [data, setData] = useState<{ school: SchoolRow; students: StudentRow[]; calls: CallRow[]; outcomes: string[] } | null>(null)
  const [f, setF] = useState({ spoke_to: '', outcome: 'reached', note: '', follow_up_date: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const load = useCallback(() => {
    api.get<any>(`fellow/student-verify/school/${id}`).then(setData).catch(() => {})
  }, [id])
  useEffect(() => { load() }, [load])

  const logCall = async () => {
    setBusy(true); setErr(''); setMsg('')
    try {
      await api.post(`fellow/student-verify/school/${id}/call`, f)
      setMsg('Call logged.')
      setF({ spoke_to: '', outcome: 'reached', note: '', follow_up_date: '' })
      load(); onLogged()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not log the call.') } finally { setBusy(false) }
  }

  if (!data) {
    return <div className="modal-overlay open" onClick={onClose}><div className="modal" style={{ maxWidth: 760 }}><p className="msub">Loading…</p></div></div>
  }
  const s = data.school
  const waiting = data.students.filter((x) => x.teacher_approval_status === 'pending' || x.parent_consent_status === 'pending')

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 800, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2, paddingRight: 28 }}>{s.school_name}</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>{[s.school_district, s.status ? label(s.status) : ''].filter(Boolean).join(' · ')}</p>

        {/* Who to ring — school staff, all adults. */}
        <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 12 }}>
          <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>Who to call</h4>
          <div className="sv-grid">
            <div><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Office</div><strong>{s.main_phone || '—'}</strong></div>
            <div><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Principal</div><strong>{s.principal_name || '—'}</strong></div>
            <div><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Administrator</div><strong>{s.administrator_name || '—'}</strong>
              <div className="msub" style={{ fontSize: 12 }}>{[s.administrator_phone, s.administrator_email].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        </section>

        {/* The roster: statuses only. */}
        <section style={{ marginTop: 14 }}>
          <h4 className="gold-text" style={{ marginBottom: 2, fontSize: 14 }}>
            Students ({data.students.length}){waiting.length > 0 ? <span className="msub" style={{ fontWeight: 400 }}> · {waiting.length} waiting</span> : null}
          </h4>
          <p className="msub" style={{ fontSize: 12, margin: '0 0 8px' }}>Names and approval steps only. Ask the office to chase the step that is pending.</p>
          {data.students.length === 0 ? (
            <p className="msub" style={{ fontSize: 13 }}>No students registered at this school yet. Worth asking the office whether they plan to take part.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--stack">
                <thead><tr><th>Student</th><th>Grade</th><th>Parent consent</th><th>Teacher approval</th><th>Where they are</th></tr></thead>
                <tbody>{data.students.map((st) => (
                  <tr key={st.id}>
                    <td data-label="Student"><strong>{st.full_name}</strong>{st.participant_id ? <div className="msub" style={{ fontSize: 11.5 }}>{st.participant_id}</div> : null}</td>
                    <td data-label="Grade">{st.grade_level || '—'}</td>
                    <td data-label="Parent consent"><StatusPill value={st.parent_consent_status} /></td>
                    <td data-label="Teacher approval"><StatusPill value={st.teacher_approval_status} /></td>
                    <td data-label="Where they are" className="msub">{label(st.overall_status || '')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        {/* Log the call. */}
        <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 14 }}>
          <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>Log this call</h4>
          <div className="sv-grid">
            <label className="fc-fld">Who did you speak to?<input className="fc-input" value={f.spoke_to} onChange={(e) => set('spoke_to', e.target.value)} placeholder="e.g. Front office, Ms Patel" /></label>
            <label className="fc-fld">What happened?
              <select className="fc-input" value={f.outcome} onChange={(e) => set('outcome', e.target.value)}>
                {data.outcomes.map((o) => <option key={o} value={o} style={{ background: '#14120b' }}>{OUTCOME_LABEL[o] || label(o)}</option>)}
              </select>
            </label>
            <label className="fc-fld">Call back on<input className="fc-input" type="date" value={f.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} /></label>
          </div>
          <label className="fc-fld" style={{ marginTop: 10, display: 'block' }}>Notes
            <textarea className="fc-input" rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="What they told you, and what happens next." />
          </label>
          {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
          {msg && <p className="msub" style={{ color: '#6be29a' }}>{msg}</p>}
          <button className="btn btn--sm btn--solid" style={{ marginTop: 10 }} onClick={logCall} disabled={busy}>
            {busy ? 'Saving…' : 'Log the call'}
          </button>
        </section>

        {data.calls.length > 0 && (
          <section style={{ marginTop: 14 }}>
            <h4 className="gold-text" style={{ fontSize: 14, marginBottom: 8 }}>Call history</h4>
            <ul className="fc-timeline">
              {data.calls.map((c) => (
                <li key={c.id}>
                  <span className="fc-timeline__t">{String(c.created_at).slice(0, 16).replace('T', ' ')} · {c.fellow_name || 'a Fellow'}</span>
                  <span>{OUTCOME_LABEL[c.outcome] || label(c.outcome)}{c.spoke_to ? ` — ${c.spoke_to}` : ''}</span>
                  {c.note ? <span className="msub">{c.note}</span> : null}
                  {c.follow_up_date ? <span className="msub">Call back {String(c.follow_up_date).slice(0, 10)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
