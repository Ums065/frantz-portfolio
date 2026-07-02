import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

interface Category { key: string; label: string; max: number }
interface JudgeScore {
  judge_user_id: number
  judge_name: string
  judge_email: string
  total: number
  status: 'draft' | 'submitted'
  notes: string | null
  [cat: string]: number | string | null
}
interface AuditRow { action: string; old_total: number | null; new_total: number | null; created_at: string; judge_name: string }
interface ScoresPayload {
  categories: Category[]
  max_total: number
  scores: JudgeScore[]
  automatic: number
  judge_average: number | null
  final: number
  audit: AuditRow[]
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '')

/** Admin read-only breakdown: every judge's per-category scores, average, and final. */
export default function SubmissionScoresModal({ submissionId, studentName, onClose }: { submissionId: number; studentName?: string; onClose: () => void }) {
  const [data, setData] = useState<ScoresPayload | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    setBusy(true)
    api.get<ScoresPayload>(`admin/new-school/submission/${submissionId}/scores`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setBusy(false))
  }, [submissionId])

  const submitted = data?.scores.filter((s) => s.status === 'submitted') ?? []

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 860, maxHeight: '92vh', overflowY: 'auto', textAlign: 'left' }}>
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 className="gold-text" style={{ marginTop: 0 }}>Judge Scores{studentName ? ` — ${studentName}` : ''}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn btn--sm" href={`${API_BASE}/admin/new-school/submission/${submissionId}/scores/export?format=csv`} target="_blank" rel="noreferrer">Export CSV</a>
            <a className="btn btn--sm" href={`${API_BASE}/admin/new-school/submission/${submissionId}/scores/export?format=pdf`} target="_blank" rel="noreferrer">Export PDF</a>
          </div>
        </div>

        {busy ? <p className="msub">Loading…</p> : !data ? <p className="msub">Could not load scores.</p> : (
          <>
            {/* Final summary */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '10px 0 18px' }}>
              <div className="glass" style={{ padding: '10px 16px' }}><div className="msub" style={{ fontSize: 12 }}>Automatic points</div><strong style={{ fontSize: 20 }}>{data.automatic}</strong></div>
              <div className="glass" style={{ padding: '10px 16px' }}><div className="msub" style={{ fontSize: 12 }}>Judge average</div><strong style={{ fontSize: 20 }}>{data.judge_average ?? '—'}{data.judge_average != null ? ` / ${data.max_total}` : ''}</strong></div>
              <div className="glass" style={{ padding: '10px 16px', borderColor: 'var(--gold)' }}><div className="msub" style={{ fontSize: 12 }}>Final competition score</div><strong className="gold-text" style={{ fontSize: 22 }}>{data.final}</strong></div>
            </div>

            {data.scores.length === 0 ? <p className="msub">No judge has scored this submission yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Judge</th>
                      {data.categories.map((c) => <th key={c.key} title={c.label}>{c.label.split(' ')[0]}<br /><span className="msub" style={{ fontSize: 11 }}>/{c.max}</span></th>)}
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scores.map((s) => (
                      <tr key={s.judge_user_id}>
                        <td>{s.judge_name}{s.notes ? <div className="msub" style={{ fontSize: 11, marginTop: 3 }} title={String(s.notes)}>📝 {String(s.notes).slice(0, 60)}{String(s.notes).length > 60 ? '…' : ''}</div> : null}</td>
                        {data.categories.map((c) => <td key={c.key}>{s[c.key] as number}</td>)}
                        <td><strong>{s.total}</strong></td>
                        <td><span className={`status-pill ${s.status === 'submitted' ? 'status-pill--approved' : 'status-pill--new'}`}>{s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="msub" style={{ marginTop: 10, fontSize: 12 }}>Average uses only submitted scores ({submitted.length} of {data.scores.length}). Final = automatic points + rounded judge average.</p>

            {data.audit && data.audit.length > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }} className="gold-text">Score Audit Trail ({data.audit.length})</summary>
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table className="admin-table">
                    <thead><tr><th>When</th><th>Judge</th><th>Action</th><th>Old</th><th>New</th></tr></thead>
                    <tbody>
                      {data.audit.map((a, i) => (
                        <tr key={i}>
                          <td className="msub" style={{ fontSize: 12 }}>{a.created_at}</td>
                          <td>{a.judge_name}</td>
                          <td>{a.action}</td>
                          <td>{a.old_total ?? '—'}</td>
                          <td>{a.new_total ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}
