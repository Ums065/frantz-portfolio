import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import FcIcon from './FcIcon'

/* The shared task workspace between an admin and a Fellow. One component serves
   both sides — `side` decides which endpoints are used, who may set which
   status, and whose messages are shown as "mine" — so the conversation can
   never drift out of step between the two dashboards. */

export interface TaskProgress { done: number; goal: number; in_scope: number; pct: number; filter: Record<string, string> }
export interface Task {
  id: number; title: string; instructions?: string; due_date?: string | null
  priority: string; status: string; notes?: string; deliverable_url?: string
  declined_reason?: string; fellow_user_id: number; fellow_name?: string
  assigned_by_name?: string; created_at?: string; accepted_at?: string | null
  submitted_at?: string | null; completed_at?: string | null
  msgs?: number; unread?: number; is_overdue?: number | boolean
  work_target?: string | null; target_count?: number | null
  requested_by_fellow?: number; progress?: TaskProgress | null
}
interface Msg { id: number; sender_role: string; body: string; attachment_url?: string; created_at: string; sender_name?: string }

const label = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/* What each status means in the Fellow's own words. */
export const TASK_STATUS_HELP: Record<string, string> = {
  not_started: 'Waiting for you to accept it',
  accepted: 'You took it on',
  in_progress: 'You are working on it',
  waiting: 'You are blocked or waiting on someone',
  submitted: 'Handed in — waiting for your manager',
  needs_review: 'Your manager wants changes',
  completed: 'Done and signed off',
  declined: 'You could not take it on',
}
const STATUS_TONE: Record<string, string> = {
  submitted: '#6bb7e2', needs_review: '#e0a86c', declined: '#e08a8a',
  completed: '#6be29a', waiting: '#e0a86c',
}
/* A Fellow moves their own work along; only a manager signs it off. */
const FELLOW_SETTABLE = ['accepted', 'in_progress', 'waiting', 'submitted', 'declined']

export function TaskStatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status]
  return (
    <span className="fc-stage-pill" title={TASK_STATUS_HELP[status] || ''}
      style={tone ? { color: tone, borderColor: tone + '66', background: tone + '1a' } : undefined}>
      {label(status)}
    </span>
  )
}

/** Uploads a file to a task and hands back its stored URL. Both sides use it. */
const uploadTaskFile = (side: 'fellow' | 'admin', taskId: number, file: File) =>
  api.upload<{ url: string; name: string }>(
    side === 'admin' ? `admin/fellow-ops/task/${taskId}/upload` : `fellow/task/${taskId}/upload`, file)

