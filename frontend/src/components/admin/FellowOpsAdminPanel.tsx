import { useEffect, useState, useCallback } from 'react'
import { api } from '../../lib/api'

/* Admin "Fellow Command Center": today's team activity, per-Fellow rollup, live
   activity feed, master pipeline, task assignment, and daily-target settings. */

interface Summary { active_fellows: number; prospects_added: number; emails: number; calls: number; linkedin: number; follow_ups: number; meetings: number; proposals: number; sponsors: number; pipeline_total: number; pipeline_new: number; pipeline_proposal: number; pipeline_confirmed: number }
interface FellowRow { id: number; full_name: string; email: string; orgs: number; pipeline: number; today_activity: number; won: number }
interface Activity { type: string; detail?: string; created_at: string; fellow_name: string; org_name?: string }

const money = (n: number) => '$' + (n || 0).toLocaleString('en-US')
const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function FellowOpsAdminPanel() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [fellows, setFellows] = useState<FellowRow[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [tab, setTab] = useState<'today' | 'activity' | 'assign' | 'targets'>('today')

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
        {(['today', 'activity', 'assign', 'targets'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`admin-ov-tab${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>
            {t === 'today' ? 'Today' : t === 'activity' ? 'Activity Feed' : t === 'assign' ? 'Assign Task' : 'Targets'}
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
          <h4 className="gold-text">Fellows ({fellows.length})</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Fellow</th><th>Today</th><th>Prospects</th><th>Pipeline</th><th>Won</th></tr></thead>
              <tbody>{fellows.length === 0 ? <tr><td colSpan={5} className="msub" style={{ padding: 16 }}>No Fellows yet.</td></tr> : fellows.map((f) => (
                <tr key={f.id}><td><strong>{f.full_name}</strong><div className="msub" style={{ fontSize: 12 }}>{f.email}</div></td>
                  <td>{f.today_activity}</td><td>{f.orgs}</td><td>{money(f.pipeline)}</td><td>{f.won}</td></tr>
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

      {tab === 'assign' && <AssignTask fellows={fellows} onDone={load} />}
      {tab === 'targets' && <TargetsForm onDone={load} />}
    </div>
  )
}

function AssignTask({ fellows, onDone }: { fellows: FellowRow[]; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ fellow_user_id: '', title: '', instructions: '', due_date: '', priority: 'medium' })
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.fellow_user_id || !f.title.trim()) { setErr('Pick a Fellow and enter a title.'); return }
    setErr(''); setMsg('')
    try { await api.post('admin/fellow-ops/task', { ...f, fellow_user_id: Number(f.fellow_user_id) }); setMsg('Task assigned.'); setF({ fellow_user_id: '', title: '', instructions: '', due_date: '', priority: 'medium' }); onDone() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not assign.') }
  }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      <label className="fc-fld">Fellow<select className="fc-input" value={f.fellow_user_id} onChange={(e) => set('fellow_user_id', e.target.value)}>
        <option value="" style={{ background: '#14120b' }}>Choose…</option>
        {fellows.map((x) => <option key={x.id} value={x.id} style={{ background: '#14120b' }}>{x.full_name}</option>)}
      </select></label>
      <label className="fc-fld">Task title<input className="fc-input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Research 25 healthcare companies" /></label>
      <label className="fc-fld">Instructions<textarea className="fc-input" rows={3} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 10 }}>
        <label className="fc-fld" style={{ flex: 1 }}>Due date<input className="fc-input" type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></label>
        <label className="fc-fld" style={{ flex: 1 }}>Priority<select className="fc-input" value={f.priority} onChange={(e) => set('priority', e.target.value)}>{['low', 'medium', 'high'].map((p) => <option key={p} value={p} style={{ background: '#14120b' }}>{p}</option>)}</select></label>
      </div>
      {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
      {msg && <p className="msub" style={{ color: '#6be29a' }}>{msg}</p>}
      <button className="btn btn--solid" onClick={save} style={{ justifySelf: 'start' }}>Assign Task</button>
    </div>
  )
}

function TargetsForm({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState<Record<string, number>>({ orgs: 10, emails: 10, calls: 5, linkedin: 5, follow_ups: 10 })
  const [msg, setMsg] = useState('')
  const set = (k: string, v: string) => setT((p) => ({ ...p, [k]: Number(v) || 0 }))
  const save = async () => { await api.put('admin/fellow-ops/targets', t); setMsg('Saved.'); onDone() }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
      <p className="msub">Daily targets shown on every Fellow's scorecard.</p>
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
