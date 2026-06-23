import { useEffect, useState, type CSSProperties } from 'react'
import { api, type SponsorApplicationRow, type SponsorLevelRow, type SponsorProgramRow } from '../../lib/api'

interface SponsorAdminPayload {
  program: SponsorProgramRow
  applications: SponsorApplicationRow[]
  paymentInstructions: string[]
  paymentStatusOptions: Array<'pending_check' | 'check_received' | 'payment_confirmed'>
  approvalStatusOptions: Array<'pending_review' | 'approved' | 'rejected' | 'published'>
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function labelizeStatus(value: string) {
  return value.split('_').join(' ')
}

export default function SponsorsAdminPanel() {
  const [program, setProgram] = useState<SponsorProgramRow | null>(null)
  const [levels, setLevels] = useState<SponsorLevelRow[]>([])
  const [rows, setRows] = useState<SponsorApplicationRow[]>([])
  const [paymentInstructions, setPaymentInstructions] = useState<string[]>([])
  const [paymentStatusOptions, setPaymentStatusOptions] = useState<SponsorAdminPayload['paymentStatusOptions']>(['pending_check', 'check_received', 'payment_confirmed'])
  const [approvalStatusOptions, setApprovalStatusOptions] = useState<SponsorAdminPayload['approvalStatusOptions']>(['pending_review', 'approved', 'rejected', 'published'])
  const [selected, setSelected] = useState<SponsorApplicationRow | null>(null)
  const [draft, setDraft] = useState<SponsorApplicationRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'all' | SponsorApplicationRow['payment_status']>('all')
  const [approvalFilter, setApprovalFilter] = useState<'all' | SponsorApplicationRow['approval_status']>('all')
  const [levelFilter, setLevelFilter] = useState('all')

  const organizationTypes = [
    'Corporation',
    'Small Business',
    'Nonprofit',
    'Foundation',
    'College / University',
    'Healthcare Organization',
    'Financial Institution',
    'Government Agency',
    'Community Organization',
    'Other',
  ]

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await api.get<SponsorAdminPayload>('admin/sponsorship/current/applications')
      setProgram(payload.program)
      setLevels(payload.program.levels || [])
      setRows(payload.applications || [])
      setPaymentInstructions(payload.paymentInstructions || [])
      setPaymentStatusOptions(payload.paymentStatusOptions || ['pending_check', 'check_received', 'payment_confirmed'])
      setApprovalStatusOptions(payload.approvalStatusOptions || ['pending_review', 'approved', 'rejected', 'published'])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sponsor applications.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const syncRow = (updated: SponsorApplicationRow, focus = false) => {
    setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
    if (focus || selected?.id === updated.id) {
      setSelected(updated)
      setDraft(updated)
    }
  }

  const openRow = (row: SponsorApplicationRow) => {
    setSelected(row)
    setDraft({ ...row })
    setError('')
  }

  const save = async (payload: Partial<SponsorApplicationRow> & { id?: number }, focus = false) => {
    const targetId = payload.id ?? selected?.id
    if (!targetId) return
    setBusy(true)
    setError('')
    try {
      const response = await api.put<{ application: SponsorApplicationRow }>(`admin/sponsorship/application/${targetId}`, payload)
      syncRow(response.application, focus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update sponsor application.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: SponsorApplicationRow) => {
    if (!confirm(`Remove sponsor application for ${row.organization_name}?`)) return
    setBusy(true)
    setError('')
    try {
      await api.del(`admin/sponsorship/application/${row.id}`)
      setRows((prev) => prev.filter((item) => item.id !== row.id))
      if (selected?.id === row.id) {
        setSelected(null)
        setDraft(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove sponsor application.')
    } finally {
      setBusy(false)
    }
  }

  const counts = {
    pending: rows.filter((row) => row.approval_status === 'pending_review').length,
    approved: rows.filter((row) => row.approval_status === 'approved').length,
    published: rows.filter((row) => row.approval_status === 'published').length,
    paid: rows.filter((row) => row.payment_status === 'payment_confirmed').length,
  }

  const filteredRows = rows.filter((row) => {
    const haystack = [
      row.organization_name,
      row.contact_person,
      row.email_address,
      row.organization_type,
      row.sponsorship_level_name,
      row.payment_status,
      row.approval_status,
    ].join(' ').toLowerCase()
    const matchesSearch = search.trim() === '' || haystack.includes(search.trim().toLowerCase())
    const matchesPayment = paymentFilter === 'all' || row.payment_status === paymentFilter
    const matchesApproval = approvalFilter === 'all' || row.approval_status === approvalFilter
    const matchesLevel = levelFilter === 'all' || row.sponsorship_level_slug === levelFilter
    return matchesSearch && matchesPayment && matchesApproval && matchesLevel
  })

  const exportCsv = () => {
    const headers = [
      'Organization Name',
      'Contact Person',
      'Email',
      'Phone',
      'Level',
      'Amount',
      'Payment Status',
      'Approval Status',
      'Applied At',
    ]
    const lines = [
      headers.join(','),
      ...filteredRows.map((row) => [
        row.organization_name,
        row.contact_person,
        row.email_address,
        row.phone_number,
        row.sponsorship_level_name,
        String(row.sponsorship_amount),
        row.payment_status,
        row.approval_status,
        row.created_at || '',
      ].map((value) => {
        const text = String(value ?? '').replace(/"/g, '""')
        return /[",\n]/.test(text) ? `"${text}"` : text
      }).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sponsor-applications.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
        <div className="glass" style={{ padding: 18, borderRadius: 14 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Program</div>
          <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22, marginTop: 8 }}>{program?.edition_name || 'Loading...'}</div>
        </div>
        <div className="glass" style={{ padding: 18, borderRadius: 14 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Pending Review</div>
          <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22, marginTop: 8 }}>{counts.pending}</div>
        </div>
        <div className="glass" style={{ padding: 18, borderRadius: 14 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Payment Confirmed</div>
          <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22, marginTop: 8 }}>{counts.paid}</div>
        </div>
        <div className="glass" style={{ padding: 18, borderRadius: 14 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Published</div>
          <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22, marginTop: 8 }}>{counts.published}</div>
        </div>
      </div>

      <div className="glass" style={{ padding: 20, borderRadius: 14, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 className="gold-text" style={{ margin: 0 }}>Sponsor Applications</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>{rows.length} sponsor records with check-payment and approval workflow.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--sm" type="button" onClick={exportCsv} disabled={!filteredRows.length}>Export CSV</button>
            <button className="btn btn--sm" type="button" onClick={() => void load()} disabled={loading || busy}>Refresh</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginBottom: 14 }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Search</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Organization, contact, email..." />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Payment Status</span>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}>
              <option value="all">All</option>
              {paymentStatusOptions.map((status) => <option key={status} value={status}>{labelizeStatus(status)}</option>)}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Approval Status</span>
            <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value as typeof approvalFilter)}>
              <option value="all">All</option>
              {approvalStatusOptions.map((status) => <option key={status} value={status}>{labelizeStatus(status)}</option>)}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Level</span>
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="all">All</option>
              {levels.map((level) => <option key={level.slug} value={level.slug}>{level.name}</option>)}
            </select>
          </label>
        </div>

        {error && <p style={{ color: '#e08a8a', marginBottom: 14 }}>{error}</p>}
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Loading sponsor applications...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                {['Organization', 'Contact', 'Level', 'Amount', 'Payment', 'Approval', 'Applied', 'Actions'].map((head) => (
                  <th key={head} style={{ textAlign: 'left', padding: '12px 10px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <strong>{row.organization_name}</strong>
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>{row.organization_type}</div>
                  </td>
                  <td style={tdStyle}>
                    <div>{row.contact_person}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>{row.email_address}</div>
                  </td>
                  <td style={tdStyle}>{row.sponsorship_level_name}</td>
                  <td style={tdStyle}>{formatMoney(row.sponsorship_amount)}</td>
                  <td style={tdStyle}>{labelizeStatus(row.payment_status)}</td>
                  <td style={tdStyle}>{labelizeStatus(row.approval_status)}</td>
                  <td style={tdStyle}>{formatDate(row.created_at)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn--sm" type="button" onClick={() => openRow(row)}>View / Edit</button>
                      <button className="btn btn--sm" type="button" onClick={() => void save({ id: row.id, approval_status: 'approved' })} disabled={busy}>Approve</button>
                      <button className="btn btn--sm" type="button" onClick={() => void save({ id: row.id, payment_status: 'check_received' })} disabled={busy}>Check Received</button>
                      <button className="btn btn--sm" type="button" onClick={() => void save({ id: row.id, payment_status: 'payment_confirmed' })} disabled={busy}>Confirm Payment</button>
                      <button className="btn btn--sm" type="button" onClick={() => void save({ id: row.id, approval_status: 'published' })} disabled={busy}>Publish</button>
                      <button className="btn btn--sm" type="button" onClick={() => void remove(row)} disabled={busy} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td style={tdStyle} colSpan={8}>No sponsor applications yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass" style={{ padding: 20, borderRadius: 14 }}>
        <h3 className="gold-text" style={{ marginTop: 0 }}>Check Payment Instructions</h3>
        <div style={{ color: 'var(--muted)', lineHeight: 1.8 }}>
          {paymentInstructions.map((line, index) => (
            <div key={`${line}-${index}`}>{line || <span>&nbsp;</span>}</div>
          ))}
        </div>
      </div>

      {selected && draft && (
        <div className="modal-overlay open" onClick={(event) => event.target === event.currentTarget && (setSelected(null), setDraft(null))}>
          <div className="modal" style={{ maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' }}>
            <button type="button" className="close" onClick={() => { setSelected(null); setDraft(null) }} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <span className="eyebrow">Sponsor Application</span>
                <h3 className="gold-text" style={{ marginTop: 8 }}>{selected.organization_name}</h3>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
                  Applied {formatDate(selected.created_at)} | Reviewed by {selected.reviewed_by_name || '—'}
                </p>
              </div>
              {selected.logo_url && (
                <img src={selected.logo_url} alt={`${selected.organization_name} logo`} style={{ width: 92, height: 92, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--line)', background: 'rgba(255,255,255,0.05)', padding: 10 }} />
              )}
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 20 }}>
              <label className="field">
                <span>Organization Name</span>
                <input type="text" value={draft.organization_name} onChange={(e) => setDraft({ ...draft, organization_name: e.target.value })} />
              </label>
              <label className="field">
                <span>Contact Person</span>
                <input type="text" value={draft.contact_person} onChange={(e) => setDraft({ ...draft, contact_person: e.target.value })} />
              </label>
              <label className="field">
                <span>Title / Position</span>
                <input type="text" value={draft.title_position || ''} onChange={(e) => setDraft({ ...draft, title_position: e.target.value })} />
              </label>
              <label className="field">
                <span>Email Address</span>
                <input type="email" value={draft.email_address} onChange={(e) => setDraft({ ...draft, email_address: e.target.value })} />
              </label>
              <label className="field">
                <span>Phone Number</span>
                <input type="text" value={draft.phone_number} onChange={(e) => setDraft({ ...draft, phone_number: e.target.value })} />
              </label>
              <label className="field">
                <span>Website</span>
                <input type="text" value={draft.website || ''} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
              </label>
              <label className="field">
                <span>Organization Type</span>
                <select value={draft.organization_type} onChange={(e) => setDraft({ ...draft, organization_type: e.target.value })}>
                  {organizationTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sponsorship Level</span>
                <select value={draft.sponsorship_level_slug} onChange={(e) => {
                  const next = levels.find((level) => level.slug === e.target.value)
                  setDraft({
                    ...draft,
                    sponsorship_level_slug: e.target.value,
                    sponsorship_level_name: next?.name || draft.sponsorship_level_name,
                    sponsorship_amount: e.target.value === 'custom_sponsorship'
                      ? draft.sponsorship_amount
                      : Math.max(next?.minimum_amount || 0, draft.sponsorship_amount),
                  })
                }}>
                  {levels.map((level) => (
                    <option key={level.slug} value={level.slug}>{level.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sponsorship Amount</span>
                <input type="number" value={draft.sponsorship_amount} onChange={(e) => setDraft({ ...draft, sponsorship_amount: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span>Payment Status</span>
                <select value={draft.payment_status} onChange={(e) => setDraft({ ...draft, payment_status: e.target.value as SponsorApplicationRow['payment_status'] })}>
                  {paymentStatusOptions.map((status) => (
                    <option key={status} value={status}>{labelizeStatus(status)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Approval Status</span>
                <select value={draft.approval_status} onChange={(e) => setDraft({ ...draft, approval_status: e.target.value as SponsorApplicationRow['approval_status'] })}>
                  {approvalStatusOptions.map((status) => (
                    <option key={status} value={status}>{labelizeStatus(status)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Street Address</span>
                <input type="text" value={draft.street_address} onChange={(e) => setDraft({ ...draft, street_address: e.target.value })} />
              </label>
              <label className="field">
                <span>City</span>
                <input type="text" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              </label>
              <label className="field">
                <span>State</span>
                <input type="text" value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
              </label>
              <label className="field">
                <span>Zip Code</span>
                <input type="text" value={draft.zip_code} onChange={(e) => setDraft({ ...draft, zip_code: e.target.value })} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Public Description</span>
                <textarea className="fld-area" value={draft.public_description || ''} onChange={(e) => setDraft({ ...draft, public_description: e.target.value })} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Company Bio</span>
                <textarea className="fld-area" value={draft.company_bio} onChange={(e) => setDraft({ ...draft, company_bio: e.target.value })} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Why Support This Initiative?</span>
                <textarea className="fld-area" value={draft.support_reason} onChange={(e) => setDraft({ ...draft, support_reason: e.target.value })} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Admin Notes</span>
                <textarea className="fld-area" value={draft.admin_notes || ''} onChange={(e) => setDraft({ ...draft, admin_notes: e.target.value })} />
              </label>
            </div>

            <div className="glass" style={{ padding: 16, borderRadius: 12, marginTop: 18 }}>
              <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>Optional Interests</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {draft.interests.length ? draft.interests.map((interest) => (
                  <span key={interest} className="status-pill status-pill--approved">{interest}</span>
                )) : <span style={{ color: 'var(--muted)' }}>No optional interests selected.</span>}
              </div>
            </div>

            {error && <p style={{ color: '#e08a8a', marginTop: 14 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
              <button className="btn btn--solid" type="button" disabled={busy} onClick={() => void save(draft, true)}>{busy ? 'Saving...' : 'Save Sponsor'}</button>
              <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void save({ id: draft.id, approval_status: 'approved' })}>Approve Sponsor</button>
              <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void save({ id: draft.id, approval_status: 'rejected' })}>Reject Sponsor</button>
              <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void save({ id: draft.id, payment_status: 'check_received' })}>Mark Check Received</button>
              <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void save({ id: draft.id, payment_status: 'payment_confirmed' })}>Mark Payment Confirmed</button>
              <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void save({ id: draft.id, approval_status: 'published' })}>Publish Sponsor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const tdStyle: CSSProperties = {
  padding: '12px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  verticalAlign: 'top',
}
