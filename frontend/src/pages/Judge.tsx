import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'

const WRAP_S: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 24px 60px', fontFamily: 'var(--f-body)' }
const thS: React.CSSProperties = { textAlign: 'left', padding: '14px 16px', color: 'var(--gold-light)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.06em' }
const tdS: React.CSSProperties = { padding: '13px 16px', verticalAlign: 'top', color: '#d8d3c6' }
const rowS: React.CSSProperties = { borderBottom: '1px solid rgba(201,168,76,0.08)' }

const QueueIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M8 13h8M8 17h6" /></svg>
)
const ReviewsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
)

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
  useSeo({ title: 'Judge Dashboard', description: 'Score student competition submissions.' })

  const [tab, setTab] = useState<'queue' | 'reviews'>('queue')
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const role = (user?.role || '').toLowerCase()
  const allowed = !!user && ['judge', 'admin', 'super_admin'].includes(role)

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

  useEffect(() => {
    if (!allowed) return
    if (tab === 'queue') loadQueue()
    else loadReviews()
  }, [allowed, tab, loadQueue, loadReviews])

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

  const NAV: Array<{ key: 'queue' | 'reviews'; label: string }> = [
    { key: 'queue', label: 'Review Queue' },
    { key: 'reviews', label: 'My Reviews' },
  ]
  const activeLabel = tab === 'queue' ? 'Review Queue' : 'My Reviews'

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
                    <span className="admin-nav__icon" aria-hidden="true">{item.key === 'queue' ? <QueueIcon /> : <ReviewsIcon />}</span>
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
        </main>
      </div>
    </div>

      {/* Scoring modal */}
      {(detail || detailBusy) && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
          <div className="modal" style={{ maxWidth: 900, maxHeight: '92vh', overflowY: 'auto', textAlign: 'left' }}>
            <button className="close" onClick={closeDetail} aria-label="Close">✕</button>
            {detailBusy || !detail ? <p className="msub">Loading submission…</p> : (
              <div>
                <h3 className="gold-text" style={{ marginTop: 0 }}>{detail.submission.student_name}</h3>
                <p className="msub">{detail.submission.school_name} · Grade {detail.submission.grade_level} · {detail.submission.participant_id}{detail.submission.teacher_name ? ` · ${detail.submission.teacher_name}` : ''}</p>

                {/* Project content */}
                <div style={{ display: 'grid', gap: 12, margin: '16px 0' }}>
                  {([
                    ['Problem Identified', detail.submission.problem_identified],
                    ['Why It Matters', detail.submission.why_it_matters],
                    ['Proposed Solution', detail.submission.proposed_solution],
                    ['How It Helps', detail.submission.how_it_helps],
                    ['Expected Impact', detail.submission.expected_impact],
                  ] as const).map(([label, val]) => (
                    <div key={label} className="glass" style={{ padding: '10px 14px' }}>
                      <strong className="gold-text" style={{ fontSize: 13 }}>{label}</strong>
                      <p className="msub" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{val || '—'}</p>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {detail.submission.video_url && <a className="btn btn--sm" href={detail.submission.video_url} target="_blank" rel="noreferrer">▶ Video Presentation</a>}
                    {detail.submission.written_url && <a className="btn btn--sm" href={detail.submission.written_url} target="_blank" rel="noreferrer">📄 Written Report</a>}
                  </div>
                  {(detail.submission.ai_note || detail.submission.ai_url) && (
                    <div className="glass" style={{ padding: '10px 14px' }}>
                      <strong className="gold-text" style={{ fontSize: 13 }}>AI Demonstration</strong>
                      {detail.submission.ai_note && <p className="msub" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{detail.submission.ai_note}</p>}
                      {detail.submission.ai_url && <a className="btn btn--sm" style={{ marginTop: 8 }} href={detail.submission.ai_url} target="_blank" rel="noreferrer">Open AI file</a>}
                    </div>
                  )}
                  {(detail.submission.community_note || detail.submission.community_url) && (
                    <div className="glass" style={{ padding: '10px 14px' }}>
                      <strong className="gold-text" style={{ fontSize: 13 }}>Community Service</strong>
                      {detail.submission.community_note && <p className="msub" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{detail.submission.community_note}</p>}
                      {detail.submission.community_url && <a className="btn btn--sm" style={{ marginTop: 8 }} href={detail.submission.community_url} target="_blank" rel="noreferrer">Open community file</a>}
                    </div>
                  )}
                </div>

                {/* Supporting materials */}
                {detail.materials.length > 0 && (
                  <details style={{ marginBottom: 16 }} open>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }} className="gold-text">Supporting Materials ({detail.materials.length})</summary>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {detail.materials.map((mt) => (
                        <a key={mt.id} className="btn btn--sm" href={mt.file_url} target="_blank" rel="noreferrer">{mt.label}</a>
                      ))}
                    </div>
                  </details>
                )}

                {/* Interviews */}
                <details style={{ marginBottom: 16 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }} className="gold-text">Business Interviews ({detail.interviews.length})</summary>
                  <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    {detail.interviews.map((iv) => (
                      <div key={iv.id} className="glass" style={{ padding: '8px 12px', fontSize: 13 }}>
                        <strong>#{iv.visit_number} · {iv.business_name}</strong> — {iv.owner_name} · {iv.business_category}
                        <div className="msub" style={{ marginTop: 4 }}>{iv.business_address} · {iv.business_phone} · {iv.date_of_visit}</div>
                        <div className="msub" style={{ marginTop: 4 }}>Challenge: {iv.main_challenge}</div>
                        <div className="msub" style={{ marginTop: 4 }}>{iv.signature ? <>✍️ Signed: {iv.signature}</> : <span style={{ color: '#e08a8a' }}>Not signed</span>}</div>
                      </div>
                    ))}
                    {detail.interviews.length === 0 && <p className="msub">No interviews logged.</p>}
                  </div>
                </details>

                {/* Scoring rubric */}
                <h4 className="gold-text">Score (max {detail.max_total})</h4>
                <div style={{ display: 'grid', gap: 14 }}>
                  {detail.categories.map((c) => (
                    <div key={c.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <label style={{ fontWeight: 600 }}>{c.label} <span className="msub">({CATEGORY_HINTS[c.key]})</span></label>
                        <strong className="gold-text">{scores[c.key] ?? 0} / {c.max}</strong>
                      </div>
                      <input
                        type="range" min={0} max={c.max} step={1}
                        value={scores[c.key] ?? 0}
                        onChange={(e) => setScore(c.key, Number(e.target.value), c.max)}
                        style={{ width: '100%' }}
                      />
                    </div>
                  ))}
                </div>

                <div className="field" style={{ marginTop: 14 }}>
                  <label>Notes (optional)</label>
                  <textarea className="fld-area" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the record…" />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 18 }} className="gold-text">Total: {total} / {detail.max_total}</strong>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--sm" disabled={saveBusy} onClick={() => save('draft')}>Save Draft</button>
                    <button className="btn btn--sm btn--solid" disabled={saveBusy} onClick={() => save('submitted')}>Submit Score</button>
                  </div>
                </div>
                {msg && <p className="msub" style={{ marginTop: 8, color: msg.includes('✓') ? 'var(--green-bright)' : '#e08a8a' }}>{msg}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
