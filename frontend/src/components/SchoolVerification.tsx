import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import FcIcon from './FcIcon'

/* The Fellow's school-verification workspace: the master school list, filtered
   server-side (it runs to hundreds of rows), a panel to fill in what is missing,
   a record of HOW each school was confirmed, and an invitation to take part.
   Verifying a school makes it selectable at registration. */

interface School {
  id: number; title: string; dbn?: string; region?: string; priority?: string
  school_type?: string; grades?: string; neighborhood?: string; address?: string; zip?: string
  phone?: string; website?: string; contact_name?: string; parent_contact?: string; email?: string
  county?: string; district?: string; source_url?: string; notes?: string
  status: string; outreach_status: string; verify_method?: string; verified_on?: string
  pushed_school_id?: number | null
}
interface Facets {
  total: number; verified: number; contacted: number; registered: number
  regions: Record<string, number>; types: Record<string, number>; priorities: Record<string, number>
  methods: string[]; outreach_statuses: string[]
}

const label = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/* Plain wording for the audit trail — a Fellow should never wonder which to pick. */
const METHOD_LABEL: Record<string, string> = {
  phone_call: 'I called the school',
  online_research: 'I found it through online research',
  official_website: 'I read it on the official school website',
  email_reply: 'The school replied to my email',
  in_person: 'I visited in person',
  other: 'Other (explained in my notes)',
}
const OUTREACH_LABEL: Record<string, string> = {
  not_contacted: 'Not contacted yet',
  invited: 'Invitation sent',
  responded: 'They replied',
  registered: 'Registered for the challenge',
  declined: 'Said no this season',
  unreachable: 'Could not reach them',
}

const INVITE_DEFAULT = (school: string, who: string) =>
  `Dear ${school} team,

My name is ${who} and I am a Student Fellow with the Student Impact Challenge, a program of TrendCatch Gives Back Inc., a registered 501(c)(3) nonprofit.

We invite your school to take part in this season's challenge. Students interview local business owners, identify a real problem in their community, and build a solution for it. Taking part is free for your school, and participating students can earn scholarships; the winning school receives a school-impact grant.

Everything runs through your own staff: a teacher approves each student, scores their work on our rubric, and only your school's top three submissions go forward to the judges.

Could I send you the one-page overview, or arrange a short call with whoever handles enrichment programs?

Thank you for your time and for everything you already do for your students.`

