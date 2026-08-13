import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import SheetImport from '../components/SheetImport'
import FellowCrm, { VIEW_META, type ViewKey } from '../components/FellowCrm'
import FcIcon, { type IconName } from '../components/FcIcon'
import SchoolVerification from '../components/SchoolVerification'
import TaskWorkspace from '../components/TaskWorkspace'
import ProfileSection from '../components/profile/ProfileSection'
import AnnouncementsFeed, { useAnnouncementBadge } from '../components/AnnouncementsFeed'
import NotificationBell from '../components/NotificationBell'
import { EcoMessages, Section } from './portal/EcosystemPortal'
import {
  RESEARCH_CATEGORIES, EMPTY_ENTRY_FORM,
  type ResearchCategory, type ResearchEntry, type CategoryConfig,
} from '../lib/fellowFields'

const WRAP_S: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 clamp(14px,4vw,24px) 60px', fontFamily: 'var(--f-body)' }
const cardS: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 'clamp(16px,3vw,22px)', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }
const inputS: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', color: 'var(--ivory)', fontSize: 14 }
const labelS: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', margin: '0 0 5px' }

interface Assignment {
  id: number; title: string; detail: string; assign_date: string | null
  status: string; volunteer_note: string; created_ts: number; responded_ts: number
}
/* One flat navigation instead of tabs-inside-tabs: the CRM's ten sections are
   addressed directly as `crm:<view>` so every destination is one click away. */
type TabKey = 'overview' | 'profile' | 'announcements' | 'messages' | 'school-verify' | 'tasks' | ResearchCategory | `crm:${ViewKey}`
type EntryForm = typeof EMPTY_ENTRY_FORM

interface NavItem { key: TabKey; label: string; icon: IconName; hint?: string; alert?: boolean }

