import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import FcIcon, { type IconName } from './FcIcon'

/* Student Fellow sponsorship CRM (Phase 1a): My Day scorecard + tasks + follow-ups,
   a Prospects list with duplicate check, a Pipeline board, and an organization
   detail drawer (info, contacts, timeline, quick activity logging, stage moves). */

interface Org { id: number; name: string; website?: string; industry?: string; category?: string; org_type?: string; location?: string; territory?: string; priority: string; stage: string; est_value: number; fit_notes?: string; internal_notes?: string; updated_at?: string }
interface Contact { id: number; name: string; title?: string; email?: string; phone?: string; linkedin?: string; is_primary?: number }
interface Activity { type: string; detail?: string; created_at: string }
interface Followup { id: number; org_id: number; due_date: string; reason?: string; org_name?: string; status?: string; method?: string }
interface Task { id: number; title: string; priority: string; status: string; due_date?: string }

const STAGE_LABEL = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const money = (n: number) => n > 0 ? '$' + n.toLocaleString('en-US') : '—'
const ACTIVITY_QUICK: [string, string, IconName][] = [['email', 'Email sent', 'mail'], ['call', 'Call', 'phone'], ['linkedin', 'LinkedIn', 'linkedin'], ['meeting', 'Meeting', 'calendar'], ['proposal', 'Proposal', 'file'], ['note', 'Note', 'note']]

export type ViewKey = 'day' | 'prospects' | 'pipeline' | 'calls' | 'outreach' | 'academy' | 'certification' | 'performance' | 'materials' | 'report'

/* Every tab explains itself: an icon, a plain-language tagline, and the 3 steps
   to actually do the work. New Fellows should never have to guess. */
export const VIEW_META: Record<ViewKey, { icon: IconName; label: string; tagline: string; steps: string[] }> = {
  day: {
    icon: 'sunrise', label: 'My Day',
    tagline: 'Start here every morning. Your goals for today, follow-ups that are due, and tasks from your manager.',
    steps: [
      'Check the scorecard — those bars are today\'s goals (research, emails, calls).',
      'Clear every follow-up that is due: click the company name to open it, then press "Done".',
      'Work your tasks and change each status so your manager can see your progress.',
    ],
  },
  prospects: {
    icon: 'building', label: 'Prospects',
    tagline: 'Your list of companies that could sponsor the challenge. Everything starts by adding them here.',
    steps: [
      'Press "Add Prospect" for one company, or "Import list" to paste many at once.',
      'If another Fellow already owns that company, you get a warning — never double-contact.',
      'Click any row to open the company: log a call, send an email, add a contact person.',
    ],
  },
  pipeline: {
    icon: 'funnel', label: 'Pipeline',
    tagline: 'The same companies, sorted by how close they are to saying yes. Scroll sideways to see all stages.',
    steps: [
      'Each column is a stage. Companies move left → right as they warm up.',
      'Click a card to open the company and move it to the next stage.',
      'The number beside each column is how much sponsorship value is sitting in that stage.',
    ],
  },
  calls: {
    icon: 'phone', label: 'Call List',
    tagline: 'Everyone with a phone number, ready to dial — with the date you last spoke to them.',
    steps: [
      'Work down the list, oldest "last call" first.',
      'Press "Log call", choose what happened, and set the next follow-up date.',
      'It counts towards your daily call goal automatically — no extra typing.',
    ],
  },
  outreach: {
    icon: 'mail', label: 'Outreach',
    tagline: 'Approved email and phone scripts, written for you. Never start a message from a blank page.',
    steps: [
      'Pick the template that matches your situation (first contact, follow-up, thank you…).',
      'Copy it and change the name and details so it feels personal.',
      'Send it from the company\'s page ("Send Email") so it is logged for you.',
    ],
  },
  academy: {
    icon: 'cap', label: 'Training Academy',
    tagline: 'Your training course. Read each module, then mark it complete to unlock the exam.',
    steps: [
      'Work through the modules in order — they build on each other.',
      'Open the document, read it, then press "Mark complete".',
      'Finish all modules to unlock the Certification exam.',
    ],
  },
  certification: {
    icon: 'award', label: 'Certification',
    tagline: 'Pass the exam to become a Certified Student Fellow.',
    steps: [
      'Finish the Training Academy modules first.',
      'Take the quiz — you need 80% to pass.',
      'Did not pass? You can study and retake it.',
    ],
  },
  performance: {
    icon: 'trending', label: 'Performance',
    tagline: 'Your own numbers — today, this week, this month, and all time.',
    steps: [
      'The three cards show total prospects, pipeline value, and sponsorships won.',
      'The table counts each activity you logged, per time period.',
      'Your manager sees this too — steady effort every day beats one big day.',
    ],
  },
  materials: {
    icon: 'folder', label: 'Materials',
    tagline: 'Approved decks, one-pagers and links you are allowed to send to sponsors.',
    steps: [
      'Only send materials from this list — they are approved by the team.',
      'Open or download the file, then attach it to your outreach.',
      'Something missing? Ask an admin to add it.',
    ],
  },
  report: {
    icon: 'clipboard', label: 'Daily Report',
    tagline: 'Finish your day here. A two-minute summary so your manager can help you.',
    steps: [
      'Fill this in at the end of every working day.',
      'Write what you did, what got stuck, and your plan for tomorrow.',
      'Be honest about blockers — that is how you get help fast.',
    ],
  },
}

export const TAB_GROUPS: { label: string; views: ViewKey[] }[] = [
  { label: 'Start here', views: ['day'] },
  { label: 'Find sponsors', views: ['prospects', 'pipeline', 'calls', 'outreach'] },
  { label: 'Learn', views: ['academy', 'certification', 'materials'] },
  { label: 'Track', views: ['performance', 'report'] },
]

/* Plain-English meaning of each pipeline stage, shown on the board and drawer. */
const STAGE_HELP: Record<string, string> = {
  researching: 'You are still learning about this company.',
  qualified: 'A good fit — worth contacting.',
  contact_identified: 'You found the right person to talk to.',
  outreach_ready: 'Email or script ready to send.',
  first_contact: 'You reached out. Waiting for a reply.',
  follow_up: 'No reply yet — time to nudge them again.',
  response_received: 'They replied. Read it and respond.',
  interested: 'They want to know more.',
  meeting_scheduled: 'A meeting is booked.',
  proposal_sent: 'They have your sponsorship proposal.',
  negotiation: 'Discussing the amount or the details.',
  verbal_commitment: 'They said yes — not signed yet.',
  confirmed: 'Signed and confirmed.',
  paid: 'Money received. Fully done.',
  not_interested: 'They said no.',
  no_response: 'Never replied after several tries.',
  closed_lost: 'Closed without a sponsorship.',
}

/* The 6-step journey a sponsor goes through, shown on My Day so a Fellow
   always knows where the work is heading. */
const JOURNEY: [string, string][] = [
  ['1', 'Add the company'], ['2', 'Research the fit'], ['3', 'Find the right person'],
  ['4', 'Reach out & follow up'], ['5', 'Send the proposal'], ['6', 'Sponsorship confirmed'],
]

/* The workflow rail shown on every tab: which step of the job this screen is
   for, so a Fellow can always see where they are and what comes next. */
const WORKFLOW: { step: string; view: ViewKey; hint: string }[] = [
  { step: 'Build your list', view: 'prospects', hint: 'Add the companies you will approach.' },
  { step: 'Learn the pitch', view: 'academy', hint: 'Know the program before you contact anyone.' },
  { step: 'Reach out', view: 'outreach', hint: 'Use an approved script — email, phone or LinkedIn.' },
  { step: 'Follow up', view: 'day', hint: 'Most sponsors say yes on the second or third contact.' },
  { step: 'Close the deal', view: 'pipeline', hint: 'Move them forward: meeting, proposal, confirmed.' },
  { step: 'Report your day', view: 'report', hint: 'Two minutes so your manager can help you.' },
]
/* How far through the pipeline a stage is, for the drawer progress bar. */
const STAGE_ORDER = ['researching', 'qualified', 'contact_identified', 'outreach_ready', 'first_contact', 'follow_up', 'response_received', 'interested', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'verbal_commitment', 'confirmed', 'paid']
const stagePct = (s: string) => {
  if (['not_interested', 'no_response', 'closed_lost'].includes(s)) return 0
  const i = STAGE_ORDER.indexOf(s)
  return i < 0 ? 0 : Math.round(((i + 1) / STAGE_ORDER.length) * 100)
}

