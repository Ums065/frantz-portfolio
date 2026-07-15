import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Pill, Modal, EcoTable, ProfileModal } from './EcosystemAdminPanel'

/* Admin review of Business opportunity requests (implementation help / contact
   school / internship-hiring / volunteer). Table + filters + detail modal, so it
   scales to lots of records. The business can't reach students/schools directly —
   admin approves and coordinates consent. */

interface BizAdminRequest {
  id: number
  business_user_id: number
  business_name: string
  request_type: string
  student_name: string | null
  school_name: string | null
  submission_id: number | null
  message: string
  status: string
  admin_note: string
  student_consent: string
  parent_consent: string
  created_ts: number
}

const LABEL: Record<string, string> = {
  implementation: 'Implementation Help',
  contact_school: 'Contact School',
  internship: 'Internship / Hiring',
  volunteer: 'Volunteer Support',
}
const fmt = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const clamp = { display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'var(--muted)' } as React.CSSProperties

export default function BusinessRequestsAdminPanel() {
  const [rows, setRows] = useState<BizAdminRequest[]>([])
  const [open, setOpen] = useState<BizAdminRequest | null>(null)
  const [err, setErr] = useState('')
  const load = () => api.get<{ requests: BizAdminRequest[] }>('admin/business-requests').then((d) => setRows(d.requests || [])).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load requests.'))
  useEffect(() => { void load() }, [])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid var(--line)', borderRadius: 12, padding: '13px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gold)' }}>What this tab is for</div>
        <p style={{ color: '#d8d3c6', fontSize: 13, lineHeight: 1.6, margin: '5px 0 0' }}>
          Opportunity requests raised by <strong>local businesses</strong> off a student's interview or submitted solution —
          <em> implementation help</em>, <em>hiring a student</em> (ages 16–19), <em>contacting a school</em>, or <em>volunteer support</em>.
          Review each and Approve / ask for more info / Decline. A business can <strong>never</strong> contact a student or school
          directly — you approve and coordinate the required consent. The business is emailed your decision.
        </p>
      </div>
      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}

      <EcoTable<BizAdminRequest>
        head={['Business', 'Type', 'Student / School', 'Request', 'Status', 'Date', '']}
        rows={rows}
        searchText={(r) => `${r.business_name} ${r.request_type} ${r.student_name || ''} ${r.school_name || ''} ${r.message}`}
        searchPlaceholder="Search business requests…"
        filters={[
          { label: 'types', options: ['implementation', 'contact_school', 'internship', 'volunteer'], valueOf: (r) => r.request_type },
          { label: 'statuses', options: ['pending', 'approved', 'info_needed', 'declined'], valueOf: (r) => r.status },
        ]}
        renderRow={(r) => (
          <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
            <td style={{ fontWeight: 600 }}>{r.business_name}</td>
            <td>{LABEL[r.request_type] || r.request_type}</td>
            <td style={{ color: 'var(--muted)' }}>{[r.student_name, r.school_name].filter(Boolean).join(' · ') || '—'}</td>
            <td style={{ maxWidth: 240 }}><span style={clamp}>{r.message || '—'}</span></td>
            <td><Pill status={r.status} /></td>
            <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmt(r.created_ts)}</td>
            <td><button className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setOpen(r) }}>Review</button></td>
          </tr>
        )}
      />

      {open && <BizRequestModal req={open} onClose={() => setOpen(null)} onDone={(list) => { setRows(list); setOpen(null) }} />}
    </div>
  )
}

function BizRequestModal({ req, onClose, onDone }: { req: BizAdminRequest; onClose: () => void; onDone: (list: BizAdminRequest[]) => void }) {
  const [note, setNote] = useState(req.admin_note || '')
  const [busy, setBusy] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--ivory)', fontSize: 13 }
  const act = async (status: string) => {
    setBusy(status)
    try { const d = await api.put<{ requests: BizAdminRequest[] }>(`admin/business-request/${req.id}`, { status, admin_note: note }); onDone(d.requests || []) }
    catch { setBusy('') }
  }
  return (
    <Modal title={`${LABEL[req.request_type] || req.request_type} · ${req.business_name}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Pill status={req.status} />
        <button className="btn btn--sm" onClick={() => setShowProfile(true)}>View Profile</button>
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 'auto' }}>{fmt(req.created_ts)}</span>
      </div>
      {showProfile && <ProfileModal userId={req.business_user_id} onClose={() => setShowProfile(false)} />}

      {(req.student_name || req.school_name) && (
        <p style={{ color: '#d8d3c6', fontSize: 13, margin: '0 0 10px' }}>
          <span style={{ color: 'var(--muted)' }}>Regarding:</span> {[req.student_name, req.school_name].filter(Boolean).join(' · ')}
        </p>
      )}
      {req.request_type === 'internship' && req.status === 'approved' && (
        <div style={{ display: 'flex', gap: 16, margin: '0 0 12px', flexWrap: 'wrap', fontSize: 12.5 }}>
          <span style={{ color: 'var(--muted)' }}>Consent chain:</span>
          <span>Student <Pill status={req.student_consent} /></span>
          <span>Parent <Pill status={req.parent_consent} /></span>
        </div>
      )}
      {req.request_type === 'internship' && req.status !== 'approved' && (
        <p style={{ color: 'var(--gold-light)', fontSize: 12.5, margin: '0 0 10px' }}>Approving this sends the offer to the student, then their parent/guardian for consent.</p>
      )}
      {req.message && <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>{req.message}</p>}

      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '12px 0 5px' }}>
        Note to the business <span style={{ textTransform: 'none', color: 'var(--muted)', fontWeight: 400 }}>(for “Needs Info”, write what you need)</span>
      </label>
      <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note — the business sees this…" />
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {([['approved', 'Approve'], ['info_needed', 'Needs Info'], ['declined', 'Decline']] as const).map(([st, l]) => (
          <button key={st} className={`btn btn--sm${req.status === st ? ' btn--solid' : ''}`} disabled={!!busy} onClick={() => act(st)}>{busy === st ? '…' : l}{req.status === st ? ' ✓' : ''}</button>
        ))}
      </div>
    </Modal>
  )
}
