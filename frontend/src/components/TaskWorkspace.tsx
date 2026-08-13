import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import FcIcon from './FcIcon'

/* The shared task workspace between an admin and a Fellow. One component serves
   both sides — `side` decides which endpoints are used, who may set which
   status, and whose messages are shown as "mine" — so the conversation can
   never drift out of step between the two dashboards. */

export interface Task {
  id: number; title: string; instructions?: string; due_date?: string | null
  priority: string; status: string; notes?: string; deliverable_url?: string
  declined_reason?: string; fellow_user_id: number; fellow_name?: string
  assigned_by_name?: string; created_at?: string; accepted_at?: string | null
  submitted_at?: string | null; completed_at?: string | null
  msgs?: number; unread?: number
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

export default function TaskWorkspace({ side, fellows, onChanged }:
  { side: 'fellow' | 'admin'; fellows?: { id: number; full_name: string }[]; onChanged?: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<'open' | 'needs_me' | 'done' | 'all'>(side === 'admin' ? 'needs_me' : 'open')
  const [who, setWho] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)

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
        {side === 'admin' && (
          <>
            <select className="fc-input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="" style={{ background: '#14120b' }}>Every Fellow</option>
              {(fellows || []).map((fl) => <option key={fl.id} value={fl.id} style={{ background: '#14120b' }}>{fl.full_name}</option>)}
            </select>
            <button className="btn btn--sm btn--solid fc-btn-i" onClick={() => setAssigning(true)}>
              <FcIcon name="plus" size={15} />Assign a task
            </button>
          </>
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
            <button key={t.id} type="button" className="tw-card" onClick={() => setOpenId(t.id)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', color: 'var(--ivory)' }}>{t.title}</strong>
                <span className="msub" style={{ fontSize: 12.5 }}>
                  {side === 'admin' ? `${t.fellow_name || 'Unassigned'} · ` : ''}
                  {t.due_date ? `due ${String(t.due_date).slice(0, 10)}` : 'no due date'}
                  {t.priority && t.priority !== 'medium' ? ` · ${t.priority} priority` : ''}
                </span>
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

      {openId && <TaskDetail id={openId} side={side} fellows={fellows} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {assigning && <AssignTaskModal fellows={fellows || []} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); refresh() }} />}
    </div>
  )
}

function TaskDetail({ id, side, fellows, onClose, onChanged }:
  { id: number; side: 'fellow' | 'admin'; fellows?: { id: number; full_name: string }[]; onClose: () => void; onChanged: () => void }) {
  const path = side === 'admin' ? `admin/fellow-ops/task/${id}` : `fellow/task/${id}`
  const [task, setTask] = useState<Task | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [deliverable, setDeliverable] = useState('')

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
  const setStatus = async (status: string) => {
    setBusy(true); setErr('')
    try {
      if (side === 'fellow') {
        const payload: Record<string, string> = { status, notes: note, deliverable_url: deliverable }
        if (status === 'declined') {
          const why = window.prompt('Tell your manager why you cannot take this on:')
          if (!why || !why.trim()) { setBusy(false); return }
          payload.declined_reason = why.trim()
        }
        await api.put(`fellow/task/${id}`, payload)
      } else {
        await api.put(`admin/fellow-ops/task/${id}`, { status })
      }
      load(); onChanged()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update.') } finally { setBusy(false) }
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
            <label className="fc-fld" style={{ marginTop: 8 }}>Link to a file or sheet <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
              <input className="fc-input" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="https://…" />
            </label>
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
            <button className="btn btn--solid fc-btn-i" onClick={send} disabled={busy || !reply.trim()}>
              <FcIcon name="send" size={15} />Send
            </button>
          </div>
        </section>

        {err && <p className="msub" style={{ color: '#e08a8a', marginTop: 10 }}>{err}</p>}
      </div>
    </div>
  )
}

function AssignTaskModal({ fellows, onClose, onDone }: { fellows: { id: number; full_name: string }[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ fellow_user_id: '', title: '', instructions: '', due_date: '', priority: 'medium' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.fellow_user_id || !f.title.trim()) { setErr('Pick a Fellow and give the task a title.'); return }
    setBusy(true); setErr('')
    try { await api.post('admin/fellow-ops/task', { ...f, fellow_user_id: Number(f.fellow_user_id) }); onDone() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not assign.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Assign a task</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>The Fellow is notified straight away, and your brief starts the conversation so they can reply to it.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <label className="fc-fld">Fellow
            <select className="fc-input" value={f.fellow_user_id} onChange={(e) => set('fellow_user_id', e.target.value)}>
              <option value="" style={{ background: '#14120b' }}>Choose…</option>
              {fellows.map((fl) => <option key={fl.id} value={fl.id} style={{ background: '#14120b' }}>{fl.full_name}</option>)}
            </select>
          </label>
          <label className="fc-fld">Task title<input className="fc-input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Verify 25 Queens schools" /></label>
          <label className="fc-fld">The brief
            <textarea className="fc-input" rows={5} value={f.instructions} onChange={(e) => set('instructions', e.target.value)}
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
          {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
          <button className="btn btn--solid" onClick={save} disabled={busy}>{busy ? 'Assigning…' : 'Assign task'}</button>
        </div>
      </div>
    </div>
  )
}