const WORKFLOW_OF: Partial<Record<ViewKey, number>> = { prospects: 0, academy: 1, certification: 1, materials: 1, outreach: 2, calls: 2, day: 3, pipeline: 4, performance: 4, report: 5 }

/* Horizontal workflow rail — the current screen's step is highlighted and
   every step is a shortcut to the tab that does it. */
function FcWorkflow({ view, onGo }: { view: ViewKey; onGo: (v: ViewKey) => void }) {
  const here = WORKFLOW_OF[view] ?? -1
  return (
    <div className="fc-rail" aria-label="Where this screen fits in your work">
      {WORKFLOW.map((w, i) => (
        <button key={w.step} type="button" title={w.hint} onClick={() => onGo(w.view)}
          className={`fc-rail__step${i === here ? ' is-here' : ''}${i < here ? ' is-done' : ''}`}>
          <span className="fc-rail__n">{i + 1}</span>
          <span className="fc-rail__t">{w.step}</span>
        </button>
      ))}
    </div>
  )
}

/* Loading placeholder shaped like the content it replaces, so the layout does
   not jump when data lands (and it never reads as an error). */
function FcSkeleton({ rows = 3, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div className="fc-skel" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <span key={i} style={{ height }} />)}
    </div>
  )
}

/* Per-view explainer: tagline always visible, the 3 steps collapsible (and the
   open/closed choice is remembered per Fellow). */
function FcGuide({ view }: { view: ViewKey }) {
  const m = VIEW_META[view]
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('fcGuide.' + view) !== 'closed' } catch { return true }
  })
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem('fcGuide.' + view, o ? 'closed' : 'open') } catch { /* ignore */ }
      return !o
    })
  }
  return (
    <div className="fc-guide">
      <div className="fc-guide__head">
        <span className="fc-guide__icon"><FcIcon name={m.icon} size={24} /></span>
        <div className="fc-guide__txt">
          <h3>{m.label}</h3>
          <p>{m.tagline}</p>
        </div>
        <button type="button" className="fc-guide__btn" onClick={toggle} aria-expanded={open}>
          {open ? 'Hide steps' : 'How does this work?'}
        </button>
      </div>
      {open && (
        <ol className="fc-guide__steps">
          {m.steps.map((s, i) => <li key={i}><span>{i + 1}</span>{s}</li>)}
        </ol>
      )}
    </div>
  )
}

/* `view`/`onView` let a host page (the Fellow sidebar) drive the section, so the
   CRM's ten sections sit in one flat navigation instead of tabs-inside-tabs.
   Left uncontrolled, the component keeps its own tab bar and works standalone. */