export default function TaskWorkspace({ side, fellows, onChanged, onOpenWork }:
  { side: 'fellow' | 'admin'; fellows?: { id: number; full_name: string }[]; onChanged?: () => void
    onOpenWork?: (target: string, filter: Record<string, string>) => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<'open' | 'needs_me' | 'done' | 'all'>(side === 'admin' ? 'needs_me' : 'open')
  const [who, setWho] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [asking, setAsking] = useState(false)

  const base = side === 'admin' ? 'admin/fellow-ops/tasks' : 'fellow/tasks'
  const load = useCallback(() => {
    const qs = new URLSearchParams({ filter })
    if (side === 'admin' && who) qs.set('fellow_user_id', who)
    setLoading(true)
    api.get<{ tasks: Task[] }>(`${base}?${qs}`)
      .then((d) => setTasks(d.tasks || [])).catch(() => {}).finally(() => setLoading(false))
  }, [base, filter, who, side])
  useEffect(() => { load() }, [load])

  const refresh = () => { load(); onChanged?.() }
  const FILTERS: [typeof filter, string][] = side === 'admin'
    ? [['needs_me', 'Needs me'], ['open', 'All open'], ['done', 'Closed'], ['all', 'Everything']]
    : [['open', 'To do'], ['done', 'Finished'], ['all', 'Everything']]

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="fc-nav__tabs" role="tablist">
          {FILTERS.map(([k, lbl]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k}
              className={`fc-tab${filter === k ? ' is-active' : ''}`} onClick={() => setFilter(k)}>{lbl}</button>
          ))}
        </div>
        {side === 'admin' ? (
          <>
            <select className="fc-input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="" style={{ background: '#14120b' }}>Every Fellow</option>
              {(fellows || []).map((fl) => <option key={fl.id} value={fl.id} style={{ background: '#14120b' }}>{fl.full_name}</option>)}
            </select>
            <button className="btn btn--sm btn--solid fc-btn-i" onClick={() => setAssigning(true)}>
              <FcIcon name="plus" size={15} />Assign a task
            </button>
          </>
        ) : (
          <button className="btn btn--sm fc-btn-i" onClick={() => setAsking(true)} title="Ask your manager for something, or flag a problem">
            <FcIcon name="plus" size={15} />Ask for something
          </button>
        )}
      </div>

      {loading ? <p className="msub">Loading tasks…</p> : tasks.length === 0 ? (
        <div className="fc-empty">
          <span><FcIcon name="clipboard" size={34} /></span>
          <h4>{side === 'admin'
            ? (filter === 'needs_me' ? 'Nothing needs you right now' : 'No tasks here')
            : (filter === 'open' ? 'No open tasks' : 'Nothing here')}</h4>
          <p className="msub">{side === 'admin'
            ? 'Tasks a Fellow hands in, declines or gets blocked on appear here first. Assign one to get started.'
            : 'When your manager assigns you work it appears here, and you can reply to them on each task.'}</p>
          {side === 'admin' && <button className="btn btn--solid fc-btn-i" onClick={() => setAssigning(true)}><FcIcon name="plus" size={16} />Assign a task</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {tasks.map((t) => (
            <button key={t.id} type="button" className={`tw-card${t.is_overdue ? ' is-overdue' : ''}`} onClick={() => setOpenId(t.id)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', color: 'var(--ivory)' }}>
                  {t.title}
                  {t.requested_by_fellow ? <em className="tw-tag">asked for</em> : null}
                </strong>
                <span className="msub" style={{ fontSize: 12.5 }}>
                  {side === 'admin' ? `${t.fellow_name || 'Unassigned'} · ` : ''}
                  {t.is_overdue
                    ? <strong style={{ color: '#f0b8a8' }}>overdue — was due {String(t.due_date).slice(0, 10)}</strong>
                    : t.due_date ? `due ${String(t.due_date).slice(0, 10)}` : 'no due date'}
                  {t.priority && t.priority !== 'medium' ? ` · ${t.priority} priority` : ''}
                </span>
                {t.progress && t.progress.goal > 0 && (
                  <span style={{ display: 'block', marginTop: 6, maxWidth: 260 }}>
                    <span className="fc-progress__bar" style={{ display: 'block' }}><span style={{ width: t.progress.pct + '%' }} /></span>
                    <span className="msub" style={{ fontSize: 11.5 }}>{t.progress.done} of {t.progress.goal} verified</span>
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {(t.unread || 0) > 0 && <em className="tw-unread">{t.unread} new</em>}
                {(t.msgs || 0) > 0 && <span className="msub" style={{ fontSize: 12 }}>{t.msgs} message{t.msgs === 1 ? '' : 's'}</span>}
                <TaskStatusPill status={t.status} />
              </span>
            </button>
          ))}
        </div>
      )}

      {openId && <TaskDetail id={openId} side={side} fellows={fellows} onOpenWork={onOpenWork}
        onClose={() => setOpenId(null)} onChanged={refresh} onDeleted={() => { setOpenId(null); refresh() }} />}
      {assigning && <AssignTaskModal fellows={fellows || []} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); refresh() }} />}
      {asking && <AskModal onClose={() => setAsking(false)} onDone={() => { setAsking(false); refresh() }} />}
    </div>
  )
}

