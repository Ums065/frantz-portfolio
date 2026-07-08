import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

/* Admin management for the ecosystem roles (sponsor / partner / media / volunteer):
   review their requests, issue per-account documents (invoices, certificates,
   press kits…), and post announcements. */

interface EcoReq { id: number; org_name: string; role: string; req_type: string; message: string; status: string; admin_note: string; created_ts: number }
interface EcoAccount { user_id: number; role: string; org_name: string; email: string; approval_status: string }
interface EcoDoc { id: number; doc_type: string; label: string; url: string; created_ts: number }
interface EcoAnn { id: number; audience: string; title: string; body: string; created_ts: number }

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }
const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--ivory)', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', marginBottom: 5 }
const fmt = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return '' } }
const statusStyle = (s: string): React.CSSProperties => ({ color: ({ approved: 'var(--gold-light)', declined: '#ff9a9a', info_needed: 'var(--gold)' } as Record<string, string>)[s] || 'var(--muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' })

type Tab = 'requests' | 'documents' | 'announcements'

export default function EcosystemAdminPanel() {
  const [tab, setTab] = useState<Tab>('requests')
  const [reqs, setReqs] = useState<EcoReq[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [accounts, setAccounts] = useState<EcoAccount[]>([])
  const [anns, setAnns] = useState<EcoAnn[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<{ requests: EcoReq[] }>('admin/ecosystem/requests').then((d) => { setReqs(d.requests || []); setNotes(Object.fromEntries((d.requests || []).map((r) => [r.id, r.admin_note]))) }).catch((e) => setErr(String(e)))
    api.get<{ accounts: EcoAccount[] }>('admin/ecosystem/accounts').then((d) => setAccounts(d.accounts || [])).catch(() => {})
    api.get<{ announcements: EcoAnn[] }>('admin/ecosystem/announcements').then((d) => setAnns(d.announcements || [])).catch(() => {})
  }, [])

  const act = async (id: number, status: string) => {
    try { const d = await api.put<{ requests: EcoReq[] }>(`admin/ecosystem/request/${id}`, { status, admin_note: notes[id] || '' }); setReqs(d.requests || []) } catch (e) { setErr(String(e)) }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['requests', 'documents', 'announcements'] as const).map((t) => (
          <button key={t} className={`btn btn--sm${tab === t ? ' btn--solid' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>
      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}

      {tab === 'requests' && (
        reqs.length === 0 ? <div style={{ ...card, color: 'var(--muted)' }}>No ecosystem requests.</div> : reqs.map((r) => (
          <div key={r.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div><span className="gold-text" style={{ fontWeight: 800, textTransform: 'capitalize' }}>{r.role} · {r.req_type}</span><span style={{ color: 'var(--muted)', fontSize: 12.5, marginLeft: 8 }}>{r.org_name} · {fmt(r.created_ts)}</span></div>
              <span style={statusStyle(r.status)}>{r.status.replace('_', ' ')}</span>
            </div>
            {r.message && <p style={{ color: '#c7c1b4', fontSize: 13, margin: '8px 0 0' }}>“{r.message}”</p>}
            <input style={{ ...inp, marginTop: 10 }} placeholder="Note to the account…" value={notes[r.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn btn--solid btn--sm" onClick={() => act(r.id, 'approved')}>Approve</button>
              <button className="btn btn--sm" onClick={() => act(r.id, 'info_needed')}>Needs Info</button>
              <button className="btn btn--sm" onClick={() => act(r.id, 'declined')}>Decline</button>
            </div>
          </div>
        ))
      )}

      {tab === 'documents' && <DocumentIssuer accounts={accounts} />}

      {tab === 'announcements' && <Announcer anns={anns} setAnns={setAnns} />}
    </div>
  )
}

function DocumentIssuer({ accounts }: { accounts: EcoAccount[] }) {
  const [uid, setUid] = useState(0)
  const [docType, setDocType] = useState('invoice')
  const [label, setLabel] = useState('')
  const [docs, setDocs] = useState<EcoDoc[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const acct = accounts.find((a) => a.user_id === uid)

  const loadDocs = (id: number) => { if (id) api.get<{ documents: EcoDoc[] }>(`admin/ecosystem/documents/${id}`).then((d) => setDocs(d.documents || [])).catch(() => setDocs([])); else setDocs([]) }
  useEffect(() => { loadDocs(uid) }, [uid])

  const upload = async (file: File | null) => {
    if (!file || !uid || !acct) { setMsg('Pick an account first.'); return }
    setBusy(true); setMsg('')
    try {
      const up = await api.upload<{ url: string }>('admin/upload', file)
      const d = await api.post<{ documents: EcoDoc[] }>('admin/ecosystem/document', { user_id: uid, role: acct.role, doc_type: docType, label: label || file.name, file_url: up.url })
      setDocs(d.documents || []); setLabel(''); setMsg('Document added ✓')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Upload failed.') } finally { setBusy(false) }
  }
  const del = async (id: number) => { if (!confirm('Remove this document?')) return; await api.del(`admin/ecosystem/document/${id}`); loadDocs(uid) }

  return (
    <div style={{ ...card, display: 'grid', gap: 12 }}>
      <div><label style={lbl}>Account</label>
        <select style={inp} value={uid} onChange={(e) => setUid(Number(e.target.value))}>
          <option value={0}>Select an account…</option>
          {accounts.map((a) => <option key={a.user_id} value={a.user_id}>{a.role} · {a.org_name} ({a.email})</option>)}
        </select>
      </div>
      {uid > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <div><label style={lbl}>Type</label>
              <select style={inp} value={docType} onChange={(e) => setDocType(e.target.value)}>
                {['invoice', 'receipt', 'tax', 'agreement', 'report', 'certificate', 'press', 'handbook', 'document'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Label</label><input style={inp} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Q1 Invoice" /></div>
          </div>
          <label className="btn btn--sm btn--solid" style={{ cursor: 'pointer', justifySelf: 'start' }}>{busy ? 'Uploading…' : 'Upload PDF / image'}
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; upload(f) }} />
          </label>
          {msg && <span style={{ color: msg.includes('✓') ? 'var(--gold-light)' : '#ff9a9a', fontSize: 13 }}>{msg}</span>}
          <div style={{ display: 'grid', gap: 6 }}>
            {docs.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <a href={d.url} target="_blank" rel="noreferrer" style={{ color: 'var(--ivory)', fontSize: 13 }}>{d.label} · <span style={{ color: 'var(--muted)' }}>{d.doc_type}</span></a>
                <button className="btn btn--sm" onClick={() => del(d.id)}>✕</button>
              </div>
            ))}
            {docs.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No documents for this account yet.</p>}
          </div>
        </>
      )}
    </div>
  )
}

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
          <div><label style={lbl}>Audience</label><select style={inp} value={audience} onChange={(e) => setAudience(e.target.value)}>{['all', 'sponsor', 'partner', 'media', 'volunteer'].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
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