export default function FellowCrm({ view: viewProp, onView }: { view?: ViewKey; onView?: (v: ViewKey) => void } = {}) {
  const [ownView, setOwnView] = useState<ViewKey>('day')
  const view = viewProp ?? ownView
  const controlled = viewProp !== undefined
  const setView = (v: ViewKey) => { controlled ? onView?.(v) : setOwnView(v) }
  const [importing, setImporting] = useState(false)
  const [overview, setOverview] = useState<{ scorecard: { counts: Record<string, number>; targets: Record<string, number> }; tasks: Task[]; followups: Followup[]; followups_due: number; orgs_total: number; demo_orgs?: number } | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [priorities, setPriorities] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [composing, setComposing] = useState<{ tpl?: number } | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const loadOverview = useCallback(() => { api.get<any>('fellow/crm/overview').then(setOverview).catch(() => {}) }, [])
  const loadOrgs = useCallback(() => {
    api.get<{ orgs: Org[]; stages: string[]; priorities: string[] }>('fellow/orgs').then((d) => { setOrgs(d.orgs || []); setStages(d.stages || []); setPriorities(d.priorities || []) }).catch(() => {})
  }, [])
  useEffect(() => { loadOverview(); loadOrgs() }, [loadOverview, loadOrgs])
  const refresh = () => { loadOverview(); loadOrgs() }
  const [doneFu, setDoneFu] = useState<Followup | null>(null)
  const followupDone = async (id: number, nextDate: string) => {
    await api.post(`fellow/followup/${id}/done`, { next_date: nextDate })
    setDoneFu(null)
    refresh()
  }
  const setTaskStatus = async (id: number, status: string) => { await api.put(`fellow/task/${id}`, { status }); loadOverview() }
  // Sample prospects: lets a new Fellow see the Pipeline / Calls / Performance
  // screens working before they have real prospects of their own.
  const demoLoaded = (overview?.demo_orgs || 0) > 0
  const toggleDemo = async () => {
    if (demoLoaded && !window.confirm('Remove the sample prospects? Your real prospects are not touched.')) return
    setDemoBusy(true)
    try { demoLoaded ? await api.del('fellow/demo-data') : await api.post('fellow/demo-data', {}); refresh() }
    catch { /* ignore */ } finally { setDemoBusy(false) }
  }
  const demoBtn = (
    <button className={`btn btn--sm fc-btn-i${demoLoaded ? '' : ' btn--solid'}`} onClick={toggleDemo} disabled={demoBusy}
      title={demoLoaded ? 'Delete the sample prospects' : 'Fill the CRM with 7 example companies so you can see how every screen works'}>
      <FcIcon name={demoLoaded ? 'trash' : 'sparkles'} size={15} />{demoBusy ? 'Working…' : demoLoaded ? 'Remove sample data' : 'Load sample data'}
    </button>
  )

  const filtered = orgs.filter((o) => !q.trim() || `${o.name} ${o.category || ''} ${o.industry || ''} ${o.location || ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  const sc = overview?.scorecard
  const scRow = (label: string, key: string, target: number) => {
    const val = sc?.counts?.[key] || 0
    const pct = target > 0 ? Math.min(100, Math.round((val / target) * 100)) : (val > 0 ? 100 : 0)
    return (
      <div key={label} className="fc-sc">
        <div className="fc-sc__top"><span>{label}</span><strong>{val}{target ? ` / ${target}` : ''}</strong></div>
        <div className="fc-sc__bar"><span style={{ width: pct + '%' }} /></div>
      </div>
    )
  }
  const today = new Date().toISOString().slice(0, 10)

  const pipelineValue = orgs.reduce((n, o) => n + (['not_interested', 'no_response', 'closed_lost'].includes(o.stage) ? 0 : (o.est_value || 0)), 0)
  const wonCount = orgs.filter((o) => o.stage === 'confirmed' || o.stage === 'paid').length

  return (
    <div className="fc-crm">
      <header className={`fc-head${controlled ? ' fc-head--bare' : ''}`}>
        {/* The host page already shows the section title when it drives the nav. */}
        {!controlled && (
          <div className="fc-head__title">
            <span className="fc-head__eyebrow">Student Fellow</span>
            <h2>Sponsorship CRM</h2>
            <p className="msub">Find local sponsors, track every conversation, and close the deal.</p>
          </div>
        )}
        <div className="fc-head__actions">
          <button className="btn btn--sm btn--solid fc-btn-i" onClick={() => setComposing({})}><FcIcon name="send" size={15} />Send Email</button>
          <button className="btn btn--sm fc-btn-i" onClick={() => setAdding(true)}><FcIcon name="plus" size={15} />Add Prospect</button>
        </div>
        <dl className="fc-kpis">
          <div><dt>Prospects</dt><dd>{orgs.length}</dd></div>
          <div><dt>Pipeline value</dt><dd>{money(pipelineValue)}</dd></div>
          <div><dt>Sponsors won</dt><dd>{wonCount}</dd></div>
          <div className={(overview?.followups_due || 0) > 0 ? 'is-alert' : ''}><dt>Follow-ups due</dt><dd>{overview?.followups_due || 0}</dd></div>
        </dl>
      </header>

      <FcWorkflow view={view} onGo={setView} />

      {!controlled && <nav className="fc-nav" aria-label="Sponsorship CRM sections">
        {TAB_GROUPS.map((g) => (
          <div className="fc-nav__group" key={g.label}>
            <span className="fc-nav__label">{g.label}</span>
            <div className="fc-nav__tabs" role="tablist">
              {g.views.map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} title={VIEW_META[v].tagline}
                  className={`fc-tab${view === v ? ' is-active' : ''}`} onClick={() => setView(v)}>
                  <FcIcon name={VIEW_META[v].icon} size={15} />
                  {VIEW_META[v].label}
                  {v === 'prospects' && orgs.length > 0 ? <em>{orgs.length}</em> : null}
                  {v === 'day' && (overview?.followups_due || 0) > 0 ? <em className="is-alert">{overview?.followups_due}</em> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>}

      <FcGuide view={view} />

      {view === 'day' && (
        <div className="fc-day">
          <section className="glass" style={{ padding: 18, borderRadius: 14 }}>
            <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 4 }}>How a sponsorship happens</h4>
            <p className="msub" style={{ margin: '0 0 12px', fontSize: 12.5 }}>Every company you add travels these six steps. Your job is to move them one step forward each day.</p>
            <ol className="fc-journey">
              {JOURNEY.map(([n, t]) => <li key={n}><span>{n}</span>{t}</li>)}
            </ol>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(201,168,76,.16)' }}>
              <p className="msub" style={{ margin: 0, fontSize: 12.5, flex: '1 1 240px' }}>
                {demoLoaded
                  ? 'Sample prospects are loaded — explore Pipeline, Call List and Performance, then remove them when you are ready for real work.'
                  : 'New here? Load 7 example companies to see how every screen works. You can delete them with one click.'}
              </p>
              {demoBtn}
            </div>
          </section>

          <section className="glass" style={{ padding: 18, borderRadius: 14 }}>
            <h3 className="gold-text" style={{ marginTop: 0, marginBottom: 4 }}>Today's Scorecard</h3>
            <p className="msub" style={{ margin: '0 0 14px', fontSize: 12.5 }}>Each bar fills up as you log work. Reaching the target number is a good day.</p>
            {!overview ? <FcSkeleton rows={3} height={40} /> : <div className="fc-sc-grid">
              {scRow('Organizations researched', 'research', sc?.targets?.orgs || 0)}
              {scRow('Emails sent', 'email', sc?.targets?.emails || 0)}
              {scRow('Calls made', 'call', sc?.targets?.calls || 0)}
              {scRow('LinkedIn outreach', 'linkedin', sc?.targets?.linkedin || 0)}
              {scRow('Follow-ups done', 'follow_up', sc?.targets?.follow_ups || 0)}
              {scRow('Meetings booked', 'meeting', 0)}
            </div>}
          </section>

          <div className="fc-day-cols">
            <section className="glass" style={{ padding: 18, borderRadius: 14 }}>
              <h4 className="gold-text" style={{ marginTop: 0 }}>Follow-ups Due <span className="msub">({overview?.followups_due || 0} due / overdue)</span></h4>
              {(overview?.followups || []).length === 0 ? <p className="msub">Nothing due — you are all caught up.</p> : (
                <ul className="fc-list">
                  {(overview?.followups || []).map((f) => (
                    <li key={f.id} className={f.due_date <= today ? 'is-due' : ''}>
                      <button type="button" onClick={() => setOpenId(f.org_id)}>{f.org_name}</button>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="msub">{f.due_date}{f.reason ? ` · ${f.reason}` : ''}</span>
                        <button type="button" className="btn btn--sm btn--solid" onClick={() => setDoneFu(f)}>Done</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="glass" style={{ padding: 18, borderRadius: 14 }}>
              <h4 className="gold-text" style={{ marginTop: 0 }}>My Tasks</h4>
              {(overview?.tasks || []).length === 0 ? <p className="msub">No open tasks.</p> : (
                <ul className="fc-list">
                  {(overview?.tasks || []).map((t) => (
                    <li key={t.id}>
                      <span>{t.title}<span className="msub" style={{ display: 'block', fontSize: 12 }}>{t.priority}{t.due_date ? ` · due ${t.due_date}` : ''}</span></span>
                      <select className="fc-input" style={{ width: 'auto', padding: '5px 8px' }} value={t.status} onChange={(e) => setTaskStatus(t.id, e.target.value)}>
                        {['not_started', 'in_progress', 'waiting', 'completed', 'needs_review'].map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {view === 'prospects' && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <input className="fc-input" style={{ flex: '1 1 220px' }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prospects…" />
            <button className="btn btn--sm fc-btn-i" onClick={() => setImporting(true)}><FcIcon name="upload" size={15} />Import list</button>
            <button className="btn btn--sm btn--solid fc-btn-i" onClick={() => setAdding(true)}><FcIcon name="plus" size={15} />Add Prospect</button>
          </div>
          {filtered.length === 0 ? (
            <div className="fc-empty">
              <span><FcIcon name={q.trim() ? 'search' : 'building'} size={34} /></span>
              <h4>{q.trim() ? 'No prospect matches that search' : 'No prospects yet — this is where you begin'}</h4>
              <p className="msub">{q.trim() ? 'Try a shorter word, or clear the search box.' : 'A "prospect" is any company that might sponsor the challenge — a local shop, a bank, a hospital, a restaurant chain. Add one and you can start tracking every call and email with it.'}</p>
              {!q.trim() && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn--solid fc-btn-i" onClick={() => setAdding(true)}><FcIcon name="plus" size={16} />Add your first prospect</button>
                  {demoBtn}
                </div>
              )}
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--stack">
                <thead><tr><th>Organization</th><th>Category</th><th>Priority</th><th>Stage</th><th>Value</th></tr></thead>
                <tbody>{filtered.map((o) => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
                    <td data-label="Organization"><strong>{o.name}</strong>{o.location ? <div className="msub" style={{ fontSize: 12 }}>{o.location}</div> : null}</td>
                    <td data-label="Category">{o.category || '—'}</td>
                    <td data-label="Priority" style={{ textTransform: 'capitalize' }}>{o.priority.replace('_', ' ')}</td>
                    <td data-label="Stage"><span className="fc-stage-pill" title={STAGE_HELP[o.stage] || ''}>{STAGE_LABEL(o.stage)}</span></td>
                    <td data-label="Value">{money(o.est_value)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'pipeline' && (orgs.length === 0 ? (
        <div className="fc-empty">
          <span><FcIcon name="funnel" size={34} /></span>
          <h4>Your pipeline is empty</h4>
          <p className="msub">You do not fill this in yourself — the pipeline builds itself from your prospects. Add a company under Prospects and a card appears in the stage it is in.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn--solid" onClick={() => setView('prospects')}>Go to Prospects →</button>
            {demoBtn}
          </div>
        </div>
      ) : (
        <div className="fc-pipeline">
          {stages.filter((s) => !['not_interested', 'no_response', 'closed_lost'].includes(s)).map((s) => {
            const col = orgs.filter((o) => o.stage === s)
            if (col.length === 0) return null
            const total = col.reduce((n, o) => n + (o.est_value || 0), 0)
            return (
              <div className="fc-col" key={s}>
                <div className="fc-col__head">{STAGE_LABEL(s)} <span className="msub">({col.length}{total ? ` · ${money(total)}` : ''})</span></div>
                {STAGE_HELP[s] ? <p className="fc-col__help">{STAGE_HELP[s]}</p> : null}
                {col.map((o) => (
                  <button key={o.id} type="button" className="fc-card" onClick={() => setOpenId(o.id)}>
                    <strong>{o.name}</strong>
                    <span className="msub">{o.category || o.industry || '—'}{o.est_value ? ` · ${money(o.est_value)}` : ''}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      ))}

      {view === 'calls' && <CallsView onLogged={refresh} onOpen={setOpenId} onProspects={() => setView('prospects')} demoBtn={demoBtn} />}
      {view === 'outreach' && <OutreachView onUse={(id) => setComposing({ tpl: id })} />}
      {view === 'academy' && <AcademyView />}
      {view === 'certification' && <CertificationView />}
      {view === 'performance' && <PerformanceView />}
      {view === 'materials' && <MaterialsView />}
      {view === 'report' && <ReportView />}

      {doneFu && <FollowupDone fu={doneFu} onClose={() => setDoneFu(null)} onDone={followupDone} />}
      {composing && <EmailComposer presetTpl={composing.tpl} onClose={() => setComposing(null)} onSent={() => { setComposing(null); refresh() }} onProspects={() => { setComposing(null); setView('prospects') }} />}
      {adding && <AddProspect priorities={priorities} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh() }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onSaved={() => { setImporting(false); refresh() }} />}
      {openId && <OrgDrawer id={openId} onClose={() => setOpenId(null)} onChange={refresh} />}
    </div>
  )
}

/* Marking a follow-up done always asks the one question that matters next:
   when do you chase them again? Quick picks beat typing a date by hand. */
function FollowupDone({ fu, onClose, onDone }: { fu: Followup; onClose: () => void; onDone: (id: number, next: string) => void }) {
  const plus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
  const QUICK: [string, number][] = [['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14], ['In a month', 30]]
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const go = (next: string) => { setBusy(true); onDone(fu.id, next) }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>Follow-up done</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 13 }}>
          Nice work on <strong style={{ color: '#f0ead6' }}>{fu.org_name}</strong>. When should you contact them again?
        </p>
        <p className="msub" style={{ fontSize: 12, margin: '10px 0 6px' }}>Most sponsors say yes on the second or third contact — pick a date, do not leave it to memory.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {QUICK.map(([label, d]) => (
            <button key={label} className="btn btn--sm btn--solid" disabled={busy} onClick={() => go(plus(d))}>{label}</button>
          ))}
        </div>
        <label className="fc-fld">Or pick a date
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="fc-input" type="date" value={custom} min={plus(0)} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn btn--sm" disabled={busy || !custom} onClick={() => go(custom)}>Set</button>
          </div>
        </label>
        <hr style={{ border: 0, borderTop: '1px solid rgba(201,168,76,.16)', margin: '14px 0' }} />
        <button className="btn btn--sm" disabled={busy} onClick={() => go('')} style={{ width: '100%' }}>
          No follow-up needed — close this one
        </button>
      </div>
    </div>
  )
}

interface CrmContact { id: number; name: string; title?: string; email: string; org_id: number; org_name: string; stage: string }

/* Standalone email composer: pick a saved contact from any of your prospects,
   drop in an approved template, personalize it, send, and set the follow-up —
   all without hunting for the company first. */
function EmailComposer({ presetTpl, onClose, onSent, onProspects }: { presetTpl?: number; onClose: () => void; onSent: () => void; onProspects: () => void }) {
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [to, setTo] = useState('')
  const [tpl, setTpl] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyTxt, setBodyTxt] = useState('')
  const [fu, setFu] = useState('')
  const [edited, setEdited] = useState(false) // has the Fellow typed into the draft?
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState('')

  useEffect(() => {
    Promise.all([
      api.get<{ contacts: CrmContact[] }>('fellow/contacts').then((d) => d.contacts || []).catch(() => []),
      api.get<{ templates: any[] }>('fellow/templates').then((d) => d.templates || []).catch(() => []),
    ]).then(([c, t]) => {
      setContacts(c)
      const usable = t.filter((x) => x.kind === 'email' || x.kind === 'follow_up' || x.kind === 'meeting')
      setTemplates(usable)
      // Arrived from "Use & send" on a script: load it now, personalize on pick.
      const pre = presetTpl && usable.find((x) => x.id === presetTpl)
      if (pre) { setTpl(String(pre.id)); setSubject(pre.subject || ''); setBodyTxt(pre.body || '') }
      setLoading(false)
    })
  }, [presetTpl])

  const chosen = contacts.find((c) => String(c.id) === to)
  // Fill in the name and company we already know so there is less to hand-edit.
  const personalize = (s: string, c?: CrmContact) => (s || '')
    .replace(/\[First name\]/g, (c?.name || '').split(' ')[0] || '[First name]')
    .replace(/\[Company\]/g, c?.org_name || '[Company]')
  const applyTemplate = (id: string, c = chosen) => {
    setTpl(id)
    const t = templates.find((x) => String(x.id) === id)
    if (!t) { setSubject(''); setBodyTxt(''); setEdited(false); return }
    setSubject(personalize(t.subject || '', c))
    setBodyTxt(personalize(t.body || '', c))
    setEdited(false)
  }
  const pickContact = (id: string) => {
    setTo(id)
    // Re-personalize the script for whoever they chose — but never clobber a
    // message the Fellow has already typed into.
    if (tpl && !edited) applyTemplate(tpl, contacts.find((c) => String(c.id) === id))
  }
  // Warn before sending something that still says "[Your name]".
  const leftover = Array.from(new Set(`${subject}\n${bodyTxt}`.match(/\[[^\]\n]{2,30}\]/g) || []))

  const send = async () => {
    if (!chosen) { setErr('Choose who you are writing to.'); return }
    if (!subject.trim() || !bodyTxt.trim()) { setErr('Add a subject and a message.'); return }
    if (leftover.length > 0 && !window.confirm(`These placeholders are still in your email:\n\n${leftover.join('  ')}\n\nSend anyway?`)) return
    setBusy(true); setErr('')
    try {
      const r = await api.post<{ message: string }>(`fellow/org/${chosen.org_id}/send-email`, { contact_id: chosen.id, subject, body: bodyTxt, follow_up_date: fu })
      setSent(r.message || 'Email sent.')
      setTimeout(onSent, 1200)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.') } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 660, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text fc-btn-i" style={{ marginBottom: 2 }}><FcIcon name="send" size={19} />Send an Email</h3>
        <p className="msub" style={{ marginTop: 0, fontSize: 12.5 }}>Sent from the program address on your behalf and logged to the company's timeline automatically.</p>

        {loading ? <FcSkeleton rows={4} height={44} /> : contacts.length === 0 ? (
          <div className="fc-empty" style={{ marginTop: 14 }}>
            <span><FcIcon name="contact" size={34} /></span>
            <h4>No contact has an email address yet</h4>
            <p className="msub">You can only email a saved contact — that keeps everything logged and protects the program. Open a prospect, add a contact person with their email, then come back.</p>
            <button className="btn btn--solid" onClick={onProspects}>Go to Prospects →</button>
          </div>
        ) : sent ? (
          <p style={{ color: '#6be29a', fontWeight: 700 }}>✓ {sent}</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            <label className="fc-fld">To
              <select className="fc-input" value={to} onChange={(e) => pickContact(e.target.value)}>
                <option value="" style={{ background: '#14120b' }}>Choose a contact…</option>
                {contacts.map((c) => <option key={c.id} value={c.id} style={{ background: '#14120b' }}>{c.org_name} — {c.name}{c.title ? ` (${c.title})` : ''}</option>)}
              </select>
            </label>
            {chosen && <p className="msub" style={{ margin: '-6px 0 0', fontSize: 12 }}>Sending to <strong style={{ color: '#f0ead6' }}>{chosen.email}</strong> · stage: {STAGE_LABEL(chosen.stage)}</p>}

            <label className="fc-fld">Start from an approved script <span style={{ textTransform: 'none', fontWeight: 400 }}>(recommended)</span>
              <select className="fc-input" value={tpl} disabled={!chosen}
                onChange={(e) => { if (edited && !window.confirm('Loading a script will replace what you have written. Continue?')) return; applyTemplate(e.target.value) }}>
                <option value="" style={{ background: '#14120b' }}>{chosen ? 'Write from scratch' : 'Choose a contact first…'}</option>
                {templates.map((t) => <option key={t.id} value={t.id} style={{ background: '#14120b' }}>{t.category ? `${t.category} — ` : ''}{t.name}</option>)}
              </select>
            </label>

            <label className="fc-fld">Subject<input className="fc-input" value={subject} onChange={(e) => { setSubject(e.target.value); setEdited(true) }} placeholder="Keep it short and specific" /></label>
            <label className="fc-fld">Message<textarea className="fc-input" rows={12} value={bodyTxt} onChange={(e) => { setBodyTxt(e.target.value); setEdited(true) }} placeholder="Your message — personalize every placeholder before sending." /></label>

            {leftover.length > 0 && (
              <div className="fc-dup">⚠ Still to fill in: {leftover.join('  ')}</div>
            )}
            <label className="fc-fld">Set your next follow-up <span style={{ textTransform: 'none', fontWeight: 400 }}>(strongly recommended)</span>
              <input className="fc-input" type="date" value={fu} onChange={(e) => setFu(e.target.value)} />
            </label>
            {err && <p className="msub" style={{ color: '#e08a8a', margin: 0 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn--solid" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send Email'}</button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AddProspect({ priorities, onClose, onSaved }: { priorities: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ name: '', website: '', industry: '', category: '', location: '', priority: 'unreviewed', est_value: '', fit_notes: '' })
  const [dup, setDup] = useState<{ name: string; fellow_name?: string } | null>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const checkDup = async () => {
    if (!f.name.trim()) return
    try { const d = await api.get<{ match: any }>(`fellow/orgs/check?name=${encodeURIComponent(f.name)}`); setDup(d.match) } catch { /* ignore */ }
  }
  const save = async () => {
    if (!f.name.trim()) { setErr('Organization name is required.'); return }
    setBusy(true); setErr('')
    try { await api.post('fellow/org', { ...f, est_value: Number(f.est_value) || 0 }); onSaved() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 4 }}>Add Prospect</h3>
        <p className="msub" style={{ fontSize: 12.5, margin: 0 }}>Only the name is required — you can fill in the rest later as you learn about them.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <label className="fc-fld">Organization name<input className="fc-input" value={f.name} onChange={(e) => { set('name', e.target.value); setDup(null) }} onBlur={checkDup} /></label>
          {dup && <div className="fc-dup">⚠ Already in the system{dup.fellow_name ? ` (assigned to ${dup.fellow_name})` : ''} — check before duplicating.</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="fc-fld" style={{ flex: 1 }}>Website<input className="fc-input" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></label>
            <label className="fc-fld" style={{ flex: 1 }}>Category<input className="fc-input" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Corporate Sponsor…" /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="fc-fld" style={{ flex: '1 1 170px' }}>Industry<input className="fc-input" value={f.industry} onChange={(e) => set('industry', e.target.value)} /></label>
            <label className="fc-fld" style={{ flex: '1 1 170px' }}>Location<input className="fc-input" value={f.location} onChange={(e) => set('location', e.target.value)} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label className="fc-fld" style={{ flex: '1 1 170px' }}>Priority<select className="fc-input" value={f.priority} onChange={(e) => set('priority', e.target.value)}>{priorities.map((p) => <option key={p} value={p} style={{ background: '#14120b' }}>{p.replace('_', ' ')}</option>)}</select></label>
            <label className="fc-fld" style={{ flex: '1 1 170px' }}>Est. value ($)<input className="fc-input" type="number" value={f.est_value} onChange={(e) => set('est_value', e.target.value)} placeholder="e.g. 5000" /></label>
          </div>
          <label className="fc-fld">Why a good fit?<textarea className="fc-input" rows={2} value={f.fit_notes} onChange={(e) => set('fit_notes', e.target.value)} /></label>
          {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
          <button className="btn btn--solid" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add Prospect'}</button>
        </div>
      </div>
    </div>
  )
}

function OrgDrawer({ id, onClose, onChange }: { id: number; onClose: () => void; onChange: () => void }) {
  const [data, setData] = useState<{ org: Org; contacts: Contact[]; timeline: Activity[]; followups: Followup[]; stages: string[]; proposals?: any[]; meetings?: any[]; proposal_statuses?: string[]; meeting_types?: string[] } | null>(null)
  const [logType, setLogType] = useState('email'); const [logDetail, setLogDetail] = useState(''); const [logFu, setLogFu] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [showEmail, setShowEmail] = useState(false); const [em, setEm] = useState<Record<string, string>>({ contact_id: '', subject: '', body: '', follow_up_date: '' }); const [emMsg, setEmMsg] = useState(''); const [emBusy, setEmBusy] = useState(false)
  const [showProp, setShowProp] = useState(false); const [prop, setProp] = useState<Record<string, string>>({ amount: '', level: '', notes: '', status: 'submitted' })
  const [showMtg, setShowMtg] = useState(false); const [mtg, setMtg] = useState<Record<string, string>>({ meeting_at: '', type: 'zoom', purpose: '', notes: '', outcome: '', next_steps: '' })
  const load = useCallback(() => { api.get<any>(`fellow/org/${id}`).then(setData).catch(() => {}) }, [id])
  useEffect(() => { load() }, [load])
  if (!data) return <div className="modal-overlay open" onClick={onClose}><div className="modal" style={{ maxWidth: 720 }}><FcSkeleton rows={5} height={52} /></div></div>
  const o = data.org
  const changeStage = async (stage: string) => { await api.put(`fellow/org/${id}/stage`, { stage }); load(); onChange() }
  const logActivity = async () => {
    await api.post(`fellow/org/${id}/activity`, { type: logType, detail: logDetail, follow_up_date: logFu })
    setLogDetail(''); setLogFu(''); load(); onChange()
  }
  const sendEmail = async () => {
    if (!em.contact_id || !em.subject.trim() || !em.body.trim()) { setEmMsg('Pick a contact and fill subject + message.'); return }
    setEmBusy(true); setEmMsg('')
    try { const r = await api.post<{ message: string }>(`fellow/org/${id}/send-email`, em); setEmMsg(r.message || 'Sent.'); setEm({ contact_id: '', subject: '', body: '', follow_up_date: '' }); setShowEmail(false); load(); onChange() }
    catch (e) { setEmMsg(e instanceof Error ? e.message : 'Could not send.') } finally { setEmBusy(false) }
  }
  const addProposal = async () => { await api.post(`fellow/org/${id}/proposal`, { ...prop, amount: Number(prop.amount) || 0 }); setShowProp(false); setProp({ amount: '', level: '', notes: '', status: 'submitted' }); load(); onChange() }
  const addMeeting = async () => { await api.post(`fellow/org/${id}/meeting`, mtg); setShowMtg(false); setMtg({ meeting_at: '', type: 'zoom', purpose: '', notes: '', outcome: '', next_steps: '' }); load(); onChange() }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text" style={{ marginBottom: 2 }}>{o.name}</h3>
        <p className="msub" style={{ marginTop: 0 }}>{[o.category, o.industry, o.location].filter(Boolean).join(' · ') || '—'}{o.website ? <> · <a href={o.website} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>website ↗</a></> : null}</p>

        {/* How far along this company is, and the one control that moves it. */}
        <div className="fc-progress">
          <div className="fc-progress__bar"><span style={{ width: stagePct(o.stage) + '%' }} /></div>
          <div className="fc-progress__meta">
            <span>{stagePct(o.stage)}% of the way — <strong>{STAGE_LABEL(o.stage)}</strong></span>
            <span className="msub">{STAGE_HELP[o.stage] || ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', margin: '12px 0' }}>
          <label className="fc-fld" style={{ flex: '1 1 210px' }}>Move to stage
            <select className="fc-input" value={o.stage} onChange={(e) => changeStage(e.target.value)}>{data.stages.map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{STAGE_LABEL(s)}</option>)}</select>
          </label>
          <span className="fc-stage-pill">{money(o.est_value)}</span>
          <button className="btn btn--sm btn--solid fc-btn-i" onClick={() => setShowEmail(true)}><FcIcon name="send" size={15} />Send Email</button>
        </div>

        {/* Quick log */}
        <section className="glass" style={{ padding: 14, borderRadius: 12, marginBottom: 14 }}>
          <h4 className="gold-text" style={{ marginTop: 0, fontSize: 15 }}>Log activity</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {ACTIVITY_QUICK.map(([t, label, ic]) => (
              <button key={t} type="button" className={`btn btn--sm fc-btn-i${logType === t ? ' btn--solid' : ''}`} onClick={() => setLogType(t)}><FcIcon name={ic} size={15} />{label}</button>
            ))}
          </div>
          <input className="fc-input" value={logDetail} onChange={(e) => setLogDetail(e.target.value)} placeholder="Note / detail (optional)" style={{ marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="msub" style={{ fontSize: 12 }}>Next follow-up: <input className="fc-input" type="date" value={logFu} onChange={(e) => setLogFu(e.target.value)} style={{ width: 'auto' }} /></label>
            <button className="btn btn--sm btn--solid" onClick={logActivity}>Save to timeline</button>
          </div>
        </section>

        {/* Send email */}
        <section className="glass" style={{ padding: 14, borderRadius: 12, marginBottom: 14 }}>
          <h4 className="gold-text" style={{ marginTop: 0, fontSize: 15, display: 'flex', justifyContent: 'space-between' }}><span className="fc-btn-i"><FcIcon name="mail" size={16} />Send Email</span> <button type="button" className="btn btn--sm" onClick={() => setShowEmail((v) => !v)}>{showEmail ? 'Close' : 'Compose'}</button></h4>
          {showEmail && (
            <div style={{ display: 'grid', gap: 8 }}>
              <select className="fc-input" value={em.contact_id} onChange={(e) => setEm({ ...em, contact_id: e.target.value })}>
                <option value="" style={{ background: '#14120b' }}>To… (contact with an email)</option>
                {(data.contacts || []).filter((c) => c.email).map((c) => <option key={c.id} value={c.id} style={{ background: '#14120b' }}>{c.name} — {c.email}</option>)}
              </select>
              <input className="fc-input" placeholder="Subject" value={em.subject} onChange={(e) => setEm({ ...em, subject: e.target.value })} />
              <textarea className="fc-input" rows={5} placeholder="Your message (personalize it)…" value={em.body} onChange={(e) => setEm({ ...em, body: e.target.value })} />
              <label className="msub" style={{ fontSize: 12 }}>Next follow-up: <input className="fc-input" style={{ width: 'auto' }} type="date" value={em.follow_up_date} onChange={(e) => setEm({ ...em, follow_up_date: e.target.value })} /></label>
              <button className="btn btn--sm btn--solid" onClick={sendEmail} disabled={emBusy}>{emBusy ? 'Sending…' : 'Send Email'}</button>
              <p className="msub" style={{ fontSize: 11 }}>Sent from the program address on your behalf; logged to the timeline.</p>
            </div>
          )}
          {emMsg && <p className="msub" style={{ color: emMsg.toLowerCase().includes('sent') ? '#6be29a' : '#e08a8a', marginTop: 8 }}>{emMsg}</p>}
        </section>

        <div className="fc-drawer-cols">
          {/* Contacts */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Contacts <button type="button" className="btn btn--sm" onClick={() => setAddingContact((v) => !v)} aria-label="Add contact"><FcIcon name="plus" size={14} /></button></h4>
            {addingContact && <ContactForm orgId={id} onSaved={() => { setAddingContact(false); load(); onChange() }} />}
            {data.contacts.length === 0 ? <p className="msub">No contacts yet.</p> : data.contacts.map((c) => (
              <div key={c.id} className="fc-contact">
                <strong>{c.name}</strong>{c.title ? <span className="msub"> · {c.title}</span> : null}
                <div className="msub" style={{ fontSize: 12 }}>{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </section>
          {/* Timeline */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Timeline</h4>
            {data.timeline.length === 0 ? <p className="msub">No activity yet.</p> : (
              <ul className="fc-timeline">
                {data.timeline.map((a, i) => (
                  <li key={i}><span className="fc-timeline__t">{a.created_at?.slice(0, 16).replace('T', ' ')}</span><span>{STAGE_LABEL(a.type)}{a.detail ? ` — ${a.detail}` : ''}</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="fc-drawer-cols" style={{ marginTop: 14 }}>
          {/* Proposals */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Proposals <button type="button" className="btn btn--sm" onClick={() => setShowProp((v) => !v)} aria-label="Add proposal"><FcIcon name="plus" size={14} /></button></h4>
            {showProp && (
              <div style={{ display: 'grid', gap: 6, margin: '6px 0 10px' }}>
                <input className="fc-input" type="number" placeholder="Amount ($)" value={prop.amount} onChange={(e) => setProp({ ...prop, amount: e.target.value })} />
                <input className="fc-input" placeholder="Level (e.g. Gold)" value={prop.level} onChange={(e) => setProp({ ...prop, level: e.target.value })} />
                <select className="fc-input" value={prop.status} onChange={(e) => setProp({ ...prop, status: e.target.value })}>{(data.proposal_statuses || ['draft', 'submitted']).filter((s) => s !== 'approved').map((s) => <option key={s} value={s} style={{ background: '#14120b' }}>{STAGE_LABEL(s)}</option>)}</select>
                <button className="btn btn--sm btn--solid" onClick={addProposal}>Save proposal</button>
              </div>
            )}
            {(data.proposals || []).length === 0 ? <p className="msub">None yet.</p> : (data.proposals || []).map((p: any) => (
              <div key={p.id} className="fc-contact"><strong>{money(p.amount)}</strong> {p.level ? <span className="msub">· {p.level}</span> : null}<div><span className="fc-stage-pill">{STAGE_LABEL(p.status)}</span>{p.admin_note ? <span className="msub" style={{ fontSize: 12 }}> — {p.admin_note}</span> : null}</div></div>
            ))}
          </section>
          {/* Meetings */}
          <section>
            <h4 className="gold-text" style={{ fontSize: 15 }}>Meetings <button type="button" className="btn btn--sm" onClick={() => setShowMtg((v) => !v)} aria-label="Add meeting"><FcIcon name="plus" size={14} /></button></h4>
            {showMtg && (
              <div style={{ display: 'grid', gap: 6, margin: '6px 0 10px' }}>
                <input className="fc-input" type="datetime-local" value={mtg.meeting_at} onChange={(e) => setMtg({ ...mtg, meeting_at: e.target.value })} />
                <select className="fc-input" value={mtg.type} onChange={(e) => setMtg({ ...mtg, type: e.target.value })}>{(data.meeting_types || ['phone', 'zoom', 'meet', 'in_person']).map((t) => <option key={t} value={t} style={{ background: '#14120b' }}>{STAGE_LABEL(t)}</option>)}</select>
                <input className="fc-input" placeholder="Purpose" value={mtg.purpose} onChange={(e) => setMtg({ ...mtg, purpose: e.target.value })} />
                <input className="fc-input" placeholder="Outcome / next steps" value={mtg.next_steps} onChange={(e) => setMtg({ ...mtg, next_steps: e.target.value })} />
                <button className="btn btn--sm btn--solid" onClick={addMeeting}>Save meeting</button>
              </div>
            )}
            {(data.meetings || []).length === 0 ? <p className="msub">None yet.</p> : (data.meetings || []).map((mt: any) => (
              <div key={mt.id} className="fc-contact"><strong>{STAGE_LABEL(mt.type)}</strong> {mt.meeting_at ? <span className="msub">· {String(mt.meeting_at).slice(0, 16).replace('T', ' ')}</span> : null}{mt.purpose ? <div className="msub" style={{ fontSize: 12 }}>{mt.purpose}</div> : null}</div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}

const PERF_ROWS: [string, string][] = [['research', 'Organizations'], ['contact', 'Contacts'], ['email', 'Emails'], ['call', 'Calls'], ['linkedin', 'LinkedIn'], ['follow_up', 'Follow-ups'], ['meeting', 'Meetings'], ['proposal', 'Proposals']]
const CALL_OUTCOMES = ['no_answer', 'voicemail', 'receptionist', 'reached', 'interested', 'callback', 'meeting', 'not_interested', 'wrong_contact']
function CallsView({ onLogged, onOpen, onProspects, demoBtn }: { onLogged: () => void; onOpen: (id: number) => void; onProspects: () => void; demoBtn: React.ReactNode }) {
  const [calls, setCalls] = useState<any[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [oc, setOc] = useState('reached'); const [note, setNote] = useState(''); const [fu, setFu] = useState('')
  const load = useCallback(() => { api.get<{ calls: any[] }>('fellow/call-list').then((d) => setCalls(d.calls || [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const logCall = async (orgId: number) => {
    await api.post(`fellow/org/${orgId}/activity`, { type: 'call', detail: oc.replace('_', ' ') + (note ? ` — ${note}` : ''), follow_up_date: fu })
    setActive(null); setNote(''); setFu(''); setOc('reached'); load(); onLogged()
  }
  if (calls.length === 0) return (
    <div className="fc-empty">
      <span><FcIcon name="phone" size={34} /></span>
      <h4>Nobody to call yet</h4>
      <p className="msub">This list is built automatically: open any prospect, add a contact person <strong>with a phone number</strong>, and they appear here with the date you last spoke to them.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn--solid" onClick={onProspects}>Go to Prospects →</button>
        {demoBtn}
      </div>
    </div>
  )
  return (
    <div className="admin-table-wrap">
      <table className="admin-table admin-table--stack">
        <thead><tr><th>Organization</th><th>Contact</th><th>Phone</th><th>Last call</th><th></th></tr></thead>
        <tbody>{calls.map((c) => (
          <tr key={c.id}>
            <td data-label="Organization"><button type="button" className="fc-link" onClick={() => onOpen(c.id)}>{c.name}</button></td>
            <td data-label="Contact">{c.contact_name || '—'}</td><td data-label="Phone">{c.phone || '—'}</td>
            <td data-label="Last call" className="msub">{c.last_call ? String(c.last_call).slice(0, 10) : 'never'}</td>
            <td onClick={(e) => e.stopPropagation()}>
              {active === c.id ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select className="fc-input" style={{ width: 'auto' }} value={oc} onChange={(e) => setOc(e.target.value)}>{CALL_OUTCOMES.map((o) => <option key={o} value={o} style={{ background: '#14120b' }}>{o.replace('_', ' ')}</option>)}</select>
                  <input className="fc-input" style={{ width: 120 }} placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} />
                  <input className="fc-input" style={{ width: 'auto' }} type="date" value={fu} onChange={(e) => setFu(e.target.value)} title="Next follow-up" />
                  <button className="btn btn--sm btn--solid" onClick={() => logCall(c.id)}>Save</button>
                </div>
              ) : <button className="btn btn--sm" onClick={() => setActive(c.id)}>Log call</button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

const CERT_COLOR: Record<string, string> = { Certified: '#6be29a', 'Needs Retraining': '#e08a5c', Training: '#a9a396' }
function CertificationView() {
  const [data, setData] = useState<{ questions: any[]; cert: any } | null>(null)
  const [taking, setTaking] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<any>(null)
  const load = useCallback(() => { api.get<any>('fellow/quiz').then(setData).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  if (!data) return <FcSkeleton rows={4} height={60} />
  const submit = async () => {
    const r = await api.post<any>('fellow/quiz/submit', { answers })
    setResult(r); setTaking(false); load()
  }
  const cert = data.cert || {}
  return (
    <div style={{ maxWidth: 720 }}>
      <section className="glass" style={{ padding: 18, borderRadius: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="msub" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>Certification status</div>
          <strong style={{ fontSize: 22, color: CERT_COLOR[cert.status] || '#f0ead6' }}>{cert.status || 'Training'}</strong>
          <div className="msub" style={{ fontSize: 12 }}>Best score: {cert.best || 0}% · Pass mark: {cert.pass || 80}% · Attempts: {cert.attempts || 0}</div>
        </div>
        {cert.status !== 'Certified' && data.questions.length > 0 && <button className="btn btn--solid" onClick={() => { setTaking(true); setResult(null); setAnswers({}) }}>{cert.attempts > 0 ? 'Retake Exam' : 'Take Exam'}</button>}
      </section>

      {result && (
        <div className="glass" style={{ padding: 16, borderRadius: 12, marginBottom: 14, borderColor: result.passed ? '#3fbf7f' : '#e08a5c' }}>
          <strong style={{ color: result.passed ? '#6be29a' : '#e08a5c', fontSize: 18 }}>{result.passed ? 'Passed!' : 'Not passed yet'}</strong>
          <p className="msub">You scored {result.score}% ({result.correct}/{result.total}). {result.passed ? 'You are now certified.' : `You need ${data.cert.pass}% — review the Training Academy and retake.`}</p>
        </div>
      )}

      {taking ? (
        data.questions.length === 0 ? <p className="msub">No exam questions are set up yet.</p> : (
          <div style={{ display: 'grid', gap: 14 }}>
            {data.questions.map((q, i) => (
              <div key={q.id} className="glass" style={{ padding: 14, borderRadius: 12 }}>
                <strong>{i + 1}. {q.question}</strong>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {q.options.map((opt: string, oi: number) => (
                    <label key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name={`q${q.id}`} checked={answers[q.id] === oi} onChange={() => setAnswers({ ...answers, [q.id]: oi })} /> {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn btn--solid" onClick={submit} disabled={Object.keys(answers).length < data.questions.length} style={{ justifySelf: 'start' }}>Submit Exam ({Object.keys(answers).length}/{data.questions.length})</button>
          </div>
        )
      ) : !result && (
        <p className="msub">Complete the Training Academy, then take the certification exam. You need {cert.pass || 80}% to certify.</p>
      )}
    </div>
  )
}

function AcademyView() {
  const [mods, setMods] = useState<any[]>([]); const [done, setDone] = useState<number[]>([])
  const load = useCallback(() => { api.get<{ modules: any[]; completed: number[] }>('fellow/modules').then((d) => { setMods(d.modules || []); setDone(d.completed || []) }).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  const toggle = async (id: number, next: boolean) => { setDone((p) => next ? [...p, id] : p.filter((x) => x !== id)); await api.post(`fellow/module/${id}/complete`, { done: next }) }
  if (mods.length === 0) return <p className="msub">Training modules are being prepared.</p>
  const trainable = mods.filter((m) => m.category === 'Training & Playbooks' || m.category === 'Certification')
  const pct = trainable.length ? Math.round((trainable.filter((m) => done.includes(m.id)).length / trainable.length) * 100) : 0
  const cats = Array.from(new Set(mods.map((m) => m.category)))
  return (
    <div>
      <section className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 16 }}>
        <div className="fc-sc__top"><span>Training progress</span><strong>{trainable.filter((m) => done.includes(m.id)).length} / {trainable.length} · {pct}%</strong></div>
        <div className="fc-sc__bar"><span style={{ width: pct + '%' }} /></div>
      </section>
      {cats.map((cat) => (
        <section key={cat} style={{ marginBottom: 18 }}>
          <h4 className="gold-text">{cat} <span className="msub">({mods.filter((m) => m.category === cat).length})</span></h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {mods.filter((m) => m.category === cat).map((m) => (
              <div key={m.id} className="glass" style={{ padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={done.includes(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} />
                  <span style={{ textDecoration: done.includes(m.id) ? 'line-through' : 'none', opacity: done.includes(m.id) ? 0.7 : 1 }}>{m.title}</span>
                </label>
                {m.doc_url && <a className="btn btn--sm" href={m.doc_url} target="_blank" rel="noreferrer">Open ↗</a>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function OutreachView({ onUse }: { onUse: (templateId: number) => void }) {
  const [templates, setTemplates] = useState<any[]>([])
  const [copied, setCopied] = useState<number | null>(null)
  useEffect(() => { api.get<{ templates: any[] }>('fellow/templates').then((d) => setTemplates(d.templates || [])).catch(() => {}) }, [])
  if (templates.length === 0) return (
    <div className="fc-empty">
      <span><FcIcon name="mail" size={34} /></span>
      <h4>No scripts loaded yet</h4>
      <p className="msub">The program ships with ready-made email, phone and LinkedIn scripts. If this list is empty, an admin has removed them — ask your manager to restore the outreach templates.</p>
    </div>
  )
  const kinds = Array.from(new Set(templates.map((t) => t.kind)))
  const copy = (t: any) => { navigator.clipboard?.writeText(`${t.subject ? `Subject: ${t.subject}\n\n` : ''}${t.body || ''}`).then(() => { setCopied(t.id); setTimeout(() => setCopied(null), 1500) }).catch(() => {}) }
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <p className="msub">Approved scripts. Copy, personalize for the contact, send, then log it from the prospect's page ("Log activity → Email").</p>
      {kinds.map((k) => (
        <section key={k}>
          <h4 className="gold-text" style={{ textTransform: 'capitalize' }}>{STAGE_LABEL(k)} templates</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            {templates.filter((t) => t.kind === k).map((t) => (
              <div key={t.id} className="glass" style={{ padding: 14, borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{t.name}</strong>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {(t.kind === 'email' || t.kind === 'follow_up' || t.kind === 'meeting') && (
                      <button className="btn btn--sm btn--solid fc-btn-i" onClick={() => onUse(t.id)}><FcIcon name="send" size={14} />Use &amp; send</button>
                    )}
                    <button className="btn btn--sm" onClick={() => copy(t)}>{copied === t.id ? 'Copied ✓' : 'Copy'}</button>
                  </span>
                </div>
                {t.subject && <div className="msub" style={{ fontSize: 12, margin: '4px 0' }}>Subject: {t.subject}</div>}
                {t.body && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: '#cfc9ba', margin: '6px 0 0', maxHeight: 160, overflow: 'auto' }}>{t.body}</pre>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function PerformanceView() {
  const [p, setP] = useState<any>(null)
  useEffect(() => { api.get<{ performance: any }>('fellow/crm/performance').then((d) => setP(d.performance)).catch(() => {}) }, [])
  if (!p) return <FcSkeleton rows={4} height={60} />
  const cols: [string, string][] = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']]
  return (
    <div>
      <div className="fc-sc-grid" style={{ marginBottom: 16 }}>
        <div className="glass" style={{ padding: '14px 16px', borderRadius: 12 }}><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Total Prospects</div><strong className="gold-text" style={{ fontSize: 24, fontFamily: 'var(--f-serif)' }}>{p.orgs}</strong></div>
        <div className="glass" style={{ padding: '14px 16px', borderRadius: 12 }}><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Pipeline Value</div><strong className="gold-text" style={{ fontSize: 24, fontFamily: 'var(--f-serif)' }}>{money(p.pipeline)}</strong></div>
        <div className="glass" style={{ padding: '14px 16px', borderRadius: 12 }}><div className="msub" style={{ fontSize: 11, textTransform: 'uppercase' }}>Sponsorships Won</div><strong className="gold-text" style={{ fontSize: 24, fontFamily: 'var(--f-serif)' }}>{p.won}</strong></div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-table--stack">
          <thead><tr><th>Activity</th>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{PERF_ROWS.map(([k, lbl]) => (
            <tr key={k}><td data-label="Activity">{lbl}</td>{cols.map(([c, l]) => <td key={c} data-label={l}>{p[c]?.[k] || 0}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function MaterialsView() {
  const [items, setItems] = useState<{ id: number; category: string; title: string; description?: string; url?: string }[]>([])
  useEffect(() => { api.get<{ materials: any[] }>('fellow/materials').then((d) => setItems(d.materials || [])).catch(() => {}) }, [])
  if (items.length === 0) return (
    <div className="fc-empty">
      <span><FcIcon name="folder" size={34} /></span>
      <h4>No materials added yet</h4>
      <p className="msub">Your manager uploads the approved sponsor deck, one-pager and prospectus here. Until they appear, do not create your own — ask an admin to add them.</p>
      <p className="msub" style={{ fontSize: 12.5 }}>Meanwhile, the <strong>Training Academy</strong> tab has all the program documents you can read.</p>
    </div>
  )
  const cats = Array.from(new Set(items.map((m) => m.category)))
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {cats.map((cat) => (
        <section key={cat}>
          <h4 className="gold-text">{cat}</h4>
          <div className="fc-sc-grid">
            {items.filter((m) => m.category === cat).map((m) => (
              <div key={m.id} className="glass" style={{ padding: 14, borderRadius: 12 }}>
                <strong>{m.title}</strong>
                {m.description && <p className="msub" style={{ fontSize: 12, margin: '4px 0' }}>{m.description}</p>}
                {m.url && <a className="btn btn--sm" href={m.url} target="_blank" rel="noreferrer" style={{ marginTop: 6 }}>View / Download ↗</a>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const REPORT_FIELDS: [string, string, string][] = [
  ['wins', 'What went well today?', 'e.g. Riverside Bank agreed to a call on Thursday.'],
  ['challenges', 'What was difficult or got stuck?', 'e.g. Three companies had no contact name on their website.'],
  ['help_needed', 'What help do you need from management?', 'e.g. Can someone approve my proposal for Northside Medical?'],
  ['plan', 'What is your plan for tomorrow?', 'e.g. Call the five stores on my list and send two follow-ups.'],
]

function ReportView() {
  const [f, setF] = useState<Record<string, string>>({ wins: '', challenges: '', help_needed: '', plan: '' })
  const [nums, setNums] = useState<Record<string, number>>({})
  const [past, setPast] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const load = useCallback(() => {
    api.get<{ today_numbers: Record<string, number>; reports: any[] }>('fellow/reports').then((d) => {
      setNums(d.today_numbers || {})
      const rows = d.reports || []
      setPast(rows)
      // Already reported today? Load it so the Fellow edits instead of retyping.
      const today = new Date().toISOString().slice(0, 10)
      const mine = rows.find((r) => String(r.report_date).slice(0, 10) === today)
      if (mine) setF({ wins: mine.wins || '', challenges: mine.challenges || '', help_needed: mine.help_needed || '', plan: mine.plan || '' })
    }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const submit = async () => { await api.post('fellow/report', f); setMsg('Saved. Your manager can see it now. ✓'); load() }
  const today = new Date().toISOString().slice(0, 10)
  const sentToday = past.some((r) => String(r.report_date).slice(0, 10) === today)
  return (
    <div className="fc-day-cols">
      <div>
        <section className="glass" style={{ padding: 16, borderRadius: 12, marginBottom: 14 }}>
          <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 4 }}>Today's numbers</h4>
          <p className="msub" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Counted automatically from what you logged — you never type these.</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {PERF_ROWS.map(([k, lbl]) => <span key={k} className="msub"><strong style={{ color: '#f0ead6' }}>{nums[k] || 0}</strong> {lbl}</span>)}
          </div>
        </section>
        {sentToday && <p className="msub" style={{ color: '#6be29a', marginTop: 0 }}>✓ You already reported today — edit below and save again if anything changed.</p>}
        {REPORT_FIELDS.map(([k, label, hint]) => (
          <label key={k} className="fc-fld" style={{ marginBottom: 12, display: 'block' }}>{label}
            <textarea className="fc-input" rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={hint} /></label>
        ))}
        {msg && <p className="msub" style={{ color: '#6be29a' }}>{msg}</p>}
        <button className="btn btn--solid" onClick={submit}>{sentToday ? 'Update today\'s report' : 'Submit End-of-Day Report'}</button>
      </div>
      <section className="glass" style={{ padding: 16, borderRadius: 12, alignSelf: 'start' }}>
        <h4 className="gold-text" style={{ marginTop: 0, marginBottom: 4 }}>Your recent reports</h4>
        {past.length === 0 ? (
          <p className="msub" style={{ fontSize: 13 }}>Nothing here yet. Once you submit your first report it is kept so you and your manager can look back at the week.</p>
        ) : (
          <ul className="fc-timeline" style={{ maxHeight: 460, overflowY: 'auto' }}>
            {past.map((r) => (
              <li key={r.report_date}>
                <span className="fc-timeline__t">{String(r.report_date).slice(0, 10)}</span>
                {r.wins ? <span><strong>Went well:</strong> {r.wins}</span> : null}
                {r.challenges ? <span className="msub">Stuck: {r.challenges}</span> : null}
                {r.plan ? <span className="msub">Next: {r.plan}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(''); const [cat, setCat] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const run = async () => {
    const rows = text.split('\n').map((l) => l.trim()).filter(Boolean).map((name) => ({ name }))
    if (rows.length === 0) { setMsg('Paste at least one organization name.'); return }
    setBusy(true)
    try { const d = await api.post<{ imported: number }>('fellow/orgs/import', { rows, category: cat }); setMsg(`Imported ${d.imported}. Duplicates were skipped.`); setTimeout(onSaved, 800) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Import failed.') } finally { setBusy(false) }
  }
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="gold-text">Import Prospects</h3>
        <p className="msub">Paste organization names — one per line (e.g. from a target list). Duplicates are skipped automatically.</p>
        <label className="fc-fld" style={{ display: 'block', margin: '10px 0' }}>Category (optional)<input className="fc-input" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Corporate Sponsor…" /></label>
        <textarea className="fc-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Royal Caribbean\nCarnival Cruise Line\nBrunswick Corporation'} />
        {msg && <p className="msub" style={{ color: msg.startsWith('Imported') ? '#6be29a' : '#e08a8a', marginTop: 8 }}>{msg}</p>}
        <button className="btn btn--solid" onClick={run} disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Importing…' : 'Import'}</button>
      </div>
    </div>
  )
}

function ContactForm({ orgId, onSaved }: { orgId: number; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ name: '', title: '', email: '', phone: '', linkedin: '' })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'grid', gap: 6, margin: '6px 0 10px' }}>
      <input className="fc-input" placeholder="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
      <input className="fc-input" placeholder="Title" value={f.title} onChange={(e) => set('title', e.target.value)} />
      <input className="fc-input" placeholder="Email" value={f.email} onChange={(e) => set('email', e.target.value)} />
      <input className="fc-input" placeholder="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
      <button className="btn btn--sm btn--solid" onClick={async () => { if (!f.name.trim()) return; await api.post(`fellow/org/${orgId}/contact`, f); onSaved() }}>Save contact</button>
    </div>
  )
}