function TaskDetail({ id, side, fellows, onOpenWork, onClose, onChanged, onDeleted }:
  { id: number; side: 'fellow' | 'admin'; fellows?: { id: number; full_name: string }[]
    onOpenWork?: (target: string, filter: Record<string, string>) => void
    onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const path = side === 'admin' ? `admin/fellow-ops/task/${id}` : `fellow/task/${id}`
  const [task, setTask] = useState<Task | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [deliverable, setDeliverable] = useState('')
  const [declining, setDeclining] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(() => {
    api.get<{ task: Task; messages: Msg[]; statuses: string[] }>(path)
      .then((d) => {
        setTask(d.task); setMsgs(d.messages || []); setStatuses(d.statuses || [])
        setNote(d.task?.notes || ''); setDeliverable(d.task?.deliverable_url || '')
      }).catch(() => {})
  }, [path])
  useEffect(() => { load() }, [load])

  const send = async () => {
    if (!reply.trim()) return
    setBusy(true); setErr('')
    try { await api.post(`${path}/message`, { body: reply }); setReply(''); load(); onChanged() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.') } finally { setBusy(false) }
  }
  const setStatus = async (status: string, declinedReason = '') => {
    // Declining needs a reason, asked for in a proper modal rather than a
    // browser prompt (unstyled, and unusable on a phone).
    if (side === 'fellow' && status === 'declined' && !declinedReason) { setDeclining(true); return }
    setBusy(true); setErr('')
    try {
      if (side === 'fellow') {
        await api.put(`fellow/task/${id}`, { status, notes: note, deliverable_url: deliverable, declined_reason: declinedReason })
      } else {
        await api.put(`admin/fellow-ops/task/${id}`, { status })
      }
      setDeclining(false)
      load(); onChanged()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update.') } finally { setBusy(false) }
  }
  const attach = async (file: File, asMessage: boolean) => {
    setUploading(true); setErr('')
    try {
      const up = await uploadTaskFile(side, id, file)
      if (asMessage) { await api.post(`${path}/message`, { body: `Attached: ${up.name}`, attachment_url: up.url }); load(); onChanged() }
      else { setDeliverable(up.url); await api.put(`fellow/task/${id}`, { status: task?.status || 'in_progress', notes: note, deliverable_url: up.url }); load(); onChanged() }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not upload that file.') } finally { setUploading(false) }
  }
  const removeTask = async () => {
    if (!window.confirm('Delete this task and its whole conversation? This cannot be undone.')) return
    setBusy(true)
    try { await api.del(`admin/fellow-ops/task/${id}`); onDeleted() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.') } finally { setBusy(false) }
  }
  const saveWork = async () => {
    setBusy(true); setErr('')
    try { await api.put(`fellow/task/${id}`, { status: task?.status || 'in_progress', notes: note, deliverable_url: deliverable }); load(); onChanged() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  const reassign = async (fid: string) => {
    setBusy(true)
    try { await api.put(`admin/fellow-ops/task/${id}`, { fellow_user_id: Number(fid) }); load(); onChanged() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not reassign.') } finally { setBusy(false) }
  }

  if (!task) {
    return <div className="modal-overlay open" onClick={onClose}><div className="modal" style={{ maxWidth: 720 }}><p className="msub">Loading…</p></div></div>
  }
  const settable = side === 'fellow' ? FELLOW_SETTABLE : statuses

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 4, paddingRight: 28 }}>{task.title}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <TaskStatusPill status={task.status} />
          <span className="msub" style={{ fontSize: 12.5 }}>
            {side === 'admin' ? `${task.fellow_name} · ` : task.assigned_by_name ? `from ${task.assigned_by_name} · ` : ''}
            {task.due_date ? `due ${String(task.due_date).slice(0, 10)}` : 'no due date'}
            {task.priority ? ` · ${task.priority} priority` : ''}
          </span>
        </div>
        <p className="msub" style={{ fontSize: 12.5, marginTop: 6 }}>{TASK_STATUS_HELP[task.status] || ''}</p>

        {task.instructions && (
          <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 12 }}>
            <h4 className="gold-text" style={{ marginTop: 0, fontSize: 14 }}>The brief</h4>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, margin: 0, color: '#ded8c8' }}>{task.instructions}</p>
          </section>
        )}
        {task.declined_reason && (
          <div className="fc-dup" style={{ marginTop: 12 }}>Declined: {task.declined_reason}</div>
        )}
        {task.is_overdue && (
          <div className="fc-dup" style={{ marginTop: 12 }}>
            ⚠ This was due {String(task.due_date).slice(0, 10)}. {side === 'fellow'
              ? 'If something is blocking you, say so in the conversation below — a date can be moved.'
              : 'Ask the Fellow in the conversation below what is blocking it.'}
          </div>
        )}

        {/* The task is tied to the screen that does the work, so nobody counts
            by hand and nobody has to re-find the right filter. */}
        {task.work_target === 'schools' && task.progress && (
          <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 12 }}>
            <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 6, fontSize: 14 }}>Progress</h4>
            <div className="fc-progress__bar"><span style={{ width: task.progress.pct + '%' }} /></div>
            <p className="msub" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
              <strong style={{ color: '#f0ead6' }}>{task.progress.done} of {task.progress.goal}</strong> verified
              {task.progress.filter?.region ? ` in ${task.progress.filter.region}` : ''}
              {task.progress.goal !== task.progress.in_scope ? ` · ${task.progress.in_scope} schools in scope` : ''}
              {' '}— counted automatically as you verify them.
            </p>
            {side === 'fellow' && onOpenWork && (
              <button className="btn btn--sm btn--solid" style={{ marginTop: 10 }}
                onClick={() => { onOpenWork('schools', task.progress?.filter || {}); onClose() }}>
                Open my work →
              </button>
            )}
          </section>
        )}

        {/* Move it along */}
        <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 12 }}>
          <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 4, fontSize: 14 }}>
            {side === 'fellow' ? 'Where are you with this?' : 'Your verdict'}
          </h4>
          <p className="msub" style={{ fontSize: 12, margin: '0 0 10px' }}>
            {side === 'fellow'
              ? 'Keep this honest — your manager reads it instead of chasing you.'
              : 'Send it back with Needs Review, or sign it off as Completed.'}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {settable.map((s) => (
              <button key={s} className={`btn btn--sm${task.status === s ? ' btn--solid' : ''}`} disabled={busy}
                title={TASK_STATUS_HELP[s] || ''} onClick={() => setStatus(s)}>{label(s)}</button>
            ))}
          </div>
          {side === 'admin' && (fellows || []).length > 0 && (
            <label className="fc-fld" style={{ marginTop: 12 }}>Reassign to
              <select className="fc-input" value={task.fellow_user_id} onChange={(e) => reassign(e.target.value)} disabled={busy}>
                {(fellows || []).map((fl) => <option key={fl.id} value={fl.id} style={{ background: '#14120b' }}>{fl.full_name}</option>)}
              </select>
            </label>
          )}
        </section>

        {/* The work itself */}
        {side === 'fellow' ? (
          <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 12 }}>
            <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>Your work</h4>
            <label className="fc-fld">What you did / found
              <textarea className="fc-input" rows={4} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Write your findings here. This is what your manager reads when they review the task." />
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'flex-end' }}>
              <label className="fc-fld" style={{ flex: '1 1 220px' }}>Attach your file
                <input className="fc-input" type="file" disabled={uploading}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void attach(fl, false) }} />
                <span style={{ textTransform: 'none', fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>
                  {uploading ? 'Uploading…' : 'PDF, Word, Excel, PowerPoint, CSV or an image — up to 12MB.'}
                </span>
              </label>
              <label className="fc-fld" style={{ flex: '1 1 200px' }}>…or paste a link
                <input className="fc-input" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="https://…" />
              </label>
            </div>
            {task.deliverable_url && (
              <p className="msub" style={{ fontSize: 12.5, marginTop: 8 }}>
                Handed in: <a href={task.deliverable_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>open your file ↗</a>
              </p>
            )}
            <button className="btn btn--sm" style={{ marginTop: 10 }} onClick={saveWork} disabled={busy}>Save my work</button>
          </section>
        ) : (task.notes || task.deliverable_url) && (
          <section className="glass" style={{ padding: 14, borderRadius: 12, marginTop: 12 }}>
            <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 6, fontSize: 14 }}>What the Fellow submitted</h4>
            {task.notes && <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, margin: '0 0 8px', color: '#ded8c8' }}>{task.notes}</p>}
            {task.deliverable_url && <a className="btn btn--sm" href={task.deliverable_url} target="_blank" rel="noreferrer">Open their file ↗</a>}
          </section>
        )}

        {/* The conversation */}
        <section style={{ marginTop: 14 }}>
          <h4 className="gold-text" style={{ fontSize: 14, marginBottom: 8 }}>Conversation</h4>
          {msgs.length === 0 ? (
            <p className="msub" style={{ fontSize: 13 }}>No messages yet. {side === 'fellow' ? 'Ask your manager anything about this task here.' : 'Anything you write here reaches the Fellow with a notification.'}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {msgs.map((m) => {
                const mine = (side === 'fellow') === (m.sender_role === 'fellow')
                return (
                  <div key={m.id} className={`tw-msg${mine ? ' is-mine' : ''}`}>
                    <div className="tw-msg__who">{mine ? 'You' : (m.sender_name || label(m.sender_role))} · {String(m.created_at).slice(0, 16).replace('T', ' ')}</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{m.body}</div>
                    {m.attachment_url && <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 12.5 }}>Attachment ↗</a>}
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <textarea className="fc-input" rows={2} style={{ flex: '1 1 240px' }} value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={side === 'fellow' ? 'Ask a question or report progress…' : 'Reply to the Fellow…'} />
            <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <button className="btn btn--solid fc-btn-i" onClick={send} disabled={busy || !reply.trim()}>
                <FcIcon name="send" size={15} />Send
              </button>
              <label className="btn btn--sm fc-btn-i" style={{ cursor: 'pointer' }} title="Attach a file to the conversation">
                <FcIcon name="upload" size={15} />{uploading ? '…' : 'File'}
                <input type="file" hidden disabled={uploading}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void attach(fl, true) }} />
              </label>
            </span>
          </div>
        </section>

        {side === 'admin' && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(201,168,76,.16)' }}>
            <button className="btn btn--sm" onClick={removeTask} disabled={busy}
              style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete this task</button>
            <span className="msub" style={{ fontSize: 12, marginLeft: 10 }}>Removes the task and its conversation for good.</span>
          </div>
        )}

        {err && <p className="msub" style={{ color: '#e08a8a', marginTop: 10 }}>{err}</p>}

        {declining && <DeclineModal onClose={() => setDeclining(false)} busy={busy} onConfirm={(why) => setStatus('declined', why)} />}
      </div>
    </div>
  )
}

