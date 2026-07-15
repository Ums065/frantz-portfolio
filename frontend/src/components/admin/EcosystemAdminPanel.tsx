import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../lib/api'

/* Admin management for the ecosystem roles (sponsor / partner / media / volunteer)
   + business accounts. Record-friendly: filterable tables with a detail drawer,
   so it scales to lots of requests and accounts. Reuses the shared admin-table /
   admin-toolbar / admin-pager styles for visual consistency. */

interface EcoReq { id: number; user_id: number; org_name: string; role: string; req_type: string; message: string; status: string; admin_note: string; created_ts: number }
interface AccountProfile {
  user: { id: number; full_name: string; email: string; role: string; approval_status: string; created_at: string; referred_by_code: string | null }
  profile: Record<string, unknown>
  stats: { requests: number; documents: number; assignments: number }
}
interface EcoAccount { user_id: number; role: string; org_name: string; email: string; approval_status: string }
interface EcoDoc { id: number; doc_type: string; label: string; url: string; created_ts: number }
interface EcoAnn { id: number; audience: string; title: string; body: string; created_ts: number }
interface EcoAssign { id: number; title: string; detail: string; assign_date: string | null; status: string; created_ts: number }

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }
const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--ivory)', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', marginBottom: 5 }
const fmt = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const cap = (s: string) => (s || '').replace(/_/g, ' ')

