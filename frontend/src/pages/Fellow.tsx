import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import SheetImport from '../components/SheetImport'
import {
  RESEARCH_CATEGORIES, EMPTY_ENTRY_FORM,
  type ResearchCategory, type ResearchEntry, type CategoryConfig,
} from '../lib/fellowFields'

const WRAP_S: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 clamp(14px,4vw,24px) 60px', fontFamily: 'var(--f-body)' }
const cardS: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 'clamp(16px,3vw,22px)', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }
const inputS: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', color: 'var(--ivory)', fontSize: 14 }
const labelS: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '0 0 5px' }

interface Assignment {
  id: number; title: string; detail: string; assign_date: string | null
  status: string; volunteer_note: string; created_ts: number; responded_ts: number
}
type TabKey = 'overview' | ResearchCategory
type EntryForm = typeof EMPTY_ENTRY_FORM

export default function Fellow() {
  useSeo({ title: 'Fellow Research Workspace', noindex: true })
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const role = (user?.role || '').toLowerCase()
  const allowed = !!user && ['fellow', 'admin', 'super_admin'].includes(role)

  const [tab, setTab] = useState<TabKey>('overview')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [entries, setEntries] = useState<ResearchEntry[]>([])
  const [form, setForm] = useState<EntryForm>({ ...EMPTY_ENTRY_FORM })
  const [editId, setEditId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const activeCat = useMemo<CategoryConfig | null>(
    () => RESEARCH_CATEGORIES.find((c) => c.key === tab) ?? null,
    [tab],
  )

  const loadOverview = useCallback(() => {
    if (!allowed) return
    api.get<{ counts: Record<string, number>; assignments: Assignment[] }>('fellow/overview')
      .then((d) => { setCounts(d.counts || {}); setAssignments(d.assignments || []) })
      .catch(() => {})
  }, [allowed])

  const loadEntries = useCallback((cat: ResearchCategory) => {
    api.get<{ entries: ResearchEntry[] }>(`fellow/entries?category=${cat}`)
      .then((d) => setEntries(d.entries || []))
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => {
    if (activeCat) { loadEntries(activeCat.key); resetForm() }
  }, [activeCat, loadEntries])

  const resetForm = () => { setForm({ ...EMPTY_ENTRY_FORM }); setEditId(null); setMsg('') }

  const startEdit = (e: ResearchEntry) => {
    setEditId(e.id)
    setForm({
      title: e.title, organization: e.organization, contact_name: e.contact_name, email: e.email,
      phone: e.phone, website: e.website, location: e.location, source_url: e.source_url, notes: e.notes,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    if (!activeCat) return
    if (!form.title.trim()) { setMsg('Please fill in the name/title.'); return }
    setBusy(true); setMsg('')
    try {
      if (editId) {
        await api.put(`fellow/entry/${editId}`, form)
      } else {
        await api.post('fellow/entry', { ...form, category: activeCat.key })
      }
      resetForm()
      loadEntries(activeCat.key); loadOverview()
      window.fcToast?.('Saved.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save.')
    } finally { setBusy(false) }
  }

  const importRows = async (rowsIn: Record<string, string>[]) => {
    if (!activeCat) return
    await api.post('fellow/import', { category: activeCat.key, rows: rowsIn })
    loadEntries(activeCat.key); loadOverview()
  }

  const removeEntry = async (id: number) => {
    if (!activeCat) return
    if (!window.confirm('Delete this entry?')) return
    try { await api.del(`fellow/entry/${id}`); loadEntries(activeCat.key); loadOverview() } catch { /* ignore */ }
  }

  const respondAssignment = async (id: number, action: 'accept' | 'decline' | 'complete') => {
    let note = ''
    if (action === 'decline') { note = window.prompt('Reason (optional):') || '' }
    try {
      const d = await api.put<{ assignments: Assignment[] }>(`fellow/assignment/${id}/respond`, { action, note })
      setAssignments(d.assignments || [])
    } catch (err) { window.fcToast?.(err instanceof Error ? err.message : 'Could not respond.') }
  }

  if (loading) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="admin-loading glass"><span className="admin-kicker">Fellow Workspace</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, marginTop: 8 }}>Loading…</h1>
        </div>
      </div>
    )
  }
  if (!allowed) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="admin-login glass" style={{ maxWidth: 430, margin: '80px auto', padding: 'clamp(20px,6vw,36px)', borderRadius: 16, textAlign: 'center' }}>
          <span className="admin-kicker">Fellow access</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 8px' }}>Research Workspace</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.65 }}>Sign in with your Fellow account to open your research workspace.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn--solid" data-auth="login">Sign In</button>
            <button className="btn" onClick={() => navigate('/')}>Back to Home</button>
          </div>
        </div>
      </div>
    )
  }

  const openAssignments = assignments.filter((a) => a.status === 'active' || a.status === 'accepted')

  return (
    <div className="admin-page" style={WRAP_S}>
      <div style={{ maxWidth: 1040, margin: '0 auto', minWidth: 0, display: 'grid', gap: 12, paddingTop: 18 }}>
          <header className="glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 'clamp(14px,3vw,20px)', borderRadius: 16 }}>
            <div style={{ minWidth: 0 }}>
              <span className="admin-kicker">Youth Community Impact Fellow</span>
              <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,4vw,26px)', margin: '2px 0 0' }}>Research Workspace</h1>
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, overflowWrap: 'anywhere' }}>Signed in as {user?.full_name}</p>
            </div>
            <button className="btn btn--sm" onClick={() => void logout()}>Log out</button>
          </header>

          {/* Tabs */}
          <div className="admin-ov-tabs" role="tablist" aria-label="Workspace sections" style={{ margin: '4px 0 8px' }}>
            <button type="button" role="tab" aria-selected={tab === 'overview'} className={`admin-ov-tab${tab === 'overview' ? ' is-active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
            {RESEARCH_CATEGORIES.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={tab === c.key} className={`admin-ov-tab${tab === c.key ? ' is-active' : ''}`} onClick={() => setTab(c.key)}>
                {c.tabLabel}{counts[c.key] ? ` (${counts[c.key]})` : ''}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 12px' }}>My progress</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(130px,100%),1fr))', gap: 12, minWidth: 0 }}>
                  {RESEARCH_CATEGORIES.map((c) => (
                    <button key={c.key} type="button" onClick={() => setTab(c.key)} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 10px', cursor: 'pointer', color: 'inherit' }}>
                      <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, fontWeight: 800 }}>{counts[c.key] ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>{c.tabLabel}</div>
                    </button>
                  ))}
                </div>
              </section>

              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 12px' }}>My assignments</h2>
                {openAssignments.length === 0 && assignments.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No assignments yet. Your admin will assign research tasks here.</p>
                  : (
                    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                      {assignments.map((a) => (
                        <div key={a.id} style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <strong style={{ color: 'var(--ivory)', overflowWrap: 'anywhere' }}>{a.title}</strong>
                            <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--gold-light)' }}>{a.status}</span>
                          </div>
                          {a.detail && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.detail}</p>}
                          {a.assign_date && <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>Due: {a.assign_date}</p>}
                          {(a.status === 'active' || a.status === 'accepted') && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                              {a.status === 'active' && <button className="btn btn--sm btn--solid" onClick={() => void respondAssignment(a.id, 'accept')}>Accept</button>}
                              {a.status === 'active' && <button className="btn btn--sm" onClick={() => void respondAssignment(a.id, 'decline')}>Decline</button>}
                              <button className="btn btn--sm" onClick={() => void respondAssignment(a.id, 'complete')}>Mark complete</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
              </section>
            </div>
          )}

          {activeCat && (
            <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              <section style={cardS}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px' }}>{editId ? 'Edit entry' : `Add — ${activeCat.label}`}</h2>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>{activeCat.blurb}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 12, minWidth: 0 }}>
                  {activeCat.fields.map((f) => (
                    <div key={f.name} style={f.textarea ? { gridColumn: '1 / -1' } : undefined}>
                      <label style={labelS}>{f.label}{f.name === 'title' ? ' *' : ''}</label>
                      {f.textarea
                        ? <textarea style={{ ...inputS, minHeight: 76, resize: 'vertical' }} value={form[f.name]} placeholder={f.placeholder} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                        : <input style={inputS} value={form[f.name]} placeholder={f.placeholder} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />}
                    </div>
                  ))}
                </div>
                {msg && <p style={{ color: '#ff9a9a', fontSize: 13, margin: '10px 0 0' }}>{msg}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="btn btn--solid" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : editId ? 'Update entry' : 'Add entry'}</button>
                  {editId && <button className="btn" onClick={resetForm}>Cancel</button>}
                </div>
              </section>

              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 6px' }}>Import from a sheet</h2>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>Already have a spreadsheet? Upload it and the rows will be added to <strong>{activeCat.label}</strong>.</p>
                <SheetImport onImport={importRows} />
              </section>

              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 12px' }}>My {activeCat.tabLabel} entries ({entries.length})</h2>
                {entries.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing added yet. Use the form above.</p>
                  : (
                    <div className="admin-table-wrap glass">
                      <table className="admin-table admin-table--stack">
                        <thead><tr><th>Name</th><th>Details</th><th>Status</th><th></th></tr></thead>
                        <tbody>
                          {entries.map((e) => (
                            <tr key={e.id}>
                              <td data-label="Name"><strong style={{ color: 'var(--ivory)' }}>{e.title}</strong></td>
                              <td data-label="Details" className="admin-cell--wrap">
                                {[e.contact_name, e.email, e.phone, e.website, e.location].filter(Boolean).join(' · ') || e.notes || '—'}
                              </td>
                              <td data-label="Status">{e.status}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                  <button className="btn btn--sm" onClick={() => startEdit(e)}>Edit</button>
                                  <button className="btn btn--sm" onClick={() => void removeEntry(e.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </section>
            </div>
          )}
      </div>
    </div>
  )
}
