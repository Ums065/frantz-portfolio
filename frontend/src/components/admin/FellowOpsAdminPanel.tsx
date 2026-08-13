import { useEffect, useState, useCallback } from 'react'
import { api } from '../../lib/api'
import FcIcon from '../FcIcon'
import TaskWorkspace from '../TaskWorkspace'

/* Admin "Fellow Command Center": today's team activity, per-Fellow rollup, live
   activity feed, master pipeline, task assignment, and daily-target settings. */

interface Summary { active_fellows: number; prospects_added: number; emails: number; calls: number; linkedin: number; follow_ups: number; meetings: number; proposals: number; sponsors: number; pipeline_total: number; pipeline_new: number; pipeline_proposal: number; pipeline_confirmed: number }
interface FellowRow { id: number; full_name: string; email: string; orgs: number; pipeline: number; today_activity: number; won: number; modules_done?: number }
interface Activity { type: string; detail?: string; created_at: string; fellow_name: string; org_name?: string }

const money = (n: number) => '$' + (n || 0).toLocaleString('en-US')
const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function FellowOpsAdminPanel() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [fellows, setFellows] = useState<FellowRow[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [tab, setTab] = useState<'today' | 'analytics' | 'schools' | 'pipeline' | 'activity' | 'reports' | 'proposals' | 'assign' | 'targets' | 'materials' | 'templates' | 'training' | 'certification'>('today')

  const load = useCallback(() => {
    api.get<{ summary: Summary; fellows: FellowRow[] }>('admin/fellow-ops/summary').then((d) => { setSummary(d.summary); setFellows(d.fellows || []) }).catch(() => {})
    api.get<{ activity: Activity[] }>('admin/fellow-ops/activity').then((d) => setActivity(d.activity || [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const tiles: [string, string | number, string?][] = summary ? [
    ['Fellows Active', summary.active_fellows], ['Prospects Added', summary.prospects_added],
    ['Emails', summary.emails], ['Calls', summary.calls], ['LinkedIn', summary.linkedin],
    ['Follow-ups', summary.follow_ups], ['Meetings', summary.meetings], ['Proposals', summary.proposals],
  ] : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 className="gold-text" style={{ margin: 0 }}>Fellow Command Center</h3>
        <button className="btn btn--sm" onClick={load}>↻ Refresh</button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 14px' }}>What the sponsorship team did today, live.</p>

      <div className="admin-ov-tabs" role="tablist" style={{ marginBottom: 16 }}>
        {(['today', 'analytics', 'schools', 'pipeline', 'activity', 'reports', 'proposals', 'assign', 'targets', 'materials', 'templates', 'training', 'certification'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`admin-ov-tab${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>
            {t === 'today' ? 'Today' : t === 'analytics' ? 'Analytics' : t === 'schools' ? 'School Verification' : t === 'pipeline' ? 'All Prospects' : t === 'activity' ? 'Activity Feed' : t === 'reports' ? 'Daily Reports' : t === 'proposals' ? 'Proposals' : t === 'assign' ? 'Tasks' : t === 'targets' ? 'Targets' : t === 'materials' ? 'Materials' : t === 'templates' ? 'Templates' : t === 'training' ? 'Training' : 'Certification'}
          </button>
        ))}
      </div>

      {tab === 'today' && summary && (
        <>
          <div className="admin-stats" style={{ marginBottom: 16 }}>
            {tiles.map(([lbl, val]) => (
              <div key={lbl} className="admin-stat glass"><span className="admin-stat__label">{lbl}</span><strong>{val}</strong><p>today</p></div>
            ))}
          </div>
          <div className="fc-sc-grid" style={{ marginBottom: 18 }}>
            {[['Total Pipeline', summary.pipeline_total], ['New Today', summary.pipeline_new], ['Proposal Stage', summary.pipeline_proposal], ['Confirmed', summary.pipeline_confirmed]].map(([l, v]) => (
              <div key={l as string} className="glass" style={{ padding: '14px 16px', borderRadius: 12 }}>
                <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>{l}</div>
                <strong className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 24 }}>{money(v as number)}</strong>
              </div>
            ))}
          </div>
          <h4 className="gold-text" style={{ marginBottom: 2 }}>Fellows ({fellows.length})</h4>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 10px' }}>Real work only — sample data a Fellow loads to learn the tool is never counted here.</p>
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--stack">
              <thead><tr><th>Fellow</th><th>Today</th><th>Prospects</th><th>Pipeline</th><th>Won</th><th>Training</th></tr></thead>
              <tbody>{fellows.length === 0 ? <tr><td colSpan={6} className="msub" style={{ padding: 16 }}>No Fellows yet.</td></tr> : fellows.map((f) => (
                <tr key={f.id}><td data-label="Fellow"><strong>{f.full_name}</strong><div className="msub" style={{ fontSize: 12 }}>{f.email}</div></td>
                  <td data-label="Today">{f.today_activity}</td><td data-label="Prospects">{f.orgs}</td><td data-label="Pipeline">{money(f.pipeline)}</td><td data-label="Won">{f.won}</td>
                  <td data-label="Training">{f.modules_done ?? 0} module{(f.modules_done ?? 0) === 1 ? '' : 's'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'activity' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Time</th><th>Fellow</th><th>Action</th><th>Organization</th></tr></thead>
            <tbody>{activity.length === 0 ? <tr><td colSpan={4} className="msub" style={{ padding: 16 }}>No activity yet.</td></tr> : activity.map((a, i) => (
              <tr key={i}><td className="msub">{a.created_at?.slice(0, 16).replace('T', ' ')}</td><td>{a.fellow_name}</td>
                <td>{label(a.type)}{a.detail ? <span className="msub"> — {a.detail}</span> : null}</td><td>{a.org_name || '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'analytics' && <AnalyticsView />}
      {tab === 'schools' && <SchoolsAdmin />}
      {tab === 'pipeline' && <PipelineAdmin />}
      {tab === 'reports' && <ReportsAdmin />}
      {tab === 'proposals' && <ProposalsAdmin />}
      {tab === 'assign' && <TaskWorkspace side="admin" fellows={fellows} onChanged={load} />}
      {tab === 'targets' && <TargetsForm fellows={fellows} onDone={load} />}
      {tab === 'materials' && <MaterialsAdmin />}
      {tab === 'templates' && <TemplatesAdmin />}
      {tab === 'training' && <ModulesAdmin />}
      {tab === 'certification' && <CertAdmin />}
    </div>
  )
}

function CertAdmin() {
  const [subtab, setSubtab] = useState<'status' | 'questions'>('status')
  const [fellows, setFellows] = useState<any[]>([]); const [pass, setPass] = useState(80)
  const [qs, setQs] = useState<any[]>([]); const [editing, setEditing] = useState<any | null>(null)
  const loadStatus = useCallback(() => { api.get<any>('admin/fellow-ops/certifications').then((d) => { setFellows(d.fellows || []); setPass(d.pass || 80) }).catch(() => {}) }, [])
  const loadQs = useCallback(() => { api.get<any>('admin/fellow-ops/quiz').then((d) => setQs(d.questions || [])).catch(() => {}) }, [])
  useEffect(() => { loadStatus(); loadQs() }, [loadStatus, loadQs])
  const saveQ = async () => {
    if (!editing) return
    const opts = (editing.options || []).map((o: string) => o.trim()).filter(Boolean)
    if (!String(editing.question || '').trim() || opts.length < 2) return
    const payload = { ...editing, options: opts }
    if (editing.id) await api.put(`admin/fellow-ops/quiz-question/${editing.id}`, payload); else await api.post('admin/fellow-ops/quiz-question', payload)
    setEditing(null); loadQs()
  }
  const removeQ = async (id: number) => { if (!window.confirm('Delete this question?')) return; await api.del(`admin/fellow-ops/quiz-question/${id}`); loadQs() }
  const col: Record<string, string> = { Certified: '#6be29a', 'Needs Retraining': '#e08a5c', Training: 'var(--muted)' }
  return (
    <div>
      <div className="admin-ov-tabs" style={{ marginBottom: 14 }}>
        <button className={`admin-ov-tab${subtab === 'status' ? ' is-active' : ''}`} onClick={() => setSubtab('status')}>Fellow Status</button>
        <button className={`admin-ov-tab${subtab === 'questions' ? ' is-active' : ''}`} onClick={() => setSubtab('questions')}>Exam Questions ({qs.length})</button>
      </div>
      {subtab === 'status' ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Fellow</th><th>Status</th><th>Best</th><th>Attempts</th></tr></thead>
            <tbody>{fellows.length === 0 ? <tr><td colSpan={4} className="msub" style={{ padding: 16 }}>No Fellows yet.</td></tr> : fellows.map((f) => (
              <tr key={f.id}><td><strong>{f.full_name}</strong></td><td style={{ color: col[f.status], fontWeight: 700 }}>{f.status}</td><td>{f.best}%</td><td>{f.attempts}</td></tr>
            ))}</tbody>
          </table>
          <p className="msub" style={{ marginTop: 8 }}>Pass mark: {pass}%.</p>
        </div>
      ) : (
        <div>
          <button className="btn btn--sm btn--solid" style={{ marginBottom: 12 }} onClick={() => setEditing({ question: '', options: ['', '', '', ''], correct_index: 0, is_active: 1 })}><FcIcon name="plus" size={15} />Add Question</button>
          <div style={{ display: 'grid', gap: 8 }}>
            {qs.length === 0 ? <p className="msub">No questions yet — add some so Fellows can certify.</p> : qs.map((q) => (
              <div key={q.id} className="glass" style={{ padding: 12, borderRadius: 10, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>{q.question}<span className="msub" style={{ display: 'block', fontSize: 12 }}>Answer: {(q.options || [])[q.correct_index]}</span></span>
                <span style={{ display: 'flex', gap: 6 }}><button className="btn btn--sm" onClick={() => setEditing({ ...q })}>Edit</button><button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={() => removeQ(q.id)}>✕</button></span>
              </div>
            ))}
          </div>
        </div>
      )}
      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            <h3 className="gold-text">{editing.id ? 'Edit' : 'Add'} Question</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <label className="fc-fld">Question<textarea className="fc-input" rows={2} value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} /></label>
              <p className="msub" style={{ margin: 0 }}>Options (select the correct one):</p>
              {(editing.options || ['', '', '', '']).map((opt: string, i: number) => (
                <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="radio" checked={editing.correct_index === i} onChange={() => setEditing({ ...editing, correct_index: i })} />
                  <input className="fc-input" value={opt} placeholder={`Option ${i + 1}`} onChange={(e) => { const o = [...(editing.options || [])]; o[i] = e.target.value; setEditing({ ...editing, options: o }) }} />
                </label>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d8d3c6', fontSize: 13 }}><input type="checkbox" checked={!!editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })} /> Active</label>
              <button className="btn btn--solid" onClick={saveQ}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModulesAdmin() {
  const [rows, setRows] = useState<any[]>([]); const [editing, setEditing] = useState<any | null>(null); const [msg, setMsg] = useState('')
  const load = useCallback(() => { api.get<{ modules: any[] }>('admin/fellow-ops/modules').then((d) => setRows(d.modules || [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const sync = async () => { const d = await api.post<{ added: number }>('admin/fellow-ops/modules/sync', {}); setMsg(`Synced — ${d.added} new.`); load() }
  const save = async () => { if (!editing) return; await api.put(`admin/fellow-ops/module/${editing.id}`, editing); setEditing(null); load() }
  const cats = Array.from(new Set(rows.map((r) => r.category)))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <p className="msub" style={{ margin: 0 }}>{rows.length} documents. New PDFs dropped in <code>frontend/public/academy</code> appear on Sync.</p>
        <button className="btn btn--sm btn--solid" onClick={sync}>↻ Sync folder</button>
      </div>
      {msg && <p className="msub" style={{ color: '#6be29a' }}>{msg}</p>}
      {cats.map((cat) => (
        <section key={cat} style={{ marginBottom: 14 }}>
          <h4 className="gold-text">{cat} ({rows.filter((r) => r.category === cat).length})</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>#</th><th>Title</th><th>Active</th><th></th></tr></thead>
              <tbody>{rows.filter((r) => r.category === cat).map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setEditing({ ...r })}>
                  <td>{r.sort_order}</td><td><strong>{r.title}</strong></td><td>{r.is_active ? '✓' : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>{r.doc_url && <a className="btn btn--sm" href={r.doc_url} target="_blank" rel="noreferrer">Open</a>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ))}
      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            <h3 className="gold-text">Edit Module</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <label className="fc-fld">Title<input className="fc-input" value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
              <label className="fc-fld">Category<input className="fc-input" value={editing.category || ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></label>
              <label className="fc-fld">Description<input className="fc-input" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
              <label className="fc-fld">Video URL (optional)<input className="fc-input" value={editing.video_url || ''} onChange={(e) => setEditing({ ...editing, video_url: e.target.value })} /></label>
              <label className="fc-fld">Sort order<input className="fc-input" type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d8d3c6', fontSize: 13 }}><input type="checkbox" checked={!!editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })} /> Active (visible to Fellows)</label>
              <button className="btn btn--solid" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface Template { id: number; kind: string; category?: string; name: string; subject?: string; body?: string; sort_order?: number; is_active?: number }
function TemplatesAdmin() {
  const [rows, setRows] = useState<Template[]>([]); const [kinds, setKinds] = useState<string[]>([])
  const [editing, setEditing] = useState<Partial<Template> | null>(null)
  const load = useCallback(() => { api.get<{ templates: Template[]; kinds: string[] }>('admin/fellow-ops/templates').then((d) => { setRows(d.templates || []); setKinds(d.kinds || []) }).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const set = (patch: Partial<Template>) => setEditing((e) => ({ ...(e || {}), ...patch }))
  const save = async () => {
    if (!editing || !String(editing.name || '').trim()) return
    if (editing.id) await api.put(`admin/fellow-ops/template/${editing.id}`, editing); else await api.post('admin/fellow-ops/template', editing)
    setEditing(null); load()
  }
  const remove = async (id: number) => { if (!window.confirm('Delete this template?')) return; await api.del(`admin/fellow-ops/template/${id}`); load() }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="msub" style={{ margin: 0 }}>Approved email / call / LinkedIn scripts Fellows can copy.</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ kind: 'email', is_active: 1 })}><FcIcon name="plus" size={15} />Add Template</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Kind</th><th>Name</th><th>Active</th><th></th></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={4} className="msub" style={{ padding: 16 }}>No templates yet.</td></tr> : rows.map((r) => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setEditing({ ...r })}>
              <td style={{ textTransform: 'capitalize' }}>{r.kind.replace('_', ' ')}</td><td><strong>{r.name}</strong></td><td>{r.is_active ? '✓' : '—'}</td>
              <td onClick={(e) => e.stopPropagation()}><button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={() => remove(r.id)}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            <h3 className="gold-text">{editing.id ? 'Edit' : 'Add'} Template</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="fc-fld" style={{ flex: 1 }}>Kind<select className="fc-input" value={editing.kind || 'email'} onChange={(e) => set({ kind: e.target.value })}>{kinds.map((k) => <option key={k} value={k} style={{ background: '#14120b' }}>{k.replace('_', ' ')}</option>)}</select></label>
                <label className="fc-fld" style={{ flex: 1 }}>Category<input className="fc-input" value={editing.category || ''} onChange={(e) => set({ category: e.target.value })} placeholder="Corporate / Foundation…" /></label>
              </div>
              <label className="fc-fld">Name<input className="fc-input" value={editing.name || ''} onChange={(e) => set({ name: e.target.value })} /></label>
              <label className="fc-fld">Subject (email)<input className="fc-input" value={editing.subject || ''} onChange={(e) => set({ subject: e.target.value })} /></label>
              <label className="fc-fld">Body / script<textarea className="fc-input" rows={7} value={editing.body || ''} onChange={(e) => set({ body: e.target.value })} placeholder="Use [Name], [Organization] as placeholders." /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d8d3c6', fontSize: 13 }}><input type="checkbox" checked={!!editing.is_active} onChange={(e) => set({ is_active: e.target.checked ? 1 : 0 })} /> Active</label>
              <button className="btn btn--solid" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnalyticsView() {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get<any>('admin/fellow-ops/analytics').then(setD).catch(() => {}) }, [])
  if (!d) return <p className="msub">Loading…</p>
  const maxV = Math.max(1, ...(d.funnel || []).map((f: any) => f.value || 0))
  const alertDefs: [string, number, string][] = [
    ['Overdue follow-ups', d.alerts.overdue_followups, '#e08a5c'],
    ['Proposals awaiting approval', d.alerts.proposals_pending, '#d4af37'],
    ['Fellows inactive today', d.alerts.inactive_fellows, '#e0785c'],
    ['Verbal commitments', d.alerts.verbal_commitments, '#6be29a'],
    ['Confirmed sponsorships', d.alerts.confirmed, '#6be29a'],
  ]
  return (
    <div>
      <div className="admin-stats" style={{ marginBottom: 18 }}>
        {alertDefs.map(([lbl, n, col]) => (
          <div key={lbl} className="admin-stat glass" style={{ borderColor: n > 0 ? col : undefined }}>
            <span className="admin-stat__label">{lbl}</span><strong style={{ color: n > 0 ? col : undefined }}>{n}</strong><p>{lbl.includes('Overdue') || lbl.includes('inactive') || lbl.includes('awaiting') ? 'needs attention' : 'pipeline'}</p>
          </div>
        ))}
      </div>
      <p className="msub" style={{ marginBottom: 10 }}>Team activity — {d.activity_week} this week · {d.activity_month} this month</p>
      <h4 className="gold-text">Pipeline Funnel</h4>
      <div style={{ display: 'grid', gap: 8 }}>
        {(d.funnel || []).map((f: any) => (
          <div key={f.stage} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 170px) 1fr auto', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{f.stage.replace(/_/g, ' ')} <span className="msub">({f.n})</span></span>
            <div style={{ height: 18, borderRadius: 6, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.max(3, Math.round((f.value / maxV) * 100))}%`, background: 'linear-gradient(90deg,#c9a84c,#f6e2a8)' }} /></div>
            <strong style={{ fontSize: 13 }}>{money(f.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

/* How far the team has got through the master school list, and how each Fellow
   is confirming records — phone calls versus desk research. */
function SchoolsAdmin() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<any>('admin/fellow-ops/schools').then(setD).catch(() => {}).finally(() => setLoading(false))
  }, [])
  if (loading) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading school progress…</p>
  const t = d?.totals || {}
  const n = (v: any) => Number(v) || 0
  if (n(t.total) === 0) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No schools imported yet. A Fellow uploads the master list under Verify Schools in their workspace.</p>
  const pct = (a: any, b: any) => (n(b) ? Math.round((n(a) / n(b)) * 100) : 0)
  return (
    <div>
      <div className="admin-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 10, marginBottom: 18 }}>
        {[['Schools on the list', n(t.total)], ['Verified', `${n(t.verified)} (${pct(t.verified, t.total)}%)`],
          ['Invited', n(t.contacted)], ['Registered', n(t.registered)], ['On the registration dropdown', n(t.on_dropdown)]].map(([l, v]) => (
          <div key={String(l)} className="glass" style={{ padding: '12px 14px', borderRadius: 12 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)' }}>{l}</div>
            <strong className="gold-text" style={{ fontSize: 21, fontFamily: 'var(--f-serif)' }}>{v}</strong>
          </div>
        ))}
      </div>

      <h4 className="gold-text" style={{ marginBottom: 8 }}>By region</h4>
      <div className="admin-table-wrap" style={{ marginBottom: 20 }}>
        <table className="admin-table admin-table--stack">
          <thead><tr><th>Region</th><th>Schools</th><th>Verified</th><th>Invited</th><th>Registered</th><th>Progress</th></tr></thead>
          <tbody>{(d.by_region || []).map((r: any) => (
            <tr key={r.region}>
              <td data-label="Region"><strong>{r.region}</strong></td>
              <td data-label="Schools">{n(r.total)}</td>
              <td data-label="Verified">{n(r.verified)}</td>
              <td data-label="Invited">{n(r.contacted)}</td>
              <td data-label="Registered">{n(r.registered)}</td>
              <td data-label="Progress" style={{ minWidth: 120 }}>
                <div className="fc-progress__bar"><span style={{ width: pct(r.verified, r.total) + '%' }} /></div>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{pct(r.verified, r.total)}% verified</span>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <h4 className="gold-text" style={{ marginBottom: 2 }}>By Fellow</h4>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 10px' }}>How they confirmed each record. A Fellow verifying hundreds by desk research alone is worth a conversation.</p>
      <div className="admin-table-wrap">
        <table className="admin-table admin-table--stack">
          <thead><tr><th>Fellow</th><th>Assigned</th><th>Verified</th><th>Invited</th><th>By phone</th><th>By research</th></tr></thead>
          <tbody>{(d.by_fellow || []).map((r: any) => (
            <tr key={r.fellow_name}>
              <td data-label="Fellow"><strong>{r.fellow_name}</strong></td>
              <td data-label="Assigned">{n(r.total)}</td>
              <td data-label="Verified">{n(r.verified)}</td>
              <td data-label="Invited">{n(r.contacted)}</td>
              <td data-label="By phone">{n(r.by_phone)}</td>
              <td data-label="By research">{n(r.by_research)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

/* The master prospect list across the whole team — who owns which company and
   what it is worth. The route existed but nothing called it. */
function PipelineAdmin() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [who, setWho] = useState('')
  const [stage, setStage] = useState('')
  useEffect(() => {
    api.get<{ orgs: any[] }>('admin/fellow-ops/pipeline')
      .then((d) => setOrgs(d.orgs || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  const names = Array.from(new Set(orgs.map((o) => o.fellow_name).filter(Boolean))).sort()
  const stages = Array.from(new Set(orgs.map((o) => o.stage))).sort()
  const shown = orgs.filter((o) => (!who || o.fellow_name === who) && (!stage || o.stage === stage))
  const total = shown.reduce((n, o) => n + (Number(o.est_value) || 0), 0)
  if (loading) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading prospects…</p>
  if (orgs.length === 0) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No prospects yet. They appear here as soon as a Fellow adds one. (Sample data a Fellow loads to learn the tool is never shown here.)</p>
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Fellow:&nbsp;
          <select className="fc-input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="" style={{ background: '#14120b' }}>Everyone</option>
            {names.map((n) => <option key={n} value={n} style={{ background: '#14120b' }}>{n}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Stage:&nbsp;
          <select className="fc-input" style={{ width: 'auto' }} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="" style={{ background: '#14120b' }}>All stages</option>
            {stages.map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{label(s)}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{shown.length} prospects · <strong style={{ color: 'var(--gold-light)' }}>{money(total)}</strong></span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-table--stack">
          <thead><tr><th>Organization</th><th>Fellow</th><th>Stage</th><th>Value</th><th>Location</th></tr></thead>
          <tbody>{shown.map((o) => (
            <tr key={o.id}>
              <td data-label="Organization"><strong>{o.name}</strong>{o.category ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.category}</div> : null}</td>
              <td data-label="Fellow">{o.fellow_name || <span style={{ color: '#e0a86c' }}>unassigned</span>}</td>
              <td data-label="Stage">{label(o.stage)}</td>
              <td data-label="Value">{money(Number(o.est_value) || 0)}</td>
              <td data-label="Location">{o.location || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

/* Fellows are told "your manager can see it now" when they submit an end-of-day
   report, so their manager has to actually be able to read them. */
function ReportsAdmin() {
  const [rows, setRows] = useState<any[]>([])
  const [who, setWho] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<{ reports: any[] }>('admin/fellow-ops/reports')
      .then((d) => setRows(d.reports || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  const names = Array.from(new Set(rows.map((r) => r.fellow_name))).sort()
  const shown = who ? rows.filter((r) => r.fellow_name === who) : rows
  const nums = (j: string) => { try { return JSON.parse(j || '{}') as Record<string, number> } catch { return {} } }
  if (loading) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading reports…</p>
  if (rows.length === 0) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No reports yet. Fellows write these at the end of each working day — check back this evening.</p>
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Fellow:&nbsp;
          <select className="fc-input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="" style={{ background: '#14120b' }}>Everyone ({rows.length})</option>
            {names.map((n) => <option key={n} value={n} style={{ background: '#14120b' }}>{n}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Newest first. Read the blockers — that is where a Fellow needs you.</span>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map((r) => {
          const n = nums(r.numbers_json)
          return (
            <div key={r.id} className="glass" style={{ padding: 14, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong className="gold-text">{r.fellow_name}</strong>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{String(r.report_date).slice(0, 10)}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '8px 0 10px', fontSize: 12, color: 'var(--muted)' }}>
                {[['research', 'orgs'], ['email', 'emails'], ['call', 'calls'], ['linkedin', 'LinkedIn'], ['follow_up', 'follow-ups'], ['meeting', 'meetings'], ['proposal', 'proposals']].map(([k, lbl]) => (
                  <span key={k}><strong style={{ color: '#f0ead6' }}>{n[k] || 0}</strong> {lbl}</span>
                ))}
              </div>
              {r.wins && <p style={{ fontSize: 13, margin: '0 0 6px' }}><strong style={{ color: 'var(--gold-light)' }}>Went well:</strong> {r.wins}</p>}
              {r.challenges && <p style={{ fontSize: 13, margin: '0 0 6px' }}><strong style={{ color: 'var(--gold-light)' }}>Got stuck:</strong> {r.challenges}</p>}
              {r.help_needed && <p style={{ fontSize: 13, margin: '0 0 6px', padding: '8px 10px', borderRadius: 8, background: 'rgba(224,120,92,.1)', border: '1px solid rgba(224,120,92,.35)' }}><strong style={{ color: '#f0b8a8' }}>Needs help:</strong> {r.help_needed}</p>}
              {r.plan && <p style={{ fontSize: 13, margin: 0, color: 'var(--muted)' }}><strong style={{ color: 'var(--gold-light)' }}>Tomorrow:</strong> {r.plan}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProposalsAdmin() {
  const [rows, setRows] = useState<any[]>([])
  const load = useCallback(() => { api.get<{ proposals: any[] }>('admin/fellow-ops/proposals').then((d) => setRows(d.proposals || [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const act = async (id: number, status: string) => {
    const note = status === 'declined' ? (window.prompt('Reason (optional):', '') ?? '') : ''
    await api.put(`admin/fellow-ops/proposal/${id}`, { status, admin_note: note }); load()
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Organization</th><th>Fellow</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={5} className="msub" style={{ padding: 16 }}>No proposals yet.</td></tr> : rows.map((p) => (
          <tr key={p.id}>
            <td><strong>{p.org_name}</strong>{p.level ? <div className="msub" style={{ fontSize: 12 }}>{p.level}</div> : null}</td>
            <td>{p.fellow_name || '—'}</td>
            <td>{money(p.amount)}</td>
            <td style={{ textTransform: 'capitalize' }}>{String(p.status).replace('_', ' ')}</td>
            <td onClick={(e) => e.stopPropagation()}>
              {p.status === 'submitted' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn--sm btn--solid" onClick={() => act(p.id, 'approved')}>Approve</button>
                  <button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={() => act(p.id, 'declined')}>Decline</button>
                </div>
              ) : <span className="msub">—</span>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

interface Material { id: number; category: string; title: string; description?: string; url?: string; sort_order?: number; is_active?: number }
function MaterialsAdmin() {
  const [rows, setRows] = useState<Material[]>([])
  const [editing, setEditing] = useState<Partial<Material> | null>(null)
  const load = useCallback(() => { api.get<{ materials: Material[] }>('admin/fellow-ops/materials').then((d) => setRows(d.materials || [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const set = (patch: Partial<Material>) => setEditing((e) => ({ ...(e || {}), ...patch }))
  const save = async () => {
    if (!editing || !String(editing.title || '').trim()) return
    if (editing.id) await api.put(`admin/fellow-ops/material/${editing.id}`, editing)
    else await api.post('admin/fellow-ops/material', editing)
    setEditing(null); load()
  }
  const remove = async (id: number) => { if (!window.confirm('Delete this material?')) return; await api.del(`admin/fellow-ops/material/${id}`); load() }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="msub" style={{ margin: 0 }}>Approved documents & templates Fellows can use.</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ category: 'Sponsor Materials', is_active: 1 })}><FcIcon name="plus" size={15} />Add Material</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Category</th><th>Title</th><th>Active</th><th></th></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={4} className="msub" style={{ padding: 16 }}>No materials yet.</td></tr> : rows.map((r) => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setEditing({ ...r })}>
              <td>{r.category}</td><td><strong>{r.title}</strong></td><td>{r.is_active ? '✓' : '—'}</td>
              <td onClick={(e) => e.stopPropagation()}><button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={() => remove(r.id)}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            <h3 className="gold-text">{editing.id ? 'Edit' : 'Add'} Material</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <label className="fc-fld">Category<input className="fc-input" value={editing.category || ''} onChange={(e) => set({ category: e.target.value })} placeholder="Sponsor Materials / Outreach Materials…" /></label>
              <label className="fc-fld">Title<input className="fc-input" value={editing.title || ''} onChange={(e) => set({ title: e.target.value })} /></label>
              <label className="fc-fld">Description<input className="fc-input" value={editing.description || ''} onChange={(e) => set({ description: e.target.value })} /></label>
              <label className="fc-fld">Link (view/download)<input className="fc-input" value={editing.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="/docs/…pdf or https://…" /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d8d3c6', fontSize: 13 }}><input type="checkbox" checked={!!editing.is_active} onChange={(e) => set({ is_active: e.target.checked ? 1 : 0 })} /> Active (visible to Fellows)</label>
              <button className="btn btn--solid" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TargetsForm({ fellows, onDone }: { fellows: FellowRow[]; onDone: () => void }) {
  const [who, setWho] = useState('0')
  const [t, setT] = useState<Record<string, number>>({ orgs: 10, emails: 10, calls: 5, linkedin: 5, follow_ups: 10 })
  const [msg, setMsg] = useState('')
  const load = useCallback((fid: string) => {
    api.get<{ targets: Record<string, number> }>(`admin/fellow-ops/targets?fellow_user_id=${fid}`).then((d) => setT({ ...t, ...d.targets })).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load('0') }, [load])
  const onWho = (fid: string) => { setWho(fid); setMsg(''); load(fid) }
  const set = (k: string, v: string) => setT((p) => ({ ...p, [k]: Number(v) || 0 }))
  const save = async () => { await api.put('admin/fellow-ops/targets', { ...t, fellow_user_id: Number(who) }); setMsg('Saved.'); onDone() }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 440 }}>
      <p className="msub">Daily targets shown on a Fellow's scorecard. Pick "Global default" for everyone, or a Fellow to override just them.</p>
      <label className="fc-fld">Apply to
        <select className="fc-input" value={who} onChange={(e) => onWho(e.target.value)}>
          <option value="0" style={{ background: '#14120b' }}>Global default (all Fellows)</option>
          {fellows.map((f) => <option key={f.id} value={f.id} style={{ background: '#14120b' }}>{f.full_name}</option>)}
        </select>
      </label>
      {(['orgs', 'emails', 'calls', 'linkedin', 'follow_ups'] as const).map((k) => (
        <label key={k} className="fc-fld" style={{ display: 'flex', alignItems: 'center', gap: 10, textTransform: 'capitalize' }}>
          <span style={{ minWidth: 120 }}>{k.replace('_', ' ')}</span>
          <input className="fc-input" type="number" value={t[k]} onChange={(e) => set(k, e.target.value)} style={{ width: 100 }} />
        </label>
      ))}
      {msg && <p className="msub" style={{ color: '#6be29a' }}>{msg}</p>}
      <button className="btn btn--solid" onClick={save} style={{ justifySelf: 'start' }}>Save Targets</button>
    </div>
  )
}
