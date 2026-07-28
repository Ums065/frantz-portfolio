import { useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'

/* School-internal scoring panel (teacher + principal). Shows the school's
   internal ranking (average of teacher + principal rubric scores), lets the
   viewer score each submission with the SAME rubric judges use, and releases
   the top 3 to the judges. Fully separate from the main ranking. */

export interface InternalRankRow {
  rank: number
  submission_id: number
  student_id: number
  student_name: string
  reviewers: number
  avg_total: number
  max_total: number
  judge_released: boolean
  is_top3: boolean
}
export interface InternalBlock {
  rank: InternalRankRow[]
  top3_released_at: string | null
  my_scores: Record<string, number>
  max_total: number
}
interface RubricCat { key: string; label: string; max: number }
interface ScoreDetail {
  submission: { id: number; student_name: string; problem_identified: string; why_it_matters: string; proposed_solution: string; how_it_helps: string; expected_impact: string; video_url: string; written_url: string }
  categories: RubricCat[]
  max_total: number
  my_score: Record<string, number> | null
}

const box: React.CSSProperties = { background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', color: 'var(--ivory)', fontSize: 14, width: '100%', boxSizing: 'border-box' }

/* Read-only school-internal ranking table for students/parents — highlights the
   viewing student and marks the top 3 that go to the judges. */
export function InternalRankTable({ rows, myStudentId, title = 'Your School — Internal Ranking' }: { rows?: InternalRankRow[]; myStudentId?: number; title?: string }) {
  const list = rows ?? []
  if (list.length === 0) return null
  return (
    <section className="glass ns-dash-card ns-dash-card--wide reveal in" style={{ minWidth: 0 }}>
      <div className="ns-dash-card__head"><span className="eyebrow">🏫 {title}</span></div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>Ranked by your teachers’ &amp; principal’s scores. The top 3 are sent to the judges. (This is separate from the main challenge ranking.)</p>
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        {list.map((r) => {
          const me = myStudentId != null && r.student_id === myStudentId
          return (
            <div key={r.submission_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', minWidth: 0,
              background: me ? 'rgba(120,180,255,0.12)' : r.is_top3 ? 'rgba(212,175,90,0.08)' : 'rgba(255,255,255,0.02)',
            }}>
              <span style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12.5, background: r.is_top3 ? 'linear-gradient(180deg,#f6e2a8,#c9a84c)' : 'rgba(255,255,255,0.06)', color: r.is_top3 ? '#1c1a14' : 'var(--ivory)' }}>{r.rank}</span>
              <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                <div style={{ color: 'var(--ivory)', fontWeight: 700, fontSize: 13.5, overflowWrap: 'anywhere' }}>
                  {r.student_name}{me ? <strong style={{ color: '#9ec5ff' }}> · You</strong> : ''}{r.is_top3 && <span style={{ color: 'var(--gold-light)', marginLeft: 6, fontSize: 11.5 }}>★</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 3, color: 'var(--muted)', fontSize: 12 }}>
                  <span>{r.reviewers ? `${r.avg_total}/${r.max_total}` : 'Not scored yet'}</span>
                  {r.judge_released && <span style={{ color: '#8fd6a3' }}>Sent to judges ✓</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function InternalScoring({ role, internal }: { role: 'teacher' | 'principal'; internal?: InternalBlock }) {
  const [data, setData] = useState<InternalBlock | null>(internal ?? null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<ScoreDetail | null>(null)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const rows = data?.rank ?? []
  const released = !!data?.top3_released_at
  const scoredCount = rows.filter((r) => r.reviewers > 0).length
  const willSend = rows.slice(0, 3) // top 3 (or fewer) that will go to the judges

  const openScore = async (submissionId: number) => {
    setBusy(true)
    try {
      const d = await api.get<ScoreDetail>(`new-school/manage/submission/${submissionId}/internal`)
      setDetail(d)
      const init: Record<string, number> = {}
      d.categories.forEach((c) => { init[c.key] = Number(d.my_score?.[c.key] ?? 0) })
      setScores(init)
      setNotes(String(d.my_score?.notes ?? ''))
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not open the submission.') }
    finally { setBusy(false) }
  }

  const total = detail ? detail.categories.reduce((s, c) => s + (Number(scores[c.key]) || 0), 0) : 0

  const saveScore = async () => {
    if (!detail) return
    setSaving(true)
    try {
      const d = await api.post<{ internal: InternalBlock }>(`new-school/manage/submission/${detail.submission.id}/internal-score`, { ...scores, notes })
      if (d.internal) setData(d.internal)
      window.fcToast?.('Score saved.')
      setDetail(null)
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not save the score.') }
    finally { setSaving(false) }
  }

  const doRelease = async () => {
    if (released) return
    setBusy(true)
    try {
      const d = await api.post<{ message: string; internal: InternalBlock }>('new-school/manage/release-top3', {})
      if (d.internal) setData(d.internal)
      setConfirmOpen(false)
      window.fcToast?.(d.message || 'Top submissions sent to judges.')
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not send to the judges.') }
    finally { setBusy(false) }
  }

  return (
    <section className="glass" style={{ padding: 'clamp(16px,3.5vw,24px)', borderRadius: 16, minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg,rgba(201,168,76,0.28),rgba(201,168,76,0.06))', border: '1px solid var(--line)', fontSize: 20 }}>🏅</span>
        <div style={{ minWidth: 0 }}>
          <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(18px,3.5vw,21px)', margin: 0 }}>Internal Scoring &amp; Top 3</h3>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5, margin: '4px 0 0' }}>
            Score submissions with the judge rubric. Only the <strong>top 3</strong> by average score go to the judges — this does <strong>not</strong> affect the main rankings.
          </p>
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Submissions', rows.length], ['Scored', scoredCount], ['Go to judges', Math.min(3, rows.length)]].map(([label, val]) => (
          <div key={String(label)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 14px', minWidth: 0 }}>
            <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 18, lineHeight: 1 }}>{val}</div>
            <div style={{ color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Release action / state */}
      {released ? (
        <div style={{ background: 'rgba(120,200,140,0.1)', border: '1px solid rgba(120,200,140,0.35)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ color: '#8fd6a3', fontWeight: 700, fontSize: 13 }}>✓ Sent to the judges</div>
          <div style={{ color: '#c9e6d2', fontSize: 12.5, marginTop: 3 }}>Your top submissions were sent on {new Date(data!.top3_released_at as string).toLocaleDateString()}. This can only be done once.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn btn--solid" style={{ minWidth: 200 }} disabled={busy || scoredCount === 0} onClick={() => setConfirmOpen(true)}>
            Submit Top {Math.min(3, rows.length) || 3} to Judges
          </button>
          {scoredCount === 0
            ? <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>Score at least one submission first.</span>
            : <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>You can only submit once — please score everyone first.</span>}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 16px', border: '1px dashed var(--line)', borderRadius: 12, color: 'var(--muted)' }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>📭</div>
          <div style={{ fontSize: 13.5 }}>No submitted projects yet.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Once your students submit their work, it will appear here to score.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          {rows.map((r) => (
            <div key={r.submission_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', minWidth: 0,
              background: r.is_top3 ? 'rgba(212,175,90,0.09)' : 'rgba(255,255,255,0.02)',
            }}>
              {/* rank badge */}
              <span style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, background: r.is_top3 ? 'linear-gradient(180deg,#f6e2a8,#c9a84c)' : 'rgba(255,255,255,0.06)', color: r.is_top3 ? '#1c1a14' : 'var(--ivory)' }}>{r.rank}</span>
              {/* student + inline meta */}
              <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                <div style={{ color: 'var(--ivory)', fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>
                  {r.student_name}{r.is_top3 && <span style={{ color: 'var(--gold-light)', marginLeft: 6, fontSize: 12 }}>★ Top 3</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, color: 'var(--muted)', fontSize: 12 }}>
                  <span>Score: <strong style={{ color: r.reviewers ? 'var(--gold-light)' : 'var(--muted)' }}>{r.reviewers ? `${r.avg_total}/${r.max_total}` : 'not scored'}</strong></span>
                  <span>{r.reviewers} reviewer{r.reviewers === 1 ? '' : 's'}</span>
                  {r.judge_released && <span style={{ color: '#8fd6a3' }}>Sent to judges ✓</span>}
                </div>
              </div>
              {/* action */}
              <button className="btn btn--sm" style={{ flex: '0 0 auto' }} disabled={busy} onClick={() => void openScore(r.submission_id)}>Score</button>
            </div>
          ))}
        </div>
      )}

      {confirmOpen && createPortal(
        <div onClick={() => !busy && setConfirmOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 9999 }}>
          <div onClick={(e) => e.stopPropagation()} className="glass" style={{ maxWidth: 460, width: '100%', padding: 24, borderRadius: 16 }}>
            <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 20, margin: '0 0 6px' }}>Send to the judges?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '0 0 12px' }}>
              These {willSend.length === 1 ? 'submission' : `${willSend.length} submissions`} will be sent to the judges. This can be done <strong style={{ color: '#e59a9a' }}>only once</strong> and cannot be undone.
            </p>
            <ol style={{ margin: '0 0 16px', padding: '0 0 0 4px', listStyle: 'none', display: 'grid', gap: 8 }}>
              {willSend.map((r, i) => (
                <li key={r.submission_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(212,175,90,0.08)', border: '1px solid rgba(212,175,90,0.25)', borderRadius: 10, padding: '9px 12px' }}>
                  <span className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 16, minWidth: 20 }}>{i + 1}</span>
                  <span style={{ color: 'var(--ivory)', fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>{r.student_name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{r.reviewers ? `${r.avg_total}/${r.max_total}` : 'unscored'}</span>
                </li>
              ))}
            </ol>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn--sm" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="btn btn--sm btn--solid" disabled={busy} onClick={() => void doRelease()}>{busy ? 'Sending…' : 'Yes, send to judges'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {detail && createPortal(
        <div onClick={() => !saving && setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 9999 }}>
          <div onClick={(e) => e.stopPropagation()} className="glass" style={{ maxWidth: 620, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 16 }}>
            <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 20, margin: '0 0 4px' }}>Score: {detail.submission.student_name}</h3>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 14px' }}>Same rubric the judges use ({role === 'principal' ? 'Principal' : 'Teacher'} score) · max {detail.max_total}</p>

            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {([['Problem', detail.submission.problem_identified], ['Why it matters', detail.submission.why_it_matters], ['Proposed solution', detail.submission.proposed_solution], ['How it helps', detail.submission.how_it_helps], ['Expected impact', detail.submission.expected_impact]] as const).filter(([, v]) => v).map(([label, v]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)' }}>{label}</div>
                  <div style={{ fontSize: 13, color: '#d8d3c6', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v}</div>
                </div>
              ))}
              {(detail.submission.video_url || detail.submission.written_url) && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {detail.submission.video_url && <a href={detail.submission.video_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)', fontSize: 12.5 }}>▶ Video</a>}
                  {detail.submission.written_url && <a href={detail.submission.written_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-light)', fontSize: 12.5 }}>📄 Written</a>}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {detail.categories.map((c) => (
                <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, color: 'var(--ivory)' }}>{c.label} <span style={{ color: 'var(--muted)' }}>/ {c.max}</span></label>
                  <input type="number" min={0} max={c.max} value={scores[c.key] ?? 0}
                    onChange={(e) => setScores((s) => ({ ...s, [c.key]: Math.max(0, Math.min(c.max, Number(e.target.value) || 0)) }))}
                    style={{ ...box, width: 90, textAlign: 'center' }} />
                </div>
              ))}
              <div><textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...box, minHeight: 64, resize: 'vertical' }} /></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22 }}>{total} / {detail.max_total}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--sm" disabled={saving} onClick={() => setDetail(null)}>Cancel</button>
                <button className="btn btn--sm btn--solid" disabled={saving} onClick={() => void saveScore()}>{saving ? 'Saving…' : 'Save Score'}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}
