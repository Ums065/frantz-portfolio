import { useCallback, useEffect, useMemo, useState } from 'react'
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
interface ScoredRow {
  submission_id: number; total: number; status: string; updated_at: string; updated_epoch: number
  problem: number; solution: number; creativity: number; supporting_evidence: number; community_impact: number; presentation: number
  student_name: string; participant_id: string; school_name: string
}
interface JudgeDetail {
  judge: { user_id: number; display_name: string; email: string; approval_status: string }
  reviews: ScoredRow[]; max_total: number; page: number; per_page: number; total: number; total_pages: number
}

const PAGE_SIZE = 10

/** Admin panel: create judges, settings, reported concerns, and final results. */
export default function JudgesAdminPanel() {
  const [judges, setJudges] = useState<JudgeRow[]>([])
  const [results, setResults] = useState<ResultRow[]>([])
  const [reports, setReports] = useState<ReportRow[]>([])
  const [settings, setSettings] = useState<{ anonymous_judging: boolean; results_published: boolean; winners_published: boolean }>({ anonymous_judging: false, results_published: false, winners_published: false })
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  // Judge detail modal state
  const [sel, setSel] = useState<JudgeRow | null>(null)
  const [detail, setDetail] = useState<JudgeDetail | null>(null)
  const [page, setPage] = useState(1)
  const [detailBusy, setDetailBusy] = useState(false)
  const [eName, setEName] = useState(''); const [eEmail, setEEmail] = useState(''); const [ePass, setEPass] = useState('')
  const [dMsg, setDMsg] = useState(''); const [dErr, setDErr] = useState('')

  // Judges table controls
  const [jSearch, setJSearch] = useState(''); const [jFilter, setJFilter] = useState<'all' | 'scored' | 'unscored'>('all')
  const [jPage, setJPage] = useState(1); const [jSel, setJSel] = useState<Set<number>>(new Set())
  // Results table controls
  const [rSearch, setRSearch] = useState(''); const [rSchool, setRSchool] = useState('all'); const [rJudged, setRJudged] = useState<'all' | 'judged' | 'pending'>('all')
  const [rPage, setRPage] = useState(1); const [rSel, setRSel] = useState<Set<number>>(new Set())

  const loadAll = () => {
    api.get<{ judges: JudgeRow[] }>('admin/new-school/judges').then((d) => setJudges(d.judges || [])).catch(() => {})
    api.get<{ results: ResultRow[] }>('admin/new-school/results').then((d) => setResults(d.results || [])).catch(() => {})
    api.get<{ reports: ReportRow[] }>('admin/new-school/reports').then((d) => setReports(d.reports || [])).catch(() => {})
    api.get<{ settings: typeof settings }>('admin/new-school/settings').then((d) => setSettings(d.settings)).catch(() => {})
  }
  useEffect(() => { loadAll() }, [])

  const loadDetail = useCallback((userId: number, p: number) => {
    setDetailBusy(true)
    api.get<JudgeDetail>(`admin/new-school/judges/${userId}/reviews?page=${p}`)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setDetailBusy(false))
  }, [])

  const openJudge = (j: JudgeRow) => {
    setSel(j); setPage(1); setDetail(null)
    setEName(j.display_name); setEEmail(j.email); setEPass('')
    setDMsg(''); setDErr('')
    loadDetail(j.user_id, 1)
  }
  const closeJudge = () => { setSel(null); setDetail(null) }
  const gotoPage = (p: number) => { if (!sel) return; setPage(p); loadDetail(sel.user_id, p) }

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('')
    if (name.trim().length < 3) { setErr('Enter the judge full name.'); return }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    setSaving(true)
    try {
      await api.post('admin/new-school/judge', { full_name: name.trim(), email: email.trim().toLowerCase(), password })
      setMsg(`Judge "${name.trim()}" created.`); setName(''); setEmail(''); setPassword(''); loadAll()
      setTimeout(() => { setShowAdd(false); setMsg('') }, 900)
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not create the judge.') } finally { setSaving(false) }
  }

  const saveJudge = async () => {
    if (!sel) return
    setDErr(''); setDMsg('')
    if (eName.trim().length < 3) { setDErr('Enter the judge full name.'); return }
    if (ePass && ePass.length < 6) { setDErr('New password must be at least 6 characters.'); return }
    setDetailBusy(true)
    try {
      await api.put(`admin/new-school/judge/${sel.user_id}`, { full_name: eName.trim(), email: eEmail.trim().toLowerCase(), password: ePass })
      setDMsg('Judge updated.'); setEPass(''); loadAll()
      loadDetail(sel.user_id, page)
    } catch (e2) { setDErr(e2 instanceof Error ? e2.message : 'Could not update the judge.'); setDetailBusy(false) }
  }

  const deleteJudge = async () => {
    if (!sel) return
    if (!window.confirm(`Remove judge "${sel.display_name}"? This also deletes all scores they gave, and rankings will recalculate.`)) return
    setDetailBusy(true)
    try {
      await api.del(`admin/new-school/judge/${sel.user_id}`)
      closeJudge(); loadAll()
    } catch (e2) { setDErr(e2 instanceof Error ? e2.message : 'Could not remove the judge.'); setDetailBusy(false) }
  }

  const toggleSetting = async (key: 'anonymous_judging' | 'results_published' | 'winners_published') => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    try { await api.post('admin/new-school/settings', { [key]: next[key] }) } catch { loadAll() }
  }

  const setReportStatus = async (id: number, status: string) => {
    try { await api.put(`admin/new-school/reports/${id}`, { status }); loadAll() } catch { /* ignore */ }
  }

  const fmtDate = (epoch: number) => {
    if (!epoch) return '—'
    const d = new Date(epoch * 1000)
    if (isNaN(d.getTime())) return '—'
    return `${d.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
  }

  // ---- Judges: filter + search + paginate ----
  const filteredJudges = useMemo(() => {
    const q = jSearch.trim().toLowerCase()
    return judges.filter((j) => {
      if (jFilter === 'scored' && j.reviews_submitted <= 0) return false
      if (jFilter === 'unscored' && j.reviews_submitted > 0) return false
      if (q && !(`${j.display_name} ${j.email}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [judges, jSearch, jFilter])
  const jPages = Math.max(1, Math.ceil(filteredJudges.length / PAGE_SIZE))
  const jClamped = Math.min(jPage, jPages)
  const jView = filteredJudges.slice((jClamped - 1) * PAGE_SIZE, jClamped * PAGE_SIZE)
  useEffect(() => { setJPage(1) }, [jSearch, jFilter])

  const toggleJ = (id: number) => setJSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allJChecked = filteredJudges.length > 0 && filteredJudges.every((j) => jSel.has(j.user_id))
  const toggleAllJ = () => setJSel((s) => {
    const n = new Set(s)
    if (allJChecked) filteredJudges.forEach((j) => n.delete(j.user_id))
    else filteredJudges.forEach((j) => n.add(j.user_id))
    return n
  })
  const bulkDeleteJudges = async () => {
    const ids = [...jSel]
    if (!ids.length) return
    if (!window.confirm(`Remove ${ids.length} judge(s)? This deletes all their scores too, and rankings will recalculate.`)) return
    for (const id of ids) { try { await api.del(`admin/new-school/judge/${id}`) } catch { /* skip */ } }
    setJSel(new Set()); loadAll()
  }

  // ---- Results: filter + search + paginate ----
  const schools = useMemo(() => Array.from(new Set(results.map((r) => r.school_name).filter(Boolean))).sort(), [results])
  const filteredResults = useMemo(() => {
    const q = rSearch.trim().toLowerCase()
    return results.filter((r) => {
      if (rSchool !== 'all' && r.school_name !== rSchool) return false
      if (rJudged === 'judged' && r.judge_average == null) return false
      if (rJudged === 'pending' && r.judge_average != null) return false
      if (q && !(`${r.student_name} ${r.participant_id} ${r.school_name}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [results, rSearch, rSchool, rJudged])
  const rPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE))
  const rClamped = Math.min(rPage, rPages)
  const rView = filteredResults.slice((rClamped - 1) * PAGE_SIZE, rClamped * PAGE_SIZE)
  useEffect(() => { setRPage(1) }, [rSearch, rSchool, rJudged])

  const toggleR = (id: number) => setRSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allRChecked = filteredResults.length > 0 && filteredResults.every((r) => rSel.has(r.submission_id))
  const toggleAllR = () => setRSel((s) => {
    const n = new Set(s)
    if (allRChecked) filteredResults.forEach((r) => n.delete(r.submission_id))
    else filteredResults.forEach((r) => n.add(r.submission_id))
    return n
  })
  const exportResults = () => {
    const chosen = rSel.size ? filteredResults.filter((r) => rSel.has(r.submission_id)) : filteredResults
    if (!chosen.length) return
    const header = ['Rank', 'Student', 'Participant', 'School', 'Automatic', 'Judge Avg', 'Final']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [header, ...chosen.map((r) => [r.rank_position, r.student_name, r.participant_id, r.school_name, r.automatic, r.judge_average ?? '', r.final])]
      .map((row) => row.map(esc).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'final-results.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const selStyle: React.CSSProperties = {
    padding: '7px 32px 7px 12px', borderRadius: 8, border: '1px solid var(--line)',
    background: '#181509', color: 'var(--ivory)', cursor: 'pointer', fontSize: 14,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23C9A84C' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center',
  }
  const optStyle: React.CSSProperties = { background: '#181509', color: 'var(--ivory)' }

  const searchInput = (val: string, set: (v: string) => void, ph: string) => (
    <input type="search" value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
      style={{ flex: '1 1 200px', minWidth: 160, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,0.04)', color: 'var(--ivory)' }} />
  )
  const Pager = ({ p, pages, set }: { p: number; pages: number; set: (n: number) => void }) => pages <= 1 ? null : (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
      <button className="btn btn--sm" disabled={p <= 1} onClick={() => set(p - 1)}>‹ Prev</button>
      <span className="msub" style={{ fontSize: 13 }}>Page {p} of {pages}</span>
      <button className="btn btn--sm" disabled={p >= pages} onClick={() => set(p + 1)}>Next ›</button>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* Judges */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 className="gold-text" style={{ margin: 0 }}>Judges ({judges.length})</h3>
          <button className="btn btn--solid btn--sm" onClick={() => { setShowAdd(true); setErr(''); setMsg('') }}>＋ Add Judge</button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
          {searchInput(jSearch, setJSearch, 'Search name or email…')}
          <select value={jFilter} onChange={(e) => setJFilter(e.target.value as typeof jFilter)} style={selStyle}>
            <option style={optStyle} value="all">All judges</option>
            <option style={optStyle} value="scored">Has scored</option>
            <option style={optStyle} value="unscored">No scores yet</option>
          </select>
          {jSel.size > 0 && (
            <button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={bulkDeleteJudges}>Delete selected ({jSel.size})</button>
          )}
        </div>

        {filteredJudges.length === 0 ? <p className="msub">No judges match.</p> : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr>
                  <th style={{ width: 34 }}><input type="checkbox" checked={allJChecked} onChange={toggleAllJ} aria-label="Select all judges" /></th>
                  <th>Name</th><th>Email</th><th>Submitted</th><th></th>
                </tr></thead>
                <tbody>{jView.map((j) => (
                  <tr key={j.id} onClick={() => openJudge(j)} style={{ cursor: 'pointer' }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={jSel.has(j.user_id)} onChange={() => toggleJ(j.user_id)} aria-label={`Select ${j.display_name}`} /></td>
                    <td><strong className="gold-text">{j.display_name}</strong></td>
                    <td>{j.email}</td>
                    <td>{j.reviews_submitted}</td>
                    <td style={{ textAlign: 'right', color: 'var(--gold)' }}>Manage ›</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Pager p={jClamped} pages={jPages} set={setJPage} />
          </>
        )}
      </div>

      {/* Reports inbox */}
      <div>
        <h3 className="gold-text">Reported Concerns ({reports.filter((r) => r.status === 'open').length} open)</h3>
        {reports.length === 0 ? <p className="msub">No reports.</p> : (
          <div className="admin-table-wrap">
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
          {searchInput(rSearch, setRSearch, 'Search student, ID or school…')}
          <select value={rSchool} onChange={(e) => setRSchool(e.target.value)} style={selStyle}>
            <option style={optStyle} value="all">All schools</option>
            {schools.map((s) => <option style={optStyle} key={s} value={s}>{s}</option>)}
          </select>
          <select value={rJudged} onChange={(e) => setRJudged(e.target.value as typeof rJudged)} style={selStyle}>
            <option style={optStyle} value="all">All</option>
            <option style={optStyle} value="judged">Judged</option>
            <option style={optStyle} value="pending">Not judged</option>
          </select>
          <button className="btn btn--sm" onClick={exportResults} disabled={filteredResults.length === 0}>
            Export {rSel.size ? `selected (${rSel.size})` : 'all'} · CSV
          </button>
        </div>

        {filteredResults.length === 0 ? <p className="msub">No projects match.</p> : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr>
                  <th style={{ width: 34 }}><input type="checkbox" checked={allRChecked} onChange={toggleAllR} aria-label="Select all results" /></th>
                  <th>#</th><th>Student</th><th>School</th><th>Automatic</th><th>Judge Avg</th><th>Final</th>
                </tr></thead>
                <tbody>{rView.map((r) => (
                  <tr key={r.submission_id}>
                    <td><input type="checkbox" checked={rSel.has(r.submission_id)} onChange={() => toggleR(r.submission_id)} aria-label={`Select ${r.student_name}`} /></td>
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
            <Pager p={rClamped} pages={rPages} set={setRPage} />
          </>
        )}
        <p className="msub" style={{ fontSize: 12, marginTop: 8 }}>Tie-breakers: Solution → Community → Creativity → Problem → Presentation (avg judge category scores).</p>
      </div>

      {/* ---- Add Judge modal ---- */}
      {showAdd && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 520, width: '94vw', maxHeight: '92vh', overflowY: 'auto', textAlign: 'left', padding: 0, background: 'var(--bg-2, #14130d)' }}>
            <div style={{ borderBottom: '1px solid var(--line)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 className="gold-text" style={{ margin: 0, fontFamily: 'var(--f-serif)' }}>Add a Judge</h3>
              <button onClick={() => setShowAdd(false)} aria-label="Close" title="Close"
                style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)', color: 'var(--ivory)', fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 18 }}>
              {/* Judging settings */}
              <section>
                <h4 className="gold-text" style={{ margin: '0 0 10px' }}>Judging Settings</h4>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={settings.anonymous_judging} onChange={() => toggleSetting('anonymous_judging')} style={{ marginTop: 3 }} />
                    <span><strong>Anonymous judging</strong><br /><span className="msub" style={{ fontSize: 13 }}>Hide student name, school & teacher from judges.</span></span>
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={settings.results_published} onChange={() => toggleSetting('results_published')} style={{ marginTop: 3 }} />
                    <span><strong>Publish results to students</strong><br /><span className="msub" style={{ fontSize: 13 }}>Reveal judge scores & final score on student dashboards.</span></span>
                  </label>
                </div>
              </section>

              <div style={{ borderTop: '1px solid var(--line)' }} />

              {/* New judge form */}
              <form onSubmit={create} style={{ display: 'grid', gap: 10 }}>
                <h4 className="gold-text" style={{ margin: 0 }}>New Judge</h4>
                <div className="field"><label>Full Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} required /></div>
                <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div className="field"><label>Password</label><input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
                {msg && <p className="msub" style={{ color: 'var(--green-bright)', margin: 0 }}>{msg}</p>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button type="button" className="btn btn--sm" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button type="submit" className="btn btn--solid btn--sm" disabled={saving}>{saving ? 'Creating…' : 'Create Judge'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ---- Judge detail modal ---- */}
      {sel && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && closeJudge()}>
          <div className="modal" style={{ maxWidth: 820, width: '96vw', maxHeight: '92vh', overflowY: 'auto', textAlign: 'left', padding: 0, background: 'var(--bg-2, #14130d)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'linear-gradient(180deg,#1c1a12,#14130d)', borderBottom: '1px solid var(--line)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>Judge</div>
                <h3 className="gold-text" style={{ margin: '4px 0 2px', fontFamily: 'var(--f-serif)', fontSize: 21 }}>{sel.display_name}</h3>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{sel.email}</div>
              </div>
              <button onClick={closeJudge} aria-label="Close" title="Close"
                style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)', color: 'var(--ivory)', fontSize: 16, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ padding: '18px 22px', display: 'grid', gap: 22 }}>
              <section className="glass" style={{ padding: '14px 16px' }}>
                <h4 className="gold-text" style={{ margin: '0 0 10px' }}>Edit Judge</h4>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                  <div className="field"><label>Full Name</label><input type="text" value={eName} onChange={(e) => setEName(e.target.value)} /></div>
                  <div className="field"><label>Email</label><input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} /></div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}><label>New Password (leave blank to keep)</label><input type="text" value={ePass} onChange={(e) => setEPass(e.target.value)} placeholder="••••••" /></div>
                </div>
                {dErr && <p className="msub" style={{ color: '#e08a8a', marginBottom: 0 }}>{dErr}</p>}
                {dMsg && <p className="msub" style={{ color: 'var(--green-bright)', marginBottom: 0 }}>{dMsg}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn btn--solid btn--sm" disabled={detailBusy} onClick={saveJudge}>{detailBusy ? 'Saving…' : 'Save Changes'}</button>
                  <button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} disabled={detailBusy} onClick={deleteJudge}>Delete Judge</button>
                </div>
              </section>

              <section>
                <h4 className="gold-text" style={{ margin: '0 0 6px' }}>Scored Students {detail ? `(${detail.total})` : ''}</h4>
                <p className="msub" style={{ fontSize: 12, marginTop: 0 }}>Every student this judge scored, and the score given (out of {detail?.max_total ?? 135}).</p>
                {detailBusy && !detail ? <p className="msub">Loading…</p> : !detail || detail.reviews.length === 0 ? (
                  <p className="msub">This judge has not scored any students yet.</p>
                ) : (
                  <>
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead><tr><th>Student</th><th>School</th><th>Status</th><th>Scored On</th><th style={{ textAlign: 'right' }}>Score</th></tr></thead>
                        <tbody>{detail.reviews.map((r) => (
                          <tr key={r.submission_id}>
                            <td><strong>{r.student_name}</strong><div className="msub" style={{ fontSize: 12 }}>{r.participant_id}</div></td>
                            <td>{r.school_name}</td>
                            <td><span className={`status-pill ${r.status === 'submitted' ? 'status-pill--approved' : 'status-pill--new'}`}>{r.status}</span></td>
                            <td className="msub" style={{ fontSize: 12 }}>{fmtDate(r.updated_epoch)}</td>
                            <td style={{ textAlign: 'right' }}><strong className="gold-text" style={{ fontSize: 16 }}>{r.total}</strong><span className="msub"> / {detail.max_total}</span></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    {detail.total_pages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
                        <button className="btn btn--sm" disabled={detail.page <= 1 || detailBusy} onClick={() => gotoPage(detail.page - 1)}>‹ Prev</button>
                        <span className="msub" style={{ fontSize: 13 }}>Page {detail.page} of {detail.total_pages}</span>
                        <button className="btn btn--sm" disabled={detail.page >= detail.total_pages || detailBusy} onClick={() => gotoPage(detail.page + 1)}>Next ›</button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