/* Group accent colours + glyphs, mirroring the admin Command Center sidebar. */
const GROUP_META: Record<string, { color: string; path: string }> = {
  'Start here':    { color: '#d4af37', path: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z' },
  'Find sponsors': { color: '#3fbf7f', path: 'M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1' },
  'Learn':         { color: '#4a90e2', path: 'M22 9L12 5 2 9l10 4 10-4zM6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5' },
  'Track':         { color: '#2fb3c0', path: 'M3 20V4M3 20h18M7 15l3.5-4 3 2.5L20 7' },
  'Research':      { color: '#a06cd5', path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  'Account':       { color: '#e0785c', path: 'M3 5h18v14H3zM3 6l9 7 9-7' },
}
function GroupGlyph({ group }: { group: string }) {
  const m = GROUP_META[group]
  if (!m) return null
  return <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke={m.color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={m.path} /></svg>
}

const RESEARCH_ICON: Partial<Record<ResearchCategory, IconName>> = {
  school_contact: 'building', partner_prospect: 'contact', funder: 'award',
  content_creator: 'sparkles', research_note: 'file',
}

const crmItem = (v: ViewKey, alert = false): NavItem =>
  ({ key: `crm:${v}`, label: VIEW_META[v].label, icon: VIEW_META[v].icon, hint: VIEW_META[v].tagline, alert })

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Start here', items: [
    { key: 'overview', label: 'Overview', icon: 'trending', hint: 'Your research progress and the tasks your admin assigned.' },
    crmItem('day', true),
  ] },
  { label: 'Find sponsors', items: [crmItem('prospects'), crmItem('pipeline'), crmItem('calls'), crmItem('outreach')] },
  { label: 'Learn', items: [crmItem('academy'), crmItem('certification'), crmItem('materials')] },
  { label: 'Track', items: [crmItem('performance'), crmItem('report')] },
  { label: 'My work', items: [
    { key: 'tasks', label: 'My Tasks', icon: 'clipboard', hint: 'Work your manager assigned you — accept it, do it, hand it in, and talk to them on each task.', alert: true },
  ] },
  { label: 'Schools', items: [
    { key: 'school-verify', label: 'Verify Schools', icon: 'building', hint: 'The master school list — confirm each school and invite it to take part.' },
  ] },
  { label: 'Research', items: RESEARCH_CATEGORIES.map((c) => ({ key: c.key as TabKey, label: c.tabLabel, icon: RESEARCH_ICON[c.key] ?? 'note', hint: c.blurb })) },
  { label: 'Account', items: [
    { key: 'announcements', label: 'Announcements', icon: 'note', alert: true },
    { key: 'messages', label: 'Messages', icon: 'mail', hint: 'Talk to the program team.' },
    { key: 'profile', label: 'Profile', icon: 'contact' },
  ] },
]
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export default function Fellow() {
  useSeo({ title: 'Fellow Research Workspace', noindex: true })
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const role = (user?.role || '').toLowerCase()
  const allowed = !!user && ['fellow', 'admin', 'super_admin'].includes(role)

  const [tab, setTab] = useState<TabKey>('overview')
  const [navOpen, setNavOpen] = useState(false)
  const [crmDue, setCrmDue] = useState(0)
  const [crmOrgs, setCrmOrgs] = useState(0)
  const [taskOpen, setTaskOpen] = useState(0)
  const [taskUnread, setTaskUnread] = useState(0)
  // Set when a task's "Open my work" is used, so the schools list opens already filtered.
  const [workFilter, setWorkFilter] = useState<Record<string, string> | null>(null)
  // Collapsible sidebar groups, same as the admin Command Center. Every group
  // starts open so nothing is hidden; the Fellow's choices then persist.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { const s = JSON.parse(localStorage.getItem('fc_fellow_nav_open') || 'null'); if (s && typeof s === 'object') return s } catch { /* ignore */ }
    return Object.fromEntries(NAV_GROUPS.map((g) => [g.label, true]))
  })
  useEffect(() => { try { localStorage.setItem('fc_fellow_nav_open', JSON.stringify(openGroups)) } catch { /* ignore */ } }, [openGroups])
  const toggleGroup = (name: string) => setOpenGroups((p) => ({ ...p, [name]: !p[name] }))
  // Quick "jump to a section" search over the nav, always visible.
  const [navQuery, setNavQuery] = useState('')
  const { items: annItems, unseen: annUnseen, markSeen: markAnnSeen } = useAnnouncementBadge()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [entries, setEntries] = useState<ResearchEntry[]>([])
  const [form, setForm] = useState<EntryForm>({ ...EMPTY_ENTRY_FORM })
  const [editId, setEditId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const activeCat = useMemo<CategoryConfig | null>(
    () => RESEARCH_CATEGORIES.find((c) => c.key === tab) ?? null,
    [tab],
  )
  const crmView = tab.startsWith('crm:') ? (tab.slice(4) as ViewKey) : null
  const activeLabel = NAV_ITEMS.find((i) => i.key === tab)?.label ?? 'Overview'
  const badges: Partial<Record<TabKey, number>> = {
    'crm:day': crmDue,
    tasks: taskUnread || taskOpen,
    announcements: annUnseen,
    ...Object.fromEntries(RESEARCH_CATEGORIES.map((c) => [c.key, counts[c.key] || 0])),
  }

  const loadOverview = useCallback(() => {
    if (!allowed) return
    api.get<{ counts: Record<string, number>; assignments: Assignment[] }>('fellow/overview')
      .then((d) => { setCounts(d.counts || {}); setAssignments(d.assignments || []) })
      .catch(() => {})
    // Overdue follow-ups drive the sidebar badge on My Day.
    if (role === 'fellow') {
      api.get<{ followups_due: number; orgs_total: number }>('fellow/crm/overview')
        .then((d) => { setCrmDue(d.followups_due || 0); setCrmOrgs(d.orgs_total || 0) })
        .catch(() => {})
      // Open tasks and unread replies drive the My Tasks sidebar badge.
      api.get<{ tasks: { status: string; unread?: number }[] }>('fellow/tasks?filter=open')
        .then((d) => {
          const list = d.tasks || []
          setTaskOpen(list.length)
          setTaskUnread(list.reduce((n, t) => n + (Number(t.unread) || 0), 0))
        })
        .catch(() => {})
    }
  }, [allowed, role])

  const loadEntries = useCallback((cat: ResearchCategory) => {
    api.get<{ entries: ResearchEntry[] }>(`fellow/entries?category=${cat}`)
      .then((d) => setEntries(d.entries || []))
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => {
    if (activeCat) { loadEntries(activeCat.key); resetForm() }
  }, [activeCat, loadEntries])

  const resetForm = () => { setForm({ ...EMPTY_ENTRY_FORM }); setEditId(null); setMsg('') }

  const startEdit = (e: ResearchEntry) => {
    setEditId(e.id)
    setForm({
      title: e.title, organization: e.organization, contact_name: e.contact_name, email: e.email,
      phone: e.phone, website: e.website, location: e.location, source_url: e.source_url, notes: e.notes,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    if (!activeCat) return
    // Validate every field for this category: required unless it's a URL field
    // (URLs optional); findings/notes are required; email/url formats checked.
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const f of activeCat.fields) {
      const val = String((form as Record<string, string>)[f.name] ?? '').trim()
      const req = f.required !== false // default required
      if (req && !val) { setMsg(`Please fill in "${f.label}".`); return }
      if (!val) continue
      if (f.type === 'email' && !emailRe.test(val)) { setMsg(`"${f.label}" must be a valid email address.`); return }
      if (f.type === 'url' && !val.includes('.')) { setMsg(`"${f.label}" must be a valid link.`); return }
    }
    setBusy(true); setMsg('')
    try {
      if (editId) {
        await api.put(`fellow/entry/${editId}`, form)
      } else {
        await api.post('fellow/entry', { ...form, category: activeCat.key })
      }
      resetForm()
      loadEntries(activeCat.key); loadOverview()
      window.fcToast?.('Saved.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save.')
    } finally { setBusy(false) }
  }

  const importRows = async (rowsIn: Record<string, string>[]) => {
    if (!activeCat) return
    await api.post('fellow/import', { category: activeCat.key, rows: rowsIn })
    loadEntries(activeCat.key); loadOverview()
  }

  const removeEntry = async (id: number) => {
    if (!activeCat) return
    if (!window.confirm('Delete this entry?')) return
    try { await api.del(`fellow/entry/${id}`); loadEntries(activeCat.key); loadOverview() } catch { /* ignore */ }
  }

  const respondAssignment = async (id: number, action: 'accept' | 'decline' | 'complete') => {
    let note = ''
    if (action === 'decline') { note = window.prompt('Reason (optional):') || '' }
    try {
      const d = await api.put<{ assignments: Assignment[] }>(`fellow/assignment/${id}/respond`, { action, note })
      setAssignments(d.assignments || [])
    } catch (err) { window.fcToast?.(err instanceof Error ? err.message : 'Could not respond.') }
  }

  if (loading) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="admin-loading glass"><span className="admin-kicker">Fellow Workspace</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, marginTop: 8 }}>Loading…</h1>
        </div>
      </div>
    )
  }
  if (!allowed) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="admin-login glass" style={{ maxWidth: 430, margin: '80px auto', padding: 'clamp(20px,6vw,36px)', borderRadius: 16, textAlign: 'center' }}>
          <span className="admin-kicker">Fellow access</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 8px' }}>Research Workspace</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.65 }}>Sign in with your Fellow account to open your research workspace.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn--solid" data-auth="login">Sign In</button>
            <button className="btn" onClick={() => navigate('/')}>Back to Home</button>
          </div>
        </div>
      </div>
    )
  }

  const openAssignments = assignments.filter((a) => a.status === 'active' || a.status === 'accepted')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  // Ranked suggestions from the Fellow's real state — most urgent first, and
  // never an empty list, so the Overview always answers "what now?".
  const nextActions: { label: string; why: string; cta: string; go: TabKey; icon: IconName; urgent?: boolean }[] = []
  if (crmDue > 0) nextActions.push({ label: `Clear ${crmDue} follow-up${crmDue > 1 ? 's' : ''} that ${crmDue > 1 ? 'are' : 'is'} due`, why: 'Most sponsors say yes on the second or third contact — chasing on time is the whole job.', cta: 'Open My Day', go: 'crm:day', icon: 'sunrise', urgent: true })
  if (crmOrgs === 0) nextActions.push({ label: 'Add your first prospect', why: 'A prospect is any company that might sponsor — a shop, a bank, a clinic. Everything else starts here.', cta: 'Add one', go: 'crm:prospects', icon: 'building' })
  else if (crmOrgs < 10) nextActions.push({ label: `Grow your list — you have ${crmOrgs}`, why: 'Aim for a list you can work every day. More prospects, more chances.', cta: 'Add prospects', go: 'crm:prospects', icon: 'building' })
  if (taskUnread > 0) nextActions.push({ label: `${taskUnread} unread repl${taskUnread > 1 ? 'ies' : 'y'} from your manager`, why: 'They wrote back on a task. Read it before carrying on.', cta: 'Open My Tasks', go: 'tasks', icon: 'clipboard', urgent: true })
  if (taskOpen > 0) nextActions.push({ label: `${taskOpen} task${taskOpen > 1 ? 's' : ''} assigned to you`, why: 'Accept it, work it, then hand it in so your manager knows where you are.', cta: 'Open My Tasks', go: 'tasks', icon: 'clipboard' })
  if (nextActions.length < 3) nextActions.push({ label: 'Move someone forward in the pipeline', why: 'Pick one company and take it one stage further today — a call, an email, a meeting.', cta: 'Open Pipeline', go: 'crm:pipeline', icon: 'funnel' })
  if (nextActions.length < 3) nextActions.push({ label: 'Finish your training', why: 'Read the modules, then take the exam to become a Certified Student Fellow.', cta: 'Open Academy', go: 'crm:academy', icon: 'cap' })
  nextActions.push({ label: 'End your day with a report', why: 'Two minutes so your manager can unblock you tomorrow.', cta: 'Write it', go: 'crm:report', icon: 'clipboard' })

  return (
    <div className="admin-page" style={WRAP_S}>
      <div className={`admin-layout${navOpen ? '' : ' is-nav-collapsed'}`}>
        <button type="button" className="admin-mobilebar" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen}>
          <span>☰&nbsp; Menu</span>
          <span className="admin-mobilebar__hint">{navOpen ? 'Tap to close' : activeLabel}</span>
        </button>

        <aside className="admin-sidebar glass">
          <div className="admin-sidebar__brand">
            <span className="admin-kicker">Student Fellow</span>
            <strong className="gold-text">{user?.full_name || 'My Workspace'}</strong>
          </div>
          <div className="admin-nav__search">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="search" value={navQuery} onChange={(e) => setNavQuery(e.target.value)} placeholder="Jump to a section…" aria-label="Search workspace sections" />
          </div>
          <nav className="admin-nav" onClick={() => setNavOpen(false)}>
            {navQuery.trim() ? (
              // Flat search results — jump straight to any section.
              (() => {
                const q = navQuery.trim().toLowerCase()
                const matches = NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q))
                if (matches.length === 0) return <p className="admin-nav__empty">No section matches “{navQuery}”.</p>
                return (
                  <div className="admin-nav__items admin-nav__items--flat">
                    {matches.map((item) => (
                      <button key={item.key} type="button" className={`admin-nav__item${tab === item.key ? ' is-active' : ''}`}
                        onClick={() => { setTab(item.key); setNavQuery(''); if (item.key === 'announcements') markAnnSeen() }}>
                        <span className="admin-nav__icon"><FcIcon name={item.icon} size={16} /></span>
                        <span className="admin-nav__label">{item.label}</span>
                        {badges[item.key] ? <span className={`admin-nav__badge${item.alert ? ' admin-nav__badge--notify' : ''}`}>{badges[item.key]}</span> : null}
                      </button>
                    ))}
                  </div>
                )
              })()
            ) : NAV_GROUPS.map((group) => {
              const open = !!openGroups[group.label]
              const groupCount = group.items.reduce((n, it) => n + (Number(badges[it.key]) || 0), 0)
              const color = GROUP_META[group.label]?.color || '#d4af37'
              return (
                <div key={group.label} className={`admin-nav__group${open ? ' is-open' : ' is-collapsed'}`} style={{ ['--grp' as string]: color }}>
                  <button type="button" className="admin-nav__group-label admin-nav__group-toggle" aria-expanded={open}
                    onClick={(e) => { e.stopPropagation(); toggleGroup(group.label) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 0, borderBottom: '1px solid rgba(201,168,76,0.14)', cursor: 'pointer' }}>
                    <span className="admin-nav__chevron" aria-hidden="true" style={{ display: 'inline-block', transition: 'transform .2s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                    <span className="admin-nav__glyph" aria-hidden="true"><GroupGlyph group={group.label} /></span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>{group.label}</span>
                    {!open && groupCount > 0 && <span className="admin-nav__badge admin-nav__badge--notify" title={`${groupCount} need attention`}>{groupCount}</span>}
                  </button>
                  {open && (
                    <div className="admin-nav__items">
                      {group.items.map((item) => (
                        <button key={item.key} type="button"
                          className={`admin-nav__item${tab === item.key ? ' is-active' : ''}`}
                          title={item.hint}
                          onClick={() => { setTab(item.key); if (item.key === 'announcements') markAnnSeen() }}>
                          <span className="admin-nav__icon"><FcIcon name={item.icon} size={16} /></span>
                          <span className="admin-nav__label">{item.label}</span>
                          {badges[item.key] ? <span className={`admin-nav__badge${item.alert ? ' admin-nav__badge--notify' : ''}`}>{badges[item.key]}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
          <div className="admin-sidebar__foot">
            <button type="button" className="btn btn--sm" onClick={() => setTab('profile')}>My Profile</button>
            <a className="btn btn--sm" href="/">View Site</a>
            <button className="btn btn--sm" onClick={() => void logout()}>Log out</button>
          </div>
        </aside>

        <div style={{ minWidth: 0, display: 'grid', gap: 12 }}>
          <header className="glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 'clamp(14px,3vw,20px)', borderRadius: 16 }}>
            <div style={{ minWidth: 0 }}>
              <span className="admin-kicker">Youth Community Impact Fellow</span>
              <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,4vw,26px)', margin: '2px 0 0' }}>{activeLabel}</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <NotificationBell />
            </div>
          </header>

          {crmView && <FellowCrm view={crmView} onView={(v) => setTab(`crm:${v}`)} />}
          {tab === 'school-verify' && <SchoolVerification initialFilter={workFilter} />}
          {tab === 'tasks' && (
            <TaskWorkspace side="fellow" onChanged={loadOverview}
              onOpenWork={(target, filter) => { if (target === 'schools') { setWorkFilter(filter); setTab('school-verify') } }} />
          )}
          {tab === 'profile' && <ProfileSection />}
          {tab === 'messages' && (
            <Section title="Messages with the program team">
              <EcoMessages fetchUrl="team/messages" sendUrl="team/message" sendPayload={(body) => ({ body })} mine="user" />
            </Section>
          )}
          {tab === 'announcements' && <AnnouncementsFeed items={annItems} />}

          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              {/* A real starting point: what to do next, ranked, with the button
                  that does it — rather than making the Fellow guess. */}
              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 4px' }}>What to do next</h2>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px' }}>{greeting}, {(user?.full_name || '').split(' ')[0]}. Work down this list — the top one matters most today.</p>
                <div style={{ display: 'grid', gap: 10 }}>
                  {nextActions.map((a) => (
                    <div key={a.label} className="fc-next" data-urgent={a.urgent ? '1' : undefined}>
                      <span className="fc-next__icon"><FcIcon name={a.icon} size={18} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block', color: 'var(--ivory)', fontSize: 14 }}>{a.label}</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{a.why}</span>
                      </span>
                      <button className="btn btn--sm btn--solid" onClick={() => setTab(a.go)}>{a.cta}</button>
                    </div>
                  ))}
                </div>
              </section>

              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 12px' }}>My progress</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(130px,100%),1fr))', gap: 12, minWidth: 0 }}>
                  {RESEARCH_CATEGORIES.map((c) => (
                    <button key={c.key} type="button" onClick={() => setTab(c.key)} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 10px', cursor: 'pointer', color: 'inherit' }}>
                      <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, fontWeight: 800 }}>{counts[c.key] ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>{c.tabLabel}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Assigned work lives in one place now — My Tasks. The old
                  assignments list was the second copy of the same thing. */}
              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 12px' }}>Work assigned to me</h2>
                {taskOpen === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing open. When your manager assigns you work it appears under My Tasks, where you can reply to them on each task.</p>
                  : (
                    <>
                      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
                        You have <strong style={{ color: 'var(--ivory)' }}>{taskOpen}</strong> open task{taskOpen === 1 ? '' : 's'}
                        {taskUnread > 0 ? <> and <strong style={{ color: '#f0b8a8' }}>{taskUnread}</strong> unread repl{taskUnread === 1 ? 'y' : 'ies'} from your manager</> : null}.
                      </p>
                      <button className="btn btn--solid" onClick={() => setTab('tasks')}>Open My Tasks →</button>
                    </>
                  )}
              </section>
            </div>
          )}

          {activeCat && (
            <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              <section style={cardS}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px' }}>{editId ? 'Edit entry' : `Add — ${activeCat.label}`}</h2>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>{activeCat.blurb}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 12, minWidth: 0 }}>
                  {activeCat.fields.map((f) => (
                    <div key={f.name} style={f.textarea ? { gridColumn: '1 / -1' } : undefined}>
                      <label style={labelS}>{f.label}{f.required !== false ? ' *' : ' (optional)'}</label>
                      {f.textarea
                        ? <textarea style={{ ...inputS, minHeight: 76, resize: 'vertical' }} value={form[f.name]} placeholder={f.placeholder} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                        : <input style={inputS} value={form[f.name]} placeholder={f.placeholder} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />}
                    </div>
                  ))}
                </div>
                {msg && <p style={{ color: '#ff9a9a', fontSize: 13, margin: '10px 0 0' }}>{msg}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="btn btn--solid" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : editId ? 'Update entry' : 'Add entry'}</button>
                  {editId && <button className="btn" onClick={resetForm}>Cancel</button>}
                </div>
              </section>

              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 6px' }}>Import from a sheet</h2>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>Already have a spreadsheet? Upload it and the rows will be added to <strong>{activeCat.label}</strong>.</p>
                <SheetImport onImport={importRows} />
              </section>

              <section style={cardS}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 12px' }}>My {activeCat.tabLabel} entries ({entries.length})</h2>
                {entries.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing added yet. Use the form above.</p>
                  : (
                    <div className="admin-table-wrap glass">
                      <table className="admin-table admin-table--stack">
                        <thead><tr><th>Name</th><th>Details</th><th>Status</th><th></th></tr></thead>
                        <tbody>
                          {entries.map((e) => (
                            <tr key={e.id}>
                              <td data-label="Name"><strong style={{ color: 'var(--ivory)' }}>{e.title}</strong></td>
                              <td data-label="Details" className="admin-cell--wrap">
                                {[e.contact_name, e.email, e.phone, e.website, e.location].filter(Boolean).join(' · ') || e.notes || '—'}
                              </td>
                              <td data-label="Status">{e.status}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                  <button className="btn btn--sm" onClick={() => startEdit(e)}>Edit</button>
                                  <button className="btn btn--sm" onClick={() => void removeEntry(e.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
