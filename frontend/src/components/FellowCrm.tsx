import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

/* Student Fellow sponsorship CRM (Phase 1a): My Day scorecard + tasks + follow-ups,
   a Prospects list with duplicate check, a Pipeline board, and an organization
   detail drawer (info, contacts, timeline, quick activity logging, stage moves). */

interface Org { id: number; name: string; website?: string; industry?: string; category?: string; org_type?: string; location?: string; territory?: string; priority: string; stage: string; est_value: number; fit_notes?: string; internal_notes?: string; updated_at?: string }
interface Contact { id: number; name: string; title?: string; email?: string; phone?: string; linkedin?: string; is_primary?: number }
interface Activity { type: string; detail?: string; created_at: string }
interface Followup { id: number; org_id: number; due_date: string; reason?: string; org_name?: string; status?: string; method?: string }
interface Task { id: number; title: string; priority: string; status: string; due_date?: string }

const STAGE_LABEL = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const money = (n: number) => n > 0 ? '$' + n.toLocaleString('en-US') : '—'
const ACTIVITY_QUICK: [string, string][] = [['email', '✉ Email sent'], ['call', '📞 Call'], ['linkedin', 'in LinkedIn'], ['meeting', '📅 Meeting'], ['proposal', '📄 Proposal'], ['note', '📝 Note']]

