import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

/* OfferChat — a one-to-one chat on a confirmed internship offer, shared by the
   student, business, and admin views. Purely driven by two endpoints under a
   role-specific `base`:
     GET  {base}/messages  → { can_chat, messages: [{id, sender_role, sender_name, body, ts}] }
     POST {base}/messages  { body } → { messages }
   Auto-polls every ~9s while mounted (no websockets). */

export interface OfferMessage {
  id: number
  sender_role: 'student' | 'business' | 'admin'
  sender_name: string
  body: string
  ts: number
}

const ROLE_TINT: Record<string, string> = {
  student: 'rgba(120,180,255,0.16)',
  business: 'rgba(212,175,90,0.16)',
  admin: 'rgba(180,140,220,0.16)',
}

function fmt(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function OfferChat({ base, role }: { base: string; role: 'student' | 'business' | 'admin' }) {
  const [messages, setMessages] = useState<OfferMessage[]>([])
  const [canChat, setCanChat] = useState(true)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const d = await api.get<{ can_chat: boolean; messages: OfferMessage[] }>(`${base}/messages`)
      setCanChat(d.can_chat !== false)
      setMessages(Array.isArray(d.messages) ? d.messages : [])
    } catch { /* silent — keep prior state */ } finally { setLoading(false) }
  }

  useEffect(() => {
    let alive = true
    void load()
    const id = window.setInterval(() => { if (alive) void load() }, 9000)
    return () => { alive = false; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  const send = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const d = await api.post<{ messages: OfferMessage[] }>(`${base}/messages`, { body })
      setMessages(Array.isArray(d.messages) ? d.messages : [])
      setDraft('')
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not send.') } finally { setBusy(false) }
  }

  if (!canChat) return null

  return (
    <div style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'rgba(0,0,0,0.18)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 13, fontWeight: 800, color: 'var(--gold-light)' }}>
        💬 Direct messages
      </div>
      <div ref={scrollRef} style={{ maxHeight: 260, overflowY: 'auto', padding: 14, display: 'grid', gap: 10 }}>
        {loading && messages.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : messages.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No messages yet. Say hello to get started.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === role
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', minWidth: 0, background: ROLE_TINT[m.sender_role] || 'rgba(255,255,255,0.06)', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                    {mine ? 'You' : m.sender_name}{m.sender_role === 'admin' ? ' (Admin)' : m.sender_role === 'business' ? ' (Business)' : ''} · {fmt(m.ts)}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--ivory)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
                </div>
              </div>
            )
          })
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder="Write a message…"
          style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', color: 'var(--ivory)', fontSize: 14 }}
        />
        <button className="btn btn--sm btn--solid" disabled={busy || !draft.trim()} onClick={() => void send()}>{busy ? '…' : 'Send'}</button>
      </div>
    </div>
  )
}
