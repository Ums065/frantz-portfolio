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
  const [view, setView] = useState<'day' | 'prospects' | 'pipeline'>('day')
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
        {(['day', 'prospects', 'pipeline'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={`admin-ov-tab${view === v ? ' is-active' : ''}`} onClick={() => setView(v)}>
            {v === 'day' ? 'My Day' : v === 'prospects' ? `Prospects (${orgs.length})` : 'Pipeline'}
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
                      <span className="msub">{f.due_date}{f.reason ? ` · ${f.reason}` : ''}</span>
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
                    <li key={t.id}><span>{t.title}</span><span className="msub">{t.priority}{t.due_date ? ` · due ${t.due_date}` : ''}</span></li>
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

      {adding && <AddProspect stages={stages} priorities={priorities} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh() }} />}
      {openId && <OrgDrawer id={openId} onClose={() => setOpenId(null)} onChange={refresh} />}
    </div>
  )
}

function AddProspect({ priorities, onClose, onSaved }: { stages: string[]; priorities: string[]; onClose: () => void; onSaved: () => void }) {
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
  const [data, setData] = useState<{ org: Org; contacts: Contact[]; timeline: Activity[]; followups: Followup[]; stages: string[] } | null>(null)
  const [logType, setLogType] = useState('email'); const [logDetail, setLogDetail] = useState(''); const [logFu, setLogFu] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const load = useCallback(() => { api.get<any>(`fellow/org/${id}`).then(setData).catch(() => {}) }, [id])
  useEffect(() => { load() }, [load])
  if (!data) return <div className="modal-overlay open" onClick={onClose}><div className="modal" style={{ maxWidth: 640 }}><p className="msub">Loading…</p></div></div>
  const o = data.org
  const changeStage = async (stage: string) => { await api.put(`fellow/org/${id}/stage`, { stage }); load(); onChange() }
  const logActivity = async () => {
    await api.post(`fellow/org/${id}/activity`, { type: logType, detail: logDetail, follow_up_date: logFu })
    setLogDetail(''); setLogFu(''); load(); onChange()
  }
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