export default function SchoolVerification() {
  const [rows, setRows] = useState<School[]>([])
  const [facets, setFacets] = useState<Facets | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const per = 50

  // Every filter is applied by the server; the browser never holds the full list.
  const [f, setF] = useState({ q: '', region: '', priority: '', school_type: '', status: '', outreach_status: '', needs_info: false })
  const set = (k: string, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setPage(1) }

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), per: String(per) })
    Object.entries(f).forEach(([k, v]) => { if (v !== '' && v !== false) qs.set(k, v === true ? '1' : String(v)) })
    setLoading(true)
    api.get<{ schools: School[]; total: number; facets: Facets }>(`fellow/schools?${qs}`)
      .then((d) => { setRows(d.schools || []); setTotal(d.total || 0); setFacets(d.facets) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [page, f])
  useEffect(() => { load() }, [load])

  const pages = Math.max(1, Math.ceil(total / per))
  const open = rows.find((r) => r.id === openId) || null
  const filtersOn = Object.values(f).some((v) => v !== '' && v !== false)

  return (
    <div>
      <header className="fc-head fc-head--bare">
        <div className="fc-head__actions">
          <button className="btn btn--sm btn--solid fc-btn-i" onClick={() => setImporting(true)}>
            <FcIcon name="upload" size={15} />Import school list
          </button>
        </div>
        <dl className="fc-kpis">
          <div><dt>Schools on your list</dt><dd>{facets?.total ?? '—'}</dd></div>
          <div><dt>Verified</dt><dd>{facets?.verified ?? '—'}</dd></div>
          <div><dt>Invited</dt><dd>{facets?.contacted ?? '—'}</dd></div>
          <div><dt>Registered</dt><dd>{facets?.registered ?? '—'}</dd></div>
        </dl>
      </header>

      <div className="fc-guide">
        <div className="fc-guide__head">
          <span className="fc-guide__icon"><FcIcon name="building" size={24} /></span>
          <div className="fc-guide__txt">
            <h3>School Verification</h3>
            <p>Every school here needs its contact details confirmed. Once you verify one, it becomes selectable when that school registers — so this list is how schools get into the challenge.</p>
          </div>
        </div>
        <ol className="fc-guide__steps">
          <li><span>1</span>Filter down to a workable batch — pick a borough and "Missing contact info".</li>
          <li><span>2</span>Open a school, find its phone, email and principal (call the school, or check its official website).</li>
          <li><span>3</span>Say <strong>how</strong> you confirmed it and press Verify. Then invite the school to take part.</li>
        </ol>
      </div>

      {/* Filters */}
      <div className="sv-filters">
        <input className="fc-input" type="search" style={{ flex: '1 1 200px' }} value={f.q}
          onChange={(e) => set('q', e.target.value)} placeholder="Search name, DBN, neighbourhood…" />
        <select className="fc-input" style={{ width: 'auto' }} value={f.region} onChange={(e) => set('region', e.target.value)}>
          <option value="" style={{ background: '#14120b' }}>All regions</option>
          {Object.entries(facets?.regions || {}).map(([r, n]) => <option key={r} value={r} style={{ background: '#14120b' }}>{r} ({n})</option>)}
        </select>
        <select className="fc-input" style={{ width: 'auto' }} value={f.school_type} onChange={(e) => set('school_type', e.target.value)}>
          <option value="" style={{ background: '#14120b' }}>All school types</option>
          {Object.entries(facets?.types || {}).map(([t, n]) => <option key={t} value={t} style={{ background: '#14120b' }}>{t} ({n})</option>)}
        </select>
        <select className="fc-input" style={{ width: 'auto' }} value={f.priority} onChange={(e) => set('priority', e.target.value)}>
          <option value="" style={{ background: '#14120b' }}>Any priority</option>
          {Object.entries(facets?.priorities || {}).map(([p, n]) => <option key={p} value={p} style={{ background: '#14120b' }}>{p} ({n})</option>)}
        </select>
        <select className="fc-input" style={{ width: 'auto' }} value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="" style={{ background: '#14120b' }}>Verified or not</option>
          <option value="unverified" style={{ background: '#14120b' }}>Not verified yet</option>
          <option value="verified" style={{ background: '#14120b' }}>Verified</option>
        </select>
        <select className="fc-input" style={{ width: 'auto' }} value={f.outreach_status} onChange={(e) => set('outreach_status', e.target.value)}>
          <option value="" style={{ background: '#14120b' }}>Any outreach state</option>
          {(facets?.outreach_statuses || []).map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{OUTREACH_LABEL[s] || label(s)}</option>)}
        </select>
        <label className="msub" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={f.needs_info} onChange={(e) => set('needs_info', e.target.checked)} />
          Missing contact info
        </label>
        {filtersOn && <button className="btn btn--sm" onClick={() => { setF({ q: '', region: '', priority: '', school_type: '', status: '', outreach_status: '', needs_info: false }); setPage(1) }}>Clear</button>}
      </div>

      <p className="msub" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        {loading ? 'Loading…' : `${total} school${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''}${filtersOn ? ' your filters' : ''}. Showing ${rows.length}.`}
      </p>

      {rows.length === 0 && !loading ? (
        <div className="fc-empty">
          <span><FcIcon name={facets?.total ? 'search' : 'building'} size={34} /></span>
          <h4>{facets?.total ? 'No school matches those filters' : 'No schools on your list yet'}</h4>
          <p className="msub">{facets?.total
            ? 'Try clearing a filter, or search a shorter word.'
            : 'Upload the master school list and every school appears here, ready to verify.'}</p>
          {!facets?.total && <button className="btn btn--solid fc-btn-i" onClick={() => setImporting(true)}><FcIcon name="upload" size={16} />Import school list</button>}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead><tr><th>School</th><th>Region</th><th>Type</th><th>Contact</th><th>Verified</th><th>Outreach</th></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(s.id)}>
                <td data-label="School">
                  <strong>{s.title}</strong>
                  <div className="msub" style={{ fontSize: 12 }}>{[s.neighborhood, s.dbn].filter(Boolean).join(' · ') || '—'}</div>
                </td>
                <td data-label="Region">{s.region || '—'}</td>
                <td data-label="Type">{s.school_type || '—'}<div className="msub" style={{ fontSize: 11.5 }}>{s.grades || ''}</div></td>
                <td data-label="Contact">
                  {[s.phone, s.email].filter(Boolean).length === 0
                    ? <span style={{ color: '#e0a86c' }}>Nothing yet</span>
                    : <span className="msub" style={{ fontSize: 12 }}>{[s.phone, s.email].filter(Boolean).join(' · ')}</span>}
                </td>
                <td data-label="Verified">
                  {s.status === 'verified'
                    ? <span className="fc-stage-pill" title={`${METHOD_LABEL[s.verify_method || ''] || ''}${s.verified_on ? ` — ${s.verified_on}` : ''}`}>Verified</span>
                    : <span className="msub">Not yet</span>}
                </td>
                <td data-label="Outreach">{OUTREACH_LABEL[s.outreach_status] || label(s.outreach_status)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
          <span className="msub" style={{ fontSize: 12.5 }}>Page {page} of {pages}</span>
          <button className="btn btn--sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {open && <SchoolPanel school={open} methods={facets?.methods || []} statuses={facets?.outreach_statuses || []}
        onClose={() => setOpenId(null)} onSaved={load} />}
      {importing && <SchoolImport onClose={() => setImporting(false)} onDone={() => { setImporting(false); load() }} />}
    </div>
  )
}

