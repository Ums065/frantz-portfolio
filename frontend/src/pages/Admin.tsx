import { useEffect, useState } from 'react'
import { api, type AnalyticsPayload, type AwardRow, type CommunityCommentRow, type CommunityThreadRow, type EventItem, type EventRsvpRow, type InventoryRow, type MediaRow, type PostDetail, type TestimonialRow, type User } from '../lib/api'
import { useAuth } from '../context/AuthContext'

interface RequestRow {
  id: number; request_type: string; full_name: string; email: string
  organization: string | null; message: string | null; status: string; created_at: string
}
interface SubRow { id: number; email: string; created_at: string }
interface ContactRow { id: number; full_name: string; email: string; message: string | null; created_at: string }
interface MemberRow { id: number; full_name: string; email: string; role: string; created_at: string }
interface OrderRow {
  id: number; order_no: string; customer_name: string; email: string; items: string
  total: string; payment_method: string; status: string; created_at: string
}
interface Submissions {
  requests: RequestRow[]; subscribers: SubRow[]; contacts: ContactRow[]; members: MemberRow[]; orders: OrderRow[]
}

const isAdmin = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')

export default function Admin() {
  const { user, loading, logout, refresh: refreshAuth } = useAuth()
  const [data, setData] = useState<Submissions | null>(null)
  const [tab, setTab] = useState<'analytics' | 'requests' | 'orders' | 'subscribers' | 'contacts' | 'members' | 'awards' | 'events' | 'blog' | 'testimonials' | 'media' | 'community' | 'rsvps' | 'inventory'>('analytics')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const refreshData = () =>
    api.get<Submissions>('admin/submissions').then(setData).catch(() => setData(null))

  useEffect(() => { if (isAdmin(user?.role)) refreshData() }, [user])

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    try {
      await api.post<{ user: User }>('auth/admin-login', { email, password })
      await refreshAuth()
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Login failed') }
  }

  const setStatus = async (id: number, status: string) => {
    await api.put(`admin/request/${id}`, { status })
    refreshData()
  }

  const setOrderStatus = async (id: number, status: string) => {
    await api.put(`admin/order/${id}`, { status })
    refreshData()
  }

  if (loading) {
    return (
      <div className="admin-page" style={wrapS}>
        <div className="admin-loading glass">
          <span className="admin-kicker">Admin Dashboard</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, marginTop: 8 }}>Loading secure workspace</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.65 }}>Verifying session and fetching live data...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin(user?.role)) {
    return (
      <div className="admin-page" style={wrapS}>
        <div className="admin-login glass" style={{ maxWidth: 380, margin: '80px auto', padding: 36, borderRadius: 16 }}>
          <span className="admin-kicker">Restricted access</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 8px' }}>Admin Login</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.65 }}>Sign in with an administrator account.</p>
          <form onSubmit={doLogin}>
            <div className="field"><label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@frantzcoutard.com" /></div>
            <div className="field"><label>Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
            {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}
            {user && !isAdmin(user.role) && <p style={{ color: '#e08a8a', fontSize: 13 }}>This account is not an admin.</p>}
            <button className="btn btn--solid" type="submit" style={{ width: '100%', marginTop: 8 }}>Login</button>
          </form>
        </div>
      </div>
    )
  }

  const tabs = [
    ['analytics', 'Analytics'],
    ['requests', `Requests (${data?.requests.length ?? 0})`],
    ['orders', `Orders (${data?.orders?.length ?? 0})`],
    ['subscribers', `Subscribers (${data?.subscribers.length ?? 0})`],
    ['contacts', `Contacts (${data?.contacts.length ?? 0})`],
    ['members', `Members (${data?.members.length ?? 0})`],
    ['awards', 'Awards'],
    ['events', 'Events'],
    ['blog', 'Blog'],
    ['testimonials', 'Testimonials'],
    ['media', 'Media'],
    ['community', 'Community'],
    ['rsvps', 'RSVPs'],
    ['inventory', 'Inventory'],
  ] as const

  return (
    <div className="admin-page" style={wrapS}>
      <div className="admin-shell" style={{ maxWidth: 1240, margin: '0 auto' }}>
        <header className="admin-header glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 28px 24px', borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
          <div>
            <span className="admin-kicker">Admin Dashboard</span>
            <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, marginTop: 6 }}>Command Center</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 640, lineHeight: 1.6 }}>
              Signed in as {user?.full_name} | {user?.role}. Manage requests, orders, content, and inventory from one secure console.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a className="btn btn--sm" href="/">View Site</a>
            <button className="btn btn--sm" onClick={() => logout()}>Logout</button>
          </div>
        </header>

        <div className="admin-stats">
          <div className="admin-stat glass"><span>Requests</span><strong>{data?.requests.length ?? 0}</strong><p>Forms awaiting review</p></div>
          <div className="admin-stat glass"><span>Orders</span><strong>{data?.orders?.length ?? 0}</strong><p>Commerce records</p></div>
          <div className="admin-stat glass"><span>Members</span><strong>{data?.members.length ?? 0}</strong><p>Approved accounts</p></div>
          <div className="admin-stat glass"><span>Contacts</span><strong>{data?.contacts.length ?? 0}</strong><p>Inbound messages</p></div>
        </div>

        <div className="admin-tabs" style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {tabs.map(([key, label]) => (
            <button key={key} className={tab === key ? 'btn btn--sm btn--solid' : 'btn btn--sm'} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {tab === 'analytics' && <AnalyticsAdmin />}

        {tab === 'requests' && (
          <Table head={['Type', 'Name', 'Email', 'Org', 'Message', 'Status', 'Date']}>
            {data?.requests.map((r) => (
              <tr key={r.id} style={rowS}>
                <td style={tdS}>{r.request_type}</td>
                <td style={tdS}>{r.full_name}</td>
                <td style={tdS}>{r.email}</td>
                <td style={tdS}>{r.organization || '—'}</td>
                <td style={{ ...tdS, maxWidth: 240 }}>{r.message || '—'}</td>
                <td style={tdS}>
                  <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} style={selectS}>
                    <option value="new">new</option>
                    <option value="reviewed">reviewed</option>
                    <option value="approved">approved</option>
                    <option value="closed">closed</option>
                  </select>
                </td>
                <td style={tdS}>{r.created_at}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === 'orders' && (
          <Table head={['Order #', 'Customer', 'Email', 'Items', 'Total', 'Pay', 'Status', 'Date']}>
            {data?.orders?.map((o) => {
              let items = ''
              try { items = (JSON.parse(o.items) as Array<{ name: string; qty: number; size: string }>).map((it) => `${it.qty}× ${it.name} (${it.size})`).join(', ') } catch { items = '—' }
              return (
                <tr key={o.id} style={rowS}>
                  <td style={tdS}>{o.order_no}</td>
                  <td style={tdS}>{o.customer_name}</td>
                  <td style={tdS}>{o.email}</td>
                  <td style={{ ...tdS, maxWidth: 280 }}>{items}</td>
                  <td style={tdS}>${o.total}</td>
                  <td style={tdS}>{o.payment_method}</td>
                  <td style={tdS}>
                    <select value={o.status} onChange={(e) => setOrderStatus(o.id, e.target.value)} style={selectS}>
                      <option value="pending">pending</option>
                      <option value="paid">paid</option>
                      <option value="fulfilled">fulfilled</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                  <td style={tdS}>{o.created_at}</td>
                </tr>
              )
            })}
          </Table>
        )}

        {tab === 'subscribers' && (
          <Table head={['Email', 'Subscribed']}>
            {data?.subscribers.map((s) => (
              <tr key={s.id} style={rowS}><td style={tdS}>{s.email}</td><td style={tdS}>{s.created_at}</td></tr>
            ))}
          </Table>
        )}

        {tab === 'contacts' && (
          <Table head={['Name', 'Email', 'Message', 'Date']}>
            {data?.contacts.map((c) => (
              <tr key={c.id} style={rowS}><td style={tdS}>{c.full_name}</td><td style={tdS}>{c.email}</td><td style={tdS}>{c.message || '—'}</td><td style={tdS}>{c.created_at}</td></tr>
            ))}
          </Table>
        )}

        {tab === 'members' && (
          <Table head={['Name', 'Email', 'Role', 'Joined']}>
            {data?.members.map((m) => (
              <tr key={m.id} style={rowS}><td style={tdS}>{m.full_name}</td><td style={tdS}>{m.email}</td><td style={tdS}>{m.role}</td><td style={tdS}>{m.created_at}</td></tr>
            ))}
          </Table>
        )}

        {tab === 'awards' && <AwardsAdmin />}
        {tab === 'events' && <EventsAdmin />}
        {tab === 'blog' && <PostsAdmin />}
        {tab === 'testimonials' && <TestimonialsAdmin />}
        {tab === 'media' && <MediaAdmin />}
        {tab === 'community' && <CommunityAdmin />}
        {tab === 'rsvps' && <RsvpsAdmin />}
        {tab === 'inventory' && <InventoryAdmin />}
      </div>
    </div>
  )
}

/* ---------------- Awards management (CRUD + image upload) ---------------- */
const emptyAward: AwardRow = {
  id: 0, title: '', year: '', level: 'Business', presenter: '', short_text: '',
  description: '', image: '', is_featured: 0, sort_order: 0,
}
const LEVELS = ['National', 'Federal', 'State', 'County', 'Nonprofit', 'Business']

function AwardsAdmin() {
  const [rows, setRows] = useState<AwardRow[]>([])
  const [editing, setEditing] = useState<AwardRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ awards: AwardRow[] }>('admin/awards').then((d) => setRows(d.awards)).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (patch: Partial<AwardRow>) => setEditing((e) => (e ? { ...e, ...patch } : e))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/award/${editing.id}`, editing)
      else await api.post('admin/award', editing)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally { setBusy(false) }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this award?')) return
    await api.del(`admin/award/${id}`)
    load()
  }

  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const d = await api.upload<{ url: string }>('admin/upload', file)
      set({ image: d.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} awards · shown on the public Awards page</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyAward, sort_order: rows.length + 1 })}>+ Add Award</button>
      </div>

      <Table head={['', 'Title', 'Year', 'Level', 'Featured', 'Order', 'Actions']}>
        {rows.map((a) => (
          <tr key={a.id} style={rowS}>
            <td style={tdS}>{a.image ? <img src={a.image} alt="" style={{ width: 40, height: 52, objectFit: 'cover', borderRadius: 4 }} /> : '—'}</td>
            <td style={tdS}>{a.title}</td>
            <td style={tdS}>{a.year || '—'}</td>
            <td style={tdS}>{a.level || '—'}</td>
            <td style={tdS}>{a.is_featured ? '★' : '—'}</td>
            <td style={tdS}>{a.sort_order}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--sm" onClick={() => setEditing(a)}>Edit</button>
                <button className="btn btn--sm" onClick={() => remove(a.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editing.id ? 'Edit Award' : 'New Award'}</h3>

            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Year</label>
                <input type="text" value={editing.year ?? ''} onChange={(e) => set({ year: e.target.value })} placeholder="2026" /></div>
              <div className="field" style={{ flex: 1 }}><label>Level</label>
                <select value={editing.level ?? ''} onChange={(e) => set({ level: e.target.value })} style={fldSelectS}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select></div>
              <div className="field" style={{ flex: '0 0 80px' }}><label>Order</label>
                <input type="number" value={editing.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} /></div>
            </div>

            <div className="field"><label>Presenter</label>
              <input type="text" value={editing.presenter ?? ''} onChange={(e) => set({ presenter: e.target.value })} placeholder="e.g. U.S. Senator Charles E. Schumer" /></div>

            <div className="field"><label>Short summary</label>
              <textarea className="fld-area" value={editing.short_text ?? ''} onChange={(e) => set({ short_text: e.target.value })} /></div>

            <div className="field"><label>Full description</label>
              <textarea className="fld-area" style={{ minHeight: 120 }} value={editing.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></div>

            <div className="field"><label>Image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.image && <img src={editing.image} alt="" style={{ width: 54, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload Image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.image ?? ''} onChange={(e) => set({ image: e.target.value })} placeholder="/assets/awards/example.png" style={{ marginTop: 8 }} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured award (shown in the “Featured Awards” row)
            </label>

            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Award'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

const fldSelectS: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.45)', border: '1px solid var(--line)', borderRadius: 9, padding: '13px 15px', color: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none' }

/* ---------------- Events management (CRUD) ---------------- */
const emptyEvent: EventItem = { id: 0, title: '', location: '', role: '', event_date: '', is_past: 0 }

function EventsAdmin() {
  const [rows, setRows] = useState<EventItem[]>([])
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ events: EventItem[] }>('admin/events').then((d) => setRows(d.events)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<EventItem>) => setEditing((e) => (e ? { ...e, ...patch } : e))

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/event/${editing.id}`, editing)
      else await api.post('admin/event', editing)
      setEditing(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') } finally { setBusy(false) }
  }
  const remove = async (id: number) => { if (!confirm('Delete this event?')) return; await api.del(`admin/event/${id}`); load() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} events · shown on the Events page &amp; home</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyEvent })}>+ Add Event</button>
      </div>
      <Table head={['Title', 'Location', 'Role', 'Date', 'Past', 'Actions']}>
        {rows.map((ev) => (
          <tr key={ev.id} style={rowS}>
            <td style={tdS}>{ev.title}</td>
            <td style={tdS}>{ev.location || '—'}</td>
            <td style={tdS}>{ev.role || '—'}</td>
            <td style={tdS}>{ev.event_date}</td>
            <td style={tdS}>{ev.is_past ? 'Yes' : '—'}</td>
            <td style={tdS}><div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--sm" onClick={() => setEditing(ev)}>Edit</button>
              <button className="btn btn--sm" onClick={() => remove(ev.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
            </div></td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 480 }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Event' : 'New Event'}</h3>
            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Location</label>
                <input type="text" value={editing.location} onChange={(e) => set({ location: e.target.value })} /></div>
              <div className="field" style={{ flex: 1 }}><label>Role</label>
                <input type="text" value={editing.role} onChange={(e) => set({ role: e.target.value })} placeholder="Keynote Speaker" /></div>
            </div>
            <div className="field"><label>Date</label>
              <input type="date" required value={editing.event_date} onChange={(e) => set({ event_date: e.target.value })} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_past} onChange={(e) => set({ is_past: e.target.checked ? 1 : 0 })} />
              Past event (shown under “Past Appearances”)
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Event'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ---------------- Blog posts management (CRUD + cover upload) ---------------- */
const emptyPost: PostDetail = { id: 0, title: '', category: '', excerpt: '', body: '', cover_image: '', is_featured: 0, published_at: '' }

function PostsAdmin() {
  const [rows, setRows] = useState<PostDetail[]>([])
  const [editing, setEditing] = useState<PostDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ posts: PostDetail[] }>('admin/posts').then((d) => setRows(d.posts)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<PostDetail>) => setEditing((e) => (e ? { ...e, ...patch } : e))

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/post/${editing.id}`, editing)
      else await api.post('admin/post', editing)
      setEditing(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') } finally { setBusy(false) }
  }
  const remove = async (id: number) => { if (!confirm('Delete this post?')) return; await api.del(`admin/post/${id}`); load() }
  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try { const d = await api.upload<{ url: string }>('admin/upload', file); set({ cover_image: d.url }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.') } finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} articles · shown on the Blog page &amp; home</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyPost })}>+ Add Article</button>
      </div>
      <Table head={['', 'Title', 'Category', 'Featured', 'Published', 'Actions']}>
        {rows.map((p) => (
          <tr key={p.id} style={rowS}>
            <td style={tdS}>{p.cover_image ? <img src={p.cover_image} alt="" style={{ width: 52, height: 32, objectFit: 'cover', borderRadius: 4 }} /> : '—'}</td>
            <td style={tdS}>{p.title}</td>
            <td style={tdS}>{p.category || '—'}</td>
            <td style={tdS}>{p.is_featured ? '★' : '—'}</td>
            <td style={tdS}>{p.published_at}</td>
            <td style={tdS}><div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--sm" onClick={() => setEditing(p)}>Edit</button>
              <button className="btn btn--sm" onClick={() => remove(p.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
            </div></td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Article' : 'New Article'}</h3>
            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Category</label>
                <input type="text" value={editing.category} onChange={(e) => set({ category: e.target.value })} placeholder="Featured / Tech News / My Story" /></div>
              <div className="field" style={{ flex: 1 }}><label>Published date</label>
                <input type="date" value={editing.published_at} onChange={(e) => set({ published_at: e.target.value })} /></div>
            </div>
            <div className="field"><label>Excerpt</label>
              <textarea className="fld-area" value={editing.excerpt} onChange={(e) => set({ excerpt: e.target.value })} /></div>
            <div className="field"><label>Body (separate paragraphs with a blank line)</label>
              <textarea className="fld-area" style={{ minHeight: 160 }} value={editing.body} onChange={(e) => set({ body: e.target.value })} /></div>
            <div className="field"><label>Cover image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.cover_image && <img src={editing.cover_image} alt="" style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload Cover'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.cover_image ?? ''} onChange={(e) => set({ cover_image: e.target.value })} placeholder="/api/uploads/media/..." style={{ marginTop: 8 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured (large card on the home blog section)
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Article'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ---------------- Analytics ---------------- */
function AnalyticsAdmin() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AnalyticsPayload>('admin/analytics').then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Could not load analytics.'))
  }, [])

  const cards = [
    ['Users', data?.totals.users ?? 0],
    ['Members', data?.totals.members ?? 0],
    ['Requests', data?.totals.requests ?? 0],
    ['Orders', data?.totals.orders ?? 0],
    ['Revenue', `$${(data?.totals.revenue ?? 0).toFixed(2)}`],
    ['Subscribers', data?.totals.subscribers ?? 0],
    ['Contacts', data?.totals.contacts ?? 0],
    ['Media Items', data?.totals.media ?? 0],
    ['Community Threads', data?.totals.community_threads ?? 0],
    ['Community Comments', data?.totals.community_comments ?? 0],
    ['Event RSVPs', data?.totals.event_rsvps ?? 0],
    ['Inventory Items', data?.totals.inventory_items ?? 0],
    ['Low Stock', data?.totals.low_stock ?? 0],
  ] as const

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        {cards.map(([label, value]) => (
          <div key={label} className="glass" style={{ padding: 18, borderRadius: 14 }}>
            <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
            <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, marginTop: 8 }}>{value}</div>
          </div>
        ))}
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <div className="glass" style={{ padding: 22, borderRadius: 14 }}>
        <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
          <h3 className="gold-text">Request Breakdown</h3>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Latest counts from the live database</span>
        </div>
        <SeriesBars rows={data?.request_types || []} />
      </div>

      <div className="dashboard-cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <div className="glass" style={{ padding: 22, borderRadius: 14 }}>
          <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
            <h3 className="gold-text">Request Status</h3>
          </div>
          <SeriesBars rows={data?.request_statuses || []} />
        </div>
        <div className="glass" style={{ padding: 22, borderRadius: 14 }}>
          <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
            <h3 className="gold-text">Order Status</h3>
          </div>
          <SeriesBars rows={data?.order_statuses || []} />
        </div>
      </div>

      <div className="glass" style={{ padding: 22, borderRadius: 14 }}>
        <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
          <h3 className="gold-text">Content Mix</h3>
        </div>
        <SeriesBars rows={data?.content_mix || []} />
      </div>
    </div>
  )
}

function SeriesBars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  if (!rows.length) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No data yet.</p>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: '#e9e1d0', textTransform: 'uppercase', letterSpacing: '.08em' }}>{row.label}</span>
            <strong style={{ color: 'var(--gold-light)' }}>{row.value}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ width: `${(row.value / max) * 100}%`, height: '100%', background: 'var(--gold-grad)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Testimonials management ---------------- */
const emptyTestimonial: TestimonialRow = {
  id: 0,
  quote: '',
  author_name: '',
  author_title: '',
  company: '',
  image: '',
  is_featured: 0,
  sort_order: 0,
  created_at: '',
}

function TestimonialsAdmin() {
  const [rows, setRows] = useState<TestimonialRow[]>([])
  const [editing, setEditing] = useState<TestimonialRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ testimonials: TestimonialRow[] }>('admin/testimonials').then((d) => setRows(d.testimonials)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<TestimonialRow>) => setEditing((row) => (row ? { ...row, ...patch } : row))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/testimonial/${editing.id}`, editing)
      else await api.post('admin/testimonial', editing)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this testimonial?')) return
    await api.del(`admin/testimonial/${id}`)
    load()
  }

  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const d = await api.upload<{ url: string }>('admin/upload', file)
      set({ image: d.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} testimonials shown on the public Media and Community pages</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyTestimonial, sort_order: rows.length + 1 })}>+ Add Testimonial</button>
      </div>

      <Table head={['Quote', 'Author', 'Company', 'Featured', 'Order', 'Actions']}>
        {rows.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={{ ...tdS, maxWidth: 300 }}>{row.quote}</td>
            <td style={tdS}>{row.author_name}</td>
            <td style={tdS}>{row.company || '—'}</td>
            <td style={tdS}>{row.is_featured ? '★' : '—'}</td>
            <td style={tdS}>{row.sort_order}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--sm" onClick={() => setEditing(row)}>Edit</button>
                <button className="btn btn--sm" onClick={() => remove(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Testimonial' : 'New Testimonial'}</h3>
            <div className="field"><label>Quote</label>
              <textarea className="fld-area" style={{ minHeight: 110 }} value={editing.quote} onChange={(e) => set({ quote: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Author name</label>
                <input type="text" required value={editing.author_name} onChange={(e) => set({ author_name: e.target.value })} /></div>
              <div className="field" style={{ width: 120 }}><label>Order</label>
                <input type="number" value={editing.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Title</label>
                <input type="text" value={editing.author_title || ''} onChange={(e) => set({ author_title: e.target.value })} placeholder="Program Lead" /></div>
              <div className="field" style={{ flex: 1 }}><label>Company</label>
                <input type="text" value={editing.company || ''} onChange={(e) => set({ company: e.target.value })} placeholder="Organization / company" /></div>
            </div>
            <div className="field"><label>Image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.image && <img src={editing.image} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploadingâ€¦' : 'Upload Image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.image || ''} onChange={(e) => set({ image: e.target.value })} placeholder="/assets/..." style={{ marginTop: 8 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured testimonial
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Savingâ€¦' : 'Save Testimonial'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ---------------- Media management ---------------- */
const emptyMedia: MediaRow = {
  id: 0,
  title: '',
  type: 'article',
  summary: '',
  body: '',
  image: '',
  link_url: '',
  published_at: '',
  is_featured: 0,
  sort_order: 0,
}
const MEDIA_TYPES = ['podcast', 'interview', 'tv', 'press_release', 'article', 'photo', 'video'] as const

function MediaAdmin() {
  const [rows, setRows] = useState<MediaRow[]>([])
  const [editing, setEditing] = useState<MediaRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ media: MediaRow[] }>('admin/media').then((d) => setRows(d.media)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<MediaRow>) => setEditing((row) => (row ? { ...row, ...patch } : row))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/media/${editing.id}`, editing)
      else await api.post('admin/media', editing)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this media item?')) return
    await api.del(`admin/media/${id}`)
    load()
  }

  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const d = await api.upload<{ url: string }>('admin/upload', file)
      set({ image: d.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} media items shown on the public Media Center</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyMedia, sort_order: rows.length + 1 })}>+ Add Media</button>
      </div>

      <Table head={['Title', 'Type', 'Featured', 'Published', 'Actions']}>
        {rows.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={tdS}>{row.title}</td>
            <td style={tdS}>{row.type}</td>
            <td style={tdS}>{row.is_featured ? '★' : '—'}</td>
            <td style={tdS}>{row.published_at || '—'}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--sm" onClick={() => setEditing(row)}>Edit</button>
                <button className="btn btn--sm" onClick={() => remove(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Media Item' : 'New Media Item'}</h3>
            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Type</label>
                <select value={editing.type} onChange={(e) => set({ type: e.target.value })} style={fldSelectS}>
                  {MEDIA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select></div>
              <div className="field" style={{ width: 120 }}><label>Order</label>
                <input type="number" value={editing.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} /></div>
            </div>
            <div className="field"><label>Summary</label>
              <textarea className="fld-area" value={editing.summary || ''} onChange={(e) => set({ summary: e.target.value })} /></div>
            <div className="field"><label>Body</label>
              <textarea className="fld-area" style={{ minHeight: 130 }} value={editing.body || ''} onChange={(e) => set({ body: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Link URL</label>
                <input type="text" value={editing.link_url || ''} onChange={(e) => set({ link_url: e.target.value })} placeholder="/blog/1" /></div>
              <div className="field" style={{ flex: 1 }}><label>Published date</label>
                <input type="date" value={editing.published_at || ''} onChange={(e) => set({ published_at: e.target.value })} /></div>
            </div>
            <div className="field"><label>Image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.image && <img src={editing.image} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploadingâ€¦' : 'Upload Image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.image || ''} onChange={(e) => set({ image: e.target.value })} placeholder="/assets/..." style={{ marginTop: 8 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured item
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Savingâ€¦' : 'Save Media'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

const emptyCommunityThread: CommunityThreadRow = {
  id: 0,
  title: '',
  body: '',
  audience: 'member',
  author_name: '',
  is_pinned: 0,
  created_at: '',
}

function CommunityAdmin() {
  const [threads, setThreads] = useState<CommunityThreadRow[]>([])
  const [comments, setComments] = useState<CommunityCommentRow[]>([])
  const [editing, setEditing] = useState<CommunityThreadRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    api.get<{ threads: CommunityThreadRow[]; comments: CommunityCommentRow[] }>('admin/community')
      .then((d) => {
        setThreads(d.threads)
        setComments(d.comments)
      })
      .catch(() => {})

  useEffect(() => { load() }, [])
  const set = (patch: Partial<CommunityThreadRow>) => setEditing((row) => (row ? { ...row, ...patch } : row))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      const payload = {
        title: editing.title,
        body: editing.body,
        audience: editing.audience,
        is_pinned: editing.is_pinned,
      }
      if (editing.id) await api.put(`admin/community/thread/${editing.id}`, payload)
      else await api.post('community/thread', payload)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const removeThread = async (id: number) => {
    if (!confirm('Delete this thread?')) return
    await api.del(`admin/community/thread/${id}`)
    load()
  }

  const removeComment = async (id: number) => {
    if (!confirm('Delete this comment?')) return
    await api.del(`admin/community/comment/${id}`)
    load()
  }

  const threadTitleById = Object.fromEntries(threads.map((row) => [row.id, row.title]))

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Community Board</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{threads.length} threads · {comments.length} comments</p>
        </div>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyCommunityThread })}>+ Add Thread</button>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <Table head={['Title', 'Audience', 'Pinned', 'Comments', 'Author', 'Date', 'Actions']}>
        {threads.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={{ ...tdS, maxWidth: 280 }}>{row.title}</td>
            <td style={tdS}>{row.audience}</td>
            <td style={tdS}>{row.is_pinned ? 'Yes' : '—'}</td>
            <td style={tdS}>{row.comment_count ?? 0}</td>
            <td style={tdS}>{row.author_name}</td>
            <td style={tdS}>{row.created_at}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--sm" onClick={() => setEditing(row)}>Edit</button>
                <button className="btn btn--sm" onClick={() => removeThread(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Table head={['Thread', 'Author', 'Comment', 'Date', 'Actions']}>
        {comments.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={tdS}>{threadTitleById[row.thread_id] || `Thread #${row.thread_id}`}</td>
            <td style={tdS}>{row.author_name}</td>
            <td style={{ ...tdS, maxWidth: 380 }}>{row.body}</td>
            <td style={tdS}>{row.created_at}</td>
            <td style={tdS}>
              <button className="btn btn--sm" onClick={() => removeComment(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editing.id ? 'Edit Thread' : 'New Thread'}</h3>

            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Audience</label>
                <select value={editing.audience} onChange={(e) => set({ audience: e.target.value as CommunityThreadRow['audience'] })} style={fldSelectS}>
                  <option value="public">public</option>
                  <option value="member">member</option>
                  <option value="vip">vip</option>
                </select></div>
              <div className="field" style={{ width: 120 }}><label>Thread ID</label>
                <input type="text" value={editing.id || 'new'} disabled /></div>
            </div>

            <div className="field"><label>Body</label>
              <textarea className="fld-area" style={{ minHeight: 160 }} required value={editing.body} onChange={(e) => set({ body: e.target.value })} /></div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_pinned} onChange={(e) => set({ is_pinned: e.target.checked ? 1 : 0 })} />
              Pin this thread
            </label>

            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Savingâ€¦' : 'Save Thread'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

function RsvpsAdmin() {
  const [rows, setRows] = useState<EventRsvpRow[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = () => api.get<{ rsvps: EventRsvpRow[] }>('admin/event-rsvps').then((d) => setRows(d.rsvps)).catch(() => {})
  useEffect(() => { load() }, [])

  const update = async (id: number, status: string) => {
    setBusyId(id); setError('')
    try {
      await api.put(`admin/event-rsvp/${id}`, { status })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update RSVP.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Event RSVPs</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} RSVP records from the live database</p>
        </div>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <Table head={['Event', 'Name', 'Email', 'Status', 'Code', 'Notes', 'Date']}>
        {rows.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={tdS}>
              <div style={{ fontWeight: 600, color: '#f0e3bf' }}>{row.event_title || `Event #${row.event_id}`}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{row.location || '—'}{row.event_date ? ` · ${row.event_date}` : ''}</div>
            </td>
            <td style={tdS}>{row.full_name}</td>
            <td style={tdS}>{row.email}</td>
            <td style={tdS}>
              <select value={row.status} onChange={(e) => update(row.id, e.target.value)} style={selectS} disabled={busyId === row.id}>
                <option value="going">going</option>
                <option value="maybe">maybe</option>
                <option value="interested">interested</option>
                <option value="cancelled">cancelled</option>
              </select>
            </td>
            <td style={{ ...tdS, fontFamily: 'monospace', letterSpacing: '.04em' }}>{row.confirmation_code}</td>
            <td style={{ ...tdS, maxWidth: 260 }}>{row.notes || '—'}</td>
            <td style={tdS}>{row.created_at}</td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

function InventoryAdmin() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, { stock: string; low_stock_threshold: string; restock_note: string }>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = () =>
    api.get<{ inventory: InventoryRow[] }>('admin/inventory')
      .then((d) => {
        setRows(d.inventory)
        setDrafts(Object.fromEntries(
          d.inventory.map((row) => [row.product_id, {
            stock: String(row.stock),
            low_stock_threshold: String(row.low_stock_threshold),
            restock_note: row.restock_note || '',
          }]),
        ))
      })
      .catch(() => {})

  useEffect(() => { load() }, [])

  const setDraft = (productId: string, patch: Partial<{ stock: string; low_stock_threshold: string; restock_note: string }>) => {
    setDrafts((prev) => ({
      ...prev,
      [productId]: {
        stock: prev[productId]?.stock ?? '',
        low_stock_threshold: prev[productId]?.low_stock_threshold ?? '',
        restock_note: prev[productId]?.restock_note ?? '',
        ...patch,
      },
    }))
  }

  const save = async (productId: string) => {
    const draft = drafts[productId]
    if (!draft) return
    setBusyId(productId); setError('')
    try {
      await api.put(`admin/inventory/${productId}`, {
        stock: Number(draft.stock || 0),
        low_stock_threshold: Number(draft.low_stock_threshold || 0),
        restock_note: draft.restock_note,
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update inventory.')
    } finally {
      setBusyId(null)
    }
  }

  const lowStock = rows.filter((row) => row.status !== 'in').length

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Inventory</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} products · {lowStock} need attention</p>
        </div>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <Table head={['Product', 'Stock', 'Threshold', 'Status', 'Restock note', 'Updated', 'Actions']}>
        {rows.map((row) => {
          const draft = drafts[row.product_id] || {
            stock: String(row.stock),
            low_stock_threshold: String(row.low_stock_threshold),
            restock_note: row.restock_note || '',
          }
          return (
            <tr key={row.product_id} style={rowS}>
              <td style={tdS}>
                <div style={{ fontWeight: 600, color: '#f0e3bf' }}>{row.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{row.product_id} · ${row.price.toFixed(2)}</div>
              </td>
              <td style={tdS}>
                <input type="number" min="0" value={draft.stock} onChange={(e) => setDraft(row.product_id, { stock: e.target.value })} style={{ width: 92, ...selectS }} />
              </td>
              <td style={tdS}>
                <input type="number" min="0" value={draft.low_stock_threshold} onChange={(e) => setDraft(row.product_id, { low_stock_threshold: e.target.value })} style={{ width: 92, ...selectS }} />
              </td>
              <td style={tdS}>
                <span className={`card__badge${row.status === 'out' ? ' red' : row.status === 'low' ? ' amber' : ' green'}`} style={{ position: 'static', display: 'inline-flex' }}>
                  {row.status === 'out' ? 'Sold out' : row.status === 'low' ? 'Low stock' : 'In stock'}
                </span>
              </td>
              <td style={{ ...tdS, minWidth: 220 }}>
                <input type="text" value={draft.restock_note} onChange={(e) => setDraft(row.product_id, { restock_note: e.target.value })} placeholder="Restock note" style={{ width: '100%', ...selectS }} />
              </td>
              <td style={tdS}>{row.updated_at || '—'}</td>
              <td style={tdS}>
                <button className="btn btn--sm btn--solid" onClick={() => save(row.product_id)} disabled={busyId === row.product_id}>
                  {busyId === row.product_id ? 'Savingâ€¦' : 'Save'}
                </button>
              </td>
            </tr>
          )
        })}
      </Table>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="glass" style={{ borderRadius: 14, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>{head.map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const wrapS: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 24px 60px', fontFamily: 'var(--f-body)' }
const thS: React.CSSProperties = { textAlign: 'left', padding: '14px 16px', color: 'var(--gold-light)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.06em' }
const tdS: React.CSSProperties = { padding: '13px 16px', verticalAlign: 'top', color: '#d8d3c6' }
const rowS: React.CSSProperties = { borderBottom: '1px solid rgba(201,168,76,0.08)' }
const selectS: React.CSSProperties = { background: '#15130c', color: '#e7d8a8', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px' }
