import { useEffect, useMemo, useState } from 'react'
import { api, type PartnerRow, type PartnerPage, type PartnerStat } from '../../lib/api'

const TYPE_OPTIONS = ['Founding Partner', 'Presenting Sponsor', 'Corporate Partner', 'Business Partner', 'Media Partner', 'Government Partner', 'School Partner', 'Venue Partner', 'Civic Partner', 'Nonprofit Partner', 'Technology Partner', 'Financial Partner', 'Community Partner']
const INDUSTRY_OPTIONS = ['Financial', 'Healthcare', 'Technology', 'Media', 'Television', 'Radio & News', 'Education', 'Government', 'Sports & Entertainment', 'Retail', 'Nonprofit']

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,0.04)', color: 'var(--ivory)', fontSize: 13, width: '100%' }
const lbl: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }
const optStyle = { background: '#181509', color: 'var(--ivory)' }

const emptyPartner = (): Partial<PartnerRow> => ({ name: '', logo_url: '', partner_type: 'Business Partner', industry: '', borough: '', county: '', location: '', partner_since: '', website: '', blurb: '', is_featured: 0, is_media_partner: 0, status: 'published', sort_order: 0 })

export default function PartnersAdminPanel() {
  const [rows, setRows] = useState<PartnerRow[]>([])
  const [editing, setEditing] = useState<Partial<PartnerRow> | null>(null)
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState<PartnerPage | null>(null)
  const [pageBusy, setPageBusy] = useState(false); const [pageMsg, setPageMsg] = useState('')

  const load = () => {
    api.get<{ partners: PartnerRow[] }>('admin/partners').then((d) => setRows(d.partners || [])).catch(() => {})
    api.get<{ page: PartnerPage }>('admin/partners/settings').then((d) => setPage(d.page)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter((r) => !n || `${r.name} ${r.partner_type || ''} ${r.industry || ''} ${r.location || ''}`.toLowerCase().includes(n))
  }, [rows, q])

  const set = (patch: Partial<PartnerRow>) => setEditing((e) => ({ ...(e || {}), ...patch }))

  const save = async () => {
    if (!editing) return
    setErr(''); setMsg('')
    if (!String(editing.name || '').trim()) { setErr('Partner name is required.'); return }
    setBusy(true)
    try {
      if (editing.id) await api.put(`admin/partner/${editing.id}`, editing)
      else await api.post('admin/partner', editing)
      setMsg('Saved.'); setEditing(null); load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the partner.') } finally { setBusy(false) }
  }
  const remove = async (id: number) => {
    if (!window.confirm('Remove this partner?')) return
    try { await api.del(`admin/partner/${id}`); load() } catch { /* ignore */ }
  }
  const uploadLogo = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    try { const d = await api.upload<{ url: string }>('admin/upload', file); set({ logo_url: d.url }) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Logo upload failed.') } finally { setBusy(false) }
  }
  const savePage = async () => {
    if (!page) return
    setPageBusy(true); setPageMsg('')
    try { const d = await api.put<{ page: PartnerPage }>('admin/partners/settings', page); setPage(d.page); setPageMsg('Page content saved.') }
    catch { setPageMsg('Could not save page content.') } finally { setPageBusy(false) }
  }
  const setStat = (i: number, patch: Partial<PartnerStat>) => setPage((p) => p ? { ...p, stats: p.stats.map((s, idx) => idx === i ? { ...s, ...patch } : s) } : p)
  const addStat = () => setPage((p) => p ? { ...p, stats: [...p.stats, { label: '', value: '' }] } : p)
  const removeStat = (i: number) => setPage((p) => p ? { ...p, stats: p.stats.filter((_, idx) => idx !== i) } : p)

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* Page content */}
      {page && (
        <div className="glass" style={{ padding: '16px 20px' }}>
          <h3 className="gold-text" style={{ marginTop: 0 }}>Partners Page Content</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Hero, impact stats, and the "Partner With Us" call-to-action shown on the public /partners page.</p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <label style={lbl}>Hero heading<input value={page.hero.subtitle} onChange={(e) => setPage({ ...page, hero: { ...page.hero, subtitle: e.target.value } })} style={inp} /></label>
            <label style={{ ...lbl, gridColumn: '1 / -1' }}>Hero tagline<input value={page.hero.tagline} onChange={(e) => setPage({ ...page, hero: { ...page.hero, tagline: e.target.value } })} style={inp} /></label>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
            {page.hero.image ? <img src={page.hero.image} alt="" style={{ width: 90, height: 56, objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ width: 90, height: 56, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px dashed var(--line)', color: 'var(--muted)', fontSize: 10 }}>No image</span>}
            <label className="btn btn--sm" style={{ cursor: 'pointer' }}>Upload hero image<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => { const f = e.target.files?.[0] || null; e.target.value = ''; if (!f) return; try { const d = await api.upload<{ url: string }>('admin/upload', f); setPage((pg) => pg ? { ...pg, hero: { ...pg.hero, image: d.url } } : pg) } catch { /* ignore */ } }} /></label>
            {page.hero.image && <button className="btn btn--sm" type="button" onClick={() => setPage({ ...page, hero: { ...page.hero, image: '' } })}>Remove</button>}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Impact stats</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
            {page.stats.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input value={s.value} onChange={(e) => setStat(i, { value: e.target.value })} placeholder="Value (e.g. 25+)" style={{ ...inp, flex: '0 0 120px' }} />
                <input value={s.label} onChange={(e) => setStat(i, { label: e.target.value })} placeholder="Label (e.g. Partner Organizations)" style={inp} />
                <button className="btn btn--sm" type="button" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={() => removeStat(i)}>✕</button>
              </div>
            ))}
            {page.stats.length < 6 && <button className="btn btn--sm" type="button" onClick={addStat} style={{ justifySelf: 'start' }}>+ Add stat</button>}
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginTop: 12 }}>
            <label style={lbl}>CTA title<input value={page.cta.title} onChange={(e) => setPage({ ...page, cta: { ...page.cta, title: e.target.value } })} style={inp} /></label>
            <label style={lbl}>CTA button label<input value={page.cta.button_label} onChange={(e) => setPage({ ...page, cta: { ...page.cta, button_label: e.target.value } })} style={inp} /></label>
            <label style={lbl}>CTA button link<input value={page.cta.button_link} onChange={(e) => setPage({ ...page, cta: { ...page.cta, button_link: e.target.value } })} style={inp} /></label>
            <label style={{ ...lbl, gridColumn: '1 / -1' }}>CTA text<textarea value={page.cta.text} onChange={(e) => setPage({ ...page, cta: { ...page.cta, text: e.target.value } })} rows={2} style={{ ...inp, resize: 'vertical' }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <button className="btn btn--solid btn--sm" type="button" onClick={savePage} disabled={pageBusy}>{pageBusy ? 'Saving…' : 'Save Page Content'}</button>
            {pageMsg && <span className="msub" style={{ color: pageMsg.includes('Could not') ? '#e08a8a' : 'var(--green-bright)' }}>{pageMsg}</span>}
          </div>
        </div>
      )}

      {/* Partners list */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 className="gold-text" style={{ margin: 0 }}>Partners ({rows.length})</h3>
          <button className="btn btn--solid btn--sm" type="button" onClick={() => { setEditing(emptyPartner()); setErr(''); setMsg('') }}>＋ Add Partner</button>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, type, industry…" style={{ ...inp, margin: '12px 0', maxWidth: 360 }} />
        {filtered.length === 0 ? <p className="msub">No partners.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th></th><th>Name</th><th>Type</th><th>Industry</th><th>Location</th><th>Since</th><th>Flags</th><th>Status</th><th></th></tr></thead>
              <tbody>{filtered.map((r) => (
                <tr key={r.id} onClick={() => { setEditing({ ...r }); setErr(''); setMsg('') }} style={{ cursor: 'pointer' }}>
                  <td>{r.logo_url ? <img src={r.logo_url} alt="" style={{ width: 34, height: 34, objectFit: 'contain', background: '#fff', borderRadius: 6 }} /> : <span className="msub">—</span>}</td>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.partner_type || '—'}</td>
                  <td>{r.industry || '—'}</td>
                  <td className="msub">{r.location || '—'}</td>
                  <td>{r.partner_since || '—'}</td>
                  <td className="msub" style={{ fontSize: 12 }}>{[r.is_featured ? '★ Featured' : '', r.is_media_partner ? '📣 Media' : ''].filter(Boolean).join(' · ') || '—'}</td>
                  <td><span className={`status-pill ${r.status === 'published' ? 'status-pill--approved' : 'status-pill--new'}`}>{r.status}</span></td>
                  <td onClick={(e) => e.stopPropagation()}><button className="btn btn--sm" style={{ color: '#e08a8a', borderColor: '#e08a8a' }} onClick={() => remove(r.id)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / create modal */}
      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 640, width: '96vw', maxHeight: '92vh', overflowY: 'auto', textAlign: 'left', padding: 0, background: 'var(--bg-2, #14130d)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'linear-gradient(180deg,#1c1a12,#14130d)', borderBottom: '1px solid var(--line)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 className="gold-text" style={{ margin: 0, fontFamily: 'var(--f-serif)' }}>{editing.id ? 'Edit Partner' : 'Add Partner'}</h3>
              <button onClick={() => setEditing(null)} aria-label="Close" style={{ width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)', color: 'var(--ivory)', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {editing.logo_url ? <img src={editing.logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'contain', background: '#fff', borderRadius: 10, padding: 4 }} /> : <span style={{ width: 64, height: 64, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px dashed var(--line)', color: 'var(--muted)', fontSize: 11 }}>No logo</span>}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>{busy ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; uploadLogo(f) }} /></label>
              </div>
              <label style={lbl}>Name<input value={editing.name || ''} onChange={(e) => set({ name: e.target.value })} style={inp} /></label>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                <label style={lbl}>Partner type<input list="partner-types" value={editing.partner_type || ''} onChange={(e) => set({ partner_type: e.target.value })} style={inp} /><datalist id="partner-types">{TYPE_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist></label>
                <label style={lbl}>Industry<input list="partner-industries" value={editing.industry || ''} onChange={(e) => set({ industry: e.target.value })} style={inp} /><datalist id="partner-industries">{INDUSTRY_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist></label>
                <label style={lbl}>Borough<input value={editing.borough || ''} onChange={(e) => set({ borough: e.target.value })} placeholder="e.g. Bronx" style={inp} /></label>
                <label style={lbl}>County<input value={editing.county || ''} onChange={(e) => set({ county: e.target.value })} placeholder="e.g. Westchester" style={inp} /></label>
                <label style={lbl}>Location<input value={editing.location || ''} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. New York, NY" style={inp} /></label>
                <label style={lbl}>Partner since<input value={editing.partner_since || ''} onChange={(e) => set({ partner_since: e.target.value })} placeholder="e.g. 2021" style={inp} /></label>
                <label style={lbl}>Website<input value={editing.website || ''} onChange={(e) => set({ website: e.target.value })} placeholder="https://…" style={inp} /></label>
                <label style={lbl}>Sort order<input type="number" value={editing.sort_order ?? 0} onChange={(e) => set({ sort_order: Number(e.target.value) })} style={inp} /></label>
                <label style={lbl}>Status<select value={editing.status || 'published'} onChange={(e) => set({ status: e.target.value })} style={inp}><option style={optStyle} value="published">Published</option><option style={optStyle} value="draft">Draft</option></select></label>
              </div>
              <label style={lbl}>Blurb<textarea value={editing.blurb || ''} onChange={(e) => set({ blurb: e.target.value })} rows={3} style={{ ...inp, resize: 'vertical' }} /></label>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ivory)', fontSize: 13 }}><input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} /> ★ Featured (Spotlight)</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ivory)', fontSize: 13 }}><input type="checkbox" checked={!!editing.is_media_partner} onChange={(e) => set({ is_media_partner: e.target.checked ? 1 : 0 })} /> 📣 Media partner</label>
              </div>
              {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
              {msg && <p className="msub" style={{ color: 'var(--green-bright)', margin: 0 }}>{msg}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn--sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn--solid btn--sm" type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Partner'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
