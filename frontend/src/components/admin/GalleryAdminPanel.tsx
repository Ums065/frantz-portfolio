import { useEffect, useState } from 'react'
import { api, type GallerySubmissionFileRow, type GallerySubmissionRow } from '../../lib/api'

type GalleryPayload = {
  submissions: GallerySubmissionRow[]
  counts: {
    submissions: number
    files: number
    pending: number
    approved: number
    rejected: number
  }
}

const fmtSize = (value: number) => {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

const statusClass = (status: string) => {
  if (status === 'approved') return 'status-pill status-pill--approved'
  if (status === 'rejected') return 'status-pill status-pill--closed'
  return 'status-pill status-pill--new'
}

export default function GalleryAdminPanel() {
  const [rows, setRows] = useState<GallerySubmissionRow[]>([])
  const [counts, setCounts] = useState<GalleryPayload['counts']>({ submissions: 0, files: 0, pending: 0, approved: 0, rejected: 0 })
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const data = await api.get<GalleryPayload>('admin/gallery/submissions')
      setRows(Array.isArray(data.submissions) ? data.submissions : [])
      setCounts(data.counts || { submissions: 0, files: 0, pending: 0, approved: 0, rejected: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load gallery submissions.')
      setRows([])
    }
  }

  useEffect(() => { void load() }, [])

  const review = async (file: GallerySubmissionFileRow, approval_status: 'approved' | 'rejected') => {
    setBusyId(file.id)
    setError('')
    try {
      await api.put(`admin/gallery/file/${file.id}`, { approval_status })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the gallery file.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <span className="status-pill">Submissions: {counts.submissions}</span>
        <span className="status-pill">Files: {counts.files}</span>
        <span className="status-pill status-pill--new">Pending: {counts.pending}</span>
        <span className="status-pill status-pill--approved">Approved: {counts.approved}</span>
        <span className="status-pill status-pill--closed">Rejected: {counts.rejected}</span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Each upload stays grouped by sender, but approval happens one file at a time.</p>
      {error && <p style={{ color: '#e08a8a' }}>{error}</p>}
      {rows.length === 0 ? (
        <div className="glass" style={{ padding: 18, borderRadius: 16 }}>No gallery submissions yet.</div>
      ) : rows.map((submission) => (
        <article key={submission.id} className="glass" style={{ padding: 18, borderRadius: 18, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h3 className="gold-text" style={{ fontSize: 20 }}>{submission.submitter_name}</h3>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>{submission.submitter_email}{submission.organization ? ` � ${submission.organization}` : ''}</p>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>Submitted: {submission.created_at || '�'} � Files: {submission.files.length}</p>
            </div>
            <span className={statusClass(submission.overall_status)}>{submission.overall_status.replace('_', ' ')}</span>
          </div>
          {submission.message && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
              <strong style={{ display: 'block', marginBottom: 6 }}>Sender note</strong>
              <p style={{ color: '#d8d3c6', whiteSpace: 'pre-wrap' }}>{submission.message}</p>
            </div>
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            {submission.files.map((file) => (
              <div key={file.id} style={{ display: 'grid', gap: 12, border: '1px solid var(--line)', borderRadius: 14, padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                <div className="admin-media-review">
                  <div className="glass" style={{ minHeight: 120, display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 12 }}>
                    {file.media_kind === 'image' ? (
                      <img src={file.file_url} alt={file.display_title} style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                    ) : (
                      <video src={file.file_url} controls preload="metadata" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ display: 'block' }}>{file.display_title}</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{file.original_name}</span>
                      </div>
                      <span className={statusClass(file.approval_status)}>{file.approval_status.replace('_', ' ')}</span>
                    </div>
                    <p style={{ color: 'var(--muted)', fontSize: 12 }}>{file.media_kind} � {file.mime_type} � {fmtSize(file.size_bytes)}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <a className="btn btn--sm" href={file.file_url} target="_blank" rel="noreferrer">Open file</a>
                      <button className="btn btn--sm btn--solid" type="button" disabled={busyId === file.id || file.approval_status === 'approved'} onClick={() => void review(file, 'approved')}>
                        {busyId === file.id ? 'Saving...' : 'Approve'}
                      </button>
                      <button className="btn btn--sm" type="button" disabled={busyId === file.id || file.approval_status === 'rejected'} onClick={() => void review(file, 'rejected')}>
                        {busyId === file.id ? 'Saving...' : 'Deny'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
