import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api, type AnalyticsPayload, type AwardRow, type CommunityCommentRow, type CommunityThreadRow, type EventItem, type EventRsvpRow, type InventoryRow, type MediaRow, type PostDetail, type ProductVisibility, type TestimonialRow, type User } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'
import SponsorsAdminPanel from '../components/admin/SponsorsAdminPanel'

type TabKey =
  | 'overview' | 'analytics' | 'requests' | 'orders' | 'subscribers' | 'contacts'
  | 'members' | 'approvals' | 'sponsors' | 'awards' | 'events' | 'blog'
  | 'testimonials' | 'media' | 'community' | 'rsvps' | 'inventory'
  | 'ns-submissions' | 'ns-interviews'

interface NavItem { key: TabKey; label: string }
const NAV_GROUPS: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Overview', items: [{ key: 'overview', label: 'Overview' }, { key: 'analytics', label: 'Analytics' }] },
  { group: 'People', items: [
    { key: 'members', label: 'User Accounts' },
    { key: 'approvals', label: 'Account Approvals' },
    { key: 'contacts', label: 'Contact Messages' },
    { key: 'subscribers', label: 'Newsletter' },
  ] },
  { group: 'New School', items: [
    { key: 'ns-submissions', label: 'Student Submissions' },
    { key: 'ns-interviews', label: 'Business Interviews' },
  ] },
  { group: 'Commerce', items: [
    { key: 'orders', label: 'Store Orders' },
    { key: 'inventory', label: 'Products & Inventory' },
    { key: 'sponsors', label: 'Founding Sponsors' },
  ] },
  { group: 'Engagement', items: [
    { key: 'requests', label: 'Service Requests' },
    { key: 'rsvps', label: 'Event RSVPs' },
    { key: 'community', label: 'Community' },
  ] },
  { group: 'Content', items: [
    { key: 'awards', label: 'Awards' },
    { key: 'events', label: 'Events' },
    { key: 'blog', label: 'Blog Posts' },
    { key: 'testimonials', label: 'Testimonials' },
    { key: 'media', label: 'Media Library' },
  ] },
]

interface RequestRow {
  id: number; request_type: string; full_name: string; email: string
  organization: string | null; message: string | null; status: string; created_at: string
}
interface SubRow { id: number; email: string; created_at: string }
interface ContactRow { id: number; full_name: string; email: string; message: string | null; created_at: string }
interface MemberRow {
  id: number
  full_name: string
  email: string
  role: string
  email_verified_at?: string | null
  approval_status?: string | null
  approval_note?: string | null
  approval_reviewed_by_user_id?: number | null
  approval_reviewed_by_name?: string | null
  approval_reviewed_by_email?: string | null
  approval_reviewed_by_role?: string | null
  approval_reviewed_at?: string | null
  created_at: string
  updated_at?: string | null
}
interface OrderRow {
  id: number; order_no: string; customer_name: string; email: string; items: string
  total: string; payment_method: string; payment_provider?: string | null; payment_status?: string | null; status: string; created_at: string
}
interface Submissions {
  requests: RequestRow[]; subscribers: SubRow[]; contacts: ContactRow[]; members: MemberRow[]; orders: OrderRow[]
}

interface DetailField {
  label: string
  value: string | number
}

interface DetailSection {
  title: string
  fields: DetailField[]
}

interface DetailTable {
  title: string
  columns: string[]
  rows: Array<Record<string, string | number | null>>
}

interface UserDetailPayload {
  user: MemberRow
  sections: DetailSection[]
  tables: DetailTable[]
}

const isAdmin = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')
const approvalButtonClass = (current: string, action: 'pending' | 'approved' | 'rejected') =>
  `btn btn--sm${current === action ? ' btn--solid' : ''}`

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  return String(value)
}

