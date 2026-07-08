import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

/* Admin review of Business opportunity requests (implementation help / contact
   school / internship-hiring / volunteer). The admin decides whether consent is
   required from the student, parent/guardian, school, teacher, or program admin
   before anything proceeds — nothing is granted automatically. */

interface BizAdminRequest {
  id: number
  business_name: string
  request_type: string
  student_name: string | null
  school_name: string | null
  submission_id: number | null
  message: string
  status: string
  admin_note: string
  created_ts: number
}

const LABEL: Record<string, string> = {
  implementation: 'Implementation Help',
  contact_school: 'Contact School',
  internship: 'Internship / Hiring',
  volunteer: 'Volunteer Support',
}
const statusStyle = (s: string): React.CSSProperties => {
  const map: Record<string, string> = { approved: 'var(--gold-light)', declined: '#ff9a9a', info_needed: 'var(--gold)', pending: 'var(--muted)' }
  return { color: map[s] || 'var(--muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }
}
const fmtDate = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const cardS: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }
const inputS: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--ivory)', fontSize: 13 }

export default function BusinessRequestsAdminPanel() {
  const [rows, setRows] = useState<BizAdminRequest[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState(0)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending'>('pending')

  const load = () => api.get<{ requests: BizAdminRequest[] }>('admin/business-requests')
    .then((d) => { setRows(d.requests || []); setNotes(Object.fromEntries((d.requests || []).map((r) => [r.id, r.admin_note]))) })
    .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load requests.'))
  useEffect(() => { void load() }, [])

  const act = async (id: number, status: string) => {
    setBusyId(id); setErr('')
    try {
      const d = await api.put<{ requests: BizAdminRequest[] }>(`admin/business-request/${id}`, { status, admin_note: notes[id] || '' })
      setRows(d.requests || [])
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update.') }
    finally { setBusyId(0) }
  }

  const shown = rows.filter((r) => filter === 'all' || r.status === 'pending')
  const pendingCount = rows.filter((r) => r.status === 'pending').length

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>{pendingCount} pending · {rows.length} total</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn--sm${filter === 'pending' ? ' btn--solid' : ''}`} onClick={() => setFilter('pending')}>Pending</button>
          <button className={`btn btn--sm${filter === 'all' ? ' btn--solid' : ''}`} onClick={() => setFilter('all')}>All</button>
        </div>
      </div>

      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}

      {shown.length === 0
        ? <div style={{ ...cardS, color: 'var(--muted)', fontSize: 14 }}>No {filter === 'pending' ? 'pending ' : ''}business requests.</div>
        : shown.map((r) => (
          <div key={r.id} style={cardS}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span className="gold-text" style={{ fontWeight: 800, fontSize: 15 }}>{LABEL[r.request_type] || r.request_type}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12.5, marginLeft: 8 }}>· {r.business_name} · {fmtDate(r.created_ts)}</span>
              </div>
              <span style={statusStyle(r.status)}>{r.status.replace('_', ' ')}</span>
            </div>
            <div style={{ color: '#d8d3c6', fontSize: 13, marginTop: 6 }}>
              {[r.student_name && `Student: ${r.student_name}`, r.school_name && `School: ${r.school_name}`, r.submission_id && `Solution #${r.submission_id}`].filter(Boolean).join(' · ') || 'General request'}
            </div>
            {r.message && <p style={{ color: '#c7c1b4', fontSize: 13.5, margin: '8px 0 0', lineHeight: 1.55 }}>“{r.message}”</p>}
            <div style={{ marginTop: 12 }}>
              <input style={inputS} placeholder="Note to the business (consent required, next steps…)" value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn btn--solid btn--sm" disabled={busyId === r.id} onClick={() => act(r.id, 'approved')}>Approve</button>
              <button className="btn btn--sm" disabled={busyId === r.id} onClick={() => act(r.id, 'info_needed')}>Needs Info</button>
              <button className="btn btn--sm" disabled={busyId === r.id} onClick={() => act(r.id, 'declined')}>Decline</button>
            </div>
          </div>
        ))}
    </div>
  )
}
