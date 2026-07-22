import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Pill, Modal, EcoTable, EcoStatChips } from './EcosystemAdminPanel'
import { RESEARCH_CATEGORIES, CATEGORY_LABEL, type ResearchCategory, type ResearchEntry } from '../../lib/fellowFields'

/* Admin side of the Youth Community Impact Fellow research workspace: create Fellow
   accounts, assign research tasks, review every entry, push verified school contacts
   into the schools data, and export to CSV for Google Sheets. */

interface Fellow { id: number; full_name: string; email: string }
const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--ivory)', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '0 0 5px' }

export default function ResearchAdminPanel() {
  const [rows, setRows] = useState<ResearchEntry[]>([])
  const [fellows, setFellows] = useState<Fellow[]>([])
  const [open, setOpen] = useState<ResearchEntry | null>(null)
  const [err, setErr] = useState('')

  const load = () => api.get<{ entries: ResearchEntry[]; fellows: Fellow[] }>('admin/research')
    .then((d) => { setRows(d.entries || []); setFellows(d.fellows || []) })
    .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load.'))
  useEffect(() => { void load() }, [])

  const by = (s: string) => rows.filter((r) => r.status === s).length

  const exportCsv = async (category: string) => {
    try {
      const d = await api.get<{ filename: string; csv: string }>(`admin/research/export${category ? `?category=${category}` : ''}`)
      const blob = new Blob([d.csv || ''], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = d.filename || 'research.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Export failed.') }
  }

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid var(--line)', borderRadius: 12, padding: '13px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gold)' }}>Research Workspace</div>
        <p style={{ color: '#d8d3c6', fontSize: 13, lineHeight: 1.6, margin: '5px 0 0' }}>
          Create a <strong>Youth Community Impact Fellow</strong> account, assign research tasks, review what they collect,
          push verified school contacts into your Schools data, and export any category to CSV for Google Sheets.
        </p>
      </div>
      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 14, minWidth: 0 }}>
        <CreateFellowCard onDone={(f) => setFellows(f)} />
        <AssignCard fellows={fellows} />
      </div>

      <EcoStatChips items={[
        { label: 'Total', value: rows.length },
        { label: 'Submitted', value: by('submitted'), tone: 'gold' },
        { label: 'Verified', value: by('verified'), tone: 'blue' },
        { label: 'Approved', value: by('approved'), tone: 'green' },
        { label: 'Rejected', value: by('rejected'), tone: 'red' },
      ]} />

      {/* CSV export bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Export CSV:</span>
        <button className="btn btn--sm" onClick={() => void exportCsv('')}>All</button>
        {RESEARCH_CATEGORIES.map((c) => (
          <button key={c.key} className="btn btn--sm" onClick={() => void exportCsv(c.key)}>{c.tabLabel}</button>
        ))}
      </div>

      <EcoTable<ResearchEntry>
        head={['#', 'Fellow', 'Category', 'Title', 'Details', 'Status', '']}
        rows={rows}
        searchText={(r) => `${r.title} ${r.organization} ${r.contact_name} ${r.email} ${r.fellow_name ?? ''}`}
        searchPlaceholder="Search research entries…"
        filters={[
          { label: 'categories', options: RESEARCH_CATEGORIES.map((c) => c.key), valueOf: (r) => r.category },
          { label: 'statuses', options: ['submitted', 'verified', 'approved', 'rejected', 'duplicate'], valueOf: (r) => r.status },
        ]}
        rowId={(r) => r.id}
        renderRow={(r, checkbox, index) => (
          <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
            {checkbox}
            <td className="admin-table__idx">{index}</td>
            <td data-label="Fellow">{r.fellow_name || `#${r.fellow_user_id}`}</td>
            <td data-label="Category">{CATEGORY_LABEL[r.category] || r.category}</td>
            <td data-label="Title" style={{ fontWeight: 600 }}>{r.title}</td>
            <td data-label="Details" className="admin-cell--wrap" style={{ color: 'var(--muted)' }}>{[r.contact_name, r.email, r.phone, r.location].filter(Boolean).join(' · ') || '—'}</td>
            <td data-label="Status"><Pill status={r.status} /></td>
            <td><button className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setOpen(r) }}>Review</button></td>
          </tr>
        )}
      />

      {open && <ReviewModal entry={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); void load() }} />}
    </div>
  )
}

function CreateFellowCard({ onDone }: { onDone: (fellows: Fellow[]) => void }) {
  const [full_name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const submit = async () => {
    setBusy(true); setNote('')
    try {
      const d = await api.post<{ fellows: Fellow[] }>('admin/fellow/create', { full_name, email, password })
      onDone(d.fellows || [])
      setName(''); setEmail(''); setPass(''); setNote('Fellow account created.')
      window.fcToast?.('Fellow account created.')
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not create account.') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, minWidth: 0 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--gold)', margin: '0 0 12px' }}>Create a Fellow account</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><label style={lbl}>Full name</label><input style={inp} value={full_name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label style={lbl}>Email</label><input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label style={lbl}>Temporary password</label><input style={inp} value={password} onChange={(e) => setPass(e.target.value)} placeholder="8+ chars, a letter & a number" /></div>
        <button className="btn btn--sm btn--solid" disabled={busy || !full_name || !email || !password} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create Fellow'}</button>
        {note && <p style={{ fontSize: 12.5, color: note.includes('created') ? '#8fd6a3' : '#ff9a9a', margin: 0 }}>{note}</p>}
      </div>
    </div>
  )
}

function AssignCard({ fellows }: { fellows: Fellow[] }) {
  const [user_id, setUid] = useState('')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [assign_date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const submit = async () => {
    if (!user_id || !title.trim()) { setNote('Pick a Fellow and enter a title.'); return }
    setBusy(true); setNote('')
    try {
      await api.post('admin/research/assignment', { user_id: Number(user_id), title, detail, assign_date })
      setTitle(''); setDetail(''); setDate(''); setNote('Assignment sent.')
      window.fcToast?.('Assignment sent.')
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not assign.') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, minWidth: 0 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--gold)', margin: '0 0 12px' }}>Assign a research task</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><label style={lbl}>Fellow</label>
          <select style={inp} value={user_id} onChange={(e) => setUid(e.target.value)}>
            <option value="">Choose a Fellow…</option>
            {fellows.map((f) => <option key={f.id} value={f.id}>{f.full_name} ({f.email})</option>)}
          </select>
        </div>
        <div><label style={lbl}>Task title</label><input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Verify 50 Queens schools" /></div>
        <div><label style={lbl}>Details (optional)</label><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
        <div><label style={lbl}>Due date (optional)</label><input style={inp} type="date" value={assign_date} onChange={(e) => setDate(e.target.value)} /></div>
        <button className="btn btn--sm btn--solid" disabled={busy || !fellows.length} onClick={() => void submit()}>{busy ? 'Sending…' : 'Assign task'}</button>
        {!fellows.length && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Create a Fellow account first.</p>}
        {note && <p style={{ fontSize: 12.5, color: note.includes('sent') ? '#8fd6a3' : '#ff9a9a', margin: 0 }}>{note}</p>}
      </div>
    </div>
  )
}

function ReviewModal({ entry, onClose, onDone }: { entry: ResearchEntry; onClose: () => void; onDone: () => void }) {
  const [adminNote, setNote] = useState(entry.admin_note || '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const setStatus = async (status: string) => {
    setBusy(status); setErr('')
    try { await api.put(`admin/research/entry/${entry.id}`, { status, admin_note: adminNote }); onDone() }
    catch (e) { setBusy(''); setErr(e instanceof Error ? e.message : 'Could not update.') }
  }
  const pushSchool = async () => {
    setBusy('push'); setErr('')
    try { await api.post(`admin/research/entry/${entry.id}/push-school`, {}); window.fcToast?.('Pushed to Schools.'); onDone() }
    catch (e) { setBusy(''); setErr(e instanceof Error ? e.message : 'Could not push.') }
  }

  const rows: Array<[string, string]> = [
    ['Fellow', entry.fellow_name || `#${entry.fellow_user_id}`],
    ['Category', CATEGORY_LABEL[entry.category] || entry.category],
    ['Organization', entry.organization], ['Contact', entry.contact_name],
    ['Email', entry.email], ['Phone', entry.phone], ['Website', entry.website],
    ['Location', entry.location], ['Source', entry.source_url],
  ]

  return (
    <Modal title={entry.title} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <Pill status={entry.status} />
        {entry.pushed_school_id ? <span style={{ fontSize: 12, color: '#8fd6a3' }}>✓ In Schools (#{entry.pushed_school_id})</span> : null}
      </div>
      <dl className="eco-dl" style={{ fontSize: 13, margin: '0 0 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}><dt style={{ color: 'var(--muted)' }}>{k}</dt><dd style={{ margin: 0, color: 'var(--ivory)', overflowWrap: 'anywhere' }}>{v}</dd></div>
        ))}
      </dl>
      {entry.notes && <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>{entry.notes}</p>}

      <label style={{ ...lbl, margin: '12px 0 5px' }}>Admin note (optional)</label>
      <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={adminNote} onChange={(e) => setNote(e.target.value)} />
      {err && <p style={{ color: '#ff9a9a', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {([['verified', 'Mark verified'], ['approved', 'Approve'], ['rejected', 'Reject'], ['duplicate', 'Duplicate']] as const).map(([st, l]) => (
          <button key={st} className={`btn btn--sm${entry.status === st ? ' btn--solid' : ''}`} disabled={!!busy} onClick={() => void setStatus(st)}>{busy === st ? '…' : l}</button>
        ))}
        {entry.category === 'school_contact' && !entry.pushed_school_id && (
          <button className="btn btn--sm btn--solid" disabled={!!busy} onClick={() => void pushSchool()} title="Create an unclaimed TrendCatch EDU school from this entry">{busy === 'push' ? '…' : '⬆ Push to Schools'}</button>
        )}
      </div>
    </Modal>
  )
}