export default function Admin() {
  useSeo({ title: 'Admin Console', noindex: true })
  const { user, loading, logout, refresh: refreshAuth, impersonate } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<Submissions | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [viewBusyId, setViewBusyId] = useState<number | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [selectedUser, setSelectedUser] = useState<MemberRow | null>(null)
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailPayload | null>(null)
  const [selectedUserLoading, setSelectedUserLoading] = useState(false)
  const [selectedUserError, setSelectedUserError] = useState('')
  const [nsData, setNsData] = useState<any>(null)

  const refreshData = async () => {
    // Load the main submissions AND the New School summary (student interviews +
    // project submissions) so the Command Center can review challenge activity too.
    const [main, ns] = await Promise.allSettled([
      api.get<Submissions>('admin/submissions'),
      api.get<any>('admin/new-school/summary'),
    ])
    setData(main.status === 'fulfilled' ? main.value : null)
    if (ns.status === 'fulfilled') setNsData(ns.value)
  }

  useEffect(() => { if (isAdmin(user?.role)) void refreshData() }, [user])

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
    void refreshData()
  }

  const setOrderStatus = async (id: number, status: string) => {
    await api.put(`admin/order/${id}`, { status })
    void refreshData()
  }

  const syncUpdatedUser = (updated: MemberRow) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      }
    })
    setSelectedUser((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
    setSelectedUserDetail((prev) => {
      if (!prev || prev.user.id !== updated.id) return prev
      return {
        ...prev,
        user: { ...prev.user, ...updated },
      }
    })
  }

  const openUserDetails = async (member: MemberRow) => {
    setSelectedUser(member)
    setSelectedUserDetail(null)
    setSelectedUserError('')
    setSelectedUserLoading(true)
    try {
      const detail = await api.get<UserDetailPayload>(`admin/user/${member.id}`)
      setSelectedUserDetail(detail)
    } catch (err) {
      setSelectedUserError(err instanceof Error ? err.message : 'Failed to load user details.')
    } finally {
      setSelectedUserLoading(false)
    }
  }

  const closeUserDetails = () => {
    setSelectedUser(null)
    setSelectedUserDetail(null)
    setSelectedUserError('')
    setSelectedUserLoading(false)
  }

  const setApproval = async (id: number, approval_status: 'pending' | 'approved' | 'rejected', approval_note = '') => {
    if (approval_status === 'rejected' && !confirm('Reject this account?')) return
    const result = await api.put<{ message: string; user?: MemberRow }>(`admin/user/${id}/approval`, { approval_status, approval_note })
    if (result.user) {
      syncUpdatedUser(result.user)
    }
    await refreshData()
    if (selectedUser?.id === id) {
      void openUserDetails(selectedUser)
    }
  }

  // Admin "view as user": swap the session to this user and open their real dashboard.
  const viewAsUser = async (m: MemberRow) => {
    if (viewBusyId) return
    setViewBusyId(m.id)
    try {
      const target = await impersonate(m.id)
      navigate(resolveDashboardRoute(target?.role ?? m.role))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not open that user's dashboard.")
    } finally {
      setViewBusyId(null)
    }
  }

  // Generic delete used across the data-list tabs (CRUD: the "D").
  const deleteRow = async (path: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return
    try {
      await api.del(path)
      await refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  // ---- Bulk actions (operate on an array of selected row ids) ----
  const bulkDelete = async (basePath: string, ids: number[], noun: string) => {
    if (!ids.length || !confirm(`Delete ${ids.length} ${noun}${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    const results = await Promise.allSettled(ids.map((id) => api.del(`${basePath}/${id}`)))
    await refreshData()
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) alert(`${failed} of ${ids.length} could not be deleted (they may have linked records).`)
  }

  const bulkSetApproval = async (ids: number[], approval_status: 'approved' | 'pending' | 'rejected') => {
    if (!ids.length) return
    if (approval_status === 'rejected' && !confirm(`Reject ${ids.length} account${ids.length === 1 ? '' : 's'}?`)) return
    await Promise.allSettled(ids.map((id) => api.put(`admin/user/${id}/approval`, { approval_status })))
    await refreshData()
  }

  // ---- New School: review (approve/reject) student PROJECT submissions ----
  const reviewSubmission = async (id: number, status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !confirm('Reject this submission?')) return
    try {
      await api.post('new-school/submission/review', { submission_id: id, status })
      await refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the submission.')
    }
  }
  const bulkReviewSubmissions = async (ids: number[], status: 'approved' | 'rejected') => {
    if (!ids.length) return
    if (status === 'rejected' && !confirm(`Reject ${ids.length} submission${ids.length === 1 ? '' : 's'}?`)) return
    await Promise.allSettled(ids.map((id) => api.post('new-school/submission/review', { submission_id: id, status })))
    await refreshData()
  }

  const reviewableAccounts = data?.members.filter((m) => !isAdmin(m.role)) ?? []
  const pendingAccounts = reviewableAccounts.filter((m) => (m.approval_status || 'pending') === 'pending').length
  const rejectedAccounts = reviewableAccounts.filter((m) => (m.approval_status || 'pending') === 'rejected').length
  const approvalQueueCount = reviewableAccounts.filter((m) => (m.approval_status || 'pending') !== 'approved').length
  const approvedAccounts = reviewableAccounts.filter((m) => (m.approval_status || 'pending') === 'approved').length

  // Per-status breakdowns for the in-tab "actual counter" strips.
  const reqRows = data?.requests ?? []
  const orderRows = data?.orders ?? []
  const reqBy = (s: string) => reqRows.filter((r) => (r.status || '').toLowerCase() === s).length
  const ordBy = (s: string) => orderRows.filter((o) => (o.status || '').toLowerCase() === s).length
  const orderRevenue = orderRows
    .filter((o) => ['paid', 'fulfilled'].includes((o.status || '').toLowerCase()))
    .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)

  // New School challenge activity (from admin/new-school/summary).
  const nsSubmissions: any[] = Array.isArray(nsData?.submissions) ? nsData.submissions : []
  const nsInterviews: any[] = Array.isArray(nsData?.businesses) ? nsData.businesses : []
  const nsSubBy = (s: string) => nsSubmissions.filter((x) => (x.status || '').toLowerCase() === s).length
  const nsPendingReview = nsSubBy('submitted')

  // Sidebar badges behave like NOTIFICATION counters: only "new/actionable" items,
  // hidden when zero. Full totals live in the per-tab StatChips strips instead.
  const notifications: Partial<Record<TabKey, number>> = {
    approvals: pendingAccounts,
    members: pendingAccounts,
    requests: reqBy('new'),
    orders: ordBy('pending'),
    contacts: data?.contacts.length ?? 0,
    'ns-submissions': nsPendingReview,
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

  const activeLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === tab)?.label ?? 'Overview'

  return (
    <div className="admin-page" style={wrapS}>
      <div className="admin-layout">
        <aside className="admin-sidebar glass">
          <div className="admin-sidebar__brand">
            <span className="admin-kicker">Admin</span>
            <strong className="gold-text">Command Center</strong>
          </div>
          <nav className="admin-nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.group} className="admin-nav__group">
                <span className="admin-nav__group-label">{group.group}</span>
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`admin-nav__item${tab === item.key ? ' is-active' : ''}`}
                    onClick={() => setTab(item.key)}
                  >
                    <span>{item.label}</span>
                    {notifications[item.key] ? <span className="admin-nav__badge admin-nav__badge--notify" title={`${notifications[item.key]} need attention`}>{notifications[item.key]}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="admin-sidebar__foot">
            <a className="btn btn--sm" href="/">View Site</a>
            <button className="btn btn--sm" onClick={() => logout()}>Logout</button>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-main__header glass">
            <div>
              <span className="admin-kicker">Admin Dashboard</span>
              <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, marginTop: 4 }}>{activeLabel}</h1>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Signed in as {user?.full_name} · {user?.role}</p>
            </div>
          </header>

          {tab === 'overview' && (
            <div className="admin-overview">
              <div className="admin-stats">
                <div className="admin-stat glass"><span>User Accounts</span><strong>{data?.members.length ?? 0}</strong><p>Registered users</p></div>
                <div className="admin-stat glass"><span>Pending</span><strong>{pendingAccounts}</strong><p>Awaiting approval</p></div>
                <div className="admin-stat glass"><span>Approved</span><strong>{approvedAccounts}</strong><p>Live accounts</p></div>
                <div className="admin-stat glass"><span>Rejected</span><strong>{rejectedAccounts}</strong><p>Declined by admin</p></div>
                <div className="admin-stat glass"><span>Orders</span><strong>{data?.orders?.length ?? 0}</strong><p>Commerce records</p></div>
                <div className="admin-stat glass"><span>Requests</span><strong>{data?.requests.length ?? 0}</strong><p>Service forms</p></div>
                <div className="admin-stat glass"><span>Contacts</span><strong>{data?.contacts.length ?? 0}</strong><p>Inbound messages</p></div>
                <div className="admin-stat glass"><span>Subscribers</span><strong>{data?.subscribers.length ?? 0}</strong><p>Newsletter list</p></div>
              </div>
              {approvalQueueCount > 0 && (
                <div className="admin-overview__cta glass">
                  <div>
                    <strong className="gold-text">{approvalQueueCount} account{approvalQueueCount === 1 ? '' : 's'} awaiting review</strong>
                    <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Approve or reject pending registrations from the People section.</p>
                  </div>
                  <button type="button" className="btn btn--sm btn--solid" onClick={() => setTab('approvals')}>Open approvals</button>
                </div>
              )}
            </div>
          )}

          {tab === 'analytics' && <AnalyticsAdmin />}

        {tab === 'requests' && (
          <>
            <StatChips items={[
              { label: 'Total', value: reqRows.length },
              { label: 'New', value: reqBy('new'), tone: 'gold' },
              { label: 'Reviewed', value: reqBy('reviewed'), tone: 'blue' },
              { label: 'Approved', value: reqBy('approved'), tone: 'green' },
              { label: 'Closed', value: reqBy('closed'), tone: 'muted' },
            ]} />
            <DataTable
              head={['Type', 'Name', 'Email', 'Org', 'Message', 'Status', 'Date', '']}
              rows={data?.requests ?? []}
              searchPlaceholder="Search requests…"
              searchText={(r) => `${r.request_type} ${r.full_name} ${r.email} ${r.organization ?? ''} ${r.message ?? ''}`}
              statusOf={(r) => r.status}
              statusOptions={['new', 'reviewed', 'approved', 'closed']}
              rowId={(r) => r.id}
              bulkActions={[{ label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/request', ids, 'request') }]}
              renderRow={(r, checkbox) => (
                <tr key={r.id}>{checkbox}
                  <td>{r.request_type}</td>
                  <td>{r.full_name}</td>
                  <td>{r.email}</td>
                  <td>{r.organization || '—'}</td>
                  <td style={{ maxWidth: 240 }}>{r.message || '—'}</td>
                  <td>
                    <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} style={selectS}>
                      <option value="new">new</option>
                      <option value="reviewed">reviewed</option>
                      <option value="approved">approved</option>
                      <option value="closed">closed</option>
                    </select>
                  </td>
                  <td>{r.created_at}</td>
                  <td><RowMenu actions={[{ label: 'Delete request', danger: true, onClick: () => void deleteRow(`admin/request/${r.id}`, 'Delete this request? This cannot be undone.') }]} /></td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'orders' && (
          <>
            <StatChips items={[
              { label: 'Total', value: orderRows.length },
              { label: 'Pending', value: ordBy('pending'), tone: 'gold' },
              { label: 'Paid', value: ordBy('paid'), tone: 'green' },
              { label: 'Fulfilled', value: ordBy('fulfilled'), tone: 'green' },
              { label: 'Cancelled', value: ordBy('cancelled'), tone: 'red' },
              { label: 'Revenue', value: `$${orderRevenue.toFixed(2)}`, tone: 'gold' },
            ]} />
            <DataTable
              head={['Order #', 'Customer', 'Email', 'Items', 'Total', 'Payment', 'Order Status', 'Date', '']}
              rows={data?.orders ?? []}
              searchPlaceholder="Search orders…"
              searchText={(o) => `${o.order_no} ${o.customer_name} ${o.email}`}
              statusOf={(o) => o.status}
              statusOptions={['pending', 'paid', 'fulfilled', 'cancelled']}
              rowId={(o) => o.id}
              bulkActions={[{ label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/order', ids, 'order') }]}
              renderRow={(o, checkbox) => {
                let items = ''
                try { items = (JSON.parse(o.items) as Array<{ name: string; qty: number; size: string }>).map((it) => `${it.qty}× ${it.name} (${it.size})`).join(', ') } catch { items = '—' }
                return (
                  <tr key={o.id}>{checkbox}
                    <td>{o.order_no}</td>
                    <td>{o.customer_name}</td>
                    <td>{o.email}</td>
                    <td style={{ maxWidth: 280 }}>{items}</td>
                    <td>${o.total}</td>
                    <td>{[o.payment_provider, o.payment_status, o.payment_method].filter(Boolean).join(' · ')}</td>
                    <td>
                      <select value={o.status} onChange={(e) => setOrderStatus(o.id, e.target.value)} style={selectS}>
                        <option value="pending">pending</option>
                        <option value="paid">paid</option>
                        <option value="fulfilled">fulfilled</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    </td>
                    <td>{o.created_at}</td>
                    <td><RowMenu actions={[{ label: 'Delete order', danger: true, onClick: () => void deleteRow(`admin/order/${o.id}`, `Delete order ${o.order_no}? This permanently removes the record.`) }]} /></td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'subscribers' && (
          <>
            <StatChips items={[{ label: 'Subscribers', value: data?.subscribers.length ?? 0, tone: 'gold' }]} />
            <DataTable
              head={['Email', 'Subscribed', '']}
              rows={data?.subscribers ?? []}
              searchPlaceholder="Search subscribers…"
              searchText={(s) => s.email}
              rowId={(s) => s.id}
              bulkActions={[{ label: 'Remove selected', danger: true, onClick: (ids) => bulkDelete('admin/subscriber', ids, 'subscriber') }]}
              renderRow={(s, checkbox) => (
                <tr key={s.id}>{checkbox}
                  <td>{s.email}</td>
                  <td>{s.created_at}</td>
                  <td><RowMenu actions={[{ label: 'Remove subscriber', danger: true, onClick: () => void deleteRow(`admin/subscriber/${s.id}`, `Remove ${s.email} from the newsletter list?`) }]} /></td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'contacts' && (
          <>
            <StatChips items={[{ label: 'Messages', value: data?.contacts.length ?? 0, tone: 'gold' }]} />
            <DataTable
              head={['Name', 'Email', 'Message', 'Date', '']}
              rows={data?.contacts ?? []}
              searchPlaceholder="Search contacts…"
              searchText={(c) => `${c.full_name} ${c.email} ${c.message ?? ''}`}
              rowId={(c) => c.id}
              bulkActions={[{ label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/contact', ids, 'message') }]}
              renderRow={(c, checkbox) => (
                <tr key={c.id}>{checkbox}
                  <td>{c.full_name}</td>
                  <td>{c.email}</td>
                  <td>{c.message || '—'}</td>
                  <td>{c.created_at}</td>
                  <td><RowMenu actions={[{ label: 'Delete message', danger: true, onClick: () => void deleteRow(`admin/contact/${c.id}`, 'Delete this contact message?') }]} /></td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'members' && (
          <>
            <StatChips items={[
              { label: 'Total', value: data?.members.length ?? 0 },
              { label: 'Approved', value: approvedAccounts, tone: 'green' },
              { label: 'Pending', value: pendingAccounts, tone: 'gold' },
              { label: 'Rejected', value: rejectedAccounts, tone: 'red' },
            ]} />
            <DataTable
              head={['#', 'Name', 'User ID', 'Email', 'Role', 'Status', 'Joined', '']}
              rows={data?.members ?? []}
              searchPlaceholder="Search accounts…"
              searchText={(m) => `${m.full_name} ${m.email} ${m.role} ${m.id}`}
              statusOf={(m) => (isAdmin(m.role) ? 'approved' : (m.approval_status || 'pending'))}
              statusOptions={['approved', 'pending', 'rejected']}
              rowId={(m) => m.id}
              rowSelectable={(m) => !isAdmin(m.role)}
              bulkActions={[
                { label: 'Approve selected', onClick: (ids) => bulkSetApproval(ids, 'approved') },
                { label: 'Reject selected', danger: true, onClick: (ids) => bulkSetApproval(ids, 'rejected') },
                { label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/user', ids, 'account') },
              ]}
              renderRow={(m, checkbox, index) => {
                const adminAccount = isAdmin(m.role)
                const status = adminAccount ? 'protected' : (m.approval_status || 'pending').toLowerCase()
                return (
                  <tr key={m.id}>{checkbox}
                    <td className="admin-table__idx">{index}</td>
                    <td>{m.full_name}</td>
                    <td className="admin-table__uid">#{m.id}</td>
                    <td>{m.email}</td>
                    <td>{m.role}</td>
                    <td><StatusPill status={status} /></td>
                    <td>{m.created_at}</td>
                    <td>
                      {adminAccount ? (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Protected</span>
                      ) : (
                        <RowMenu actions={[
                          { label: viewBusyId === m.id ? 'Opening…' : 'View dashboard', onClick: () => void viewAsUser(m), disabled: viewBusyId === m.id },
                          { label: 'Details', onClick: () => void openUserDetails(m) },
                          { label: 'Approve', onClick: () => void setApproval(m.id, 'approved'), disabled: status === 'approved' },
                          { label: 'Keep pending', onClick: () => void setApproval(m.id, 'pending'), disabled: status === 'pending' },
                          { label: 'Reject', onClick: () => void setApproval(m.id, 'rejected'), disabled: status === 'rejected' },
                          { label: 'Delete account', danger: true, onClick: () => void deleteRow(`admin/user/${m.id}`, `Permanently delete ${m.full_name}'s account? This cannot be undone.`) },
                        ]} />
                      )}
                    </td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'approvals' && (
          <>
            <StatChips items={[
              { label: 'Pending', value: pendingAccounts, tone: 'gold' },
              { label: 'Rejected', value: rejectedAccounts, tone: 'red' },
              { label: 'Approved', value: approvedAccounts, tone: 'green' },
            ]} />
            <DataTable
              head={['#', 'Name', 'User ID', 'Email', 'Role', 'Status', 'Reviewed', '']}
              rows={(data?.members ?? []).filter((m) => !isAdmin(m.role) && (m.approval_status || 'pending') !== 'approved')}
              searchPlaceholder="Search pending accounts…"
              searchText={(m) => `${m.full_name} ${m.email} ${m.role} ${m.id}`}
              statusOf={(m) => (m.approval_status || 'pending')}
              statusOptions={['pending', 'rejected']}
              rowId={(m) => m.id}
              bulkActions={[
                { label: 'Approve selected', onClick: (ids) => bulkSetApproval(ids, 'approved') },
                { label: 'Reject selected', danger: true, onClick: (ids) => bulkSetApproval(ids, 'rejected') },
                { label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/user', ids, 'account') },
              ]}
              renderRow={(m, checkbox, index) => {
                const status = (m.approval_status || 'pending').toLowerCase()
                return (
                  <tr key={m.id}>{checkbox}
                    <td className="admin-table__idx">{index}</td>
                    <td>{m.full_name}</td>
                    <td className="admin-table__uid">#{m.id}</td>
                    <td>{m.email}</td>
                    <td>{m.role}</td>
                    <td><StatusPill status={status} /></td>
                    <td>{m.approval_reviewed_at || '—'}</td>
                    <td>
                      <RowMenu actions={[
                        { label: viewBusyId === m.id ? 'Opening…' : 'View dashboard', onClick: () => void viewAsUser(m), disabled: viewBusyId === m.id },
                        { label: 'Details', onClick: () => void openUserDetails(m) },
                        { label: 'Approve', onClick: () => void setApproval(m.id, 'approved'), disabled: status === 'approved' },
                        { label: 'Keep pending', onClick: () => void setApproval(m.id, 'pending'), disabled: status === 'pending' },
                        { label: 'Reject', onClick: () => void setApproval(m.id, 'rejected'), disabled: status === 'rejected' },
                        { label: 'Delete account', danger: true, onClick: () => void deleteRow(`admin/user/${m.id}`, `Permanently delete ${m.full_name}'s account? This cannot be undone.`) },
                      ]} />
                    </td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'ns-submissions' && (
          <>
            <StatChips items={[
              { label: 'Total', value: nsSubmissions.length },
              { label: 'Pending', value: nsSubBy('submitted'), tone: 'gold' },
              { label: 'Approved', value: nsSubBy('approved'), tone: 'green' },
              { label: 'Rejected', value: nsSubBy('rejected'), tone: 'red' },
              { label: 'Winners', value: nsSubBy('winner'), tone: 'blue' },
            ]} />
            <DataTable
              head={['#', 'Participant', 'Student', 'Problem', 'Status', 'Score', '']}
              rows={nsSubmissions}
              searchPlaceholder="Search submissions…"
              searchText={(s) => `${s.student_name ?? ''} ${s.participant_id ?? ''} ${s.problem_identified ?? ''}`}
              statusOf={(s) => (s.status || '')}
              statusOptions={['submitted', 'approved', 'rejected', 'winner', 'draft']}
              rowId={(s) => s.id}
              bulkActions={[
                { label: 'Approve selected', onClick: (ids) => bulkReviewSubmissions(ids, 'approved') },
                { label: 'Reject selected', danger: true, onClick: (ids) => bulkReviewSubmissions(ids, 'rejected') },
              ]}
              renderRow={(s, checkbox, index) => {
                const st = (s.status || '').toLowerCase()
                return (
                  <tr key={s.id}>{checkbox}
                    <td className="admin-table__idx">{index}</td>
                    <td className="admin-table__uid">{s.participant_id || '—'}</td>
                    <td>{s.student_name}</td>
                    <td style={{ maxWidth: 300 }}>{s.problem_identified ? `${String(s.problem_identified).slice(0, 80)}${String(s.problem_identified).length > 80 ? '…' : ''}` : '—'}</td>
                    <td><StatusPill status={st} /></td>
                    <td>{s.score ?? '—'}</td>
                    <td>
                      <RowMenu actions={[
                        { label: 'Approve', onClick: () => void reviewSubmission(s.id, 'approved'), disabled: st === 'approved' || st === 'winner' },
                        { label: 'Reject', danger: true, onClick: () => void reviewSubmission(s.id, 'rejected'), disabled: st === 'rejected' },
                        { label: 'Open in New School dashboard', onClick: () => navigate('/new-school/dashboard') },
                      ]} />
                    </td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'ns-interviews' && (
          <>
            <StatChips items={[{ label: 'Business Interviews', value: nsInterviews.length, tone: 'gold' }]} />
            <DataTable
              head={['#', 'Student', 'Participant', 'Business', 'Visit', 'Date']}
              rows={nsInterviews}
              searchPlaceholder="Search interviews…"
              searchText={(b) => `${b.student_name ?? ''} ${b.participant_id ?? ''} ${b.business_name ?? ''}`}
              renderRow={(b, _checkbox, index) => (
                <tr key={b.id}>
                  <td className="admin-table__idx">{index}</td>
                  <td>{b.student_name}</td>
                  <td className="admin-table__uid">{b.participant_id || '—'}</td>
                  <td>{b.business_name}</td>
                  <td>{b.visit_number ?? '—'}</td>
                  <td>{b.date_of_visit || b.created_at || '—'}</td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'sponsors' && <SponsorsAdminPanel />}
        {tab === 'awards' && <AwardsAdmin />}
        {tab === 'events' && <EventsAdmin />}
        {tab === 'blog' && <PostsAdmin />}
        {tab === 'testimonials' && <TestimonialsAdmin />}
        {tab === 'media' && <MediaAdmin />}
        {tab === 'community' && <CommunityAdmin />}
        {tab === 'rsvps' && <RsvpsAdmin />}
        {tab === 'inventory' && <InventoryAdmin />}
        </main>
      </div>

      <UserDetailModal
        open={!!selectedUser}
        summary={selectedUser}
        detail={selectedUserDetail}
        loading={selectedUserLoading}
        error={selectedUserError}
        onClose={closeUserDetails}
        onApproval={(status) => selectedUser && void setApproval(selectedUser.id, status)}
      />
    </div>
  )
}

function UserDetailModal({
  open,
  summary,
  detail,
  loading,
  error,
  onClose,
  onApproval,
}: {
  open: boolean
  summary: MemberRow | null
  detail: UserDetailPayload | null
  loading: boolean
  error: string
  onClose: () => void
  onApproval: (status: 'pending' | 'approved' | 'rejected') => void
}) {
  if (!open || !summary) return null

  const status = (detail?.user.approval_status || summary.approval_status || 'pending').toLowerCase()
  const reviewer = detail?.user.approval_reviewed_by_name
    ? `${detail.user.approval_reviewed_by_name}${detail.user.approval_reviewed_by_email ? ` (${detail.user.approval_reviewed_by_email})` : ''}`
    : '—'

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h3 className="gold-text">{summary.full_name}</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
              {summary.email} · {summary.role}
            </p>
          </div>
          <span className={`status-pill ${status === 'approved' ? 'status-pill--approved' : status === 'rejected' ? 'status-pill--closed' : 'status-pill--new'}`}>
            {status}
          </span>
        </div>

        {loading && <p style={{ color: 'var(--muted)', marginTop: 18 }}>Loading user details…</p>}
        {error && <p style={{ color: '#e08a8a', marginTop: 18 }}>{error}</p>}

        {!loading && !error && detail && (
          <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
            {detail.sections.map((section) => (
              <section key={section.title} className="glass" style={{ padding: 18, borderRadius: 14 }}>
                <h4 className="gold-text" style={{ fontSize: 18, marginBottom: 12 }}>{section.title}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {section.fields.map((field) => (
                    <div key={field.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                        {field.label}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word' }}>{displayValue(field.value)}</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {detail.tables.map((table) => (
              <section key={table.title} className="glass" style={{ padding: 18, borderRadius: 14, overflowX: 'auto' }}>
                <h4 className="gold-text" style={{ fontSize: 18, marginBottom: 12 }}>{table.title}</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr>
                      {table.columns.map((column) => (
                        <th key={column} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr key={`${table.title}-${index}`}>
                        {Object.values(row).map((value, cellIndex) => (
                          <td key={cellIndex} style={{ padding: '11px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top', lineHeight: 1.5 }}>
                            {displayValue(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
          <button type="button" className={approvalButtonClass(status, 'approved')} disabled={loading} onClick={() => onApproval('approved')}>
            Approve
          </button>
          <button type="button" className={approvalButtonClass(status, 'pending')} disabled={loading} onClick={() => onApproval('pending')}>
            Keep Pending
          </button>
          <button type="button" className={approvalButtonClass(status, 'rejected')} disabled={loading} onClick={() => onApproval('rejected')}>
            Reject
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 12, alignSelf: 'center', marginLeft: 'auto' }}>Reviewed by: {reviewer}</span>
        </div>
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
    ['Pending', data?.totals.pending_accounts ?? 0],
    ['Approved', data?.totals.approved_accounts ?? 0],
    ['Rejected', data?.totals.rejected_accounts ?? 0],
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

type InventoryDraft = {
  product_id: string
  name: string
  category: string
  tagline: string
  description: string
  details: string
  feature_list: string
  spec_list: string
  shipping_note: string
  image: string
  price: string
  stock: string
  low_stock_threshold: string
  visibility: ProductVisibility
  restock_note: string
  sort_order: string
}

const inventoryDraftFromRow = (row: InventoryRow): InventoryDraft => ({
  product_id: row.product_id,
  name: row.name || '',
  category: row.category || '',
  tagline: row.tagline || '',
  description: row.description || '',
  details: row.details || '',
  feature_list: row.feature_list || '',
  spec_list: row.spec_list || '',
  shipping_note: row.shipping_note || '',
  image: row.image || '',
  price: String(row.price ?? 0),
  stock: String(row.stock ?? 0),
  low_stock_threshold: String(row.low_stock_threshold ?? 0),
  visibility: row.visibility,
  restock_note: row.restock_note || '',
  sort_order: String(row.sort_order ?? 0),
})

const emptyInventoryDraft = (sortOrder: number): InventoryDraft => ({
  product_id: '',
  name: '',
  category: '',
  tagline: '',
  description: '',
  details: '',
  feature_list: '',
  spec_list: '',
  shipping_note: '',
  image: '',
  price: '0',
  stock: '0',
  low_stock_threshold: '5',
  visibility: 'upcoming',
  restock_note: '',
  sort_order: String(sortOrder),
})

const inventoryTone = (row: Pick<InventoryRow, 'visibility' | 'stock_status'>): { label: string; tone: 'green' | 'amber' | 'red' | 'muted' } => {
  if (row.visibility === 'hidden') return { label: 'Hidden', tone: 'muted' }
  if (row.visibility === 'upcoming') return { label: 'Upcoming', tone: 'amber' }
  if (row.stock_status === 'out') return { label: 'Sold out', tone: 'red' }
  if (row.stock_status === 'low') return { label: 'Low stock', tone: 'amber' }
  return { label: 'Live', tone: 'green' }
}

const badgePill = (tone: 'green' | 'amber' | 'red' | 'muted'): React.CSSProperties => {
  const palette = {
    green: { border: 'rgba(143,191,150,0.38)', color: '#8FBF96', background: 'rgba(15,91,58,0.16)' },
    amber: { border: 'rgba(201,168,76,0.38)', color: '#F5D48A', background: 'rgba(201,168,76,0.12)' },
    red: { border: 'rgba(224,138,138,0.42)', color: '#e08a8a', background: 'rgba(122,59,59,0.16)' },
    muted: { border: 'rgba(128,119,104,0.42)', color: '#807768', background: 'rgba(128,119,104,0.12)' },
  }[tone]

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    padding: '6px 10px',
    border: `1px solid ${palette.border}`,
    color: palette.color,
    background: palette.background,
    fontSize: 11,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  }
}

function InventoryAdmin() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [editing, setEditing] = useState<InventoryDraft | null>(null)
  const [editingIsNew, setEditingIsNew] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>())
  const [error, setError] = useState('')

  const load = () =>
    api.get<{ inventory: InventoryRow[] }>('admin/inventory')
      .then((d) => setRows(d.inventory))
      .catch(() => {})

  useEffect(() => { void load() }, [])

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev
      const currentIds = new Set(rows.map((row) => row.product_id))
      let changed = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (currentIds.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [rows])

  const isBusy = busyId !== null || bulkBusy
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.product_id)),
    [rows, selectedIds],
  )
  const selectedCount = selectedRows.length
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.product_id))
  const nextSortOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1
  const liveCount = rows.filter((row) => row.visibility === 'live').length
  const upcomingCount = rows.filter((row) => row.visibility === 'upcoming').length
  const hiddenCount = rows.filter((row) => row.visibility === 'hidden').length
  const soldOutCount = rows.filter((row) => row.visibility === 'live' && row.stock_status === 'out').length

  const clearSelection = () => setSelectedIds(new Set<string>())

  const inventoryRowPayload = (row: InventoryRow, visibility: ProductVisibility = row.visibility): Record<string, unknown> => ({
    name: row.name,
    category: row.category,
    tagline: row.tagline,
    description: row.description,
    details: row.details,
    feature_list: row.feature_list,
    spec_list: row.spec_list,
    shipping_note: row.shipping_note,
    image: row.image,
    price: row.price,
    stock: row.stock,
    low_stock_threshold: row.low_stock_threshold,
    visibility,
    restock_note: row.restock_note,
    sort_order: row.sort_order,
  })

  const inventoryDraftPayload = (draft: InventoryDraft): Record<string, unknown> => ({
    name: draft.name.trim(),
    category: draft.category.trim() || null,
    tagline: draft.tagline.trim() || null,
    description: draft.description.trim() || null,
    details: draft.details.trim() || null,
    feature_list: draft.feature_list.trim() || null,
    spec_list: draft.spec_list.trim() || null,
    shipping_note: draft.shipping_note.trim() || null,
    image: draft.image.trim() || null,
    price: Number(draft.price || 0),
    stock: Number(draft.stock || 0),
    low_stock_threshold: Number(draft.low_stock_threshold || 0),
    visibility: draft.visibility,
    restock_note: draft.restock_note.trim() || null,
    sort_order: Number(draft.sort_order || 0),
  })

  const openNewProduct = () => {
    if (isBusy) return
    setError('')
    setEditingIsNew(true)
    setEditing(emptyInventoryDraft(nextSortOrder))
  }

  const openEditProduct = (row: InventoryRow) => {
    if (isBusy) return
    setError('')
    setEditingIsNew(false)
    setEditing(inventoryDraftFromRow(row))
  }

  const toggleSelected = (productId: string) => {
    if (isBusy) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (isBusy) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) rows.forEach((row) => next.delete(row.product_id))
      else rows.forEach((row) => next.add(row.product_id))
      return next
    })
  }

  const saveRow = async (productId: string, payload: Record<string, unknown>) => {
    setBusyId(productId)
    setError('')
    try {
      await api.put(`admin/inventory/${encodeURIComponent(productId)}`, payload)
      await load()
      clearSelection()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update merch product.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const deleteRow = async (row: InventoryRow) => {
    if (!window.confirm(`Delete ${row.name} (${row.product_id})? This cannot be undone.`)) return
    setBusyId(row.product_id)
    setError('')
    try {
      await api.del(`admin/inventory/${encodeURIComponent(row.product_id)}`)
      await load()
      clearSelection()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete merch product.')
    } finally {
      setBusyId(null)
    }
  }

  const saveEditing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return

    const productId = editing.product_id.trim()
    if (!productId) {
      setError('Product ID is required.')
      return
    }
    if (!editing.name.trim()) {
      setError('Product name is required.')
      return
    }

    const ok = await saveRow(productId, inventoryDraftPayload(editing))

    if (ok) {
      setEditing(null)
      setEditingIsNew(false)
    }
  }

  const applyVisibility = async (row: InventoryRow, visibility: ProductVisibility) => {
    await saveRow(row.product_id, inventoryRowPayload(row, visibility))
  }

  const bulkUpdateVisibility = async (visibility: ProductVisibility) => {
    if (!selectedRows.length) return
    setBulkBusy(true)
    setError('')
    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => api.put(`admin/inventory/${encodeURIComponent(row.product_id)}`, inventoryRowPayload(row, visibility))),
      )
      await load()
      const failed = results.find((result) => result.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        const reason = failed.reason
        setError(reason instanceof Error ? reason.message : 'Some products could not be updated.')
      } else {
        clearSelection()
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkDeleteSelected = async () => {
    if (!selectedRows.length) return
    const count = selectedRows.length
    if (!window.confirm(`Delete ${count} selected product${count === 1 ? '' : 's'}? This cannot be undone.`)) return

    setBulkBusy(true)
    setError('')
    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => api.del(`admin/inventory/${encodeURIComponent(row.product_id)}`)),
      )
      await load()
      const failed = results.find((result) => result.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        const reason = failed.reason
        setError(reason instanceof Error ? reason.message : 'Some products could not be deleted.')
      } else {
        clearSelection()
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const submitLabel = bulkBusy ? 'Working...' : busyId ? 'Saving...' : 'Save Product'

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Products & Inventory</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            {rows.length} products - {liveCount} live - {upcomingCount} upcoming - {hiddenCount} hidden - {soldOutCount} sold out
          </p>
        </div>
        <button className="btn btn--sm btn--solid" onClick={openNewProduct} disabled={isBusy}>+ Add Product</button>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      {selectedCount > 0 && (
        <div className="admin-bulkbar">
          <span className="admin-bulkbar__count">{selectedCount} selected</span>
          <button type="button" className="btn btn--sm" onClick={() => void bulkUpdateVisibility('live')} disabled={isBusy}>Set live</button>
          <button type="button" className="btn btn--sm" onClick={() => void bulkUpdateVisibility('upcoming')} disabled={isBusy}>Set upcoming</button>
          <button type="button" className="btn btn--sm" onClick={() => void bulkUpdateVisibility('hidden')} disabled={isBusy}>Hide selected</button>
          <button type="button" className="btn btn--sm admin-bulkbar__danger" onClick={() => void bulkDeleteSelected()} disabled={isBusy}>Delete selected</button>
          <button type="button" className="btn btn--sm" onClick={clearSelection} disabled={isBusy}>Clear</button>
        </div>
      )}

      <div className="admin-table-wrap glass">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__check">
                <input
                  type="checkbox"
                  aria-label="Select all products"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={isBusy || rows.length === 0}
                />
              </th>
              <th>Product</th>
              <th>Visibility</th>
              <th>Stock</th>
              <th>Threshold</th>
              <th>Status</th>
              <th>Price</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length
              ? rows.map((row) => {
                  const tone = inventoryTone(row)
                  const visibilityLabel = row.visibility === 'hidden' ? 'Restore' : 'Hide'
                  return (
                    <tr key={row.product_id}>
                      <td className="admin-table__check">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selectedIds.has(row.product_id)}
                          onChange={() => toggleSelected(row.product_id)}
                          disabled={isBusy}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f0e3bf' }}>{row.name}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                          {row.product_id} - {row.category || 'Uncategorized'}
                        </div>
                      </td>
                      <td>
                        <span style={badgePill(row.visibility === 'hidden' ? 'muted' : row.visibility === 'upcoming' ? 'amber' : 'green')}>
                          {row.visibility}
                        </span>
                      </td>
                      <td>{row.stock}</td>
                      <td>{row.low_stock_threshold}</td>
                      <td>
                        <span style={badgePill(tone.tone)}>{tone.label}</span>
                      </td>
                      <td>${Number(row.price || 0).toFixed(2)}</td>
                      <td>{row.updated_at || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn btn--sm" onClick={() => openEditProduct(row)} disabled={isBusy}>Edit</button>
                          <button className="btn btn--sm" onClick={() => void applyVisibility(row, row.visibility === 'hidden' ? 'live' : 'hidden')} disabled={isBusy}>
                            {visibilityLabel}
                          </button>
                          <RowMenu
                            disabled={isBusy}
                            actions={[
                              { label: 'Edit product', onClick: () => openEditProduct(row), disabled: isBusy },
                              { label: 'Set live', onClick: () => void applyVisibility(row, 'live'), disabled: isBusy },
                              { label: 'Set upcoming', onClick: () => void applyVisibility(row, 'upcoming'), disabled: isBusy },
                              { label: row.visibility === 'hidden' ? 'Restore to live' : 'Hide product', onClick: () => void applyVisibility(row, row.visibility === 'hidden' ? 'live' : 'hidden'), disabled: isBusy },
                              { label: 'Delete product', danger: true, onClick: () => void deleteRow(row), disabled: isBusy },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              : <tr><td className="admin-table__empty" colSpan={9}>No inventory items found.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && !isBusy && (setEditing(null), setEditingIsNew(false))}>
          <form className="modal" style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={saveEditing}>
            <button type="button" className="close" onClick={() => { setEditing(null); setEditingIsNew(false) }} aria-label="Close" disabled={isBusy}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editingIsNew ? 'New Product' : 'Edit Product'}</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '4px 0 18px' }}>
              Hidden removes the product from the public store, upcoming keeps it visible as a future drop, and live publishes it.
            </p>

            <div className="field">
              <label>Product ID</label>
              <input
                type="text"
                required
                value={editing.product_id}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, product_id: e.target.value } : prev))}
                placeholder="hoodie-spring-drop"
                disabled={!editingIsNew}
              />
            </div>

            <div className="field">
              <label>Product Name</label>
              <input type="text" required value={editing.name} onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))} />
            </div>

            <div className="fgrid">
              <div className="field">
                <label>Category</label>
                <input type="text" value={editing.category} onChange={(e) => setEditing((prev) => (prev ? { ...prev, category: e.target.value } : prev))} placeholder="Hoodies, Caps, Books" />
              </div>
              <div className="field">
                <label>Price</label>
                <input type="number" min="0" step="0.01" value={editing.price} onChange={(e) => setEditing((prev) => (prev ? { ...prev, price: e.target.value } : prev))} />
              </div>
              <div className="field">
                <label>Visibility</label>
                <select value={editing.visibility} onChange={(e) => setEditing((prev) => (prev ? { ...prev, visibility: e.target.value as ProductVisibility } : prev))} style={fldSelectS}>
                  <option value="live">Live</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
              <div className="field">
                <label>Sort Order</label>
                <input type="number" min="0" value={editing.sort_order} onChange={(e) => setEditing((prev) => (prev ? { ...prev, sort_order: e.target.value } : prev))} />
              </div>
              <div className="field">
                <label>Stock</label>
                <input type="number" min="0" value={editing.stock} onChange={(e) => setEditing((prev) => (prev ? { ...prev, stock: e.target.value } : prev))} />
              </div>
              <div className="field">
                <label>Low Stock Threshold</label>
                <input type="number" min="0" value={editing.low_stock_threshold} onChange={(e) => setEditing((prev) => (prev ? { ...prev, low_stock_threshold: e.target.value } : prev))} />
              </div>
            </div>

            <div className="field">
              <label>Image URL</label>
              <input type="text" value={editing.image} onChange={(e) => setEditing((prev) => (prev ? { ...prev, image: e.target.value } : prev))} placeholder="/assets/merch-hoodie.webp" />
            </div>

            <div className="field">
              <label>Tagline</label>
              <input type="text" value={editing.tagline} onChange={(e) => setEditing((prev) => (prev ? { ...prev, tagline: e.target.value } : prev))} placeholder="Short product line shown near the title" />
            </div>

            <div className="field">
              <label>Card Description</label>
              <textarea className="fld-area" style={{ minHeight: 100 }} value={editing.description} onChange={(e) => setEditing((prev) => (prev ? { ...prev, description: e.target.value } : prev))} placeholder="Short description for store cards" />
            </div>

            <div className="field">
              <label>Detailed Story</label>
              <textarea className="fld-area" style={{ minHeight: 140 }} value={editing.details} onChange={(e) => setEditing((prev) => (prev ? { ...prev, details: e.target.value } : prev))} placeholder="Longer product detail content for the quick-view modal" />
            </div>

            <div className="fgrid">
              <div className="field">
                <label>Feature Highlights</label>
                <textarea className="fld-area" style={{ minHeight: 140 }} value={editing.feature_list} onChange={(e) => setEditing((prev) => (prev ? { ...prev, feature_list: e.target.value } : prev))} placeholder={"One highlight per line\nHeavyweight fleece\nEmbroidered emblem"} />
              </div>
              <div className="field">
                <label>Product Specs</label>
                <textarea className="fld-area" style={{ minHeight: 140 }} value={editing.spec_list} onChange={(e) => setEditing((prev) => (prev ? { ...prev, spec_list: e.target.value } : prev))} placeholder={"One spec per line\nFit: Relaxed\nCollection: Core"} />
              </div>
            </div>

            <div className="fgrid">
              <div className="field">
                <label>Shipping Note</label>
                <input type="text" value={editing.shipping_note} onChange={(e) => setEditing((prev) => (prev ? { ...prev, shipping_note: e.target.value } : prev))} placeholder="Ships in 2-4 business days" />
              </div>
              <div className="field">
                <label>Restock Note</label>
                <input type="text" value={editing.restock_note} onChange={(e) => setEditing((prev) => (prev ? { ...prev, restock_note: e.target.value } : prev))} placeholder="Core collection stock" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 6 }}>
              <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, maxWidth: 420 }}>
                Set visibility to <strong>live</strong> when you want it on the store, <strong>upcoming</strong> when it should preview publicly, and <strong>hidden</strong> to remove it from the public site.
              </p>
              <button type="submit" className="btn btn--solid" disabled={isBusy}>
                {submitLabel}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function InventoryAdminLegacy() {
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

function StatusPill({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  const cls = ['approved', 'paid', 'fulfilled', 'going', 'protected', 'active'].includes(s)
    ? 'status-pill--approved'
    : ['rejected', 'closed', 'cancelled'].includes(s)
      ? 'status-pill--closed'
      : 'status-pill--new'
  return <span className={`status-pill ${cls}`}>{status}</span>
}

interface StatChipItem { label: string; value: number | string; tone?: 'gold' | 'green' | 'red' | 'blue' | 'muted' }
/** In-tab "actual counter" strip — the full breakdown, distinct from the sidebar notification badges. */
function StatChips({ items }: { items: StatChipItem[] }) {
  return (
    <div className="admin-statchips">
      {items.map((it) => (
        <div key={it.label} className={`admin-statchip${it.tone ? ` admin-statchip--${it.tone}` : ''}`}>
          <strong>{it.value}</strong>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

interface MenuAction { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
/**
 * Compact 3-dot (kebab) actions menu for table rows. The dropdown is rendered in a
 * portal on document.body (NOT inside the table) because the admin cards use
 * `.glass { backdrop-filter / transform }`, which would otherwise become the
 * containing block for a fixed element and clip it inside the overflow scroller.
 * Fixed-positioned at the trigger; closes on outside click, Escape, scroll, or resize.
 */
function RowMenu({ actions, disabled = false }: { actions: MenuAction[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div className="row-menu">
      <button ref={triggerRef} type="button" className="row-menu__trigger" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle}>
        <span /><span /><span />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="row-menu__dropdown" role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}>
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`row-menu__item${a.danger ? ' row-menu__item--danger' : ''}`}
              disabled={a.disabled}
              onClick={() => { setOpen(false); a.onClick() }}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

interface BulkAction { label: string; danger?: boolean; onClick: (ids: number[]) => void | Promise<void> }
interface DataTableProps<T> {
  head: string[]
  rows: T[]
  renderRow: (row: T, checkbox?: React.ReactNode, index?: number) => React.ReactNode
  searchText?: (row: T) => string
  statusOf?: (row: T) => string
  statusOptions?: string[]
  searchPlaceholder?: string
  pageSize?: number
  rowId?: (row: T) => number
  rowSelectable?: (row: T) => boolean
  bulkActions?: BulkAction[]
}

/** List table with search, status filter, result counter, pagination, and optional bulk selection/actions. */
function DataTable<T>({ head, rows, renderRow, searchText, statusOf, statusOptions, searchPlaceholder, pageSize = 10, rowId, rowSelectable, bulkActions }: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const bulkEnabled = !!(rowId && bulkActions && bulkActions.length)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (q && searchText && !searchText(row).toLowerCase().includes(q)) return false
      if (statusFilter !== 'all' && statusOf && (statusOf(row) || '').toLowerCase() !== statusFilter) return false
      return true
    })
  }, [rows, query, statusFilter, searchText, statusOf])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  useEffect(() => { if (page !== safePage) setPage(safePage) }, [page, safePage])
  const start = (safePage - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const isSelectable = (row: T) => bulkEnabled && (!rowSelectable || rowSelectable(row))
  const pageSelectableIds = bulkEnabled ? pageRows.filter(isSelectable).map((r) => rowId!(r)) : []
  const allPageSelected = pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selected.has(id))
  const selectedIds = [...selected]

  const toggleOne = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const togglePage = () => setSelected((prev) => {
    const next = new Set(prev)
    if (allPageSelected) pageSelectableIds.forEach((id) => next.delete(id))
    else pageSelectableIds.forEach((id) => next.add(id))
    return next
  })
  const clearSelection = () => setSelected(new Set())
  const runBulk = async (action: BulkAction) => {
    if (!selectedIds.length) return
    await action.onClick(selectedIds)
    clearSelection()
  }

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        {searchText && (
          <input
            className="admin-toolbar__search"
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder={searchPlaceholder || 'Search…'}
          />
        )}
        {statusOptions && statusOf && (
          <select
            className="admin-toolbar__filter"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <option value="all">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>
        )}
        <span className="admin-toolbar__count">
          {filtered.length === rows.length ? `${rows.length}` : `${filtered.length} of ${rows.length}`} {rows.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      {bulkEnabled && selectedIds.length > 0 && (
        <div className="admin-bulkbar">
          <span className="admin-bulkbar__count">{selectedIds.length} selected</span>
          {bulkActions!.map((a, i) => (
            <button
              key={i}
              type="button"
              className={`btn btn--sm${a.danger ? ' admin-bulkbar__danger' : ''}`}
              onClick={() => void runBulk(a)}
            >
              {a.label}
            </button>
          ))}
          <button type="button" className="btn btn--sm" onClick={clearSelection}>Clear</button>
        </div>
      )}

      <div className="admin-table-wrap glass">
        <table className="admin-table">
          <thead>
            <tr>
              {bulkEnabled && (
                <th className="admin-table__check">
                  <input type="checkbox" aria-label="Select all on page" checked={allPageSelected} onChange={togglePage} />
                </th>
              )}
              {head.map((h, i) => <th key={h || `col-${i}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.length
              ? pageRows.map((row, i) => renderRow(
                  row,
                  bulkEnabled
                    ? (isSelectable(row)
                        ? <td className="admin-table__check"><input type="checkbox" aria-label="Select row" checked={selected.has(rowId!(row))} onChange={() => toggleOne(rowId!(row))} /></td>
                        : <td className="admin-table__check" />)
                    : undefined,
                  start + i + 1,
                ))
              : <tr><td className="admin-table__empty" colSpan={head.length + (bulkEnabled ? 1 : 0)}>No matching records.</td></tr>}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="admin-pager">
          <button type="button" className="btn btn--sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹ Prev</button>
          <span className="admin-pager__label">Page {safePage} of {pageCount}</span>
          <button type="button" className="btn btn--sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>Next ›</button>
        </div>
      )}
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



