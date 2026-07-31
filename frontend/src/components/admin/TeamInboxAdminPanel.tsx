import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Modal, EcoStatChips } from './EcosystemAdminPanel'
import { EcoMessages } from '../../pages/portal/EcosystemPortal'

/* Unified admin Team Inbox: every 1:1 "Messages with the team" thread across
   roles that use the generic channel (business, member, fellow) plus the
   ecosystem accounts (sponsor/partner/media/volunteer) — all keyed on user_id
   in ecosystem_messages. Click a thread to read/reply. */

interface Thread {
  user_id: number
  full_name: string
  email: string
  role: string
  unread: number
  total: number
  last_ts: number
}

const fmt = (ts: number) => { if (!ts) return ''; try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const roleLabel = (r: string) => (r || '').replace(/_/g, ' ') || '—'

export default function TeamInboxAdminPanel() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [open, setOpen] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = () => api.get<{ threads: Thread[] }>('admin/team/threads')
    .then((d) => { setThreads(Array.isArray(d.threads) ? d.threads : []); setErr('') })
    .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load messages.'))
    .finally(() => setLoading(false))
  useEffect(() => { void load() }, [])

  const totalUnread = threads.reduce((n, t) => n + (t.unread || 0), 0)

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid var(--line)', borderRadius: 12, padding: '13px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gold)' }}>What this tab is for</div>
        <p style={{ color: '#d8d3c6', fontSize: 13, lineHeight: 1.6, margin: '5px 0 0' }}>
          One place to read and reply to every 1:1 "Messages with the team" thread — from businesses, members, fellows, and ecosystem partners (sponsor/partner/media/volunteer). New School role chats (student/parent/teacher/school/judge) live under <strong>New School → Messages</strong>.
        </p>
      </div>
      {err && <p style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</p>}

      <EcoStatChips items={[
        { label: 'Conversations', value: threads.length },
        { label: 'Unread', value: totalUnread, tone: totalUnread > 0 ? 'gold' : undefined },
      ]} />

      {loading ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>
        : threads.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No team conversations yet.</p>
          : (
            <div style={{ display: 'grid', gap: 8 }}>
              {threads.map((t) => (
                <button
                  key={t.user_id}
                  type="button"
                  onClick={() => setOpen(t)}
                  style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 14px', cursor: 'pointer', color: 'inherit' }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--ivory)', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.full_name || t.email || `User #${t.user_id}`}</span>
                    <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>{roleLabel(t.role)} · {t.total} message{t.total === 1 ? '' : 's'} · {fmt(t.last_ts)}</span>
                  </span>
                  {t.unread > 0 && <span style={{ background: '#e5484d', color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1, padding: '4px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t.unread} new</span>}
                </button>
              ))}
            </div>
          )}

      {open && (
        <Modal title={`Messages · ${open.full_name || open.email || `User #${open.user_id}`}`} onClose={() => { setOpen(null); void load() }} wide>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>{roleLabel(open.role)}{open.email ? ` · ${open.email}` : ''}</p>
          <EcoMessages
            fetchUrl={`admin/team/messages/${open.user_id}`}
            sendUrl="admin/team/message"
            sendPayload={(body) => ({ user_id: open.user_id, body })}
            mine="admin"
          />
        </Modal>
      )}
    </div>
  )
}
