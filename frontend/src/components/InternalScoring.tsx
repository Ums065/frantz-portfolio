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
      <div style={{ overflowX: 'auto', minWidth: 0 }}>
        <table className="admin-table admin-table--stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '8px 10px' }}>#</th>
              <th style={{ padding: '8px 10px' }}>Student</th>
              <th style={{ padding: '8px 10px' }}>Score</th>
              <th style={{ padding: '8px 10px' }}>To judges</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const me = myStudentId != null && r.student_id === myStudentId
              return (
                <tr key={r.submission_id} style={{ borderTop: '1px solid var(--line)', background: me ? 'rgba(120,180,255,0.12)' : r.is_top3 ? 'rgba(212,175,90,0.08)' : 'transparent' }}>
                  <td data-label="#" style={{ padding: '8px 10px', fontWeight: 800, color: r.is_top3 ? 'var(--gold-light)' : 'var(--ivory)' }}>{r.rank}{r.is_top3 ? ' ★' : ''}</td>
                  <td data-label="Student" style={{ padding: '8px 10px' }}>{r.student_name}{me ? <strong style={{ color: '#9ec5ff' }}> · You</strong> : ''}</td>
                  <td data-label="Score" style={{ padding: '8px 10px' }}>{r.reviewers ? `${r.avg_total} / ${r.max_total}` : 'Not scored yet'}</td>
                  <td data-label="To judges" style={{ padding: '8px 10px' }}>{r.judge_released ? <span style={{ color: '#8fd6a3' }}>Sent ✓</span> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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

  const rows = data?.rank ?? []
  const released = !!data?.top3_released_at
  const scoredCount = rows.filter((r) => r.reviewers > 0).length

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

  const releaseTop3 = async () => {
    if (released) return
    if (!window.confirm('Send this school’s top 3 submissions to the judges? This cannot be undone.')) return
    setBusy(true)
    try {
      const d = await api.post<{ message: string; internal: InternalBlock }>('new-school/manage/release-top3', {})
      if (d.internal) setData(d.internal)
      window.fcToast?.(d.message || 'Top 3 sent to judges.')
    } catch (e) { window.fcToast?.(e instanceof Error ? e.message : 'Could not send the top 3.') }
    finally { setBusy(false) }
  }

  return (
    <section className="glass" style={{ padding: 'clamp(16px,3vw,22px)', borderRadius: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 20, margin: 0 }}>Internal Scoring &amp; Top 3</h3>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '4px 0 0' }}>
            Score submissions with the judge rubric. The top 3 by average score go to the judges. This does <strong>not</strong> affect the main rankings.
          </p>
        </div>
        <button className="btn btn--sm btn--solid" disabled={busy || released || scoredCount === 0} onClick={() => void releaseTop3()}>
          {released ? 'Top 3 sent ✓' : 'Submit Top 3 to Judges'}
        </button>
      </div>
      {released && (
        <p style={{ color: '#8fd6a3', fontSize: 12.5, margin: '0 0 10px' }}>✓ Your top 3 were sent to the judges on {new Date(data!.top3_released_at as string).toLocaleDateString()}.</p>
      )}
      {!released && scoredCount === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 10px' }}>Score at least one submission to enable sending the top 3.</p>
      )}

      <div style={{ overflowX: 'auto', minWidth: 0 }}>
        <table className="admin-table admin-table--stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '8px 10px' }}>#</th>
              <th style={{ padding: '8px 10px' }}>Student</th>
              <th style={{ padding: '8px 10px' }}>Avg score</th>
              <th style={{ padding: '8px 10px' }}>Reviewers</th>
              <th style={{ padding: '8px 10px' }}>To judges</th>
              <th style={{ padding: '8px 10px' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 14, color: 'var(--muted)' }}>No submitted projects yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.submission_id} style={{ borderTop: '1px solid var(--line)', background: r.is_top3 ? 'rgba(212,175,90,0.08)' : 'transparent' }}>
                <td data-label="#" style={{ padding: '8px 10px', fontWeight: 800, color: r.is_top3 ? 'var(--gold-light)' : 'var(--ivory)' }}>{r.rank}{r.is_top3 ? ' ★' : ''}</td>
                <td data-label="Student" style={{ padding: '8px 10px' }}>{r.student_name}</td>
                <td data-label="Avg score" style={{ padding: '8px 10px' }}>{r.reviewers ? `${r.avg_total} / ${r.max_total}` : '—'}</td>
                <td data-label="Reviewers" style={{ padding: '8px 10px' }}>{r.reviewers}</td>
                <td data-label="To judges" style={{ padding: '8px 10px' }}>{r.judge_released ? <span style={{ color: '#8fd6a3' }}>Sent ✓</span> : '—'}</td>
                <td data-label="" style={{ padding: '8px 10px' }}>
                  <button className="btn btn--sm" disabled={busy} onClick={() => void openScore(r.submission_id)}>Score</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