/** Declining needs a reason, and the reason goes straight to the manager. */
function DeclineModal({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: (why: string) => void }) {
  const [why, setWhy] = useState('')
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Decline this task</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>
          Tell your manager why. There is no wrong answer — too much on, unclear brief, not enough time — but they need to know so they can move it or explain it.
        </p>
        <label className="fc-fld" style={{ marginTop: 12 }}>Your reason
          <textarea className="fc-input" rows={4} value={why} onChange={(e) => setWhy(e.target.value)}
            placeholder="e.g. I have 40 calls booked this week and cannot fit this in before Friday." />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn--solid" disabled={busy || !why.trim()} onClick={() => onConfirm(why.trim())}>
            {busy ? 'Sending…' : 'Send and decline'}
          </button>
          <button className="btn" onClick={onClose}>Keep the task</button>
        </div>
      </div>
    </div>
  )
}

/** A Fellow raises their own item: a request, a blocker, an idea. */
function AskModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: '', instructions: '', priority: 'medium' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    if (!f.title.trim()) { setErr('Give it a short title.'); return }
    setBusy(true); setErr('')
    try { await api.post('fellow/task/request', f); onDone() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Ask your manager for something</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>Need approval, a document, an introduction — or something is blocking you. This appears on their board and you can keep talking on it.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <label className="fc-fld">What do you need?<input className="fc-input" value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Approval for the Riverside Bank proposal" /></label>
          <label className="fc-fld">Any detail
            <textarea className="fc-input" rows={4} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })}
              placeholder="Why you need it, and by when." />
          </label>
          <label className="fc-fld">How urgent?
            <select className="fc-input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {['low', 'medium', 'high'].map((p) => <option key={p} value={p} style={{ background: '#14120b' }}>{label(p)}</option>)}
            </select>
          </label>
          {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
          <button className="btn btn--solid" onClick={save} disabled={busy}>{busy ? 'Sending…' : 'Send to my manager'}</button>
        </div>
      </div>
    </div>
  )
}

