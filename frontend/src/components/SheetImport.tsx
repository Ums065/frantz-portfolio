import { useState } from 'react'
import type { ResearchField } from '../lib/fellowFields'

/* Upload a CSV or Excel (.xlsx) sheet, auto-map its columns to our research
   fields, preview, then hand mapped rows to the parent to import. SheetJS is
   lazy-loaded (dynamic import) only when a file is chosen, so it never weighs
   down the initial bundle. */

const TARGET_FIELDS: { key: ResearchField; label: string }[] = [
  { key: 'title', label: 'Name / Title *' },
  { key: 'organization', label: 'Organization' },
  { key: 'contact_name', label: 'Contact person' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website / link' },
  { key: 'location', label: 'Location / district' },
  { key: 'source_url', label: 'Source URL' },
  { key: 'notes', label: 'Notes' },
]

// Header synonyms → target field. First match wins.
const SYNONYMS: Record<ResearchField, string[]> = {
  title: ['title', 'name', 'school', 'schoolname', 'organization', 'organisation', 'company', 'foundation', 'topic', 'creator', 'org'],
  organization: ['organization', 'organisation', 'org', 'company', 'orgname'],
  contact_name: ['contact', 'contactname', 'contactperson', 'principal', 'administrator', 'admin', 'person'],
  email: ['email', 'emailaddress', 'adminemail', 'contactemail', 'mail'],
  phone: ['phone', 'phonenumber', 'telephone', 'tel', 'mainphone', 'mobile', 'contactphone'],
  website: ['website', 'url', 'site', 'weburl', 'link', 'channel', 'profile', 'homepage'],
  location: ['location', 'district', 'borough', 'area', 'city', 'region', 'platform', 'state'],
  source_url: ['source', 'sourceurl', 'foundat', 'reference', 'link2'],
  notes: ['notes', 'note', 'description', 'findings', 'comments', 'comment', 'why', 'details'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function autoMap(headers: string[]): Record<ResearchField, number> {
  const used = new Set<number>()
  const map = {} as Record<ResearchField, number>
  const normed = headers.map(norm)
  for (const { key } of TARGET_FIELDS) {
    let idx = -1
    for (const syn of SYNONYMS[key]) {
      const i = normed.findIndex((h, j) => !used.has(j) && (h === syn || h.includes(syn)))
      if (i !== -1) { idx = i; break }
    }
    if (idx !== -1) used.add(idx)
    map[key] = idx
  }
  return map
}

export default function SheetImport({ onImport, disabled }: { onImport: (rows: Record<string, string>[]) => Promise<void>; disabled?: boolean }) {
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<ResearchField, number>>({} as Record<ResearchField, number>)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const reset = () => { setFileName(''); setHeaders([]); setRows([]); setMapping({} as Record<ResearchField, number>); setErr('') }

  const onFile = async (file: File | null) => {
    if (!file) return
    setErr(''); setBusy(true); setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as unknown[][]
      if (!aoa.length) { setErr('That sheet looks empty.'); setBusy(false); return }
      const hdr = (aoa[0] || []).map((h) => String(h ?? '').trim())
      const body = aoa.slice(1).map((r) => hdr.map((_, i) => String((r as unknown[])[i] ?? '').trim()))
      setHeaders(hdr); setRows(body); setMapping(autoMap(hdr))
    } catch {
      setErr('Could not read that file. Use a .csv or .xlsx sheet.')
    } finally { setBusy(false) }
  }

  const buildRows = (): Record<string, string>[] =>
    rows.map((r) => {
      const obj: Record<string, string> = {}
      for (const { key } of TARGET_FIELDS) { const i = mapping[key]; if (i != null && i >= 0) obj[key] = r[i] ?? '' }
      return obj
    }).filter((o) => (o.title || '').trim() !== '')

  const doImport = async () => {
    const built = buildRows()
    if (!built.length) { setErr('No rows with a Name/Title to import. Map the Name column first.'); return }
    setBusy(true); setErr('')
    try { await onImport(built); reset(); window.fcToast?.(`Imported ${built.length} rows.`) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Import failed.') }
    finally { setBusy(false) }
  }

  const importable = buildRows().length

  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }} className="btn btn--sm">
        ⬆ Upload sheet (CSV / Excel)
        <input type="file" accept=".csv,.xlsx,.xls" disabled={disabled || busy} style={{ display: 'none' }}
          onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
      </label>
      {fileName && <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--muted)' }}>{fileName}</span>}
      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 0' }}>Excel/Google Sheets works too — the first row must be column headers.</p>

      {err && <p style={{ color: '#ff9a9a', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}

      {headers.length > 0 && (
        <div style={{ marginTop: 14, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--gold-light)', marginBottom: 8 }}>
            Match columns ({rows.length} rows found)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 10, minWidth: 0 }}>
            {TARGET_FIELDS.map(({ key, label }) => (
              <label key={key} style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
                <select className="admin-select" style={{ fontSize: 12.5, padding: '6px 30px 6px 8px' }} value={mapping[key] ?? -1} onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}>
                  <option value={-1}>— skip —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>

          {/* Preview first 5 mapped rows */}
          <div className="admin-table-wrap glass" style={{ marginTop: 12 }}>
            <table className="admin-table admin-table--stack">
              <thead><tr>{TARGET_FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => <th key={f.key}>{f.label.replace(' *', '')}</th>)}</tr></thead>
              <tbody>
                {buildRows().slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {TARGET_FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                      <td key={f.key} data-label={f.label.replace(' *', '')} className="admin-cell--wrap">{r[f.key] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn--sm btn--solid" disabled={busy || !importable} onClick={() => void doImport()}>
              {busy ? 'Importing…' : `Import ${importable} row${importable === 1 ? '' : 's'}`}
            </button>
            <button className="btn btn--sm" disabled={busy} onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
