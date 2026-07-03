import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { HANDBOOK_SECTIONS, JUDGE_FAQ, JUDGE_SUPPORT } from '../lib/judgeHandbook'

const WRAP_S: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 24px 60px', fontFamily: 'var(--f-body)' }
const thS: React.CSSProperties = { textAlign: 'left', padding: '14px 16px', color: 'var(--gold-light)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.06em' }
const tdS: React.CSSProperties = { padding: '13px 16px', verticalAlign: 'top', color: '#d8d3c6' }
const rowS: React.CSSProperties = { borderBottom: '1px solid rgba(201,168,76,0.08)' }
// Scoring-modal building blocks
const secHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--gold-light)', borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 12 }
const fieldCard: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 14px' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gold)' }
const QueueIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M8 13h8M8 17h6" /></svg>
)
const ReviewsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
)
const BookIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
)
const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
)
/** Professional line icons for the Evidence & Uploads items (video / document / image). */
const EvidenceIcon = ({ kind }: { kind: 'video' | 'doc' | 'image' }) => {
  const p = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (kind === 'video') return (<svg {...p}><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" /></svg>)
  if (kind === 'doc') return (<svg {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>)
  return (<svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>)
}

interface Category { key: string; label: string; max: number }

interface QueueRow {
  submission_id: number
  submission_status: string
  submission_date: string | null
  student_name: string
  school_name: string
  grade_level: string
  participant_id: string
  teacher_name: string | null
  my_status: 'draft' | 'submitted' | null
  my_total: number | null
}

interface ReviewRow {
  submission_id: number
  total: number
  status: 'draft' | 'submitted'
  updated_at: string
  submission_status: string
  student_name: string
  school_name: string
  participant_id: string
}

interface Interview {
  id: number
  visit_number: number
  business_name: string
  owner_name: string
  business_phone: string
  business_address: string
  business_category: string
  date_of_visit: string
  main_challenge: string
  student_notes: string
  signature: string | null
}

interface Material {
  id: number
  material_type: string
  label: string
  file_url: string
  original_name: string | null
}

interface SubmissionDetail {
  submission: {
    id: number
    status: string
    submission_date: string | null
    problem_identified: string
    why_it_matters: string
    proposed_solution: string
    how_it_helps: string
    expected_impact: string
    video_url: string | null
    written_url: string | null
    ai_note: string | null
    ai_url: string | null
    community_note: string | null
    community_url: string | null
    student_name: string
    school_name: string
    grade_level: string
    participant_id: string
    teacher_name: string | null
  }
  interviews: Interview[]
  materials: Material[]
  categories: Category[]
  max_total: number
  my_score: Record<string, number> & { notes?: string | null; status?: string } | null
}

const CATEGORY_HINTS: Record<string, string> = {
  problem: 'Is it a real problem? Was it clearly explained?',
  solution: 'Practicality, feasibility, business value.',
  creativity: 'Originality, innovation, unique thinking.',
  supporting_evidence: 'Photos, business cards, documents, research.',
  community_impact: 'Benefit to the business & community, long-term impact.',
  presentation: 'Confidence, organization, professionalism, communication.',
}

export default function Judge() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  useSeo({ title: 'Judge Dashboard', description: 'Score student competition submissions.', noindex: true })

  type JudgeTab = 'queue' | 'reviews' | 'handbook' | 'faq' | 'chat'
  const [tab, setTab] = useState<JudgeTab>('queue')
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [chat, setChat] = useState<Array<{ id: number; sender: string; body: string; created_at: string }>>([])
  const [chatText, setChatText] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [hbSel, setHbSel] = useState(0)
  const [faqOpen, setFaqOpen] = useState<Set<string>>(new Set())
  const [listBusy, setListBusy] = useState(false)
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [ivOpen, setIvOpen] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [certified, setCertified] = useState<boolean | null>(null)
  const [certBusy, setCertBusy] = useState(false)
  const [certAgree, setCertAgree] = useState(false)

  const role = (user?.role || '').toLowerCase()
  const allowed = !!user && ['judge', 'admin', 'super_admin'].includes(role)

  useEffect(() => {
    if (!allowed) return
    api.get<{ certified: boolean }>('new-school/judge/status')
      .then((d) => setCertified(Boolean(d.certified)))
      .catch(() => setCertified(true))
  }, [allowed])

  const certify = async () => {
    setCertBusy(true)
    try {
      await api.post('new-school/judge/certify', {})
      setCertified(true)
    } catch { /* ignore */ } finally { setCertBusy(false) }
  }

  const recuse = async () => {
    if (!detail) return
    const reason = window.prompt('Recuse from this submission (conflict of interest). Optional reason:') ?? ''
    setSaveBusy(true)
    try {
      await api.post(`new-school/judge/submission/${detail.submission.id}/recuse`, { reason })
      setMsg('You have recused from this submission.')
      loadQueue()
      setTimeout(closeDetail, 700)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not recuse.') } finally { setSaveBusy(false) }
  }

  const reportConcern = async () => {
    if (!detail) return
    const reason = window.prompt('Report a concern — reason (e.g. missing documentation, suspected fraud):') ?? ''
    if (!reason.trim()) return
    const notesText = window.prompt('Additional notes (optional):') ?? ''
    try {
      await api.post('new-school/judge/report', { submission_id: detail.submission.id, reason, notes: notesText })
      setMsg('Concern reported to administration.')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not report.') }
  }

  const loadQueue = useCallback(() => {
    setListBusy(true)
    api.get<{ submissions: QueueRow[] }>('new-school/judge/queue')
      .then((d) => setQueue(Array.isArray(d.submissions) ? d.submissions : []))
      .catch(() => setQueue([]))
      .finally(() => setListBusy(false))
  }, [])

  const loadReviews = useCallback(() => {
    setListBusy(true)
    api.get<{ reviews: ReviewRow[] }>('new-school/judge/my-reviews')
      .then((d) => setReviews(Array.isArray(d.reviews) ? d.reviews : []))
      .catch(() => setReviews([]))
      .finally(() => setListBusy(false))
  }, [])

  const loadChat = useCallback(() => {
    api.get<{ messages: typeof chat }>('new-school/chat')
      .then((d) => setChat(Array.isArray(d.messages) ? d.messages : []))
      .catch(() => setChat([]))
  }, [])

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatText.trim()
    if (!text) return
    setChatBusy(true)
    try {
      const d = await api.post<{ messages: typeof chat }>('new-school/chat', { body: text })
      setChat(Array.isArray(d.messages) ? d.messages : [])
      setChatText('')
    } catch { /* ignore */ } finally { setChatBusy(false) }
  }

  useEffect(() => {
    if (!allowed) return
    if (tab === 'queue') loadQueue()
    else if (tab === 'reviews') loadReviews()
    else if (tab === 'chat') loadChat()
  }, [allowed, tab, loadQueue, loadReviews, loadChat])

  const openSubmission = (submissionId: number) => {
    setDetailBusy(true)
    setMsg('')
    api.get<SubmissionDetail>(`new-school/judge/submission/${submissionId}`)
      .then((d) => {
        setDetail(d)
        const init: Record<string, number> = {}
        d.categories.forEach((c) => { init[c.key] = Number((d.my_score as any)?.[c.key] ?? 0) })
        setScores(init)
        setNotes(((d.my_score as any)?.notes as string) || '')
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : 'Could not load submission.'))
      .finally(() => setDetailBusy(false))
  }

  const closeDetail = () => { setDetail(null); setScores({}); setNotes(''); setMsg('') }

  const total = useMemo(
    () => (detail ? detail.categories.reduce((sum, c) => sum + (Number(scores[c.key]) || 0), 0) : 0),
    [detail, scores],
  )

  const setScore = (key: string, value: number, max: number) => {
    const v = Math.max(0, Math.min(max, Math.round(value || 0)))
    setScores((prev) => ({ ...prev, [key]: v }))
  }

  const save = async (status: 'draft' | 'submitted') => {
    if (!detail) return
    setSaveBusy(true)
    setMsg('')
    try {
      await api.post(`new-school/judge/submission/${detail.submission.id}/score`, { ...scores, notes, status })
      setMsg(status === 'submitted' ? 'Score submitted ✓' : 'Draft saved ✓')
      if (tab === 'queue') loadQueue(); else loadReviews()
      if (status === 'submitted') setTimeout(closeDetail, 700)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save the score.')
    } finally {
      setSaveBusy(false)
    }
  }

  const pill = (s: string | null) => {
    const label = s === 'submitted' ? 'Scored' : s === 'draft' ? 'Draft' : 'Not scored'
    const cls = s === 'submitted' ? 'status-pill status-pill--approved' : s === 'draft' ? 'status-pill status-pill--new' : 'status-pill'
    return <span className={cls}>{label}</span>
  }

  if (loading) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="admin-loading glass">
          <span className="admin-kicker">Judge Dashboard</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, marginTop: 8 }}>Loading workspace</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.65 }}>Verifying your session…</p>
        </div>
      </div>
    )
  }
  if (!allowed) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="admin-login glass" style={{ maxWidth: 420, margin: '80px auto', padding: 36, borderRadius: 16, textAlign: 'center' }}>
          <span className="admin-kicker">Restricted access</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 8px' }}>Judge Access Only</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.65 }}>This dashboard is for competition judges. Please sign in with a judge account.</p>
          <button className="btn btn--solid" onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    )
  }

  if (certified === false) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="admin-login glass" style={{ maxWidth: 560, margin: '60px auto', padding: 36, borderRadius: 16 }}>
          <span className="admin-kicker">Judge Certification</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 12px' }}>Before You Begin</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>
            By continuing you certify that you have read the Official Judge's Handbook and agree to: evaluate every
            submission fairly and independently using the Official Scoring Rubric, maintain confidentiality, disclose
            any conflict of interest and recuse yourself when needed, and score without outside influence or bias.
          </p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '14px 0 18px', color: 'var(--ivory)', fontSize: 14 }}>
            <input type="checkbox" checked={certAgree} onChange={(e) => setCertAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I have read the Judge's Handbook and agree to the Judge Code of Ethics and Confidentiality requirements.</span>
          </label>
          <button className="btn btn--solid" disabled={!certAgree || certBusy} onClick={certify}>{certBusy ? 'Saving…' : 'I Certify — Continue'}</button>
        </div>
      </div>
    )
  }

  const NAV: Array<{ key: JudgeTab; label: string }> = [
    { key: 'queue', label: 'Review Queue' },
    { key: 'reviews', label: 'My Reviews' },
    { key: 'handbook', label: 'Handbook & Rules' },
    { key: 'faq', label: 'FAQ' },
    { key: 'chat', label: 'Messages' },
  ]
  const LABELS: Record<JudgeTab, string> = { queue: 'Review Queue', reviews: 'My Reviews', handbook: 'Handbook & Rules', faq: 'Frequently Asked Questions', chat: 'Messages' }
  const activeLabel = LABELS[tab]

  return (
    <>
    <div className="admin-page" style={WRAP_S}>
      <div className="admin-layout">
        <aside className="admin-sidebar glass">
          <div className="admin-sidebar__brand">
            <span className="admin-kicker">Judge</span>
            <strong className="gold-text">Scoring Center</strong>
          </div>
          <nav className="admin-nav">
            <div className="admin-nav__group">
              <span className="admin-nav__group-label">Judging</span>
              <div className="admin-nav__items">
                {NAV.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`admin-nav__item${tab === item.key ? ' is-active' : ''}`}
                    onClick={() => setTab(item.key)}
                  >
                    <span className="admin-nav__icon" aria-hidden="true">{item.key === 'queue' ? <QueueIcon /> : item.key === 'reviews' ? <ReviewsIcon /> : item.key === 'chat' ? <ChatIcon /> : <BookIcon />}</span>
                    <span className="admin-nav__label">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </nav>
          <div className="admin-sidebar__foot">
            <a className="btn btn--sm" href="/">View Site</a>
            <button className="btn btn--sm" onClick={() => logout()}>Logout</button>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-main__header glass">
            <div>
              <span className="admin-kicker">Judge Dashboard</span>
              <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, marginTop: 4 }}>{activeLabel}</h1>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Signed in as {user?.full_name} · judge</p>
            </div>
          </header>

          {listBusy && <p className="admin-muted" style={{ color: 'var(--muted)' }}>Loading…</p>}

          {tab === 'queue' && !listBusy && (
            queue.length === 0 ? (
              <div className="glass" style={{ padding: 22 }}><p style={{ color: 'var(--muted)', margin: 0 }}>No submitted projects to review yet.</p></div>
            ) : (
              <div className="glass" style={{ padding: 6, overflowX: 'auto' }}>
                <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={thS}>Student</th><th style={thS}>School</th><th style={thS}>Grade</th><th style={thS}>Teacher</th><th style={thS}>Status</th><th style={thS}>Score</th><th style={thS} /></tr></thead>
                  <tbody>
                    {queue.map((r) => (
                      <tr key={r.submission_id} style={rowS}>
                        <td style={tdS}><strong>{r.student_name}</strong><br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>{r.participant_id}</span></td>
                        <td style={tdS}>{r.school_name}</td>
                        <td style={tdS}>{r.grade_level}</td>
                        <td style={tdS}>{r.teacher_name || '—'}</td>
                        <td style={tdS}>{pill(r.my_status)}</td>
                        <td style={tdS}>{r.my_status === 'submitted' ? `${r.my_total}/135` : '—'}</td>
                        <td style={tdS}><button className="btn btn--sm btn--solid" onClick={() => openSubmission(r.submission_id)}>{r.my_status ? 'Edit Score' : 'Score'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'reviews' && !listBusy && (
            reviews.length === 0 ? (
              <div className="glass" style={{ padding: 22 }}><p style={{ color: 'var(--muted)', margin: 0 }}>You haven't scored any submissions yet.</p></div>
            ) : (
              <div className="glass" style={{ padding: 6, overflowX: 'auto' }}>
                <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={thS}>Student</th><th style={thS}>School</th><th style={thS}>Status</th><th style={thS}>Total</th><th style={thS} /></tr></thead>
                  <tbody>
                    {reviews.map((r) => (
                      <tr key={r.submission_id} style={rowS}>
                        <td style={tdS}><strong>{r.student_name}</strong><br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>{r.participant_id}</span></td>
                        <td style={tdS}>{r.school_name}</td>
                        <td style={tdS}>{pill(r.status)}</td>
                        <td style={tdS}>{r.total}/135</td>
                        <td style={tdS}><button className="btn btn--sm btn--solid" onClick={() => openSubmission(r.submission_id)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Handbook & Rules — compact master/detail: pick a section, read just that one */}
          {tab === 'handbook' && (
            <div>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Quick reference from the Official Judge's Handbook — pick a topic.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {HANDBOOK_SECTIONS.map((sec, i) => (
                  <button key={sec.title} type="button" className={`btn btn--sm${hbSel === i ? ' btn--solid' : ''}`} onClick={() => setHbSel(i)}>{sec.title}</button>
                ))}
              </div>
              <div className="glass" style={{ padding: '18px 22px', maxWidth: 820 }}>
                <h3 className="gold-text" style={{ marginTop: 0 }}>{HANDBOOK_SECTIONS[hbSel].title}</h3>
                <ul style={{ margin: '10px 0 2px', paddingLeft: 18, color: 'var(--ivory)', lineHeight: 1.7, fontSize: 14 }}>
                  {HANDBOOK_SECTIONS[hbSel].points.map((p, j) => <li key={j} style={{ marginBottom: 8 }}>{p}</li>)}
                </ul>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>Need help? {JUDGE_SUPPORT.site} · {JUDGE_SUPPORT.email} · {JUDGE_SUPPORT.phone}</p>
            </div>
          )}

          {/* FAQ — two-column, polished accordion */}
          {tab === 'faq' && (
              <div>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 16 }}>Common questions for judges — tap any question to expand.</p>
                  <div style={{ columnWidth: 400, columnGap: 14 }}>
                    {JUDGE_FAQ.map((f, idx) => {
                      const n = idx + 1
                      const open = faqOpen.has(f.q)
                      return (
                        <div key={f.q} className="glass" style={{ marginBottom: 12, breakInside: 'avoid', overflow: 'hidden', borderColor: open ? 'var(--gold)' : undefined }}>
                          <button
                            type="button"
                            onClick={() => setFaqOpen((prev) => { const next = new Set(prev); next.has(f.q) ? next.delete(f.q) : next.add(f.q); return next })}
                            style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', padding: '13px 15px', color: 'var(--ivory)' }}
                          >
                            <span style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#14110a', background: 'linear-gradient(180deg,#F6E2A8,#C9A84C)' }}>{n}</span>
                            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, lineHeight: 1.4 }}>{f.q}</span>
                            <span aria-hidden="true" style={{ flex: '0 0 auto', color: 'var(--gold-light)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                          </button>
                          {open && (
                            <p style={{ margin: 0, padding: '0 15px 14px 53px', color: 'var(--muted)', lineHeight: 1.65, fontSize: 13.5, borderTop: '1px solid var(--line)', paddingTop: 12 }}>{f.a}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
              </div>
            )}

          {/* Messages — real chat layout */}
          {tab === 'chat' && (
            <div className="glass" style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', height: '68vh', overflow: 'hidden', padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <strong className="gold-text">Administration</strong>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Questions about assignments, technical issues, or concerns.</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {chat.length === 0 ? (
                  <p className="msub" style={{ margin: 'auto', textAlign: 'center' }}>No messages yet.<br />Send the first message below.</p>
                ) : chat.map((m) => {
                  const mine = m.sender !== 'admin'
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '78%', padding: '9px 13px', borderRadius: 14,
                        borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
                        background: mine ? 'linear-gradient(180deg,#F6E2A8,#C9A84C)' : 'rgba(255,255,255,0.07)',
                        color: mine ? '#14110a' : 'var(--ivory)',
                        border: mine ? 'none' : '1px solid var(--line)',
                      }}>
                        <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{m.body}</div>
                        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: 'right' }}>{m.created_at}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <form onSubmit={sendChat} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderTop: '1px solid var(--line)', background: 'rgba(0,0,0,0.15)' }}>
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Write a message…"
                  style={{
                    flex: 1, height: 44, padding: '0 18px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)',
                    color: 'var(--ivory)', fontSize: 14, outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)' }}
                />
                <button
                  type="submit"
                  disabled={chatBusy || !chatText.trim()}
                  aria-label="Send message"
                  title="Send"
                  style={{
                    flex: '0 0 auto', width: 44, height: 44, borderRadius: '50%', border: 0,
                    display: 'grid', placeItems: 'center', cursor: chatText.trim() ? 'pointer' : 'default',
                    background: chatText.trim() ? 'linear-gradient(180deg,#F6E2A8,#C9A84C)' : 'rgba(255,255,255,0.08)',
                    color: chatText.trim() ? '#14110a' : 'var(--muted)',
                    opacity: chatBusy ? 0.6 : 1, transition: 'background .2s',
                  }}
                >
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>

      {/* Scoring modal */}
      {(detail || detailBusy) && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
          <div className="modal" style={{ maxWidth: 940, width: '96vw', maxHeight: '92vh', overflowY: 'auto', textAlign: 'left', padding: 0, background: 'var(--bg-2, #14130d)' }}>
            {detailBusy || !detail ? (
              <div style={{ padding: 40 }}><p className="msub">Loading submission…</p></div>
            ) : (
              <div>
                {/* Sticky header */}
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'linear-gradient(180deg,#1c1a12,#14130d)', borderBottom: '1px solid var(--line)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>Submission Review</div>
                    <h3 className="gold-text" style={{ margin: '4px 0 2px', fontFamily: 'var(--f-serif)', fontSize: 22 }}>{detail.submission.student_name}</h3>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{detail.submission.school_name} · Grade {detail.submission.grade_level} · ID {detail.submission.participant_id}{detail.submission.teacher_name ? ` · ${detail.submission.teacher_name}` : ''}</div>
                  </div>
                  <button className="btn btn--sm" onClick={closeDetail} aria-label="Close">✕ Close</button>
                </div>

                <div style={{ padding: '20px 24px', display: 'grid', gap: 22 }}>
                  {/* How to score */}
                  <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid var(--line)', borderLeft: '3px solid var(--gold)', borderRadius: 8, padding: '12px 16px', color: 'var(--ivory)', fontSize: 13.5, lineHeight: 1.6 }}>
                    <strong className="gold-text">What you're scoring:</strong> you evaluate <strong>this student's project</strong> — the solution they propose to help a local business. Read <strong>① The Project</strong>, then use the <strong>② Evidence</strong> and <strong>③ Interviews</strong> as supporting context. Give your points in <strong>④ Your Score</strong>. You are scoring the <em>project as a whole</em>, not each interview separately.
                  </div>

                  {/* SECTION 1 — the project */}
                  <section>
                    <div style={secHead}>① The Project — what you score</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {([
                        ['Problem Identified', detail.submission.problem_identified],
                        ['Why It Matters', detail.submission.why_it_matters],
                        ['Proposed Solution', detail.submission.proposed_solution],
                        ['How It Helps', detail.submission.how_it_helps],
                        ['Expected Impact', detail.submission.expected_impact],
                      ] as const).map(([label, val]) => (
                        <div key={label} style={fieldCard}>
                          <div style={eyebrow}>{label}</div>
                          <p style={{ margin: '6px 0 0', color: 'var(--ivory)', lineHeight: 1.6, fontSize: 14, whiteSpace: 'pre-wrap' }}>{val || '—'}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* SECTION 2 — evidence & uploads */}
                  <section>
                    <div style={secHead}>② Evidence &amp; Uploads — supporting context</div>
                    {(() => {
                      const docKinds = new Set(['written_report', 'flyer'])
                      const items = [
                        detail.submission.video_url && { kind: 'video' as const, label: 'Video Presentation', href: detail.submission.video_url },
                        detail.submission.written_url && { kind: 'doc' as const, label: 'Written Report', href: detail.submission.written_url },
                        ...detail.materials.map((mt) => ({ kind: (docKinds.has(mt.material_type) ? 'doc' : 'image') as 'doc' | 'image', label: mt.label, href: mt.file_url })),
                      ].filter(Boolean) as { kind: 'video' | 'doc' | 'image'; label: string; href: string }[]
                      return items.length === 0
                        ? <p className="msub" style={{ margin: 0 }}>No uploads provided.</p>
                        : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
                            {items.map((it, i) => (
                              <a key={i} href={it.href} target="_blank" rel="noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ivory)', textDecoration: 'none' }}>
                                <span style={{ display: 'inline-flex', color: 'var(--gold)', flex: '0 0 auto' }}><EvidenceIcon kind={it.kind} /></span>
                                <span style={{ flex: 1, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                                <span style={{ color: 'var(--gold)', fontSize: 12, flex: '0 0 auto' }}>Open ↗</span>
                              </a>
                            ))}
                          </div>
                        )
                    })()}
                  </section>

                  {/* SECTION 3 — interviews */}
                  <section>
                    <button
                      type="button"
                      onClick={() => setIvOpen((o) => !o)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
                        background: ivOpen ? 'rgba(201,168,76,0.12)' : 'rgba(201,168,76,0.06)',
                        border: '1px solid var(--gold)', borderRadius: 10, padding: '13px 16px', color: 'var(--ivory)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', color: 'var(--gold)', flex: '0 0 auto' }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: ivOpen ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }}><path d="M9 6l6 6-6 6" /></svg>
                      </span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontWeight: 700, color: 'var(--gold-light)', fontSize: 13.5, letterSpacing: 0.3 }}>③ Business Interviews — supporting context</span>
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{ivOpen ? 'Click to hide' : `Click to view the student's ${detail.interviews.length} interviews`}</span>
                      </span>
                      <span style={{ flex: '0 0 auto', fontSize: 12, fontWeight: 700, color: '#14110a', background: 'var(--gold)', borderRadius: 999, padding: '3px 11px' }}>{detail.interviews.length}</span>
                    </button>
                    {ivOpen && (
                      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                        {detail.interviews.map((iv) => (
                          <div key={iv.id} style={{ ...fieldCard, fontSize: 13 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <strong style={{ color: 'var(--ivory)' }}>#{iv.visit_number} · {iv.business_name}</strong>
                              <span style={{ fontSize: 12, color: iv.signature ? 'var(--green-bright)' : '#e08a8a' }}>{iv.signature ? '✍️ Signed' : 'Not signed'}</span>
                            </div>
                            <div style={{ color: 'var(--muted)', marginTop: 4 }}>{iv.owner_name} · {iv.business_category} · {iv.business_phone}</div>
                            <div style={{ color: 'var(--muted)', marginTop: 2 }}>{iv.business_address} · {iv.date_of_visit}</div>
                            <div style={{ color: 'var(--ivory)', marginTop: 6, lineHeight: 1.5 }}><span style={{ color: 'var(--gold)' }}>Challenge:</span> {iv.main_challenge}</div>
                          </div>
                        ))}
                        {detail.interviews.length === 0 && <p className="msub">No interviews logged.</p>}
                      </div>
                    )}
                  </section>

                  {/* SECTION 4 — scoring */}
                  <section style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid var(--gold)', borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ ...secHead, borderColor: 'transparent', marginBottom: 4 }}>④ Your Score</div>
                    <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 16px' }}>Drag each slider. The number on the right is your points for that category out of its maximum.</p>
                    <div style={{ display: 'grid', gap: 18 }}>
                      {detail.categories.map((c) => (
                        <div key={c.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--ivory)', fontSize: 14 }}>{c.label}</div>
                              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{CATEGORY_HINTS[c.key]}</div>
                            </div>
                            <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
                              <span className="gold-text" style={{ fontSize: 22, fontWeight: 800 }}>{scores[c.key] ?? 0}</span>
                              <span style={{ color: 'var(--muted)', fontSize: 13 }}> / {c.max}</span>
                            </div>
                          </div>
                          <input
                            type="range" min={0} max={c.max} step={1}
                            value={scores[c.key] ?? 0}
                            onChange={(e) => setScore(c.key, Number(e.target.value), c.max)}
                            style={{ width: '100%', marginTop: 8, accentColor: '#C9A84C' }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="field" style={{ marginTop: 18 }}>
                      <label style={{ color: 'var(--gold-light)' }}>Notes (optional)</label>
                      <textarea className="fld-area" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the record…" rows={3} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                      <div>
                        <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Total Score</div>
                        <strong className="gold-text" style={{ fontSize: 28 }}>{total}</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 15 }}> / {detail.max_total}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn--sm" disabled={saveBusy} onClick={reportConcern} title="Report a concern to administration">⚑ Report</button>
                        <button className="btn btn--sm" disabled={saveBusy} onClick={recuse} title="Recuse for conflict of interest">Recuse</button>
                        <button className="btn btn--sm" disabled={saveBusy} onClick={() => save('draft')}>Save Draft</button>
                        <button className="btn btn--solid" disabled={saveBusy} onClick={() => save('submitted')}>Submit Score</button>
                      </div>
                    </div>
                    {msg && <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: msg.includes('✓') ? 'var(--green-bright)' : '#e08a8a' }}>{msg}</p>}
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