function AssignTaskModal({ fellows, onClose, onDone }: { fellows: { id: number; full_name: string }[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: '', instructions: '', due_date: '', priority: 'medium', work_target: '', region: '', target_count: '' })
  const [picked, setPicked] = useState<number[]>([])
  const [split, setSplit] = useState(false)
  const [regions, setRegions] = useState('')
  const [templates, setTemplates] = useState<any[]>([])
  const [saveAs, setSaveAs] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const toggle = (id: number) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  useEffect(() => { api.get<{ templates: any[] }>('admin/fellow-ops/task-templates').then((d) => setTemplates(d.templates || [])).catch(() => {}) }, [])

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => String(x.id) === id)
    if (!t) return
    setF({
      title: t.title || '', instructions: t.instructions || '', priority: t.priority || 'medium',
      due_date: t.due_in_days ? new Date(Date.now() + Number(t.due_in_days) * 86400000).toISOString().slice(0, 10) : '',
      work_target: t.work_target || '', region: '', target_count: t.target_count ? String(t.target_count) : '',
    })
  }
  const save = async () => {
    if (picked.length === 0 || !f.title.trim()) { setErr('Pick at least one Fellow and give the task a title.'); return }
    setBusy(true); setErr('')
    try {
      const common = {
        title: f.title, instructions: f.instructions, due_date: f.due_date, priority: f.priority,
        work_target: f.work_target || undefined, target_count: Number(f.target_count) || 0,
      }
      if (picked.length === 1 && !split) {
        await api.post('admin/fellow-ops/task', {
          ...common, fellow_user_id: picked[0],
          work_filter: f.work_target && f.region ? { region: f.region } : undefined,
        })
      } else {
        await api.post('admin/fellow-ops/tasks/bulk', {
          ...common, fellow_user_ids: picked,
          split_regions: split ? regions.split(',').map((s) => s.trim()).filter(Boolean) : [],
        })
      }
      if (saveAs.trim()) {
        await api.post('admin/fellow-ops/task-template', {
          name: saveAs.trim(), title: f.title, instructions: f.instructions, priority: f.priority,
          work_target: f.work_target || undefined, target_count: Number(f.target_count) || 0,
        }).catch(() => {})
      }
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not assign.') } finally { setBusy(false) }
  }
  const dropTemplate = async (id: number) => {
    if (!window.confirm('Delete this template?')) return
    try { await api.del(`admin/fellow-ops/task-template/${id}`); setTemplates((p) => p.filter((t) => t.id !== id)) } catch { /* ignore */ }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Assign a task</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>Everyone picked is notified straight away, and your brief starts the conversation so they can reply to it.</p>

        {templates.length > 0 && (
          <label className="fc-fld" style={{ marginTop: 14 }}>Start from a saved brief
            <select className="fc-input" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="" style={{ background: '#14120b' }}>Write a new one</option>
              {templates.map((t) => <option key={t.id} value={t.id} style={{ background: '#14120b' }}>{t.name}</option>)}
            </select>
            <span style={{ textTransform: 'none', fontWeight: 400, fontSize: 11 }}>
              {templates.map((t) => (
                <button key={t.id} type="button" className="fc-link" style={{ marginRight: 8, fontSize: 11 }} onClick={() => dropTemplate(t.id)}>delete “{t.name}”</button>
              ))}
            </span>
          </label>
        )}

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <div className="fc-fld">Who is it for? <span style={{ textTransform: 'none', fontWeight: 400 }}>({picked.length} selected)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {fellows.map((fl) => (
                <button key={fl.id} type="button" className={`btn btn--sm${picked.includes(fl.id) ? ' btn--solid' : ''}`} onClick={() => toggle(fl.id)}>
                  {fl.full_name}
                </button>
              ))}
            </div>
          </div>
          <label className="fc-fld">Task title<input className="fc-input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Verify 25 Queens schools" /></label>
          <label className="fc-fld">The brief
            <textarea className="fc-input" rows={4} value={f.instructions} onChange={(e) => set('instructions', e.target.value)}
              placeholder="What exactly to do, and what finished looks like." />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="fc-fld" style={{ flex: '1 1 150px' }}>Due date<input className="fc-input" type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></label>
            <label className="fc-fld" style={{ flex: '1 1 150px' }}>Priority
              <select className="fc-input" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
                {['low', 'medium', 'high'].map((p) => <option key={p} value={p} style={{ background: '#14120b' }}>{label(p)}</option>)}
              </select>
            </label>
          </div>

          {/* Tie it to real work so it counts itself. */}
          <section className="glass" style={{ padding: 12, borderRadius: 11 }}>
            <label className="fc-fld">Tie this to actual work <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
              <select className="fc-input" value={f.work_target} onChange={(e) => set('work_target', e.target.value)}>
                <option value="" style={{ background: '#14120b' }}>Not linked — just a brief</option>
                <option value="schools" style={{ background: '#14120b' }}>School verification</option>
              </select>
            </label>
            {f.work_target === 'schools' && (
              <>
                <p className="msub" style={{ fontSize: 12, margin: '8px 0' }}>The Fellow gets an "Open my work" button that opens the filtered list, and the task counts verified schools by itself.</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label className="fc-fld" style={{ flex: '1 1 150px' }}>Region<input className="fc-input" value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="e.g. Queens" /></label>
                  <label className="fc-fld" style={{ flex: '1 1 120px' }}>How many?<input className="fc-input" type="number" value={f.target_count} onChange={(e) => set('target_count', e.target.value)} placeholder="25" /></label>
                </div>
                {picked.length > 1 && (
                  <label className="msub" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
                    <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                    Split a region each between them
                  </label>
                )}
                {split && (
                  <label className="fc-fld" style={{ marginTop: 8 }}>Regions to share out, comma separated
                    <input className="fc-input" value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="Queens, Brooklyn, Manhattan, Bronx, Long Island" />
                  </label>
                )}
              </>
            )}
          </section>

          <label className="fc-fld">Save this brief for next time <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
            <input className="fc-input" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} placeholder="e.g. Verify a borough" />
          </label>

          {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
          <button className="btn btn--solid" onClick={save} disabled={busy}>
            {busy ? 'Assigning…' : picked.length > 1 ? `Assign to ${picked.length} Fellows` : 'Assign task'}
          </button>
        </div>
      </div>
    </div>
  )
}
