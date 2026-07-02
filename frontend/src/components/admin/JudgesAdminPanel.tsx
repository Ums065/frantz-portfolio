import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

interface JudgeRow {
  id: number; user_id: number; display_name: string; email: string
  approval_status: string; created_at: string; reviews_submitted: number; reviews_total: number
}
interface ResultRow {
  submission_id: number; student_name: string; participant_id: string; school_name: string
  automatic: number; judge_average: number | null; final: number; rank_position: number
}
interface ReportRow {
  id: number; submission_id: number | null; reason: string; notes: string | null; status: string
  created_at: string; reporter_name: string | null; student_name: string | null; participant_id: string | null
}
/** Admin panel: create judges, settings, reported concerns, and final results. */
export default function JudgesAdminPanel() {
  const [judges, setJudges] = useState<JudgeRow[]>([])
  const [results, setResults] = useState<ResultRow[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [settings, setSettings] = useState<{ anonymous_judging: boolean; results_published: boolean }>({ anonymous_judging: false, results_published: false })
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('')

  const loadAll = () => {
    api.get<{ judges: JudgeRow[] }>('admin/new-school/judges').then((d) => setJudges(d.judges || [])).catch(() => {})
    api.get<{ results: ResultRow[] }>('admin/new-school/results').then((d) => setResults(d.results || [])).catch(() => {})
    api.get<{ reports: ReportRow[] }>('admin/new-school/reports').then((d) => setReports(d.reports || [])).catch(() => {})
    api.get<{ settings: typeof settings }>('admin/new-school/settings').then((d) => setSettings(d.settings)).catch(() => {})
  }
  useEffect(() => { loadAll() }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('')
    if (name.trim().length < 3) { setErr('Enter the judge full name.'); return }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    setSaving(true)
    try {
      await api.post('admin/new-school/judge', { full_name: name.trim(), email: email.trim().toLowerCase(), password })
      setMsg(`Judge "${name.trim()}" created.`); setName(''); setEmail(''); setPassword(''); loadAll()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not create the judge.') } finally { setSaving(false) }
  }

  const toggleSetting = async (key: 'anonymous_judging' | 'results_published') => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    try { await api.post('admin/new-school/settings', { [key]: next[key] }) } catch { loadAll() }
  }

  const setReportStatus = async (id: number, status: string) => {
    try { await api.put(`admin/new-school/reports/${id}`, { status }); loadAll() } catch { /* ignore */ }
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* Settings */}
      <div className="glass" style={{ padding: '16px 20px' }}>
        <h3 className="gold-text" style={{ marginTop: 0 }}>Judging Settings</h3>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <input type="checkbox" checked={settings.anonymous_judging} onChange={() => toggleSetting('anonymous_judging')} />
          <span><strong>Anonymous judging</strong> — hide student name, school & teacher from judges.</span>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="checkbox" checked={settings.results_published} onChange={() => toggleSetting('results_published')} />
          <span><strong>Publish results to students</strong> — reveal judge scores & final score on student dashboards.</span>
        </label>
      </div>

      {/* Create + list judges */}
      <div className="glass" style={{ padding: '16px 20px', maxWidth: 620 }}>
        <h3 className="gold-text" style={{ marginTop: 0 }}>Add a Judge</h3>
        <form onSubmit={create} style={{ display: 'grid', gap: 10 }}>
          <div className="field"><label>Full Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Password</label><input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
          {msg && <p className="msub" style={{ color: 'var(--green-bright)' }}>{msg}</p>}
          <button type="submit" className="btn btn--solid" disabled={saving}>{saving ? 'Creating…' : 'Create Judge'}</button>
        </form>
      </div>

      <div>
        <h3 className="gold-text">Judges ({judges.length})</h3>
        {judges.length === 0 ? <p className="msub">No judges yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Submitted</th><th>Total</th></tr></thead>
              <tbody>{judges.map((j) => <tr key={j.id}><td>{j.display_name}</td><td>{j.email}</td><td>{j.reviews_submitted}</td><td>{j.reviews_total}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reports inbox */}
      <div>
        <h3 className="gold-text">Reported Concerns ({reports.filter((r) => r.status === 'open').length} open)</h3>
        {reports.length === 0 ? <p className="msub">No reports.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table"><thead><tr><th>When</th><th>Reporter</th><th>Student</th><th>Reason</th><th>Notes</th><th>Status</th><th></th></tr></thead>
              <tbody>{reports.map((r) => (
                <tr key={r.id}>
                  <td className="msub" style={{ fontSize: 12 }}>{r.created_at}</td>
                  <td>{r.reporter_name || '—'}</td>
                  <td>{r.student_name ? `${r.student_name} · ${r.participant_id}` : '—'}</td>
                  <td>{r.reason}</td>
                  <td style={{ maxWidth: 240 }}>{r.notes || '—'}</td>
                  <td><span className={`status-pill ${r.status === 'open' ? 'status-pill--new' : 'status-pill--approved'}`}>{r.status}</span></td>
                  <td>{r.status === 'open' && <><button className="btn btn--sm" onClick={() => setReportStatus(r.id, 'reviewed')}>Reviewed</button> <button className="btn btn--sm" onClick={() => setReportStatus(r.id, 'dismissed')}>Dismiss</button></>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Final results */}
      <div>
        <h3 className="gold-text">Final Results (tie-broken)</h3>
        {results.length === 0 ? <p className="msub">No submitted projects yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table"><thead><tr><th>#</th><th>Student</th><th>School</th><th>Automatic</th><th>Judge Avg</th><th>Final</th></tr></thead>
              <tbody>{results.map((r) => (
                <tr key={r.submission_id}>
                  <td>{r.rank_position}</td>
                  <td>{r.student_name} · {r.participant_id}</td>
                  <td>{r.school_name}</td>
                  <td>{r.automatic}</td>
                  <td>{r.judge_average ?? '—'}</td>
                  <td><strong className="gold-text">{r.final}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="msub" style={{ fontSize: 12, marginTop: 8 }}>Tie-breakers: Solution → Community → Creativity → Problem → Presentation (avg judge category scores).</p>
      </div>
    </div>
  )
}
