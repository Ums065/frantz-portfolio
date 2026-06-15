import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type EventRsvpRow, type UserOrderRow, type UserRequestRow, type User } from '../lib/api'
import {
  DEFAULT_MEMBER_NOTIFICATIONS,
  dismissMemberNotification,
  loadMemberNotifications,
  loadSavedItems,
  removeSavedItem,
  saveMemberNotifications,
  type MemberNotification,
  type SavedContentItem,
} from '../lib/memberStorage'
import { memberPerks } from '../lib/brandContent'
import { useAuth } from '../context/AuthContext'

interface DashboardData {
  user: User
  stats: {
    requests: number
    orders: number
    rsvps: number
  }
  requests: UserRequestRow[]
  orders: UserOrderRow[]
  rsvps: EventRsvpRow[]
}

const isAdmin = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')

const dashboardTabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'requests', label: 'My Requests' },
  { key: 'orders', label: 'My Orders' },
  { key: 'rsvps', label: 'My RSVPs' },
  { key: 'saved', label: 'Saved Items' },
  { key: 'perks', label: 'Perks & Alerts' },
  { key: 'settings', label: 'Settings' },
] as const

type DashboardTab = typeof dashboardTabs[number]['key']

export default function Dashboard() {
  const { user, loading, logout, refresh } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedArticles, setSavedArticles] = useState<SavedContentItem[]>([])
  const [savedEvents, setSavedEvents] = useState<SavedContentItem[]>([])
  const [notifications, setNotifications] = useState<MemberNotification[]>(DEFAULT_MEMBER_NOTIFICATIONS)

  const memberId = useMemo(() => (user ? `FC-${String(user.id).padStart(4, '0')}` : 'FC-0000'), [user])
  const savedTotal = savedArticles.length + savedEvents.length
  const fullName = user?.full_name || ''
  const avatarInitial = fullName.trim().charAt(0).toUpperCase() || 'U'
  const displayName = data?.user?.full_name || fullName
  const activeTabLabel = dashboardTabs.find((item) => item.key === tab)?.label || 'Overview'
  const approvalStatus = (user?.approval_status || 'approved').toString()
  const requiresApproval = !!user && !isAdmin(user.role) && approvalStatus !== 'approved'

  useEffect(() => {
    if (!user || isAdmin(user.role) || requiresApproval) return
    api.get<DashboardData>('user/dashboard')
      .then((res) => {
        setData(res)
        setName(res.user?.full_name || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load dashboard.'))
    setSavedArticles(loadSavedItems('article'))
    setSavedEvents(loadSavedItems('event'))
    setNotifications(loadMemberNotifications())
  }, [user, requiresApproval])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await api.put<{ user: User; message: string }>('user/profile', {
        full_name: name,
        password,
      })
      await refresh()
      setData((prev) => (prev ? { ...prev, user: res.user } : prev))
      setPassword('')
      setMessage(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  const removeSaved = (kind: 'article' | 'event', id: string) => {
    const next = removeSavedItem(kind, id)
    if (kind === 'article') setSavedArticles(next)
    else setSavedEvents(next)
    window.fcToast?.('Saved item removed.')
  }

  const dismissNotification = (id: string) => {
    setNotifications(dismissMemberNotification(id))
  }

  if (loading) {
    return <section className="profile-page"><div className="profile-card glass"><p className="profile-page__muted">Loading...</p></div></section>
  }

  if (!user) {
    return (
      <section className="profile-page">
        <div className="profile-card glass">
          <p className="eyebrow">Member Area</p>
          <h1 className="gold-text">User Dashboard</h1>
          <p className="profile-page__muted">Please login first to open your dashboard.</p>
          <Link className="btn btn--solid" to="/">Back to Home</Link>
        </div>
      </section>
    )
  }

  if (isAdmin(user.role)) {
    return (
      <section className="profile-page">
        <div className="profile-card glass">
          <p className="eyebrow">Admin Account</p>
          <h1 className="gold-text">Use Admin Dashboard</h1>
          <p className="profile-page__muted">This account has admin access. Open the dedicated admin dashboard for management tools.</p>
          <div className="profile-actions">
            <Link className="btn btn--sm btn--solid" to="/admin">Open Admin</Link>
            <Link className="btn btn--sm" to="/">View Site</Link>
          </div>
        </div>
      </section>
    )
  }

  if (requiresApproval) {
    return (
      <section className="profile-page">
        <div className="profile-card glass" style={{ maxWidth: 720 }}>
          <p className="eyebrow">Account Review</p>
          <h1 className="gold-text">{approvalStatus === 'rejected' ? 'Account Rejected' : 'Approval Pending'}</h1>
          <p className="profile-page__muted" style={{ maxWidth: 620, margin: '0 auto' }}>
            {approvalStatus === 'rejected'
              ? 'This account was rejected by admin. Private tools stay locked and the account cannot be used until the review is changed.'
              : 'Your account is waiting for admin approval. You can log in, but member dashboard tools and private perks stay locked until the review is completed.'}
          </p>
          <div className="profile-grid" style={{ marginTop: 20 }}>
            <div>
              <span>Account</span>
              <strong>{fullName || user.email}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{user.role}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{approvalStatus}</strong>
            </div>
            <div>
              <span>Next step</span>
              <strong>Admin review</strong>
            </div>
          </div>
          <div className="profile-actions">
            <Link className="btn btn--sm btn--solid" to="/profile">View Profile</Link>
            <Link className="btn btn--sm" to="/">Back to Home</Link>
            <button className="btn btn--sm" type="button" onClick={() => logout()}>Logout</button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="profile-page profile-page--dashboard">
      <div className="dashboard-hero glass">
        <div className="dashboard-hero__copy">
          <div>
            <p className="eyebrow">Member Dashboard</p>
            <h1 className="gold-text">Welcome Back</h1>
            <p className="dashboard-hero__lead">
              A focused workspace for requests, orders, RSVPs, saved items, and account settings.
            </p>
            <div className="dashboard-hero__chips">
              <span className="dashboard-hero__chip">Active page: Dashboard</span>
              <span className="dashboard-hero__chip">Active tab: {activeTabLabel}</span>
              <span className="dashboard-hero__chip">Saved items: {savedTotal}</span>
            </div>
          </div>
        </div>
        <div className="dashboard-hero__panel">
          <div className="dashboard-hero__panel-top">
            <div className="dashboard-hero__avatar" aria-hidden="true">{avatarInitial}</div>
            <div className="dashboard-hero__panel-copy">
              <span>Current account</span>
              <strong>{displayName || user.email}</strong>
              <p>{user.email}</p>
            </div>
          </div>
          <div className="dashboard-hero__panel-grid">
            <div>
              <span>Member ID</span>
              <strong>{memberId}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{user.role}</strong>
            </div>
            <div>
              <span>Saved</span>
              <strong>{savedTotal}</strong>
            </div>
            <div>
              <span>Access</span>
              <strong>{isAdmin(user.role) ? 'Admin' : 'Member'}</strong>
            </div>
          </div>
          <div className="dashboard-hero__actions">
            <Link className="btn btn--sm btn--solid" to="/store">Shop</Link>
            <Link className="btn btn--sm" to="/community">Community</Link>
            <Link className="btn btn--sm" to="/profile">Profile</Link>
          </div>
        </div>
      </div>

      <div className="dashboard-shell">
        <aside className="dashboard-side glass">
          <div className="dashboard-side__head">
            <div className="profile-summary__avatar" aria-hidden="true">{avatarInitial}</div>
            <div>
              <h2>{displayName}</h2>
              <p>{user.email}</p>
            </div>
          </div>
          <div className="dashboard-side__status">
            <span>Active tab</span>
            <strong>{activeTabLabel}</strong>
          </div>
          {dashboardTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'dashboard-nav active' : 'dashboard-nav'}
              aria-pressed={tab === item.key}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
          <div className="dashboard-side__foot">
            <Link className="btn btn--sm btn--solid" to="/store">Shop</Link>
            <Link className="btn btn--sm" to="/community">Community</Link>
            <button className="btn btn--sm" type="button" onClick={() => logout()}>Logout</button>
          </div>
        </aside>

        <div className="dashboard-main">
          {tab === 'overview' && (
            <div className="glass dashboard-panel">
              <p className="eyebrow">Member Dashboard</p>
              <h1 className="gold-text">Welcome Back</h1>
              <div className="dashboard-stats">
                <div>
                  <span>Total Requests</span>
                  <strong>{data?.stats.requests ?? 0}</strong>
                </div>
                <div>
                  <span>Total Orders</span>
                  <strong>{data?.stats.orders ?? 0}</strong>
                </div>
                <div>
                  <span>Total RSVPs</span>
                  <strong>{data?.stats.rsvps ?? 0}</strong>
                </div>
                <div>
                  <span>Saved Items</span>
                  <strong>{savedTotal}</strong>
                </div>
              </div>
              <div className="dashboard-cards">
                <div className="dashboard-card dashboard-member-card">
                  <h3>Digital Membership Card</h3>
                  <div className="member-card__grid" style={{ marginTop: 0 }}>
                    <div><span>ID</span><strong>{memberId}</strong></div>
                    <div><span>Status</span><strong>Active</strong></div>
                    <div><span>Role</span><strong>{user.role}</strong></div>
                    <div><span>Access</span><strong>Member perks</strong></div>
                  </div>
                </div>
                <div className="dashboard-card">
                  <h3>Quick Links</h3>
                  <p>Browse the public pages, save content, and move back into the ecosystem.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <Link className="btn btn--sm btn--solid" to="/blog">Read News</Link>
                    <Link className="btn btn--sm" to="/events">Events</Link>
                    <Link className="btn btn--sm" to="/media">Media</Link>
                  </div>
                </div>
              </div>
              <div className="dashboard-notifications" style={{ marginTop: 22 }}>
                <div className="dashboard-section-head">
                  <h3>Notification Center</h3>
                  <Link to="/community">More updates</Link>
                </div>
                <div className="notification-list">
                  {notifications.slice(0, 3).map((note) => (
                    <div className={`notification-item tone-${note.tone}`} key={note.id}>
                      <div>
                        <strong>{note.title}</strong>
                        <p>{note.body}</p>
                      </div>
                      <div className="notification-item__meta">
                        <span>{note.createdAt}</span>
                        {note.href ? <Link to={note.href}>Open</Link> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'requests' && (
            <div className="glass dashboard-panel">
              <h2 className="gold-text">My Requests</h2>
              <div className="dashboard-table">
                {data?.requests.length ? (
                  <table>
                    <thead>
                      <tr><th>Type</th><th>Organization</th><th>Status</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                      {data.requests.map((row) => (
                        <tr key={row.id}>
                          <td>{row.request_type}</td>
                          <td>{row.organization || '—'}</td>
                          <td><span className={`status-pill status-pill--${row.status}`}>{row.status}</span></td>
                          <td>{row.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="profile-page__muted">You have not submitted any requests yet.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="glass dashboard-panel">
              <h2 className="gold-text">My Orders</h2>
              <div className="dashboard-table">
                {data?.orders.length ? (
                  <table>
                    <thead>
                      <tr><th>Order #</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                      {data.orders.map((row) => (
                        <tr key={row.id}>
                          <td>{row.order_no}</td>
                          <td>${row.total}</td>
                          <td>{row.payment_method}</td>
                          <td>{row.status}</td>
                          <td>{row.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="profile-page__muted">No orders found for this account yet.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'rsvps' && (
            <div className="glass dashboard-panel">
              <h2 className="gold-text">My RSVPs</h2>
              <div className="dashboard-table">
                {data?.rsvps.length ? (
                  <table>
                    <thead>
                      <tr><th>Event</th><th>Status</th><th>Code</th><th>Date</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                      {data.rsvps.map((row) => (
                        <tr key={row.id}>
                          <td>{row.event_title || 'Event'}</td>
                          <td><span className={`status-pill status-pill--${row.status}`}>{row.status}</span></td>
                          <td>{row.confirmation_code}</td>
                          <td>{row.event_date || row.created_at}</td>
                          <td>{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="profile-page__muted">You have not RSVP'd to any events yet.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'saved' && (
            <div className="glass dashboard-panel">
              <div className="dashboard-section-head">
                <div>
                  <h2 className="gold-text">Saved Items</h2>
                  <p className="profile-page__muted">Your saved articles and events appear here from the public pages.</p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link className="btn btn--sm" to="/blog">Browse Articles</Link>
                  <Link className="btn btn--sm" to="/events">Browse Events</Link>
                </div>
              </div>

              <div className="dashboard-saved-grid">
                <div>
                  <h3 className="dashboard-section-title">Saved Articles</h3>
                  <div className="saved-list">
                    {savedArticles.length ? savedArticles.map((item) => (
                      <div className="saved-item" key={item.id}>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.meta}</p>
                        </div>
                        <div className="saved-item__actions">
                          <Link to={item.href}>Open</Link>
                          <button type="button" onClick={() => removeSaved('article', item.id)}>Remove</button>
                        </div>
                      </div>
                    )) : <p className="profile-page__muted">No saved articles yet.</p>}
                  </div>
                </div>

                <div>
                  <h3 className="dashboard-section-title">Saved Events</h3>
                  <div className="saved-list">
                    {savedEvents.length ? savedEvents.map((item) => (
                      <div className="saved-item" key={item.id}>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.meta}</p>
                        </div>
                        <div className="saved-item__actions">
                          <Link to={item.href}>Open</Link>
                          <button type="button" onClick={() => removeSaved('event', item.id)}>Remove</button>
                        </div>
                      </div>
                    )) : <p className="profile-page__muted">No saved events yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'perks' && (
            <div className="glass dashboard-panel">
              <h2 className="gold-text">Perks & Alerts</h2>
              <div className="dashboard-perks">
                {memberPerks.map((perk) => (
                  <div className="dashboard-perk" key={perk.title}>
                    <span className="dashboard-perk__badge">{perk.badge}</span>
                    <strong>{perk.title}</strong>
                    <p>{perk.summary}</p>
                  </div>
                ))}
              </div>
              <div className="dashboard-notifications" style={{ marginTop: 22 }}>
                <div className="dashboard-section-head">
                  <h3>Alerts</h3>
                  <button
                    className="btn btn--sm"
                    type="button"
                    onClick={() => {
                      saveMemberNotifications(DEFAULT_MEMBER_NOTIFICATIONS)
                      setNotifications(DEFAULT_MEMBER_NOTIFICATIONS)
                    }}
                  >
                    Reset
                  </button>
                </div>
                <div className="notification-list">
                  {notifications.map((note) => (
                    <div className={`notification-item tone-${note.tone}`} key={note.id}>
                      <div>
                        <strong>{note.title}</strong>
                        <p>{note.body}</p>
                      </div>
                      <div className="notification-item__meta">
                        <span>{note.createdAt}</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {note.href ? <Link to={note.href}>Open</Link> : null}
                          <button type="button" onClick={() => dismissNotification(note.id)}>Dismiss</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="glass dashboard-panel">
              <h2 className="gold-text">Profile Settings</h2>
              <form className="dashboard-form" onSubmit={saveProfile}>
                <div className="field">
                  <label>Full Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={user.email} disabled />
                </div>
                <div className="field">
                  <label>New Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current password" />
                </div>
                {message && <p className="dashboard-success">{message}</p>}
                {error && <p className="dashboard-error">{error}</p>}
                <button className="btn btn--solid" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
