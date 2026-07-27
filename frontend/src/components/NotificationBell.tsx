import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useAnnouncementBadge } from './AnnouncementsFeed'

/* Unified notifications bell — a single dropdown shared by every dashboard.
   Merges the per-user notification feed (server is_read, from
   new_school_notifications) with global announcements (client-seen via
   useAnnouncementBadge). Auto-polls every ~30s while mounted. */

interface FeedItem { id: number; type: string; title: string; message: string; is_read: boolean; created_ts: number }

function timeAgo(ts: number): string {
  if (!ts) return ''
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<FeedItem[]>([])
  const [unread, setUnread] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 56, right: 16 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const placeDropdown = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) })
  }
  const ann = useAnnouncementBadge()

  const load = async () => {
    try {
      const d = await api.get<{ items: FeedItem[]; unread: number }>('notifications/feed')
      setItems(Array.isArray(d.items) ? d.items : [])
      setUnread(Number(d.unread) || 0)
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!user) return
    let alive = true
    void load()
    const id = window.setInterval(() => { if (alive) void load() }, 30000)
    return () => { alive = false; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Close on outside click (dropdown is portaled to body, so check it too) +
  // keep the dropdown pinned under the bell on scroll / resize.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || dropRef.current?.contains(t)) return
      setOpen(false)
    }
    const onMove = () => placeDropdown()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  if (!user) return null
  const badge = unread + ann.unseen

  const toggle = () => {
    const next = !open
    if (next) placeDropdown()
    setOpen(next)
    if (next) { void load(); ann.markSeen() } // opening clears the announcement portion
  }
  const markOne = async (id: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, is_read: true } : it)))
    setUnread((u) => Math.max(0, u - 1))
    try { await api.post(`new-school/notifications/${id}/read`, {}) } catch { /* ignore */ }
  }
  const markAll = async () => {
    setBusy(true)
    try { const d = await api.post<{ items: FeedItem[]; unread: number }>('notifications/read-all', {}); setItems(d.items || []); setUnread(Number(d.unread) || 0) }
    catch { /* ignore */ } finally { setBusy(false) }
  }

  const recentAnns = ann.items.slice(0, 4)

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`Notifications${badge ? ` (${badge} new)` : ''}`}
        title="Notifications"
        style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--line)', background: 'rgba(255,255,255,0.04)', color: 'var(--gold-light)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
        {badge > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#e5484d', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </button>

      {open && createPortal(
        <div ref={dropRef} style={{ position: 'fixed', top: pos.top, right: pos.right, width: 'min(340px, 92vw)', maxHeight: 460, overflowY: 'auto', background: '#14130f', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.8)', zIndex: 100000 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: '#14130f' }}>
            <strong style={{ color: 'var(--gold-light)', fontSize: 13.5 }}>Notifications</strong>
            {unread > 0 && <button type="button" className="linklike" disabled={busy} onClick={() => void markAll()} style={{ background: 'none', border: 0, color: 'var(--gold-light)', fontSize: 12, cursor: 'pointer' }}>Mark all read</button>}
          </div>

          <div style={{ display: 'grid' }}>
            {items.length === 0 && recentAnns.length === 0 && (
              <div style={{ padding: '22px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>You’re all caught up 🎉</div>
            )}
            {items.map((it) => (
              <button key={it.id} type="button" onClick={() => !it.is_read && void markOne(it.id)} style={{ textAlign: 'left', border: 0, borderBottom: '1px solid var(--line)', padding: '11px 14px', cursor: it.is_read ? 'default' : 'pointer', background: it.is_read ? 'transparent' : 'rgba(212,175,90,0.08)', display: 'grid', gap: 2 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  {!it.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e5484d', flex: '0 0 auto', marginTop: 4 }} />}
                  <span style={{ color: 'var(--ivory)', fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>{it.title || 'Notification'}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{timeAgo(it.created_ts)}</span>
                </div>
                {it.message && <span style={{ color: '#c9c3b4', fontSize: 12, lineHeight: 1.45, paddingLeft: !it.is_read ? 15 : 0 }}>{it.message}</span>}
              </button>
            ))}

            {recentAnns.length > 0 && (
              <>
                <div style={{ padding: '10px 14px 4px', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>📣 Announcements</div>
                {recentAnns.map((a) => (
                  <div key={a.id} style={{ borderBottom: '1px solid var(--line)', padding: '9px 14px', display: 'grid', gap: 2 }}>
                    <span style={{ color: 'var(--ivory)', fontWeight: 700, fontSize: 12.5 }}>{a.title || 'Announcement'}</span>
                    {a.body && <span style={{ color: '#c9c3b4', fontSize: 12, lineHeight: 1.45 }}>{String(a.body).slice(0, 120)}{String(a.body).length > 120 ? '…' : ''}</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