export default function FellowCrm() {
  const [view, setView] = useState<'day' | 'prospects' | 'pipeline' | 'calls' | 'outreach' | 'academy' | 'performance' | 'materials' | 'report'>('day')
  const [importing, setImporting] = useState(false)
  const [overview, setOverview] = useState<{ scorecard: { counts: Record<string, number>; targets: Record<string, number> }; tasks: Task[]; followups: Followup[]; followups_due: number; orgs_total: number } | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [priorities, setPriorities] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const loadOverview = useCallback(() => { api.get<any>('fellow/crm/overview').then(setOverview).catch(() => {}) }, [])
  const loadOrgs = useCallback(() => {
    api.get<{ orgs: Org[]; stages: string[]; priorities: string[] }>('fellow/orgs').then((d) => { setOrgs(d.orgs || []); setStages(d.stages || []); setPriorities(d.priorities || []) }).catch(() => {})
  }, [])
  useEffect(() => { loadOverview(); loadOrgs() }, [loadOverview, loadOrgs])
  const refresh = () => { loadOverview(); loadOrgs() }
  const followupDone = async (id: number) => {
    const next = window.prompt('Follow-up done! Schedule the next follow-up date (YYYY-MM-DD) or leave blank:', '')
    if (next === null) return
    await api.post(`fellow/followup/${id}/done`, { next_date: next.trim() })
    refresh()
  }
  const setTaskStatus = async (id: number, status: string) => { await api.put(`fellow/task/${id}`, { status }); loadOverview() }

  const filtered = orgs.filter((o) => !q.trim() || `${o.name} ${o.category || ''} ${o.industry || ''} ${o.location || ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  const sc = overview?.scorecard
  const scRow = (label: string, key: string, target: number) => {
    const val = sc?.counts?.[key] || 0
    const pct = target > 0 ? Math.min(100, Math.round((val / target) * 100)) : (val > 0 ? 100 : 0)
    return (
      <div key={label} className="fc-sc">
        <div className="fc-sc__top"><span>{label}</span><strong>{val}{target ? ` / ${target}` : ''}</strong></div>
        <div className="fc-sc__bar"><span style={{ width: pct + '%' }} /></div>
      </div>
    )
  }
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="fc-crm">
      <div className="admin-ov-tabs" role="tablist" style={{ marginBottom: 18 }}>
        {(['day', 'prospects', 'pipeline', 'calls', 'outreach', 'academy', 'performance', 'materials', 'report'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={`admin-ov-tab${view === v ? ' is-active' : ''}`} onClick={() => setView(v)}>
            {v === 'day' ? 'My Day' : v === 'prospects' ? `Prospects (${orgs.length})` : v === 'pipeline' ? 'Pipeline' : v === 'calls' ? 'Calls' : v === 'outreach' ? 'Outreach' : v === 'academy' ? 'Training Academy' : v === 'performance' ? 'Performance' : v === 'materials' ? 'Materials' : 'Daily Report'}
          </button>
        ))}
      </div>

      {view === 'day' && (
        <div className="fc-day">
          <section className="glass" style={{ padding: 18, borderRadius: 14 }}>
            <h3 className="gold-text" style={{ marginTop: 0 }}>Today's Scorecard</h3>
            <div className="fc-sc-grid">
              {scRow('Organizations researched', 'research', sc?.targets?.orgs || 0)}
              {scRow('Emails sent', 'email', sc?.targets?.emails || 0)}
              {scRow('Calls made', 'call', sc?.targets?.calls || 0)}
              {scRow('LinkedIn outreach', 'linkedin', sc?.targets?.linkedin || 0)}
              {scRow('Follow-ups done', 'follow_up', sc?.targets?.follow_ups || 0)}
              {scRow('Meetings booked', 'meeting', 0)}
            </div>
          </section>

          <div className="fc-day-cols">
            <section className="glass" style={{ padding: 18, borderRadius: 14 }}>
              <h4 className="gold-text" style={{ marginTop: 0 }}>Follow-ups Due <span className="msub">({overview?.followups_due || 0} due / overdue)</span></h4>
              {(overview?.followups || []).length === 0 ? <p className="msub">Nothing due. 🎉</p> : (
                <ul className="fc-list">
                  {(overview?.followups || []).map((f) => (
                    <li key={f.id} className={f.due_date <= today ? 'is-due' : ''}>
                      <button type="button" onClick={() => setOpenId(f.org_id)}>{f.org_name}</button>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="msub">{f.due_date}{f.reason ? ` · ${f.reason}` : ''}</span>
                        <button type="button" className="btn btn--sm btn--solid" onClick={() => followupDone(f.id)}>Done</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="glass" style={{ padding: 18, borderRadius: 14 }}>
              <h4 className="gold-text" style={{ marginTop: 0 }}>My Tasks</h4>
              {(overview?.tasks || []).length === 0 ? <p className="msub">No open tasks.</p> : (
                <ul className="fc-list">
                  {(overview?.tasks || []).map((t) => (
                    <li key={t.id}>
                      <span>{t.title}<span className="msub" style={{ display: 'block', fontSize: 12 }}>{t.priority}{t.due_date ? ` · due ${t.due_date}` : ''}</span></span>
                      <select className="fc-input" style={{ width: 'auto', padding: '5px 8px' }} value={t.status} onChange={(e) => setTaskStatus(t.id, e.target.value)}>
                        {['not_started', 'in_progress', 'waiting', 'completed', 'needs_review'].map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {view === 'prospects' && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <input className="fc-input" style={{ flex: '1 1 220px' }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prospects…" />
            <button className="btn btn--sm" onClick={() => setImporting(true)}>⇪ Import list</button>
            <button className="btn btn--sm btn--solid" onClick={() => setAdding(true)}>＋ Add Prospect</button>
          </div>
          {filtered.length === 0 ? <p className="msub">No prospects yet. Add your first organization.</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Organization</th><th>Category</th><th>Priority</th><th>Stage</th><th>Value</th></tr></thead>
                <tbody>{filtered.map((o) => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
                    <td><strong>{o.name}</strong>{o.location ? <div className="msub" style={{ fontSize: 12 }}>{o.location}</div> : null}</td>
                    <td>{o.category || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{o.priority.replace('_', ' ')}</td>
                    <td><span className="fc-stage-pill">{STAGE_LABEL(o.stage)}</span></td>
                    <td>{money(o.est_value)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'pipeline' && (
        <div className="fc-pipeline">
          {stages.filter((s) => !['not_interested', 'no_response', 'closed_lost'].includes(s)).map((s) => {
            const col = orgs.filter((o) => o.stage === s)
            if (col.length === 0) return null
            const total = col.reduce((n, o) => n + (o.est_value || 0), 0)
            return (
              <div className="fc-col" key={s}>
                <div className="fc-col__head">{STAGE_LABEL(s)} <span className="msub">({col.length}{total ? ` · ${money(total)}` : ''})</span></div>
                {col.map((o) => (
                  <button key={o.id} type="button" className="fc-card" onClick={() => setOpenId(o.id)}>
                    <strong>{o.name}</strong>
                    <span className="msub">{o.category || o.industry || '—'}{o.est_value ? ` · ${money(o.est_value)}` : ''}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {view === 'calls' && <CallsView onLogged={refresh} onOpen={setOpenId} />}
      {view === 'outreach' && <OutreachView />}
      {view === 'academy' && <AcademyView />}
      {view === 'performance' && <PerformanceView />}
      {view === 'materials' && <MaterialsView />}
      {view === 'report' && <ReportView />}

      {adding && <AddProspect priorities={priorities} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh() }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onSaved={() => { setImporting(false); refresh() }} />}
      {openId && <OrgDrawer id={openId} onClose={() => setOpenId(null)} onChange={refresh} />}
    </div>
  )
}

function AddProspect({ priorities, onClose, onSaved }: { priorities: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ name: '', website: '', industry: '', category: '', location: '', priority: 'unreviewed', est_value: '', fit_notes: '' })
  const [dup, setDup] = useState<{ name: string; fellow_name?: string } | null>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const checkDup = async () => {
    if (!f.name.trim()) return
    try { const d = await api.get<{ match: any }>(`fellow/orgs/check?name=${encodeURIComponent(f.name)}`); setDup(d.match) } catch { /* ignore */ }
  }
  const save = async () => {
    if (!f.name.trim()) { setErr('Organization name is required.'); return }
    setBusy(true); setErr('')
    try { await api.post('fellow/org', { ...f, est_value: Number(f.est_value) || 0 }); onSaved() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text">Add Prospect</h3>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <label className="fc-fld">Organization name<input className="fc-input" value={f.name} onChange={(e) => { set('name', e.target.value); setDup(null) }} onBlur={checkDup} /></label>
          {dup && <div className="fc-dup">⚠ Already in the system{dup.fellow_name ? ` (assigned to ${dup.fellow_name})` : ''} — check before duplicating.</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="fc-fld" style={{ flex: 1 }}>Website<input className="fc-input" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></label>
            <label className="fc-fld" style={{ flex: 1 }}>Category<input className="fc-input" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Corporate Sponsor…" /></label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="fc-fld" style={{ flex: 1 }}>Industry<input className="fc-input" value={f.industry} onChange={(e) => set('industry', e.target.value)} /></label>
            <label className="fc-fld" style={{ flex: 1 }}>Location<input className="fc-input" value={f.location} onChange={(e) => set('location', e.target.value)} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="fc-fld" style={{ flex: 1 }}>Priority<select className="fc-input" value={f.priority} onChange={(e) => set('priority', e.target.value)}>{priorities.map((p) => <option key={p} value={p} style={{ background: '#14120b' }}>{p.replace('_', ' ')}</option>)}</select></label>
            <label className="fc-fld" style={{ flex: 1 }}>Est. value ($)<input className="fc-input" type="number" value={f.est_value} onChange={(e) => set('est_value', e.target.value)} /></label>
          </div>
          <label className="fc-fld">Why a good fit?<textarea className="fc-input" rows={2} value={f.fit_notes} onChange={(e) => set('fit_notes', e.target.value)} /></label>
          {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
          <button className="btn btn--solid" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add Prospect'}</button>
        </div>
      </div>
    </div>
  )
}

function OrgDrawer({ id, onClose, onChange }: { id: number; onClose: () => void; onChange: () => void }) {
  const [data, setData] = useState<{ org: Org; contacts: Contact[]; timeline: Activity[]; followups: Followup[]; stages: string[]; proposals?: any[]; meetings?: any[]; proposal_statuses?: string[]; meeting_types?: string[] } | null>(null)
  const [logType, setLogType] = useState('email'); const [logDetail, setLogDetail] = useState(''); const [logFu, setLogFu] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [showProp, setShowProp] = useState(false); const [prop, setProp] = useState<Record<string, string>>({ amount: '', level: '', notes: '', status: 'submitted' })
  const [showMtg, setShowMtg] = useState(false); const [mtg, setMtg] = useState<Record<string, string>>({ meeting_at: '', type: 'zoom', purpose: '', notes: '', outcome: '', next_steps: '' })
  const load = useCallback(() => { api.get<any>(`fellow/org/${id}`).then(setData).catch(() => {}) }, [id])
  useEffect(() => { load() }, [load])
  if (!data) return <div className="modal-overlay open" onClick={onClose}><div className="modal" style={{ maxWidth: 640 }}><p className="msub">Loading…</p></div></div>
  const o = data.org
  const changeStage = async (stage: string) => { await api.put(`fellow/org/${id}/stage`, { stage }); load(); onChange() }
  const logActivity = async () => {
    await api.post(`fellow/org/${id}/activity`, { type: logType, detail: logDetail, follow_up_date: logFu })
    setLogDetail(''); setLogFu(''); load(); onChange()
  }
  const addProposal = async () => { await api.post(`fellow/org/${id}/proposal`, { ...prop, amount: Number(prop.amount) || 0 }); setShowProp(false); setProp({ amount: '', level: '', notes: '', status: 'submitted' }); load(); onChange() }
  const addMeeting = async () => { await api.post(`fellow/org/${id}/meeting`, mtg); setShowMtg(false); setMtg({ meeting_at: '', type: 'zoom', purpose: '', notes: '', outcome: '', next_steps: '' }); load(); onChange() }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>{o.name}</h3>
        <p className="msub" style={{ marginTop: 0 }}>{[o.category, o.industry, o.location].filter(Boolean).join(' · ') || '—'}{o.website ? <> · <a href={o.website} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>website ↗</a></> : null}</p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
          <label className="fc-fld" style={{ minWidth: 200 }}>Pipeline stage
            <select className="fc-input" value={o.stage} onChange={(e) => changeStage(e.target.value)}>{data.stages.map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{STAGE_LABEL(s)}</option>)}</select>
          </label>
          <span className="fc-stage-pill" style={{ alignSelf: 'flex-end' }}>{money(o.est_value)}</span>
        </div>

        {/* Quick log */}
        <section className="glass" style={{ padding: 14, borderRadius: 12, marginBottom: 14 }}>
          <h4 className="gold-text" style={{ marginTop: 0, fontSize: 15 }}>Log activity</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {ACTIVITY_QUICK.map(([t, label]) => (
              <button key={t} type="button" className={`btn btn--sm${logType === t ? ' btn--solid' : ''}`} onClick={() => setLogType(t)}>{label}</button>
            ))}
          </div>
          <input className="fc-input" value={logDetail} onChange={(e) => setLogDetail(e.target.value)} placeholder="Note / detail (optional)" style={{ marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="msub" style={{ fontSize: 12 }}>Next follow-up: <input className="fc-input" type="date" value={logFu} onChange={(e) => setLogFu(e.target.value)} style={{ width: 'auto' }} /></label>
            <button className="btn btn--sm btn--solid" onClick={logActivity}>Save to timeline</button>
          </div>
        </section>

        <div className="fc-drawer-cols">
          {/* Contacts */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Contacts <button type="button" className="btn btn--sm" onClick={() => setAddingContact((v) => !v)}>＋</button></h4>
            {addingContact && <ContactForm orgId={id} onSaved={() => { setAddingContact(false); load(); onChange() }} />}
            {data.contacts.length === 0 ? <p className="msub">No contacts yet.</p> : data.contacts.map((c) => (
              <div key={c.id} className="fc-contact">
                <strong>{c.name}</strong>{c.title ? <span className="msub"> · {c.title}</span> : null}
                <div className="msub" style={{ fontSize: 12 }}>{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </section>
          {/* Timeline */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Timeline</h4>
            {data.timeline.length === 0 ? <p className="msub">No activity yet.</p> : (
              <ul className="fc-timeline">
                {data.timeline.map((a, i) => (
                  <li key={i}><span className="fc-timeline__t">{a.created_at?.slice(0, 16).replace('T', ' ')}</span><span>{STAGE_LABEL(a.type)}{a.detail ? ` — ${a.detail}` : ''}</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="fc-drawer-cols" style={{ marginTop: 14 }}>
          {/* Proposals */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Proposals <button type="button" className="btn btn--sm" onClick={() => setShowProp((v) => !v)}>＋</button></h4>
            {showProp && (
              <div style={{ display: 'grid', gap: 6, margin: '6px 0 10px' }}>
                <input className="fc-input" type="number" placeholder="Amount ($)" value={prop.amount} onChange={(e) => setProp({ ...prop, amount: e.target.value })} />
                <input className="fc-input" placeholder="Level (e.g. Gold)" value={prop.level} onChange={(e) => setProp({ ...prop, level: e.target.value })} />
                <select className="fc-input" value={prop.status} onChange={(e) => setProp({ ...prop, status: e.target.value })}>{(data.proposal_statuses || ['draft', 'submitted']).filter((s) => s !== 'approved').map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{STAGE_LABEL(s)}</option>)}</select>
                <button className="btn btn--sm btn--solid" onClick={addProposal}>Save proposal</button>
              </div>
            )}
            {(data.proposals || []).length === 0 ? <p className="msub">None yet.</p> : (data.proposals || []).map((p: any) => (
              <div key={p.id} className="fc-contact"><strong>{money(p.amount)}</strong> {p.level ? <span className="msub">· {p.level}</span> : null}<div><span className="fc-stage-pill">{STAGE_LABEL(p.status)}</span>{p.admin_note ? <span className="msub" style={{ fontSize: 12 }}> — {p.admin_note}</span> : null}</div></div>
            ))}
          </section>
          {/* Meetings */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Meetings <button type="button" className="btn btn--sm" onClick={() => setShowMtg((v) => !v)}>＋</button></h4>
            {showMtg && (
              <div style={{ display: 'grid', gap: 6, margin: '6px 0 10px' }}>
                <input className="fc-input" type="datetime-local" value={mtg.meeting_at} onChange={(e) => setMtg({ ...mtg, meeting_at: e.target.value })} />
                <select className="fc-input" value={mtg.type} onChange={(e) => setMtg({ ...mtg, type: e.target.value })}>{(data.meeting_types || ['phone', 'zoom', 'meet', 'in_person']).map((t) => <option key={t} value={t} style={{ background: '#14120b' }}>{STAGE_LABEL(t)}</option>)}</select>
                <input className="fc-input" placeholder="Purpose" value={mtg.purpose} onChange={(e) => setMtg({ ...mtg, purpose: e.target.value })} />
                <input className="fc-input" placeholder="Outcome / next steps" value={mtg.next_steps} onChange={(e) => setMtg({ ...mtg, next_steps: e.target.value })} />
                <button className="btn btn--sm btn--solid" onClick={addMeeting}>Save meeting</button>
              </div>
            )}
            {(data.meetings || []).length === 0 ? <p className="msub">None yet.</p> : (data.meetings || []).map((mt: any) => (
              <div key={mt.id} className="fc-contact"><strong>{STAGE_LABEL(mt.type)}</strong> {mt.meeting_at ? <span className="msub">· {String(mt.meeting_at).slice(0, 16).replace('T', ' ')}</span> : null}{mt.purpose ? <div className="msub" style={{ fontSize: 12 }}>{mt.purpose}</div> : null}</div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}

const PERF_ROWS: [string, string][] = [['research', 'Organizations'], ['contact', 'Contacts'], ['email', 'Emails'], ['call', 'Calls'], ['linkedin', 'LinkedIn'], ['follow_up', 'Follow-ups'], ['meeting', 'Meetings'], ['proposal', 'Proposals']]
const CALL_OUTCOMES = ['no_answer', 'voicemail', 'receptionist', 'reached', 'interested', 'callback', 'meeting', 'not_interested', 'wrong_contact']
function CallsView({ onLogged, onOpen }: { onLogged: () => void; onOpen: (id: number) => void }) {
  const [calls, setCalls] = useState<any[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [oc, setOc] = useState('reached'); const [note, setNote] = useState(''); const [fu, setFu] = useState('')
  const load = useCallback(() => { api.get<{ calls: any[] }>('fellow/call-list').then((d) => setCalls(d.calls || [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const logCall = async (orgId: number) => {
    await api.post(`fellow/org/${orgId}/activity`, { type: 'call', detail: oc.replace('_', ' ') + (note ? ` — ${note}` : ''), follow_up_date: fu })
    setActive(null); setNote(''); setFu(''); setOc('reached'); load(); onLogged()
  }
  if (calls.length === 0) return <p className="msub">No call list yet — add prospects with a phone contact.</p>
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Organization</th><th>Contact</th><th>Phone</th><th>Last call</th><th></th></tr></thead>
        <tbody>{calls.map((c) => (
          <tr key={c.id}>
            <td><button type="button" className="fc-link" onClick={() => onOpen(c.id)}>{c.name}</button></td>
            <td>{c.contact_name || '—'}</td><td>{c.phone || '—'}</td>
            <td className="msub">{c.last_call ? String(c.last_call).slice(0, 10) : 'never'}</td>
            <td onClick={(e) => e.stopPropagation()}>
              {active === c.id ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select className="fc-input" style={{ width: 'auto' }} value={oc} onChange={(e) => setOc(e.target.value)}>{CALL_OUTCOMES.map((o) => <option key={o} value={o} style={{ background: '#14120b' }}>{o.replace('_', ' ')}</option>)}</select>
                  <input className="fc-input" style={{ width: 120 }} placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} />
                  <input className="fc-input" style={{ width: 'auto' }} type="date" value={fu} onChange={(e) => setFu(e.target.value)} title="Next follow-up" />
                  <button className="btn btn--sm btn--solid" onClick={() => logCall(c.id)}>Save</button>
                </div>
              ) : <button className="btn btn--sm" onClick={() => setActive(c.id)}>Log call</button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function AcademyView() {
  const [mods, setMods] = useState<any[]>([]); const [done, setDone] = useState<number[]>([])
  const load = useCallback(() => { api.get<{ modules: any[]; completed: number[] }>('fellow/modules').then((d) => { setMods(d.modules || []); setDone(d.completed || []) }).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const toggle = async (id: number, next: boolean) => { setDone((p) => next ? [...p, id] : p.filter((x) => x !== id)); await api.post(`fellow/module/${id}/complete`, { done: next }) }
  if (mods.length === 0) return <p className="msub">Training modules are being prepared.</p>
  const trainable = mods.filter((m) => m.category === 'Training & Playbooks' || m.category === 'Certification')
  const pct = trainable.length ? Math.round((trainable.filter((m) => done.includes(m.id)).length / trainable.length) * 100) : 0
  const cats = Array.from(new Set(mods.map((m) => m.category)))
  return (
    <div>
      <section className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 16 }}>
        <div className="fc-sc__top"><span>Training progress</span><strong>{trainable.filter((m) => done.includes(m.id)).length} / {trainable.length} · {pct}%</strong></div>
        <div className="fc-sc__bar"><span style={{ width: pct + '%' }} /></div>
      </section>
      {cats.map((cat) => (
        <section key={cat} style={{ marginBottom: 18 }}>
          <h4 className="gold-text">{cat} <span className="msub">({mods.filter((m) => m.category === cat).length})</span></h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {mods.filter((m) => m.category === cat).map((m) => (
              <div key={m.id} className="glass" style={{ padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={done.includes(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} />
                  <span style={{ textDecoration: done.includes(m.id) ? 'line-through' : 'none', opacity: done.includes(m.id) ? 0.7 : 1 }}>{m.title}</span>
                </label>
                {m.doc_url && <a className="btn btn--sm" href={m.doc_url} target="_blank" rel="noreferrer">Open ↗</a>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function OutreachView() {
  const [templates, setTemplates] = useState<any[]>([])
  const [copied, setCopied] = useState<number | null>(null)
  useEffect(() => { api.get<{ templates: any[] }>('fellow/templates').then((d) => setTemplates(d.templates || [])).catch(() => {}) }, [])
  if (templates.length === 0) return <p className="msub">No approved templates yet. Ask an admin to add email/call/LinkedIn scripts.</p>
  const kinds = Array.from(new Set(templates.map((t) => t.kind)))
  const copy = (t: any) => { navigator.clipboard?.writeText(`${t.subject ? `Subject: ${t.subject}\n\n` : ''}${t.body || ''}`).then(() => { setCopied(t.id); setTimeout(() => setCopied(null), 1500) }).catch(() => {}) }
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <p className="msub">Approved scripts. Copy, personalize for the contact, send, then log it from the prospect's page ("Log activity → Email").</p>
      {kinds.map((k) => (
        <section key={k}>
          <h4 className="gold-text" style={{ textTransform: 'capitalize' }}>{STAGE_LABEL(k)} templates</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            {templates.filter((t) => t.kind === k).map((t) => (
              <div key={t.id} className="glass" style={{ padding: 14, borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <strong>{t.name}</strong>
                  <button className="btn btn--sm" onClick={() => copy(t)}>{copied === t.id ? 'Copied ✓' : 'Copy'}</button>
                </div>
                {t.subject && <div className="msub" style={{ fontSize: 12, margin: '4px 0' }}>Subject: {t.subject}</div>}
                {t.body && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: '#cfc9ba', margin: '6px 0 0', maxHeight: 160, overflow: 'auto' }}>{t.body}</pre>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function PerformanceView() {
  const [p, setP] = useState<any>(null)
  useEffect(() => { api.get<{ performance: any }>('fellow/crm/performance').then((d) => setP(d.performance)).catch(() => {}) }, [])
  if (!p) return <p className="msub">Loading…</p>
  const cols: [string, string][] = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']]
  return (
    <div>
      <div className="fc-sc-grid" style={{ marginBottom: 16 }}>
        <div className="glass" style={{ padding: '14px 16px', borderRadius: 12 }}><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Total Prospects</div><strong className="gold-text" style={{ fontSize: 24, fontFamily: 'var(--f-serif)' }}>{p.orgs}</strong></div>
        <div className="glass" style={{ padding: '14px 16px', borderRadius: 12 }}><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Pipeline Value</div><strong className="gold-text" style={{ fontSize: 24, fontFamily: 'var(--f-serif)' }}>{money(p.pipeline)}</strong></div>
        <div className="glass" style={{ padding: '14px 16px', borderRadius: 12 }}><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Sponsorships Won</div><strong className="gold-text" style={{ fontSize: 24, fontFamily: 'var(--f-serif)' }}>{p.won}</strong></div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Activity</th>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{PERF_ROWS.map(([k, lbl]) => (
            <tr key={k}><td>{lbl}</td>{cols.map(([c]) => <td key={c}>{p[c]?.[k] || 0}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function MaterialsView() {
  const [items, setItems] = useState<{ id: number; category: string; title: string; description?: string; url?: string }[]>([])
  useEffect(() => { api.get<{ materials: any[] }>('fellow/materials').then((d) => setItems(d.materials || [])).catch(() => {}) }, [])
  if (items.length === 0) return <p className="msub">No approved materials yet. Ask an admin to add them.</p>
  const cats = Array.from(new Set(items.map((m) => m.category)))
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {cats.map((cat) => (
        <section key={cat}>
          <h4 className="gold-text">{cat}</h4>
          <div className="fc-sc-grid">
            {items.filter((m) => m.category === cat).map((m) => (
              <div key={m.id} className="glass" style={{ padding: 14, borderRadius: 12 }}>
                <strong>{m.title}</strong>
                {m.description && <p className="msub" style={{ fontSize: 12, margin: '4px 0' }}>{m.description}</p>}
                {m.url && <a className="btn btn--sm" href={m.url} target="_blank" rel="noreferrer" style={{ marginTop: 6 }}>View / Download ↗</a>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ReportView() {
  const [f, setF] = useState<Record<string, string>>({ wins: '', challenges: '', help_needed: '', plan: '' })
  const [nums, setNums] = useState<Record<string, number>>({})
  const [msg, setMsg] = useState('')
  const load = useCallback(() => { api.get<{ today_numbers: Record<string, number> }>('fellow/reports').then((d) => setNums(d.today_numbers || {})).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const submit = async () => { await api.post('fellow/report', f); setMsg('Report submitted for today. ✓'); load() }
  return (
    <div style={{ maxWidth: 620 }}>
      <section className="glass" style={{ padding: 16, borderRadius: 12, marginBottom: 14 }}>
        <h4 className="gold-text" style={{ marginTop: 0 }}>Today's numbers (auto)</h4>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {PERF_ROWS.map(([k, lbl]) => <span key={k} className="msub"><strong style={{ color: '#f0ead6' }}>{nums[k] || 0}</strong> {lbl}</span>)}
        </div>
      </section>
      {(['wins', 'challenges', 'help_needed', 'plan'] as const).map((k) => (
        <label key={k} className="fc-fld" style={{ marginBottom: 10, display: 'block' }}>{k === 'help_needed' ? 'Help needed from management' : k === 'plan' ? 'Plan for tomorrow' : k}
          <textarea className="fc-input" rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>
      ))}
      {msg && <p className="msub" style={{ color: '#6be29a' }}>{msg}</p>}
      <button className="btn btn--solid" onClick={submit}>Submit End-of-Day Report</button>
    </div>
  )
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(''); const [cat, setCat] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const run = async () => {
    const rows = text.split('\n').map((l) => l.trim()).filter(Boolean).map((name) => ({ name }))
    if (rows.length === 0) { setMsg('Paste at least one organization name.'); return }
    setBusy(true)
    try { const d = await api.post<{ imported: number }>('fellow/orgs/import', { rows, category: cat }); setMsg(`Imported ${d.imported}. Duplicates were skipped.`); setTimeout(onSaved, 800) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Import failed.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text">Import Prospects</h3>
        <p className="msub">Paste organization names — one per line (e.g. from a target list). Duplicates are skipped automatically.</p>
        <label className="fc-fld" style={{ display: 'block', margin: '10px 0' }}>Category (optional)<input className="fc-input" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Corporate Sponsor…" /></label>
        <textarea className="fc-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Royal Caribbean\nCarnival Cruise Line\nBrunswick Corporation'} />
        {msg && <p className="msub" style={{ color: msg.startsWith('Imported') ? '#6be29a' : '#e08a8a', marginTop: 8 }}>{msg}</p>}
        <button className="btn btn--solid" onClick={run} disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Importing…' : 'Import'}</button>
      </div>
    </div>
  )
}

function ContactForm({ orgId, onSaved }: { orgId: number; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ name: '', title: '', email: '', phone: '', linkedin: '' })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'grid', gap: 6, margin: '6px 0 10px' }}>
      <input className="fc-input" placeholder="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
      <input className="fc-input" placeholder="Title" value={f.title} onChange={(e) => set('title', e.target.value)} />
      <input className="fc-input" placeholder="Email" value={f.email} onChange={(e) => set('email', e.target.value)} />
      <input className="fc-input" placeholder="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
      <button className="btn btn--sm btn--solid" onClick={async () => { if (!f.name.trim()) return; await api.post(`fellow/org/${orgId}/contact`, f); onSaved() }}>Save contact</button>
    </div>
  )
}
