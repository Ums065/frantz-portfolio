import { useEffect, useState } from 'react'
import { api, type PressItem } from '../../lib/api'

const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(0,0,0,0.25)', color: 'var(--ivory)', fontSize: 14, width: '100%' }
const lbl: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }
const KINDS = ['youtube', 'instagram', 'website', 'video', 'photo']
const empty = (): Partial<PressItem> => ({ kind: 'website', title: '', url: '', thumbnail_url: '', source_name: '', sort_order: 0, is_active: 1 })

export default function PressAdminPanel() {
  const [rows, setRows] = useState<PressItem[]>([])
  const [editing, setEditing] = useState<Partial<PressItem> | null>(null)
  const [busy, setBusy] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [err, setErr] = useState('')

  const load = () => api.get<{ items: PressItem[] }>('admin/press').then((d) => setRows(d.items || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<PressItem>) => setEditing((e) => ({ ...(e || {}), ...patch }))

  const fetchThumb = async () => {
    const url = String(editing?.url || '').trim()
    if (!url) { setErr('Paste a URL first.'); return }
    setResolving(true); setErr('')
    try {
      const d = await api.post<{ kind: string; thumbnail: string; title: string; source: string }>('admin/press/resolve', { url })
      set({
        kind: d.kind || editing?.kind || 'website',
        thumbnail_url: d.thumbnail || editing?.thumbnail_url || '',
        title: editing?.title || d.title || '',
        source_name: editing?.source_name || d.source || '',
      })
      if (!d.thumbnail) setErr('No thumbnail found automatically — add a thumbnail URL manually (common for Instagram).')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read that URL.') } finally { setResolving(false) }
  }
  const save = async () => {
    if (!editing) return
    if (!String(editing.title || '').trim()) { setErr('Title is required.'); return }
    setBusy(true); setErr('')
    try {
      if (editing.id) await api.put(`admin/press/${editing.id}`, editing)
      else await api.post('admin/press', editing)
      setEditing(null); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  const remove = async (id: number) => { if (!window.confirm('Delete this press item?')) return; try { await api.del(`admin/press/${id}`); load() } catch { /* ignore */ } }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text" style={{ margin: 0 }}>Press &amp; Featured Media ({rows.length})</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>Articles, YouTube/Instagram videos & photos shown in the home "Featured In" popup. Paste a link and Fetch to auto-pull the thumbnail.</p>
        </div>
        <button className="btn btn--solid btn--sm" onClick={() => { setEditing(empty()); setErr('') }}>＋ Add Item</button>
      </div>

      <div className="admin-table-wrap" style={{ marginTop: 14 }}>
        <table className="admin-table">
          <thead><tr><th>Thumb</th><th>Title</th><th>Kind</th><th>Source</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6} className="msub" style={{ padding: 16 }}>No press items yet.</td></tr> : rows.map((r) => (
              <tr key={r.id} onClick={() => { setEditing({ ...r }); setErr('') }} style={{ cursor: 'pointer' }}>
                <td>{r.thumbnail_url ? <img src={r.thumbnail_url} alt="" style={{ width: 54, height: 32, objectFit: 'cover', borderRadius: 5 }} /> : <span className="msub">—</span>}</td>
                <td><strong>{r.title}</strong></td>
                <td style={{ textTransform: 'capitalize' }}>{r.kind}</td>
                <td className="msub">{r.source_name || '—'}</td>
                <td>{r.is_active ? '✓' : '—'}</td>
                <td onClick={(e) => e.stopPropagation()}><button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={() => remove(r.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Press Item' : 'Add Press Item'}</h3>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <label style={lbl}>Link (YouTube, Instagram, article, …)
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={inp} value={editing.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
                  <button className="btn btn--sm" type="button" onClick={fetchThumb} disabled={resolving}>{resolving ? '…' : 'Fetch'}</button>
                </div>
              </label>
              {editing.thumbnail_url ? <img src={editing.thumbnail_url} alt="Thumbnail" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} /> : null}
              <label style={lbl}>Thumbnail URL <span style={{ textTransform: 'none', fontWeight: 400 }}>(auto-filled; override if needed)</span>
                <input style={inp} value={editing.thumbnail_url || ''} onChange={(e) => set({ thumbnail_url: e.target.value })} placeholder="https://…/image.jpg" /></label>
              <label style={lbl}>Title<input style={inp} value={editing.title || ''} onChange={(e) => set({ title: e.target.value })} /></label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ ...lbl, flex: 1 }}>Kind
                  <select style={inp} value={editing.kind || 'website'} onChange={(e) => set({ kind: e.target.value })}>
                    {KINDS.map((k) => <option key={k} value={k} style={{ background: '#181509' }}>{k}</option>)}
                  </select></label>
                <label style={{ ...lbl, flex: 1 }}>Source<input style={inp} value={editing.source_name || ''} onChange={(e) => set({ source_name: e.target.value })} placeholder="e.g. Forbes" /></label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ ...lbl, flex: 1 }}>Sort order<input type="number" style={inp} value={editing.sort_order ?? 0} onChange={(e) => set({ sort_order: Number(e.target.value) })} /></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end', color: '#d8d3c6', fontSize: 13 }}><input type="checkbox" checked={!!editing.is_active} onChange={(e) => set({ is_active: e.target.checked ? 1 : 0 })} /> Active (show on site)</label>
              </div>
              {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
              <button className="btn btn--solid" type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