const STATUS_COLORS: Record<string, string> = { approved: 'var(--gold-light)', declined: '#ff9a9a', rejected: '#ff9a9a', info_needed: 'var(--gold)', pending: 'var(--muted)', pending_review: 'var(--gold)' }
function Pill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || 'var(--muted)'
  return <span style={{ display: 'inline-block', color: c, border: `1px solid ${c}`, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{cap(status)}</span>
}

/* ---------- reusable filterable table (shared admin-* styles) ---------- */
interface FilterDef<T> { label: string; options: string[]; valueOf: (r: T) => string }
function EcoTable<T>({ head, rows, renderRow, searchText, filters = [], searchPlaceholder, pageSize = 12 }: {
  head: string[]; rows: T[]; renderRow: (r: T) => React.ReactNode; searchText?: (r: T) => string
  filters?: FilterDef<T>[]; searchPlaceholder?: string; pageSize?: number
}) {
  const [q, setQ] = useState('')
  const [fv, setFv] = useState<string[]>(filters.map(() => 'all'))
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => rows.filter((r) => {
    if (q && searchText && !searchText(r).toLowerCase().includes(q.toLowerCase())) return false
    for (let i = 0; i < filters.length; i++) if (fv[i] !== 'all' && (filters[i].valueOf(r) || '').toLowerCase() !== fv[i]) return false
    return true
  }), [rows, q, fv, filters, searchText])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safe = Math.min(page, pageCount)
  useEffect(() => { if (page !== safe) setPage(safe) }, [page, safe])
  const pageRows = filtered.slice((safe - 1) * pageSize, (safe - 1) * pageSize + pageSize)
  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        {searchText && <input className="admin-toolbar__search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder={searchPlaceholder || 'Search…'} />}
        {filters.map((f, i) => (
          <select key={f.label} className="admin-toolbar__filter" value={fv[i]} onChange={(e) => { const n = [...fv]; n[i] = e.target.value; setFv(n); setPage(1) }}>
            <option value="all">All {f.label}</option>
            {f.options.map((o) => <option key={o} value={o.toLowerCase()}>{cap(o)}</option>)}
          </select>
        ))}
        <span className="admin-toolbar__count">{filtered.length === rows.length ? rows.length : `${filtered.length} of ${rows.length}`} {rows.length === 1 ? 'record' : 'records'}</span>
      </div>
      <div className="admin-table-wrap glass">
        <table className="admin-table">
          <thead><tr>{head.map((h, i) => <th key={h || i}>{h}</th>)}</tr></thead>
          <tbody>
            {pageRows.length ? pageRows.map(renderRow) : <tr><td className="admin-table__empty" colSpan={head.length}>No matching records.</td></tr>}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="admin-pager">
          <button type="button" className="btn btn--sm" disabled={safe <= 1} onClick={() => setPage(safe - 1)}>‹ Prev</button>
          <span className="admin-pager__label">Page {safe} of {pageCount}</span>
          <button type="button" className="btn btn--sm" disabled={safe >= pageCount} onClick={() => setPage(safe + 1)}>Next ›</button>
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return createPortal(
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass" style={{ maxWidth: wide ? 620 : 480, width: '94%', margin: '9vh auto', maxHeight: '82vh', overflowY: 'auto', padding: 24, borderRadius: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 20, margin: 0 }}>{title}</h3>
          <button className="btn btn--sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>, document.body)
}

/* ============================ main panel ============================ */
type Tab = 'requests' | 'accounts' | 'announcements'

export default function EcosystemAdminPanel() {
  const [tab, setTab] = useState<Tab>('requests')
  const [reqs, setReqs] = useState<EcoReq[]>([])
  const [accounts, setAccounts] = useState<EcoAccount[]>([])
  const [anns, setAnns] = useState<EcoAnn[]>([])
  const [err, setErr] = useState('')
  const [openReq, setOpenReq] = useState<EcoReq | null>(null)
  const [openAcct, setOpenAcct] = useState<EcoAccount | null>(null)

  const loadReqs = () => api.get<{ requests: EcoReq[] }>('admin/ecosystem/requests').then((d) => setReqs(d.requests || [])).catch((e) => setErr(String(e)))
  const loadAccounts = () => api.get<{ accounts: EcoAccount[] }>('admin/ecosystem/accounts').then((d) => setAccounts(d.accounts || [])).catch(() => {})
  useEffect(() => {
    void loadReqs(); void loadAccounts()
    api.get<{ announcements: EcoAnn[] }>('admin/ecosystem/announcements').then((d) => setAnns(d.announcements || [])).catch(() => {})
  }, [])

  const pendingReqs = reqs.filter((r) => r.status === 'pending').length

  const TABS: Array<{ key: Tab; label: string; badge?: number }> = [
    { key: 'requests', label: 'Requests', badge: pendingReqs },
    { key: 'accounts', label: 'Accounts' },
    { key: 'announcements', label: 'Announcements' },
  ]

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn--sm${tab === t.key ? ' btn--solid' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}{t.badge ? <span style={{ marginLeft: 7, background: 'var(--gold)', color: '#1a1405', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}

      {tab === 'requests' && (
        <EcoTable<EcoReq>
          head={['Account', 'Role', 'Type', 'Request', 'Status', 'Date', '']}
          rows={reqs}
          searchText={(r) => `${r.org_name} ${r.role} ${r.req_type} ${r.message}`}
          searchPlaceholder="Search requests…"
          filters={[
            { label: 'roles', options: ['sponsor', 'partner', 'media', 'volunteer'], valueOf: (r) => r.role },
            { label: 'statuses', options: ['pending', 'approved', 'info_needed', 'declined'], valueOf: (r) => r.status },
          ]}
          renderRow={(r) => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpenReq(r)}>
              <td style={{ fontWeight: 600 }}>{r.org_name}</td>
              <td style={{ textTransform: 'capitalize' }}>{r.role}</td>
              <td style={{ textTransform: 'capitalize' }}>{cap(r.req_type)}</td>
              <td style={{ maxWidth: 260 }}><span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'var(--muted)' } as React.CSSProperties}>{r.message || '—'}</span></td>
              <td><Pill status={r.status} /></td>
              <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmt(r.created_ts)}</td>
              <td><button className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setOpenReq(r) }}>Review</button></td>
            </tr>
          )}
        />
      )}

      {tab === 'accounts' && (
        <EcoTable<EcoAccount>
          head={['Organization', 'Role', 'Email', 'Approval', '']}
          rows={accounts}
          searchText={(a) => `${a.org_name} ${a.role} ${a.email}`}
          searchPlaceholder="Search accounts…"
          filters={[
            { label: 'roles', options: ['sponsor', 'partner', 'media', 'volunteer', 'business'], valueOf: (a) => a.role },
            { label: 'approval', options: ['pending', 'approved', 'rejected'], valueOf: (a) => a.approval_status },
          ]}
          renderRow={(a) => (
            <tr key={a.user_id} style={{ cursor: 'pointer' }} onClick={() => setOpenAcct(a)}>
              <td style={{ fontWeight: 600 }}>{a.org_name}</td>
              <td style={{ textTransform: 'capitalize' }}>{a.role}</td>
              <td style={{ color: 'var(--muted)' }}>{a.email}</td>
              <td><Pill status={a.approval_status} /></td>
              <td><button className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setOpenAcct(a) }}>Manage</button></td>
            </tr>
          )}
        />
      )}

      {tab === 'announcements' && <Announcer anns={anns} setAnns={setAnns} />}

      {openReq && <RequestModal req={openReq} onClose={() => setOpenReq(null)} onDone={(list) => { setReqs(list); setOpenReq(null) }} />}
      {openAcct && <AccountModal acct={openAcct} onClose={() => setOpenAcct(null)} onApprovalChange={loadAccounts} />}
    </div>
  )
}