function SchoolPanel({ school, methods, statuses, onClose, onSaved }:
  { school: School; methods: string[]; statuses: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({
    title: school.title || '', dbn: school.dbn || '', region: school.region || '', priority: school.priority || '',
    school_type: school.school_type || '', grades: school.grades || '', neighborhood: school.neighborhood || '',
    address: school.address || '', zip: school.zip || '', phone: school.phone || '', website: school.website || '',
    contact_name: school.contact_name || '', parent_contact: school.parent_contact || '', email: school.email || '',
    county: school.county || '', district: school.district || '', source_url: school.source_url || '', notes: school.notes || '',
  })
  const [method, setMethod] = useState(school.verify_method || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [inviting, setInviting] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true); setErr(''); setMsg('')
    try { await api.put(`fellow/school/${school.id}`, f); setMsg('Saved.'); onSaved() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  const verify = async () => {
    if (!method) { setErr('Choose how you confirmed this school.'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      await api.put(`fellow/school/${school.id}`, f)          // never verify stale edits
      const r = await api.post<{ message: string }>(`fellow/school/${school.id}/verify`, { verify_method: method, source_url: f.source_url })
      setMsg(r.message || 'Verified.'); onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not verify.') } finally { setBusy(false) }
  }
  const setOutreach = async (st: string) => {
    try { await api.put(`fellow/school/${school.id}/outreach`, { outreach_status: st }); onSaved() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not update.') }
  }

  const FIELDS: [string, string, string?][] = [
    ['title', 'School name'], ['dbn', 'DBN / school ID'], ['region', 'Region / borough'],
    ['school_type', 'School type'], ['grades', 'Grades'], ['neighborhood', 'Neighbourhood'],
    ['address', 'Address'], ['zip', 'ZIP'], ['county', 'County'], ['district', 'District'],
    ['phone', 'Main phone', 'Call this to confirm the rest'], ['email', 'General email', 'Needed to send the invitation'],
    ['contact_name', 'Principal / school leader'], ['parent_contact', 'Parent coordinator'],
    ['website', 'Official website'], ['priority', 'Priority'],
  ]

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>{school.title}</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>
          {school.status === 'verified'
            ? <>Verified{school.verified_on ? ` on ${school.verified_on}` : ''}{school.verify_method ? ` — ${METHOD_LABEL[school.verify_method] || label(school.verify_method)}` : ''}.</>
            : 'Not verified yet. Fill in what you can find, then say how you confirmed it.'}
        </p>

        <div className="sv-grid" style={{ marginTop: 14 }}>
          {FIELDS.map(([k, lbl, hint]) => (
            <label key={k} className="fc-fld">{lbl}
              <input className="fc-input" value={f[k]} onChange={(e) => set(k, e.target.value)} />
              {hint && <span style={{ textTransform: 'none', fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>{hint}</span>}
            </label>
          ))}
        </div>
        <label className="fc-fld" style={{ marginTop: 10, display: 'block' }}>Notes
          <textarea className="fc-input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the next person should know." />
        </label>

        {/* The audit trail: how this record was confirmed. */}
        <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 14 }}>
          <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>How did you verify this?</h4>
          <p className="msub" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Be honest — the program relies on this. Saved with today's date and your name.</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {methods.map((m) => (
              <label key={m} className="msub" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: method === m ? '#f0ead6' : undefined }}>
                <input type="radio" name="verify_method" checked={method === m} onChange={() => setMethod(m)} />
                {METHOD_LABEL[m] || label(m)}
              </label>
            ))}
          </div>
          <label className="fc-fld" style={{ marginTop: 10 }}>Where did you find it? <span style={{ textTransform: 'none', fontWeight: 400 }}>(link, if online)</span>
            <input className="fc-input" value={f.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://…" />
          </label>
        </section>

        {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
        {msg && <p className="msub" style={{ color: '#6be29a' }}>{msg}</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
          <button className="btn btn--solid" onClick={verify} disabled={busy}>
            {school.status === 'verified' ? 'Re-verify' : 'Verify this school'}
          </button>
          {school.status === 'verified' && (
            <button className="btn fc-btn-i" onClick={() => setInviting(true)} disabled={busy}>
              <FcIcon name="send" size={15} />Invite to participate
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(201,168,76,.16)' }}>
          <label className="fc-fld" style={{ flex: '1 1 220px' }}>Outreach status
            <select className="fc-input" value={school.outreach_status} onChange={(e) => setOutreach(e.target.value)}>
              {statuses.map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{OUTREACH_LABEL[s] || label(s)}</option>)}
            </select>
          </label>
          {school.pushed_school_id ? <span className="fc-stage-pill">On the registration list</span> : null}
        </div>

        {inviting && <InviteModal school={school} onClose={() => setInviting(false)} onSent={() => { setInviting(false); onSaved() }} />}
      </div>
    </div>
  )
}

function InviteModal({ school, onClose, onSent }: { school: School; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState(`Invitation: the Student Impact Challenge — ${school.title}`)
  const [body, setBody] = useState(INVITE_DEFAULT(school.title, '[Your name]'))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState('')
  const leftover = Array.from(new Set(`${subject}\n${body}`.match(/\[[^\]\n]{2,30}\]/g) || []))
  const send = async () => {
    if (leftover.length > 0 && !window.confirm(`These placeholders are still in the invitation:\n\n${leftover.join('  ')}\n\nSend anyway?`)) return
    setBusy(true); setErr('')
    try {
      const r = await api.post<{ message: string }>(`fellow/school/${school.id}/invite`, { subject, body })
      setSent(r.message || 'Invitation sent.')
      setTimeout(onSent, 1200)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Invite {school.title}</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>Sent to <strong style={{ color: '#f0ead6' }}>{school.email}</strong> from the program address, signed with your name.</p>
        {sent ? <p style={{ color: '#6be29a', fontWeight: 700, marginTop: 16 }}>✓ {sent}</p> : (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <label className="fc-fld">Subject<input className="fc-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            <label className="fc-fld">Message<textarea className="fc-input" rows={14} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            {leftover.length > 0 && <div className="fc-dup">⚠ Still to fill in: {leftover.join('  ')}</div>}
            {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn--solid" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* Reads the client's own export as-is: rows are sent keyed by the sheet's own
   headers, and the server maps and deduplicates them. */
function SchoolImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ imported: number; skipped: number; skipped_rows?: { name: string; why: string }[] } | null>(null)

  const pick = async (file: File) => {
    setErr(''); setResult(null); setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (json.length === 0) { setErr('That sheet has no rows.'); return }
      setRows(json)
    } catch { setErr('Could not read that file. A .csv or .xlsx export works best.') }
  }
  const run = async () => {
    setBusy(true); setErr('')
    try { setResult(await api.post('fellow/schools/import', { rows })) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Import failed.') } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Import the school list</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>Upload the master list as .csv or .xlsx. Column names are recognized automatically, and any school already on your list is skipped rather than duplicated.</p>

        {result ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: '#6be29a', fontWeight: 700, margin: '0 0 6px' }}>✓ Imported {result.imported} schools.</p>
            <p className="msub" style={{ fontSize: 13 }}>{result.skipped} row{result.skipped === 1 ? '' : 's'} skipped as duplicates.</p>
            {(result.skipped_rows || []).length > 0 && (
              <ul className="fc-timeline" style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
                {(result.skipped_rows || []).map((r, i) => (
                  <li key={i}><span>{r.name}</span><span className="fc-timeline__t">{r.why}</span></li>
                ))}
              </ul>
            )}
            <button className="btn btn--solid" style={{ marginTop: 14 }} onClick={onDone}>Open my school list</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            <label className="fc-fld">Choose the file
              <input className="fc-input" type="file" accept=".csv,.xlsx,.xls"
                onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void pick(fl) }} />
            </label>
            {rows.length > 0 && (
              <>
                <p className="msub" style={{ fontSize: 13, margin: 0 }}>
                  <strong style={{ color: '#f0ead6' }}>{rows.length}</strong> rows found in {fileName}. Columns detected: {Object.keys(rows[0]).length}.
                </p>
                <p className="msub" style={{ fontSize: 12 }}>First row: {String((rows[0] as Record<string, unknown>)['School Name'] ?? Object.values(rows[0])[0] ?? '—')}</p>
              </>
            )}
            {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn--solid" onClick={run} disabled={busy || rows.length === 0}>
                {busy ? 'Importing…' : `Import ${rows.length || ''} schools`}
              </button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
