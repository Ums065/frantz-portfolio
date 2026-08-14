import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import Pager from '../Pager'

/* Donations, and the organisation details every receipt depends on. A receipt is
   a tax document here, so the panel is blunt about it: until the EIN is on file
   it shows a warning, because receipts already sent will have said they are
   incomplete. */

interface Donation {
  id: number; donation_no: string; receipt_no?: string | null
  donor_name: string; email: string; organization?: string | null; donor_role?: string | null
  amount: string | number; currency: string; designation?: string | null; message?: string | null
  is_anonymous?: number; provider?: string | null; payment_status: string
  paid_at?: string | null; receipt_url?: string | null; receipt_sent_at?: string | null
  created_at: string; account_name?: string | null
}
interface Org { org_legal_name: string; org_ein: string; org_address: string; org_email: string; org_receipt_signer: string }

const cash = (n: number, cur = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: (cur || 'usd').toUpperCase() }).format(n || 0)
const label = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const TONE: Record<string, string> = { paid: '#6be29a', pending: '#e0a86c', failed: '#e08a8a', refunded: '#b9b2a0' }

export default function DonationsAdminPanel() {
  const [rows, setRows] = useState<Donation[]>([])
  const [total, setTotal] = useState(0)
  const [filteredRaised, setFilteredRaised] = useState(0)
  const [allTime, setAllTime] = useState<any>({})
  const [org, setOrg] = useState<Org | null>(null)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')
  const [unreceipted, setUnreceipted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const per = 50

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), per: String(per) })
    if (q.trim()) qs.set('q', q.trim())
    if (status) qs.set('status', status)
    if (provider) qs.set('provider', provider)
    if (unreceipted) qs.set('unreceipted', '1')
    setLoading(true)
    api.get<any>(`admin/donations?${qs}`)
      .then((d) => {
        setRows(d.donations || []); setTotal(d.total || 0)
        setFilteredRaised(Number(d.filtered_raised) || 0)
        setAllTime(d.all_time || {}); setOrg(d.org || null)
      })
      .catch(() => {}).finally(() => setLoading(false))
  }, [page, q, status, provider, unreceipted])
  useEffect(() => {
    const t = setTimeout(load, q.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const resend = async (d: Donation) => {
    setBusyId(d.id)
    try {
      const r = await api.post<{ message: string }>(`admin/donation/${d.id}/receipt`, {})
      window.fcToast?.(r.message || 'Receipt sent.')
      load()
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not send the receipt.') }
    finally { setBusyId(null) }
  }

  const pages = Math.max(1, Math.ceil(total / per))
  const filtersOn = !!(q.trim() || status || provider || unreceipted)
  const cur = rows[0]?.currency || 'usd'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text" style={{ margin: 0 }}>Donations</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0', maxWidth: '66ch', lineHeight: 1.55 }}>
            Every gift made online, with the receipt that went to the donor. Card payments run through Stripe and PayPal —
            card details never reach this system.
          </p>
        </div>
        <button className="btn btn--sm" onClick={() => setSettingsOpen(true)}>Receipt details</button>
      </div>

      {/* Receipts are legal documents: say so if they are not yet complete. */}
      {org && org.org_ein.trim() === '' && (
        <div className="fc-dup" style={{ marginTop: 14 }}>
          ⚠ No EIN on file, so receipts are going out marked <strong>not complete for tax purposes</strong>. Add it under
          “Receipt details” and re-send any receipt already issued.
        </div>
      )}

      <div className="admin-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 10, margin: '16px 0' }}>
        {[['Raised all time', cash(Number(allTime.raised) || 0, cur)],
          ['Donations', Number(allTime.n) || 0],
          ['Donors', Number(allTime.donors) || 0],
          ['Average gift', cash(Number(allTime.average) || 0, cur)]].map(([l, v]) => (
          <div key={String(l)} className="glass" style={{ padding: '12px 14px', borderRadius: 12 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)' }}>{l}</div>
            <strong className="gold-text" style={{ fontSize: 21, fontFamily: 'var(--f-serif)' }}>{v}</strong>
          </div>
        ))}
      </div>

      <div className="sv-filters">
        <input className="fc-input" type="search" style={{ flex: '1 1 200px' }} value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Search donor, email, organisation or receipt no…" />
        <select className="fc-input" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="" style={{ background: '#14120b' }}>Any status</option>
          {['paid', 'pending', 'failed', 'refunded'].map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{label(s)}</option>)}
        </select>
        <select className="fc-input" style={{ width: 'auto' }} value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1) }}>
          <option value="" style={{ background: '#14120b' }}>Card or PayPal</option>
          <option value="stripe" style={{ background: '#14120b' }}>Card (Stripe)</option>
          <option value="paypal" style={{ background: '#14120b' }}>PayPal</option>
        </select>
        <label className="msub" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={unreceipted} onChange={(e) => { setUnreceipted(e.target.checked); setPage(1) }} />
          Paid but no receipt sent
        </label>
        {filtersOn && <button className="btn btn--sm" onClick={() => { setQ(''); setStatus(''); setProvider(''); setUnreceipted(false); setPage(1) }}>Clear</button>}
        <span className="msub" style={{ fontSize: 12.5 }}>{total} shown · {cash(filteredRaised, cur)} of it paid</span>
      </div>

      {loading ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading donations…</p> : total === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{filtersOn
          ? 'No donation matches those filters.'
          : 'No donations yet. They appear here the moment one is paid, with the receipt attached.'}</p>
      ) : (<>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead><tr><th>Donor</th><th>Amount</th><th>Towards</th><th>Paid by</th><th>Status</th><th>Receipt</th></tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id}>
                <td data-label="Donor">
                  <strong>{d.donor_name}</strong>{d.is_anonymous ? <span className="msub" style={{ fontSize: 11.5 }}> · anonymous publicly</span> : null}
                  <div className="msub" style={{ fontSize: 12 }}>{d.email}</div>
                  {d.organization ? <div className="msub" style={{ fontSize: 12 }}>{d.organization}</div> : null}
                  {d.donor_role ? <div className="msub" style={{ fontSize: 11.5 }}>{label(d.donor_role)} account</div> : null}
                </td>
                <td data-label="Amount"><strong>{cash(Number(d.amount), d.currency)}</strong>
                  <div className="msub" style={{ fontSize: 11.5 }}>{String(d.paid_at || d.created_at).slice(0, 10)}</div>
                </td>
                <td data-label="Towards">{d.designation || 'Where needed most'}
                  {d.message ? <div className="msub" style={{ fontSize: 11.5, maxWidth: 220 }}>“{d.message}”</div> : null}
                </td>
                <td data-label="Paid by">{d.provider === 'paypal' ? 'PayPal' : d.provider === 'stripe' ? 'Card' : '—'}</td>
                <td data-label="Status">
                  <span className="fc-stage-pill" style={{ color: TONE[d.payment_status], borderColor: (TONE[d.payment_status] || '#888') + '55', background: (TONE[d.payment_status] || '#888') + '18' }}>
                    {label(d.payment_status)}
                  </span>
                </td>
                <td data-label="Receipt">
                  {d.receipt_url && <a className="btn btn--sm" href={d.receipt_url} target="_blank" rel="noreferrer">Open ↗</a>}
                  {d.payment_status === 'paid' && (
                    <button className="btn btn--sm" style={{ marginLeft: 6 }} disabled={busyId === d.id} onClick={() => resend(d)}>
                      {busyId === d.id ? '…' : d.receipt_sent_at ? 'Re-send' : 'Send'}
                    </button>
                  )}
                  {d.receipt_no ? <div className="msub" style={{ fontSize: 11.5 }}>{d.receipt_no}</div> : null}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={total} unit="donations" onPage={setPage} />
      </>)}

      {settingsOpen && org && <OrgSettings org={org} onClose={() => setSettingsOpen(false)} onSaved={(o) => { setOrg(o); setSettingsOpen(false) }} />}
    </div>
  )
}