/* ---------- request review modal ---------- */
function RequestModal({ req, onClose, onDone }: { req: EcoReq; onClose: () => void; onDone: (list: EcoReq[]) => void }) {
  const [note, setNote] = useState(req.admin_note || '')
  const [busy, setBusy] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const act = async (status: string) => {
    setBusy(status)
    try { const d = await api.put<{ requests: EcoReq[] }>(`admin/ecosystem/request/${req.id}`, { status, admin_note: note }); onDone(d.requests || []) }
    catch { setBusy('') }
  }
  return (
    <Modal title={`${cap(req.req_type)} · ${req.org_name}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ textTransform: 'capitalize', color: 'var(--muted)', fontSize: 13 }}>{req.role}</span>
        <Pill status={req.status} />
        <button className="btn btn--sm" onClick={() => setShowProfile(true)}>View Profile</button>
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 'auto' }}>{fmt(req.created_ts)}</span>
      </div>
      {showProfile && <ProfileModal userId={req.user_id} onClose={() => setShowProfile(false)} />}
      {req.message && <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>{req.message}</p>}
      <label style={{ ...lbl, marginTop: 12 }}>Note to the applicant <span style={{ textTransform: 'none', color: 'var(--muted)', fontWeight: 400 }}>(for “Needs Info”, write what you need)</span></label>
      <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note — the applicant sees this…" />
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {([['approved', 'Approve'], ['info_needed', 'Needs Info'], ['declined', 'Decline']] as const).map(([st, l]) => (
          <button key={st} className={`btn btn--sm${req.status === st ? ' btn--solid' : ''}`} disabled={!!busy} onClick={() => act(st)}>{busy === st ? '…' : l}{req.status === st ? ' ✓' : ''}</button>
        ))}
      </div>
    </Modal>
  )
}

/* ---------- read-only applicant profile (View Profile) ---------- */
function ProfileModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const [p, setP] = useState<AccountProfile | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get<AccountProfile>(`admin/ecosystem/account/${userId}`).then(setP).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load profile.')) }, [userId])
  const row = (k: string, v: React.ReactNode) => (
    <><dt style={{ color: 'var(--muted)', fontSize: 12.5 }}>{k}</dt><dd style={{ margin: 0, color: '#e8e2d4', fontSize: 13.5, wordBreak: 'break-word' }}>{v || <span style={{ color: 'var(--muted)' }}>—</span>}</dd></>
  )
  const PRETTY: Record<string, string> = { tier: 'Tier', recognition_level: 'Recognition level', partner_type: 'Partner type', outlet: 'Outlet', beat: 'Beat', volunteer_type: 'Volunteer role', areas: 'Areas of expertise', availability: 'Availability', category: 'Category', borough: 'Borough / county', hours: 'Hours logged', events_supported: 'Events supported', students_mentored: 'Students mentored', logo_url: 'Logo' }
  const details = (p?.profile?.details && typeof p.profile.details === 'object') ? (p.profile.details as Record<string, unknown>) : {}
  return (
    <Modal title="Applicant Profile" onClose={onClose}>
      {!p && !err && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}
      {p && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg,rgba(201,168,76,.25),rgba(201,168,76,.06))', border: '1px solid var(--line)', color: 'var(--gold-light)', fontFamily: 'var(--f-serif)', fontSize: 20, fontWeight: 800 }}>{((p.profile.org_name as string) || p.user.full_name || '•').charAt(0).toUpperCase()}</div>
            <div>
              <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 18 }}>{(p.profile.org_name as string) || p.user.full_name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5, textTransform: 'capitalize' }}>{p.user.role} · joined {fmt(Math.floor(new Date(p.user.created_at).getTime() / 1000))}</div>
            </div>
            <span style={{ marginLeft: 'auto' }}><Pill status={p.user.approval_status} /></span>
          </div>

          <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: 9, columnGap: 12, margin: 0 }}>
            {row('Contact name', (p.profile.contact_name as string) || p.user.full_name)}
            {row('Email', <a href={`mailto:${p.user.email}`} style={{ color: 'var(--gold-light)' }}>{p.user.email}</a>)}
            {row('Phone', p.profile.contact_phone as string)}
            {row('Website', p.profile.website ? <a href={p.profile.website as string} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-light)' }}>{p.profile.website as string}</a> : '')}
            {p.profile.referral_code ? row('Referral code', String(p.profile.referral_code)) : null}
            {p.user.referred_by_code ? row('Referred by', String(p.user.referred_by_code)) : null}
            {Object.entries(details).filter(([k]) => k !== 'logo_url').map(([k, v]) => (
              <span key={k} style={{ display: 'contents' }}>{row(PRETTY[k] || k, String(v ?? ''))}</span>
            ))}
          </dl>

          {(p.profile.about as string) && (
            <div>
              <div style={{ ...lbl }}>About</div>
              <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{p.profile.about as string}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            {([['Requests', p.stats.requests], ['Documents', p.stats.documents], ['Assignments', p.stats.assignments]] as const).map(([k, v]) => (
              <div key={k}><div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22, fontWeight: 800 }}>{v}</div><div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div></div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------- per-account manager: approval + documents + recognition + assignments ---------- */
function AccountModal({ acct, onClose, onApprovalChange }: { acct: EcoAccount; onClose: () => void; onApprovalChange: () => void }) {
  const uid = acct.user_id
  const [docs, setDocs] = useState<EcoDoc[]>([])
  const [assigns, setAssigns] = useState<EcoAssign[]>([])
  const [approval, setApproval] = useState(acct.approval_status)
  // document form
  const [docType, setDocType] = useState('agreement'); const [label, setLabel] = useState(''); const [docBusy, setDocBusy] = useState(false); const [docMsg, setDocMsg] = useState('')
  // recognition
  const [hours, setHours] = useState(''); const [events, setEvents] = useState(''); const [students, setStudents] = useState(''); const [recMsg, setRecMsg] = useState('')
  // assignment form
  const [aTitle, setATitle] = useState(''); const [aDetail, setADetail] = useState(''); const [aDate, setADate] = useState(''); const [aBusy, setABusy] = useState(false)

  const loadDocs = () => api.get<{ documents: EcoDoc[] }>(`admin/ecosystem/documents/${uid}`).then((d) => setDocs(d.documents || [])).catch(() => setDocs([]))
  const loadAssigns = () => api.get<{ assignments: EcoAssign[] }>(`admin/ecosystem/assignments/${uid}`).then((d) => setAssigns(d.assignments || [])).catch(() => setAssigns([]))
  useEffect(() => { void loadDocs(); void loadAssigns() }, [uid])

  const setUserApproval = async (status: string) => {
    try { await api.put(`admin/user/${uid}/approval`, { approval_status: status }); setApproval(status); onApprovalChange() } catch { /* ignore */ }
  }
  const upload = async (file: File | null) => {
    if (!file) return
    setDocBusy(true); setDocMsg('')
    try { const up = await api.upload<{ url: string }>('admin/upload', file); await api.post('admin/ecosystem/document', { user_id: uid, role: acct.role, doc_type: docType, label: label || file.name, file_url: up.url }); setLabel(''); setDocMsg('Added ✓'); loadDocs() }
    catch (e) { setDocMsg(e instanceof Error ? e.message : 'Upload failed.') } finally { setDocBusy(false) }
  }
  const delDoc = async (id: number) => { if (!confirm('Remove this document?')) return; await api.del(`admin/ecosystem/document/${id}`); loadDocs() }
  const saveRec = async () => {
    setRecMsg('')
    try { await api.put(`admin/ecosystem/recognition/${uid}`, { hours: Number(hours || 0), events_supported: Number(events || 0), students_mentored: Number(students || 0) }); setRecMsg('Saved ✓') }
    catch (e) { setRecMsg(e instanceof Error ? e.message : 'Save failed.') }
  }
  const addAssign = async () => {
    if (!aTitle.trim()) return
    setABusy(true)
    try { const d = await api.post<{ assignments: EcoAssign[] }>('admin/ecosystem/assignment', { user_id: uid, role: acct.role, title: aTitle, detail: aDetail, assign_date: aDate }); setAssigns(d.assignments || []); setATitle(''); setADetail(''); setADate('') }
    catch { /* ignore */ } finally { setABusy(false) }
  }
  const setAssignStatus = async (id: number, status: string) => { await api.put(`admin/ecosystem/assignment/${id}`, { status }); loadAssigns() }
  const delAssign = async (id: number) => { if (!confirm('Remove this assignment?')) return; await api.del(`admin/ecosystem/assignment/${id}`); loadAssigns() }

  const sect: React.CSSProperties = { borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 14 }
  return (
    <Modal title={acct.org_name} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ textTransform: 'capitalize', color: 'var(--muted)', fontSize: 13 }}>{acct.role} · {acct.email}</span>
        <Pill status={approval} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ ...lbl, marginBottom: 0, alignSelf: 'center' }}>Approval:</span>
        {['approved', 'pending', 'rejected'].map((s) => (
          <button key={s} className={`btn btn--sm${approval === s ? ' btn--solid' : ''}`} onClick={() => setUserApproval(s)} style={{ textTransform: 'capitalize' }}>{s}{approval === s ? ' ✓' : ''}</button>
        ))}
      </div>

      <div style={sect}>
        <label style={lbl}>Recognition (hours / events / students)</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
          <input style={inp} type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours" />
          <input style={inp} type="number" min="0" value={events} onChange={(e) => setEvents(e.target.value)} placeholder="Events" />
          <input style={inp} type="number" min="0" value={students} onChange={(e) => setStudents(e.target.value)} placeholder="Students" />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <button className="btn btn--sm btn--solid" onClick={saveRec}>Save Recognition</button>
          {recMsg && <span style={{ color: recMsg.includes('✓') ? 'var(--gold-light)' : '#ff9a9a', fontSize: 13 }}>{recMsg}</span>}
        </div>
      </div>

      <div style={sect}>
        <label style={lbl}>Documents</label>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
          <select style={inp} value={docType} onChange={(e) => setDocType(e.target.value)}>{['invoice', 'receipt', 'tax', 'agreement', 'report', 'certificate', 'press', 'handbook', 'document'].map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <input style={inp} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <label className="btn btn--sm btn--solid" style={{ cursor: 'pointer' }}>{docBusy ? 'Uploading…' : 'Upload PDF / image'}
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; upload(f) }} />
          </label>
          {docMsg && <span style={{ color: docMsg.includes('✓') ? 'var(--gold-light)' : '#ff9a9a', fontSize: 13 }}>{docMsg}</span>}
        </div>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
              <a href={d.url} target="_blank" rel="noreferrer" style={{ color: 'var(--ivory)', fontSize: 13 }}>{d.label} · <span style={{ color: 'var(--muted)' }}>{d.doc_type}</span></a>
              <button className="btn btn--sm" onClick={() => delDoc(d.id)}>✕</button>
            </div>
          ))}
          {docs.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No documents yet.</p>}
        </div>
      </div>

      <div style={sect}>
        <label style={lbl}>Assignments</label>
        <input style={inp} value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Title — e.g. Mentor at Queens Innovation Academy" />
        <textarea style={{ ...inp, minHeight: 54, resize: 'vertical', marginTop: 8 }} value={aDetail} onChange={(e) => setADetail(e.target.value)} placeholder="Details (you can name the student / school here)" />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inp, maxWidth: 170 }} type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
          <button className="btn btn--sm btn--solid" disabled={aBusy || !aTitle.trim()} onClick={addAssign}>{aBusy ? 'Adding…' : 'Add Assignment'}</button>
        </div>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {assigns.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
              <div><span style={{ color: 'var(--ivory)', fontSize: 13, fontWeight: 600 }}>{a.title}</span> <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {a.status}{a.assign_date ? ` · ${a.assign_date}` : ''}</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                {a.status !== 'completed' && <button className="btn btn--sm" title="Mark completed" onClick={() => setAssignStatus(a.id, 'completed')}>✓</button>}
                <button className="btn btn--sm" onClick={() => delAssign(a.id)}>✕</button>
              </div>
            </div>
          ))}
          {assigns.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No assignments yet.</p>}
        </div>
      </div>
    </Modal>
  )
}

/* ---------- announcements ---------- */
function Announcer({ anns, setAnns }: { anns: EcoAnn[]; setAnns: (a: EcoAnn[]) => void }) {
  const [audience, setAudience] = useState('all')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const post = async () => {
    if (!title.trim()) return
    setBusy(true)
    try { const d = await api.post<{ announcements: EcoAnn[] }>('admin/ecosystem/announcement', { audience, title, body }); setAnns(d.announcements || []); setTitle(''); setBody('') } catch { /* ignore */ } finally { setBusy(false) }
  }
  const del = async (id: number) => { if (!confirm('Delete announcement?')) return; await api.del(`admin/ecosystem/announcement/${id}`); setAnns(anns.filter((a) => a.id !== id)) }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
          <div><label style={lbl}>Audience</label><select style={inp} value={audience} onChange={(e) => setAudience(e.target.value)}>{['all', 'sponsor', 'partner', 'media', 'volunteer', 'business', 'community'].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Title</label><input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        </div>
        <div><label style={lbl}>Body</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <button className="btn btn--solid btn--sm" style={{ justifySelf: 'start' }} disabled={busy} onClick={post}>{busy ? 'Posting…' : 'Post Announcement'}</button>
      </div>
      {anns.map((a) => (
        <div key={a.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div><span className="gold-text" style={{ fontWeight: 700 }}>{a.title}</span> <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {a.audience} · {fmt(a.created_ts)}</span>{a.body && <p style={{ color: '#c7c1b4', fontSize: 13, margin: '4px 0 0' }}>{a.body}</p>}</div>
          <button className="btn btn--sm" onClick={() => del(a.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}
