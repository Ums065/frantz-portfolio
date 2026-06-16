import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type CommunityCommentRow, type CommunityThreadRow } from '../lib/api'
import { communityUpdates, memberPerks } from '../lib/brandContent'
import { DEFAULT_MEMBER_NOTIFICATIONS, loadMemberNotifications, MemberNotification } from '../lib/memberStorage'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'

export default function Community() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<MemberNotification[]>(DEFAULT_MEMBER_NOTIFICATIONS)
  const [threads, setThreads] = useState<CommunityThreadRow[]>([])
  const [activeThread, setActiveThread] = useState<CommunityThreadRow | null>(null)
  const [threadDetail, setThreadDetail] = useState<{ thread: CommunityThreadRow; comments: CommunityCommentRow[] } | null>(null)
  const [threadTitle, setThreadTitle] = useState('')
  const [threadBody, setThreadBody] = useState('')
  const [threadAudience, setThreadAudience] = useState<'public' | 'member' | 'vip'>('member')
  const [threadBusy, setThreadBusy] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentError, setCommentError] = useState('')

  useSeo({
    title: 'Community',
    description: 'Member benefits, founder updates, private content, and community announcements for Frantz Coutard supporters.',
    image: '/assets/brand-marks-grid.webp',
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    setNotifications(loadMemberNotifications())
    api.get<{ threads: CommunityThreadRow[] }>('community/threads').then((d) => setThreads(d.threads)).catch(() => setThreads([]))
  }, [])

  useEffect(() => {
    if (!activeThread) return
    api.get<{ thread: CommunityThreadRow; comments: CommunityCommentRow[] }>(`community/thread/${activeThread.id}`)
      .then((d) => setThreadDetail(d))
      .catch(() => setThreadDetail(null))
  }, [activeThread])

  const memberId = user ? `FC-${String(user.id).padStart(4, '0')}` : 'FC-0000'

  const createThread = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setThreadBusy(true)
    setThreadError('')
    try {
      await api.post('community/thread', {
        title: threadTitle,
        body: threadBody,
        audience: threadAudience,
      })
      setThreadTitle('')
      setThreadBody('')
      setThreadAudience('member')
      const res = await api.get<{ threads: CommunityThreadRow[] }>('community/threads')
      setThreads(res.threads)
      window.fcToast?.('Thread posted.')
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Post failed.')
    } finally {
      setThreadBusy(false)
    }
  }

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeThread) return
    setCommentBusy(true)
    setCommentError('')
    try {
      await api.post(`community/thread/${activeThread.id}/comment`, { body: commentBody })
      setCommentBody('')
      const res = await api.get<{ thread: CommunityThreadRow; comments: CommunityCommentRow[] }>(`community/thread/${activeThread.id}`)
      setThreadDetail(res)
      const threadsRes = await api.get<{ threads: CommunityThreadRow[] }>('community/threads')
      setThreads(threadsRes.threads)
      window.fcToast?.('Comment posted.')
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Comment failed.')
    } finally {
      setCommentBusy(false)
    }
  }

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Community Platform</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Members First</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto' }}>
            A premium member experience for VIP invites, founder updates, private resources, and community announcements.
          </p>
          <div className="page-hero__chips reveal in d2" style={{ justifyContent: 'center', marginTop: 18 }}>
            <span className="chip">Saved content</span>
            <span className="chip">VIP invites</span>
            <span className="chip">Founder notes</span>
            <span className="chip">Private resources</span>
          </div>
        </div>
      </section>

      <section className="block" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="community-grid">
            <div className="glass member-card reveal d1">
              <div className="member-card__top">
                <div className="member-card__seal" aria-hidden="true">{(user?.full_name || '').trim().charAt(0).toUpperCase() || 'U'}</div>
                <div>
                  <span className="member-card__label">Digital Membership Card</span>
                  <h2>{user?.full_name || 'Community Guest'}</h2>
                  <p>{user ? user.email : 'Sign in or register to unlock the member dashboard.'}</p>
                </div>
              </div>
              <div className="member-card__grid">
                <div><span>Member ID</span><strong>{memberId}</strong></div>
                <div><span>Status</span><strong>{user ? (resolveDashboardRoute(user.role) === '/admin' ? 'Admin access' : 'Member access') : 'Public access'}</strong></div>
                <div><span>Role</span><strong>{user?.role || 'visitor'}</strong></div>
                <div><span>Access</span><strong>{user ? 'Saved items + perks' : 'Join for updates'}</strong></div>
              </div>
              <div className="profile-actions">
                <Link className="btn btn--solid btn--sm" to={user ? resolveDashboardRoute(user.role) : '/dashboard'}>{user ? 'Open Dashboard' : 'Sign In'}</Link>
                <Link className="btn btn--sm" to="/blog">Read the News</Link>
              </div>
            </div>

            <div className="glass dashboard-panel reveal d2">
              <p className="eyebrow">Member Benefits</p>
              <h2 className="gold-text">What You Get</h2>
              <div className="dashboard-perks" style={{ marginTop: 18 }}>
                {memberPerks.map((perk) => (
                  <div className="dashboard-perk" key={perk.title}>
                    <span className="dashboard-perk__badge">{perk.badge}</span>
                    <strong>{perk.title}</strong>
                    <p>{perk.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Community Board</h2><span className="ln r" /></div>
            <p className="sub">Public notes, member-only threads, and VIP updates in one place.</p>
          </div>
          {user ? (
            <form className="glass dashboard-panel reveal d1" onSubmit={createThread} style={{ marginBottom: 24 }}>
              <div className="dashboard-section-head">
                <h3>Start a Thread</h3>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Members can post and reply</span>
              </div>
              <div className="fgrid">
                <div className="field col2">
                  <label>Title</label>
                  <input type="text" required value={threadTitle} onChange={(e) => setThreadTitle(e.target.value)} placeholder="Share an idea, question, or update" />
                </div>
                <div className="field col2">
                  <label>Audience</label>
                  <select value={threadAudience} onChange={(e) => setThreadAudience(e.target.value as 'public' | 'member' | 'vip')} style={{ width: '100%' }}>
                    <option value="public">Public</option>
                    <option value="member">Members</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div className="field col2">
                  <label>Body</label>
                  <textarea className="fld-area" required value={threadBody} onChange={(e) => setThreadBody(e.target.value)} placeholder="Write your message to the community..." />
                </div>
              </div>
              {threadError && <p style={{ color: '#e08a8a', fontSize: 13, marginBottom: 10 }}>{threadError}</p>}
              <button className="btn btn--solid" type="submit" disabled={threadBusy}>{threadBusy ? 'Posting...' : 'Post Thread'}</button>
            </form>
          ) : (
            <div className="glass dashboard-panel reveal d1" style={{ marginBottom: 24 }}>
              <h3 className="gold-text">Join to Post</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>Create an account to post threads, reply to member discussions, and unlock the full community platform.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                <button className="btn btn--solid btn--sm" data-auth="register">Register Now</button>
                <button className="btn btn--sm" data-auth="login">Login</button>
              </div>
            </div>
          )}
          <div className="blog-list-grid">
            {threads.map((thread) => (
              <article className="glass blog-card reveal" key={thread.id}>
                <div className="blog-card__img" style={{ display: 'grid', placeItems: 'center' }}>
                  <div style={{ textAlign: 'center', padding: 22 }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>{thread.audience}</div>
                    <div style={{ fontFamily: 'var(--f-serif)', fontSize: 20, color: 'var(--gold-light)', lineHeight: 1.1 }}>{thread.comment_count ?? 0} replies</div>
                  </div>
                </div>
                <div className="blog-card__body">
                  <div className="kicker">
                    <span className="cat">{thread.is_pinned ? 'Pinned' : thread.audience}</span>
                    <span>&bull;</span>
                    <span>{thread.author_name}</span>
                  </div>
                  <h3>{thread.title}</h3>
                  <p>{thread.body}</p>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>{thread.created_at}</div>
                  <button className="read" onClick={() => setActiveThread(thread)} type="button">
                    Open Thread
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {activeThread && threadDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 220,
            background: 'rgba(4,4,4,0.84)',
            backdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
          onClick={(e) => e.target === e.currentTarget && setActiveThread(null)}
        >
          <div className="glass" style={{ width: '100%', maxWidth: 760, borderRadius: 18, padding: 28, position: 'relative' }}>
            <button className="award-modal__close" style={{ position: 'absolute', right: 14, top: 14 }} onClick={() => setActiveThread(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{threadDetail.thread.audience} board</div>
            <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', marginBottom: 10 }}>{threadDetail.thread.title}</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.8 }}>{threadDetail.thread.body}</p>
            <div style={{ color: 'var(--gold)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 10 }}>
              {threadDetail.thread.author_name} · {threadDetail.thread.created_at}
            </div>

            <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
              {threadDetail.comments.map((comment) => (
                <div key={comment.id} style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <strong style={{ color: '#fff' }}>{comment.author_name}</strong>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{comment.created_at}</span>
                  </div>
                  <p style={{ color: '#d8d2c6', lineHeight: 1.7, fontSize: 14 }}>{comment.body}</p>
                </div>
              ))}
            </div>

            {user && (
              <form onSubmit={addComment} style={{ marginTop: 24 }}>
                <div className="field">
                  <label>Add a reply</label>
                  <textarea className="fld-area" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Write a reply for the community..." />
                </div>
                {commentError && <p style={{ color: '#e08a8a', fontSize: 13, marginBottom: 10 }}>{commentError}</p>}
                <button className="btn btn--solid btn--sm" type="submit" disabled={commentBusy}>{commentBusy ? 'Posting...' : 'Post Reply'}</button>
              </form>
            )}
          </div>
        </div>
      )}

      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Community Updates</h2><span className="ln r" /></div>
            <p className="sub">Founder notes, announcements, and roadmap updates.</p>
          </div>
          <div className="blog-list-grid">
            {communityUpdates.map((update) => (
              <article className="glass blog-card reveal" key={update.title}>
                <div className="blog-card__img" style={{ display: 'grid', placeItems: 'center' }}>
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>{update.category}</div>
                    <div style={{ fontFamily: 'var(--f-serif)', fontSize: 22, color: 'var(--gold-light)', lineHeight: 1.1 }}>{update.action}</div>
                  </div>
                </div>
                <div className="blog-card__body">
                  <div className="kicker"><span className="cat">{update.category}</span><span>&bull;</span><span>Member platform</span></div>
                  <h3>{update.title}</h3>
                  <p>{update.summary}</p>
                  <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>{update.detail}</div>
                  <Link className="read" to={update.href}>
                    {update.action}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap"><div className="sec-divider" /></div>

      <section className="block">
        <div className="wrap">
          <div className="community-grid">
            <div className="glass dashboard-panel reveal d1">
              <p className="eyebrow">Notification Center</p>
              <h2 className="gold-text">What Is New For Members</h2>
              <div className="notification-list">
                {notifications.map((note) => (
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

            <div className="glass dashboard-panel reveal d2">
              <p className="eyebrow">Join In</p>
              <h2 className="gold-text">Ways To Participate</h2>
              <div className="dashboard-cards" style={{ gridTemplateColumns: '1fr', marginTop: 18 }}>
                <div className="dashboard-card">
                  <h3>Register for access</h3>
                  <p>Create a community account to unlock saved items, perks, and the member dashboard.</p>
                  <button className="btn btn--solid" data-auth="register">Register Now</button>
                </div>
                <div className="dashboard-card">
                  <h3>Join a launch or event</h3>
                  <p>Use the request flow to ask about invite-only launches, speaking events, and community activations.</p>
                  <button className="btn" data-request="Event RSVP">RSVP / Request Invite</button>
                </div>
                <div className="dashboard-card">
                  <h3>Follow the latest news</h3>
                  <p>News and launch notes are published as the ecosystem grows.</p>
                  <Link className="btn" to="/blog">Open News</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
