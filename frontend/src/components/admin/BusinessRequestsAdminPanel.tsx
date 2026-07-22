import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Pill, Modal, EcoTable, EcoStatChips, ProfileModal } from './EcosystemAdminPanel'
import OfferStepper, { type OfferStage, type OfferEvent } from '../OfferStepper'

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
  decline_reason?: string
  declined_by?: string
  job_title?: string
  location?: string
  duration?: string
  stipend?: string
  working_hours?: string
  skills?: string
  stage?: OfferStage
  timeline?: OfferEvent[]
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

  const by = (s: string) => rows.filter((r) => r.status === s).length
  // A confirmed internship = fully consented by student + parent — a program win.
  const confirmedInternships = rows.filter((r) => r.request_type === 'internship' && r.parent_consent === 'accepted').length
  const bulkApprove = async (ids: number[]) => {
    // Only approve rows that aren't already approved, so re-selecting an approved
    // row and hitting "Approve selected" doesn't re-fire its notification email.
    const toApprove = ids.filter((id) => rows.find((r) => r.id === id)?.status !== 'approved')
    let failed = 0
    for (const id of toApprove) { try { await api.put(`admin/business-request/${id}`, { status: 'approved', admin_note: '' }) } catch { failed++ } }
    void load()
    window.fcToast?.(failed ? `${failed} of ${toApprove.length} could not be approved.` : `Approved ${toApprove.length}.`)
  }

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
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

      <EcoStatChips items={[
        { label: 'Total', value: rows.length },
        { label: 'Pending', value: by('pending'), tone: 'gold' },
        { label: 'Approved', value: by('approved'), tone: 'green' },
        { label: 'Declined', value: by('declined'), tone: 'red' },
        { label: '🎓 Internships placed', value: confirmedInternships, tone: 'green' },
      ]} />

      <EcoTable<BizAdminRequest>
        head={['#', 'Business', 'Type', 'Student / School', 'Request', 'Status', 'Date', '']}
        rows={rows}
        searchText={(r) => `${r.business_name} ${r.request_type} ${r.student_name || ''} ${r.school_name || ''} ${r.message}`}
        searchPlaceholder="Search business requests…"
        filters={[
          { label: 'types', options: ['implementation', 'contact_school', 'internship', 'volunteer'], valueOf: (r) => r.request_type },
          { label: 'statuses', options: ['pending', 'approved', 'info_needed', 'declined'], valueOf: (r) => r.status },
        ]}
        rowId={(r) => r.id}
        bulkActions={[{ label: 'Approve selected', onClick: bulkApprove }]}
        renderRow={(r, checkbox, index) => (
          <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
            {checkbox}
            <td className="admin-table__idx">{index}</td>
            <td data-label="Business" style={{ fontWeight: 600 }}>{r.business_name}</td>
            <td data-label="Type">{LABEL[r.request_type] || r.request_type}</td>
            <td data-label="Student / School" style={{ color: 'var(--muted)' }}>{[r.student_name, r.school_name].filter(Boolean).join(' · ') || '—'}</td>
            <td data-label="Request" className="admin-cell--wrap"><span style={clamp}>{r.message || '—'}</span></td>
            <td data-label="Status"><Pill status={r.status} /></td>
            <td data-label="Date" style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmt(r.created_ts)}</td>
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
  const [err, setErr] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const isInternship = req.request_type === 'internship'
  const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--ivory)', fontSize: 13 }
  const act = async (status: string) => {
    // A reason is mandatory when declining, so the business always learns why.
    if (status === 'declined' && note.trim() === '') { setErr('A reason is required when declining. Please add a note to the business.'); return }
    setErr(''); setBusy(status)
    try { const d = await api.put<{ requests: BizAdminRequest[] }>(`admin/business-request/${req.id}`, { status, admin_note: note }); onDone(d.requests || []) }
    catch (e) { setBusy(''); setErr(e instanceof Error ? e.message : 'Could not update the request.') }
  }
  const meta: Array<[string, string | undefined]> = [
    ['Role', req.job_title], ['Location', req.location], ['Duration', req.duration],
    ['Stipend', req.stipend], ['Working hours', req.working_hours], ['Skills', req.skills],
  ]
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

      {/* Rich internship details */}
      {isInternship && meta.some(([, v]) => v) && (
        <dl className="eco-dl" style={{ fontSize: 13, margin: '0 0 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
          {meta.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}><dt style={{ color: 'var(--muted)' }}>{k}</dt><dd style={{ margin: 0, color: 'var(--ivory)' }}>{v}</dd></div>
          ))}
        </dl>
      )}

      {/* Live status tracker for internships */}
      {isInternship && req.stage && (
        <div style={{ margin: '0 0 14px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
          <OfferStepper stage={req.stage} timeline={req.timeline} />
        </div>
      )}
      {isInternship && req.status !== 'approved' && !req.stage?.rejected && (
        <p style={{ color: 'var(--gold-light)', fontSize: 12.5, margin: '0 0 10px' }}>Approving this sends the offer to the student, then their parent/guardian for consent.</p>
      )}

      {req.message && <p style={{ color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>{req.message}</p>}

      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '12px 0 5px' }}>
        Note to the business <span style={{ textTransform: 'none', color: 'var(--muted)', fontWeight: 400 }}>(required to decline; for “Needs Info”, write what you need)</span>
      </label>
      <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The business sees this note…" />
      {err && <p style={{ color: '#ff9a9a', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {([['approved', 'Approve'], ['info_needed', 'Needs Info'], ['declined', 'Decline']] as const).map(([st, l]) => {
          const needsNote = (st === 'declined' || st === 'info_needed') && !note.trim()
          return (
            <button key={st} className={`btn btn--sm${req.status === st ? ' btn--solid' : ''}`} disabled={!!busy || needsNote} title={needsNote ? 'Add a reason/note first' : ''} onClick={() => act(st)}>{busy === st ? '…' : l}{req.status === st ? ' ✓' : ''}</button>
          )
        })}
      </div>
      {!note.trim() && <p style={{ color: 'var(--muted)', fontSize: 11.5, margin: '6px 0 0' }}>A note is required to Decline or request more info.</p>}
    </Modal>
  )
}