function OrgSettings({ org, onClose, onSaved }: { org: Org; onClose: () => void; onSaved: (o: Org) => void }) {
  const [f, setF] = useState<Org>(org)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof Org, v: string) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.put<{ org: Org; message: string }>('admin/org-identity', f)
      window.fcToast?.(r.message || 'Saved.')
      onSaved(r.org)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Receipt details</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>
          These print on every donation receipt. A receipt without an EIN is not complete for a donor's tax return, and
          says so on its face — so fill this in before asking anyone for money.
        </p>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <label className="fc-fld">Legal organisation name
            <input className="fc-input" value={f.org_legal_name} onChange={(e) => set('org_legal_name', e.target.value)} />
          </label>
          <label className="fc-fld">EIN <span style={{ textTransform: 'none', fontWeight: 400 }}>(federal tax ID, e.g. 12-3456789)</span>
            <input className="fc-input" value={f.org_ein} onChange={(e) => set('org_ein', e.target.value)} placeholder="Leave blank until you have it" />
          </label>
          <label className="fc-fld">Address on the receipt
            <input className="fc-input" value={f.org_address} onChange={(e) => set('org_address', e.target.value)} />
          </label>
          <label className="fc-fld">Office email <span style={{ textTransform: 'none', fontWeight: 400 }}>(also gets a copy of every receipt)</span>
            <input className="fc-input" type="email" value={f.org_email} onChange={(e) => set('org_email', e.target.value)} />
          </label>
          <label className="fc-fld">Signed by
            <input className="fc-input" value={f.org_receipt_signer} onChange={(e) => set('org_receipt_signer', e.target.value)} placeholder="e.g. Frantz Coutard, Founder" />
          </label>
          {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
          <button className="btn btn--solid" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save receipt details'}</button>
        </div>
      </div>
    </div>
  )
}
