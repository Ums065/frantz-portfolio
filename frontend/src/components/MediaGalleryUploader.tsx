import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

/* Multi-file media uploader for the Media Portal. Uploads images + video into the
   shared gallery submission pipeline (POST gallery/submission), where they land as
   'pending_review' for the admin. Once the admin approves a file, it appears
   automatically in the public website Gallery. Below the uploader we show the
   media account's own submissions with their live approval status. */

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp']
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'mkv']
const IMAGE_MAX = 6 * 1024 * 1024
const VIDEO_MAX = 70 * 1024 * 1024
const MAX_FILES = 20
const ACCEPT = '.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.mkv'

interface GalleryFile {
  id: number
  display_title: string
  original_name: string
  file_url: string
  mime_type: string
  media_kind: 'image' | 'video'
  approval_status: 'pending_review' | 'approved' | 'rejected'
}
interface GallerySubmission {
  id: number
  organization: string | null
  message: string | null
  overall_status: string
  created_at: string | null
  files: GalleryFile[]
}

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase()
const kindOf = (name: string): 'image' | 'video' | null => {
  const e = extOf(name)
  if (IMAGE_EXT.includes(e)) return 'image'
  if (VIDEO_EXT.includes(e)) return 'video'
  return null
}
const fmtDate = (s: string | null) => { if (!s) return ''; try { return new Date(String(s).replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

const STATUS_TINT: Record<string, string> = {
  pending_review: 'rgba(212,175,90,0.16)', approved: 'rgba(120,200,140,0.18)',
  rejected: 'rgba(220,130,130,0.18)', partially_approved: 'rgba(120,180,255,0.16)',
}
const STATUS_LABEL: Record<string, string> = {
  pending_review: 'Pending review', approved: 'Approved · live in Gallery',
  rejected: 'Not approved', partially_approved: 'Partly approved',
}
function StatusPill({ status }: { status: string }) {
  return <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 10px', color: 'var(--ivory)', background: STATUS_TINT[status] || 'rgba(255,255,255,0.08)', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{STATUS_LABEL[status] || status}</span>
}

export default function MediaGalleryUploader() {
  const [picked, setPicked] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [subs, setSubs] = useState<GallerySubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const loadMine = useCallback(async () => {
    setLoadErr('')
    try {
      const d = await api.get<{ submissions: GallerySubmission[] }>('gallery/my-submissions')
      setSubs(Array.isArray(d.submissions) ? d.submissions : [])
    } catch (e) { setLoadErr(e instanceof Error ? e.message : 'Could not load your uploads.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void loadMine() }, [loadMine])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    setErr('')
    const incoming = Array.from(list)
    const problems: string[] = []
    const ok: File[] = []
    for (const f of incoming) {
      const kind = kindOf(f.name)
      if (!kind) { problems.push(`${f.name}: unsupported type`); continue }
      if (kind === 'image' && f.size > IMAGE_MAX) { problems.push(`${f.name}: image over 6 MB`); continue }
      if (kind === 'video' && f.size > VIDEO_MAX) { problems.push(`${f.name}: video over 70 MB`); continue }
      ok.push(f)
    }
    setPicked((prev) => {
      const merged = [...prev]
      for (const f of ok) if (!merged.some((p) => p.name === f.name && p.size === f.size)) merged.push(f)
      return merged.slice(0, MAX_FILES)
    })
    if (problems.length) setErr(problems.join(' · '))
    if (inputRef.current) inputRef.current.value = ''
  }
  const removeAt = (i: number) => setPicked((p) => p.filter((_, idx) => idx !== i))

  const submit = async () => {
    if (picked.length === 0 || busy) return
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      picked.forEach((f) => fd.append('files[]', f))
      if (message.trim()) fd.append('message', message.trim())
      await api.postForm('gallery/submission', fd)
      window.fcToast?.(`Sent ${picked.length} file${picked.length === 1 ? '' : 's'} for admin approval.`)
      setPicked([]); setMessage('')
      await loadMine()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed. Please try again.') }
    finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', color: 'var(--ivory)', fontSize: 14, boxSizing: 'border-box' }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: 0 }}>
        Upload photos and video (JPG, PNG, WebP · MP4, WebM, MOV, MKV). Files are reviewed by the program team; once approved they appear automatically in the website’s public <strong style={{ color: 'var(--gold-light)' }}>Gallery</strong>. Images up to 6 MB, video up to 70 MB, up to {MAX_FILES} at a time.
      </p>

      <div>
        <label className="btn btn--sm" style={{ cursor: busy ? 'default' : 'pointer', display: 'inline-flex' }}>
          + Choose files
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden disabled={busy} onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>

      {picked.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {picked.map((f, i) => {
            const kind = kindOf(f.name)
            return (
              <div key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px' }}>
                <span aria-hidden style={{ fontSize: 16 }}>{kind === 'video' ? '🎬' : '🖼️'}</span>
                <span style={{ color: 'var(--ivory)', fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmtSize(f.size)}</span>
                <button type="button" onClick={() => removeAt(i)} disabled={busy} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', padding: '4px 9px' }}>✕</button>
              </div>
            )
          })}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional note for the reviewer (caption, context, credit)…" style={{ ...inp, minHeight: 60, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn--solid" disabled={busy} onClick={() => void submit()}>{busy ? 'Uploading…' : `Submit ${picked.length} file${picked.length === 1 ? '' : 's'} for approval`}</button>
            <button className="btn btn--sm" disabled={busy} onClick={() => setPicked([])}>Clear</button>
          </div>
        </div>
      )}
      {err && <p style={{ color: '#ff9a9a', fontSize: 12.5, margin: 0 }}>{err}</p>}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <strong style={{ color: 'var(--gold-light)', fontSize: 13.5 }}>Your uploads</strong>
        {loading ? <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>Loading…</p>
          : loadErr ? <p style={{ color: '#ff9a9a', fontSize: 13, margin: '10px 0 0' }}>{loadErr} <button className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => { setLoading(true); void loadMine() }}>Retry</button></p>
            : subs.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>Nothing uploaded yet. Your submissions and their approval status will show here.</p>
              : (
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  {subs.map((s) => (
                    <div key={s.id} style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(s.created_at)} · {s.files.length} file{s.files.length === 1 ? '' : 's'}</span>
                        <StatusPill status={s.overall_status} />
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                        {s.files.map((f) => (
                          <div key={f.id} style={{ width: 96, minWidth: 0 }}>
                            <div style={{ width: 96, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', background: 'rgba(0,0,0,0.3)', display: 'grid', placeItems: 'center' }}>
                              {f.media_kind === 'image'
                                ? <img src={f.file_url} alt={f.display_title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span aria-hidden style={{ fontSize: 24 }}>🎬</span>}
                            </div>
                            <div style={{ marginTop: 4 }}><StatusPill status={f.approval_status} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
      </div>
    </div>
  )
}
