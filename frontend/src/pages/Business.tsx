import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'
import OfferStepper, { type OfferStage, type OfferEvent } from '../components/OfferStepper'

/* Business Portal — access, review & opportunity requests for a verified business.
   The business is NOT a judge: it cannot rate, score or rank students, and cannot
   contact students directly. It can view who interviewed it + their submitted
   solutions, and raise requests (implementation help / contact school /
   internship-hiring / volunteer) that all go to the Admin for review + consent. */

const WRAP_S: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 clamp(12px,4vw,24px) 60px', fontFamily: 'var(--f-body)' }
const cardS: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }
const labelS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', marginBottom: 6 }
const inputS: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '11px 13px', color: 'var(--ivory)', fontSize: 14 }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)' }
const thS: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', color: 'var(--gold-light)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.06em' }
const tdS: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'top', color: '#d8d3c6', borderBottom: '1px solid rgba(201,168,76,0.08)' }
// 2-line preview clamp for long text inside a table cell.
const clampS = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 } as React.CSSProperties

interface BizMaterial { label: string; url: string }
interface BizSolution {
  submission_id: number
  status: string
  problem_identified: string
  proposed_solution: string
  how_it_helps: string
  expected_impact: string
  video_url: string | null
  written_url: string | null
  materials: BizMaterial[]
}
interface BizInterview {
  id: number
  visit_number: number
  business_name: string
  owner_name: string
  business_category: string | null
  business_address: string | null
  date_of_visit: string | null
  main_challenge: string | null
  verified: boolean
  student_id: number
  student_name: string
  school_name: string
  grade_level: string | null
  student_age: number
  internship_eligible: boolean
  solution: BizSolution | null
  solution_pending: boolean
}
type ReqType = 'implementation' | 'contact_school' | 'internship' | 'volunteer'
interface BizRequest {
  id: number
  request_type: ReqType
  submission_id: number | null
  student_id: number | null
  student_name: string | null
  school_name: string | null
  message: string
  status: string
  admin_note: string
  created_ts: number
}
interface BizOffer {
  id: number
  job_title: string
  student_name: string
  school_name: string
  location: string
  duration: string
  stipend: string
  working_hours: string
  skills: string
  message: string
  status: string
  student_consent: string
  parent_consent: string
  admin_note: string
  decline_reason: string
  created_ts: number
  stage: OfferStage
  timeline: OfferEvent[]
}
interface BizProfile { business_name: string; category: string | null; borough: string | null; contact_name: string | null; contact_phone: string | null; website: string | null; about: string | null }
interface BizDoc { id: number; doc_type: string; label: string; file_url: string; created_ts: number }
interface BizAnn { id: number; title: string; body: string; created_ts: number }
interface BizDashboard {
  profile: BizProfile | null
  interviews: BizInterview[]
  impact: { interviews: number; students: number; solutions: number }
  requests: BizRequest[]
  documents?: BizDoc[]
  announcements?: BizAnn[]
}

type Tab = 'interviews' | 'solutions' | 'pipeline' | 'requests' | 'updates' | 'profile'

const REQ_LABEL: Record<ReqType, string> = {
  implementation: 'Implementation Help',
  contact_school: 'Contact School',
  internship: 'Internship / Hiring',
  volunteer: 'Volunteer Support',
}
const statusStyle = (s: string): React.CSSProperties => {
  const map: Record<string, string> = { approved: 'var(--gold-light)', declined: '#ff9a9a', info_needed: 'var(--gold)', pending: 'var(--muted)' }
  return { color: map[s] || 'var(--muted)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em' }
}
const fmtDate = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }

const ADMIN_ROLES = ['admin', 'super_admin', 'editor']

// A pending request the modal is collecting a message for. Internship requests
// carry rich offer fields (job title, location, duration, stipend, hours, skills).
interface ReqDraft {
  type: ReqType; title: string; note: string; submission_id?: number; student_id?: number; school_name?: string
  job_title?: string; location?: string; duration?: string; stipend?: string; working_hours?: string; skills?: string
}

export default function Business() {
  const { user, loading, login, refresh, logout } = useAuth()
  const navigate = useNavigate()
  useSeo({ title: 'Business Portal', description: 'See who interviewed your business, review student solutions, and request help implementing, hiring, or contacting the school.', noindex: true })

  const role = (user?.role || '').toLowerCase()
  const isBusiness = role === 'business'
  const isAdmin = ADMIN_ROLES.includes(role)
  const approved = (user?.approval_status === 'approved') || isAdmin

  const [data, setData] = useState<BizDashboard | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('interviews')
  const [navOpen, setNavOpen] = useState(false)

  // request modal
  const [draft, setDraft] = useState<ReqDraft | null>(null)
  const [reqBusy, setReqBusy] = useState(false)
  const [reqErr, setReqErr] = useState('')
  // interview detail modal
  const [detail, setDetail] = useState<BizInterview | null>(null)
  // internship pipeline
  const [offers, setOffers] = useState<BizOffer[]>([])

  // auth panel
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [busy, setBusy] = useState('')
  const [f, setF] = useState({ full_name: '', email: '', password: '', business_name: '', category: '', borough: '', contact_phone: '', website: '', about: '', agree: false })
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  const loadDashboard = useCallback(async () => {
    if (!user || !(isBusiness || isAdmin) || !approved) return
    try {
      const d = await api.get<BizDashboard>('business/dashboard')
      setData(d); setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load your dashboard.')
    }
  }, [user, isBusiness, isAdmin, approved])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  const loadOffers = useCallback(async () => {
    if (!user || !(isBusiness || isAdmin) || !approved) return
    try { const d = await api.get<{ offers: BizOffer[] }>('business/offers'); setOffers(d.offers || []) } catch { /* non-fatal */ }
  }, [user, isBusiness, isAdmin, approved])
  useEffect(() => { void loadOffers() }, [loadOffers])

  const submitRequest = async () => {
    if (!draft) return
    setReqBusy(true); setReqErr('')
    try {
      const r = await api.post<{ requests: BizRequest[] }>('business/request', {
        request_type: draft.type,
        submission_id: draft.submission_id,
        student_id: draft.student_id,
        school_name: draft.school_name,
        message: draft.note,
        job_title: draft.job_title, location: draft.location, duration: draft.duration,
        stipend: draft.stipend, working_hours: draft.working_hours, skills: draft.skills,
      })
      setData((d) => d ? { ...d, requests: r.requests || d.requests } : d)
      const wasInternship = draft.type === 'internship'
      setDraft(null); setTab(wasInternship ? 'pipeline' : 'requests')
      if (wasInternship) void loadOffers()
    } catch (e) { setReqErr(e instanceof Error ? e.message : 'Could not send your request.') }
    finally { setReqBusy(false) }
  }

  const doLogin = async (e: FormEvent) => {
    e.preventDefault(); setBusy('login'); setErr('')
    try {
      const r = await login(loginEmail.trim(), loginPass)
      if (!r.user) setErr(r.message || 'Sign in failed. Check your email and password.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Sign in failed.') }
    finally { setBusy('') }
  }

  const doRegister = async (e: FormEvent) => {
    e.preventDefault(); setBusy('register'); setErr('')
    try {
      await api.post('business/register', {
        full_name: f.full_name.trim(), email: f.email.trim(), password: f.password,
        business_name: f.business_name.trim(), category: f.category.trim(), borough: f.borough.trim(),
        contact_phone: f.contact_phone.trim(), website: f.website.trim(), about: f.about.trim(),
      })
      await refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Registration failed.') }
    finally { setBusy('') }
  }

  // ---- loading ----
  if (loading) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="glass" style={{ maxWidth: 420, margin: '90px auto', padding: 36, borderRadius: 16, textAlign: 'center' }}>
          <span style={eyebrow}>Business Portal</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 28, marginTop: 8 }}>Loading…</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10 }}>Verifying your session.</p>
        </div>
      </div>
    )
  }

  // ---- not signed in: login / register ----
  if (!user) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="glass" style={{ maxWidth: 560, margin: '48px auto', padding: 0, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '26px 30px 0' }}>
            <span style={eyebrow}>Business Portal</span>
            <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, margin: '6px 0 6px' }}>Partner With Young Innovators</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.65 }}>
              Students across New York interviewed local businesses and built solutions to real challenges. Register your business to see who interviewed you, review their ideas, and request help implementing, hiring, or contacting the school.
            </p>
            <div style={{ display: 'flex', gap: 8, margin: '18px 0 0' }}>
              <button className={`btn btn--sm${mode === 'register' ? ' btn--solid' : ''}`} onClick={() => { setMode('register'); setErr('') }}>Register</button>
              <button className={`btn btn--sm${mode === 'login' ? ' btn--solid' : ''}`} onClick={() => { setMode('login'); setErr('') }}>Sign In</button>
            </div>
          </div>

          {err && <p style={{ color: '#ff9a9a', fontSize: 13, padding: '12px 30px 0' }}>{err}</p>}

          {mode === 'login' ? (
            <form onSubmit={doLogin} style={{ padding: '18px 30px 30px', display: 'grid', gap: 14 }}>
              <div><label style={labelS}>Email</label><input style={inputS} type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /></div>
              <div><label style={labelS}>Password</label><input style={inputS} type="password" required value={loginPass} onChange={(e) => setLoginPass(e.target.value)} /></div>
              <button className="btn btn--solid" disabled={busy === 'login'}>{busy === 'login' ? 'Signing in…' : 'Sign In'}</button>
            </form>
          ) : (
            <form onSubmit={doRegister} style={{ padding: '18px 30px 30px', display: 'grid', gap: 14 }}>
              <div><label style={labelS}>Business name *</label><input style={inputS} required value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} placeholder="e.g. Barclays Center" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div><label style={labelS}>Category</label><input style={inputS} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Retail, Food, Healthcare…" /></div>
                <div><label style={labelS}>Borough / County</label><input style={inputS} value={f.borough} onChange={(e) => setF({ ...f, borough: e.target.value })} placeholder="Bronx, Brooklyn…" /></div>
              </div>
              <div><label style={labelS}>Your name (contact) *</label><input style={inputS} required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div><label style={labelS}>Email *</label><input style={inputS} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
                <div><label style={labelS}>Phone</label><input style={inputS} value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div><label style={labelS}>Website</label><input style={inputS} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://…" /></div>
                <div><label style={labelS}>Password *</label><input style={inputS} type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="6+ characters" /></div>
              </div>
              <div><label style={labelS}>About your business</label><textarea style={{ ...inputS, minHeight: 74, resize: 'vertical' }} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--ivory)', fontSize: 13 }}>
                <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} style={{ marginTop: 3 }} />
                <span>I confirm I represent this business and agree to the platform terms.</span>
              </label>
              <button className="btn btn--solid" disabled={busy === 'register' || !f.agree}>{busy === 'register' ? 'Submitting…' : 'Create Business Account'}</button>
              <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>New accounts are reviewed by an admin before your dashboard unlocks.</p>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ---- signed in but wrong role ----
  if (!isBusiness && !isAdmin) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="glass" style={{ maxWidth: 460, margin: '80px auto', padding: 36, borderRadius: 16, textAlign: 'center' }}>
          <span style={eyebrow}>Business Portal</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 8px' }}>Different Account Type</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.65 }}>You're signed in with a {role || 'non-business'} account. The Business Portal is for registered businesses.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn--solid" onClick={() => navigate(resolveDashboardRoute(role))}>My Dashboard</button>
            <button className="btn" onClick={() => logout()}>Sign Out</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- business, pending approval ----
  if (isBusiness && !approved) {
    return (
      <div className="admin-page" style={WRAP_S}>
        <div className="glass" style={{ maxWidth: 480, margin: '80px auto', padding: 36, borderRadius: 16, textAlign: 'center' }}>
          <span style={eyebrow}>Business Portal</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 10px' }}>Account Pending Approval</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
            Thanks for registering. An admin is reviewing your business account. You'll be able to see the students who interviewed you and their solutions as soon as it's approved.
          </p>
          <button className="btn" onClick={() => logout()}>Sign Out</button>
        </div>
      </div>
    )
  }

  // ---- approved dashboard ----
  const impact = data?.impact ?? { interviews: 0, students: 0, solutions: 0 }
  const interviews = data?.interviews ?? []
  const requests = data?.requests ?? []
  const documents = data?.documents ?? []
  const announcements = data?.announcements ?? []
  const solutionInterviews = interviews.filter((i) => i.solution)
  const updatesCount = documents.length + announcements.length
  const activePipeline = offers.filter((o) => !o.stage?.rejected && o.stage?.key !== 'confirmed').length
  const NAV: Array<{ key: Tab; label: string }> = [
    { key: 'interviews', label: `Interviews (${interviews.length})` },
    { key: 'solutions', label: `Student Solutions (${solutionInterviews.length})` },
    { key: 'pipeline', label: `Internship Pipeline${offers.length ? ` (${offers.length})` : ''}` },
    { key: 'requests', label: `My Requests (${requests.length})` },
    { key: 'updates', label: `Updates${updatesCount ? ` (${updatesCount})` : ''}` },
    { key: 'profile', label: 'Business Profile' },
  ]
  const openReq = (d: ReqDraft) => { setReqErr(''); setDraft(d) }

  return (
    <div className="admin-page" style={WRAP_S}>
      <div className={`admin-layout${navOpen ? '' : ' is-nav-collapsed'}`}>
        <button type="button" className="admin-mobilebar" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen}>
          <span>☰&nbsp; Menu</span>
          <span className="admin-mobilebar__hint">{navOpen ? 'Tap to close' : (NAV.find((n) => n.key === tab)?.label.replace(/\s*\(.*\)/, '') || 'Menu')}</span>
        </button>
        <aside className="admin-sidebar glass">
          <div className="admin-sidebar__brand">
            <span className="admin-kicker">Business</span>
            <strong className="gold-text">{data?.profile?.business_name || 'Your Business'}</strong>
          </div>
          <nav className="admin-nav" onClick={() => setNavOpen(false)}>
            <div className="admin-nav__group">
              <span className="admin-nav__group-label">Dashboard</span>
              <div className="admin-nav__items">
                {NAV.map((item) => (
                  <button key={item.key} type="button" className={`admin-nav__item${tab === item.key ? ' is-active' : ''}`} onClick={() => setTab(item.key)}>{item.label}</button>
                ))}
              </div>
            </div>
          </nav>
          <button className="btn btn--sm" style={{ margin: 16 }} onClick={() => logout()}>Sign Out</button>
        </aside>

        <main className="admin-main">
          <header style={{ margin: '6px 0 20px' }}>
            <span style={eyebrow}>Business Portal</span>
            <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 28, margin: '4px 0 0' }}>
              {NAV.find((n) => n.key === tab)?.label.replace(/\s*\(.*\)/, '')}
            </h1>
          </header>

          {err && <p style={{ color: '#ff9a9a', fontSize: 13, marginBottom: 14 }}>{err}</p>}

          {/* Impact tiles always on top */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
            <StatTile label="Interviews" value={impact.interviews} />
            <StatTile label="Students Engaged" value={impact.students} />
            <StatTile label="Solutions Received" value={impact.solutions} />
          </div>

          {tab === 'interviews' && (
            interviews.length === 0
              ? <Empty text="No student interviews are linked to your business yet. Once students who interviewed your business are approved, they'll appear here (matched by business name)." />
              : (
                <div style={{ ...cardS, padding: 0, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                    <thead><tr><th style={thS}>Student</th><th style={thS}>School</th><th style={thS}>Visited</th><th style={thS}>Challenge they logged</th><th style={thS}>Solution</th><th style={thS}></th></tr></thead>
                    <tbody>
                      {interviews.map((i) => (
                        <tr key={i.id} onClick={() => setDetail(i)} style={{ cursor: 'pointer' }} title="Click to view full interview details">
                          <td style={tdS}>{i.student_name}{i.verified && <span title="Signed / verified visit" style={{ color: 'var(--gold)', marginLeft: 6 }}>✓</span>}</td>
                          <td style={tdS}>{i.school_name}{i.grade_level ? ` · ${i.grade_level}` : ''}</td>
                          <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{i.date_of_visit || '—'}</td>
                          <td style={{ ...tdS, maxWidth: 320 }}><span style={clampS}>{i.main_challenge || '—'}</span></td>
                          <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{i.solution ? <span style={{ color: 'var(--gold-light)' }}>Submitted</span> : i.solution_pending ? <span style={{ color: 'var(--muted)' }}>In progress</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                          <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                            <button className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setDetail(i) }}>View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {tab === 'solutions' && (
            solutionInterviews.length === 0
              ? <Empty text="No submitted student solutions yet. When a student who interviewed you submits their solution, it will appear here to review and to request implementation help, hiring, or a school contact." />
              : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {solutionInterviews.map((i) => <SolutionCard key={i.solution!.submission_id} interview={i} onReq={openReq} />)}
                </div>
              )
          )}

          {tab === 'pipeline' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ ...cardS }}>
                <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 18 }}>Track every internship offer in real time</div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
                  Each offer moves through admin review → the student → their parent/guardian. You'll see exactly where every offer stands, what happens next, and the full history — with email + in-app notifications at each step.
                  {offers.length > 0 && <> <strong style={{ color: 'var(--gold-light)' }}>{activePipeline} in progress.</strong></>}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn--sm" onClick={() => setTab('solutions')}>+ Make an offer from a student solution</button>
                </div>
              </div>
              {offers.length === 0
                ? <Empty text="No internship offers yet. Open a student's solution and choose “Request Internship / Hiring” to send an offer. It will appear here with a live status tracker." />
                : offers.map((o) => (
                  <div key={o.id} style={cardS}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <div className="gold-text" style={{ fontWeight: 800, fontSize: 16 }}>{o.job_title || 'Internship'}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                          {[o.student_name, o.school_name].filter(Boolean).join(' · ')} · Sent {fmtDate(o.created_ts)}
                        </div>
                      </div>
                    </div>
                    {(o.location || o.duration || o.stipend || o.working_hours) && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {o.location && <OfferChip icon="📍" text={o.location} />}
                        {o.duration && <OfferChip icon="⏳" text={o.duration} />}
                        {o.stipend && <OfferChip icon="💰" text={o.stipend} />}
                        {o.working_hours && <OfferChip icon="🕑" text={o.working_hours} />}
                      </div>
                    )}
                    <OfferStepper stage={o.stage} timeline={o.timeline} />
                  </div>
                ))}
            </div>
          )}

          {tab === 'requests' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ ...cardS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 18 }}>Need volunteer support?</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Ask the program for mentors, speakers, or event help.</div>
                </div>
                <button className="btn btn--solid btn--sm" onClick={() => openReq({ type: 'volunteer', title: 'Request Volunteer Support', note: '' })}>Request Volunteer Support</button>
              </div>
              {requests.length === 0
                ? <Empty text="You haven't made any requests yet. From a student's solution you can request implementation help, an internship/hire, or a school contact — every request is reviewed by the admin." />
                : requests.map((r) => (
                  <div key={r.id} style={cardS}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div className="gold-text" style={{ fontWeight: 800, fontSize: 15 }}>{REQ_LABEL[r.request_type]}</div>
                      <span style={statusStyle(r.status)}>{r.status.replace('_', ' ')}</span>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>
                      {[r.student_name, r.school_name].filter(Boolean).join(' · ') || 'General'} · {fmtDate(r.created_ts)}
                    </div>
                    {r.message && <p style={{ color: '#d8d3c6', margin: '8px 0 0', lineHeight: 1.55, fontSize: 13.5 }}>{r.message}</p>}
                    {r.admin_note && <p style={{ color: 'var(--gold-light)', margin: '8px 0 0', fontSize: 13 }}><strong>Admin:</strong> {r.admin_note}</p>}
                  </div>
                ))}
            </div>
          )}

          {tab === 'updates' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div>
                <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '0 0 10px' }}>Announcements</h3>
                {announcements.length === 0
                  ? <Empty text="No announcements yet. Program updates from the admin will appear here." />
                  : <div style={{ display: 'grid', gap: 12 }}>
                      {announcements.map((a) => (
                        <div key={a.id} style={cardS}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <strong className="gold-text" style={{ fontSize: 15 }}>{a.title}</strong>
                            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(a.created_ts)}</span>
                          </div>
                          {a.body && <p style={{ color: '#d8d3c6', margin: '8px 0 0', lineHeight: 1.55, fontSize: 13.5 }}>{a.body}</p>}
                        </div>
                      ))}
                    </div>}
              </div>
              <div>
                <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '0 0 10px' }}>Documents</h3>
                {documents.length === 0
                  ? <Empty text="No documents yet. Files the admin issues to your business (agreements, certificates, invoices) will appear here." />
                  : <div style={{ display: 'grid', gap: 10 }}>
                      {documents.map((d) => (
                        <div key={d.id} style={{ ...cardS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{d.label}</div>
                            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{d.doc_type} · {fmtDate(d.created_ts)}</div>
                          </div>
                          <a className="btn btn--sm" href={d.file_url} target="_blank" rel="noreferrer">Download</a>
                        </div>
                      ))}
                    </div>}
              </div>
            </div>
          )}

          {tab === 'profile' && data?.profile && (
            <ProfileEditor profile={data.profile} onSaved={(p) => setData((d) => d ? { ...d, profile: p } : d)} />
          )}
        </main>
      </div>

      {draft && (
        <div onClick={() => !reqBusy && setDraft(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="glass" style={{ maxWidth: draft.type === 'internship' ? 560 : 480, width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 26, borderRadius: 16 }}>
            <span style={eyebrow}>{REQ_LABEL[draft.type]}</span>
            <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 21, margin: '4px 0 8px' }}>{draft.title}</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
              {draft.type === 'internship'
                ? 'Describe the internship. It goes to the program admin first — then, if approved, to the student and their parent/guardian for consent. Nothing is finalised without all approvals.'
                : 'This request goes to the program admin for review. No student is contacted and nothing is implemented without the required student, parent/guardian, and school consent.'}
            </p>

            {draft.type === 'internship' && (
              <div style={{ display: 'grid', gap: 12, marginBottom: 4 }}>
                <div>
                  <label style={labelS}>Role / job title *</label>
                  <input style={inputS} value={draft.job_title || ''} onChange={(e) => setDraft({ ...draft, job_title: e.target.value })} placeholder="e.g. Marketing Intern" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                  <div><label style={labelS}>Location</label><input style={inputS} value={draft.location || ''} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="On-site / Remote / Brooklyn" /></div>
                  <div><label style={labelS}>Duration</label><input style={inputS} value={draft.duration || ''} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} placeholder="e.g. 8 weeks (summer)" /></div>
                  <div><label style={labelS}>Stipend / pay</label><input style={inputS} value={draft.stipend || ''} onChange={(e) => setDraft({ ...draft, stipend: e.target.value })} placeholder="e.g. $15/hr or Unpaid" /></div>
                  <div><label style={labelS}>Working hours</label><input style={inputS} value={draft.working_hours || ''} onChange={(e) => setDraft({ ...draft, working_hours: e.target.value })} placeholder="e.g. 10 hrs/week, after school" /></div>
                </div>
                <div>
                  <label style={labelS}>Skills / requirements</label>
                  <input style={inputS} value={draft.skills || ''} onChange={(e) => setDraft({ ...draft, skills: e.target.value })} placeholder="Comma-separated, e.g. Canva, teamwork, writing" />
                </div>
              </div>
            )}

            <label style={labelS}>{draft.type === 'internship' ? 'Description / message to the student' : 'Message (optional)'}</label>
            <textarea autoFocus style={{ ...inputS, minHeight: 90, resize: 'vertical' }} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder={draft.type === 'internship' ? 'What the student will do, why you chose them, and anything they should know…' : 'Add any details for the admin…'} />
            {reqErr && <p style={{ color: '#ff9a9a', fontSize: 13, margin: '10px 0 0' }}>{reqErr}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn--sm" disabled={reqBusy} onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn btn--solid btn--sm" disabled={reqBusy || (draft.type === 'internship' && !(draft.job_title || '').trim())} onClick={submitRequest}>{reqBusy ? 'Sending…' : draft.type === 'internship' ? 'Send Offer' : 'Send Request'}</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="glass" style={{ maxWidth: 640, width: '100%', maxHeight: '86vh', overflowY: 'auto', padding: 26, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <span style={eyebrow}>Interview · Visit #{detail.visit_number}</span>
                <h3 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22, margin: '4px 0 0' }}>
                  {detail.student_name}{detail.verified && <span title="Signed / verified visit" style={{ color: 'var(--gold)', marginLeft: 6 }}>✓</span>}
                </h3>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
                  {[detail.school_name, detail.grade_level, detail.student_age ? `Age ${detail.student_age}` : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="btn btn--sm" onClick={() => setDetail(null)} aria-label="Close">✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '18px 0' }}>
              {detailStat('Visited', detail.date_of_visit || '—')}
              {detailStat('Category', detail.business_category || '—')}
              {detailStat('Solution', detail.solution ? 'Submitted' : detail.solution_pending ? 'In progress' : 'None yet')}
              {detailStat('Internship', detail.internship_eligible ? 'Eligible' : '—')}
            </div>

            {detail.business_address && <DetailBlock label="Business address">{detail.business_address}</DetailBlock>}
            {detail.owner_name && <DetailBlock label="Owner / contact">{detail.owner_name}</DetailBlock>}
            <DetailBlock label="Challenge they logged">{detail.main_challenge || '—'}</DetailBlock>

            {detail.solution && (
              <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <span style={eyebrow}>Student solution</span>
                <DetailBlock label="Problem identified">{detail.solution.problem_identified}</DetailBlock>
                <DetailBlock label="Proposed solution">{detail.solution.proposed_solution}</DetailBlock>
                <DetailBlock label="How it helps">{detail.solution.how_it_helps}</DetailBlock>
                <DetailBlock label="Expected impact">{detail.solution.expected_impact}</DetailBlock>
                {(detail.solution.video_url || detail.solution.written_url || detail.solution.materials.length > 0) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {detail.solution.video_url && <a className="btn btn--sm" href={detail.solution.video_url} target="_blank" rel="noreferrer">▶ Video</a>}
                    {detail.solution.written_url && <a className="btn btn--sm" href={detail.solution.written_url} target="_blank" rel="noreferrer">📄 Document</a>}
                    {detail.solution.materials.map((mm, k) => <a key={k} className="btn btn--sm" href={mm.url} target="_blank" rel="noreferrer">{mm.label || 'Attachment'}</a>)}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn--sm" onClick={() => { const s = detail; setDetail(null); openReq({ type: 'contact_school', title: `Contact ${s.school_name}`, student_id: s.student_id, school_name: s.school_name, note: '' }) }}>Contact School</button>
              {detail.solution && <button className="btn btn--solid btn--sm" onClick={() => { const s = detail; setDetail(null); openReq({ type: 'implementation', title: 'Request Implementation Help', submission_id: s.solution!.submission_id, student_id: s.student_id, school_name: s.school_name, note: '' }) }}>Request Implementation</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function detailStat(label: string, value: string) {
  return (
    <div style={{ ...cardS, padding: '12px 14px' }}>
      <div style={{ ...eyebrow, fontSize: 10 }}>{label}</div>
      <div style={{ color: '#e8e2d4', fontSize: 14, marginTop: 4, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ ...eyebrow, fontSize: 10, marginBottom: 4 }}>{label}</div>
      <p style={{ color: '#d8d3c6', margin: 0, lineHeight: 1.6, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{children}</p>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ ...cardS, textAlign: 'center' }}>
      <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 32, fontWeight: 800 }}>{value}</div>
      <div style={{ ...eyebrow, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ ...cardS, color: 'var(--muted)', fontSize: 14, lineHeight: 1.65 }}>{text}</div>
}

function OfferChip({ icon, text }: { icon: string; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 11px', fontSize: 12, color: '#e0dccf' }}>
      <span aria-hidden>{icon}</span>{text}
    </span>
  )
}

function SolutionCard({ interview, onReq }: { interview: BizInterview; onReq: (d: ReqDraft) => void }) {
  const s = interview.solution!
  const field = (label: string, text: string) => text
    ? <div style={{ marginTop: 10 }}><div style={{ ...eyebrow, color: 'var(--gold-light)' }}>{label}</div><p style={{ color: '#d8d3c6', margin: '3px 0 0', lineHeight: 1.6 }}>{text}</p></div>
    : null

  return (
    <div style={cardS}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 19 }}>{interview.student_name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{interview.school_name}{interview.grade_level ? ` · ${interview.grade_level}` : ''}{interview.student_age ? ` · Age ${interview.student_age}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {s.video_url && <a className="btn btn--sm" href={s.video_url} target="_blank" rel="noreferrer">▶ Video</a>}
          {s.written_url && <a className="btn btn--sm" href={s.written_url} target="_blank" rel="noreferrer">📄 Document</a>}
          {s.materials.map((m) => <a key={m.url} className="btn btn--sm" href={m.url} target="_blank" rel="noreferrer">📎 {m.label}</a>)}
        </div>
      </div>

      {field('Problem identified', s.problem_identified)}
      {field('Proposed solution', s.proposed_solution)}
      {field('How it helps', s.how_it_helps)}
      {field('Expected impact', s.expected_impact)}

      {/* opportunity requests (no rating) */}
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn--solid btn--sm" onClick={() => onReq({ type: 'implementation', title: `Implement: ${interview.student_name}'s solution`, submission_id: s.submission_id, note: '' })}>Request Help Implementing This Solution</button>
        {interview.internship_eligible && (
          <button className="btn btn--sm" onClick={() => onReq({ type: 'internship', title: `Internship / Hiring: ${interview.student_name}`, student_id: interview.student_id, note: '' })}>Request Internship / Hiring</button>
        )}
        <button className="btn btn--sm" onClick={() => onReq({ type: 'contact_school', title: `Contact ${interview.school_name}`, student_id: interview.student_id, school_name: interview.school_name, note: '' })}>Contact School</button>
      </div>
    </div>
  )
}

function ProfileEditor({ profile, onSaved }: { profile: BizProfile; onSaved: (p: BizProfile) => void }) {
  const [p, setP] = useState<BizProfile>(profile)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const set = (k: keyof BizProfile, v: string) => setP((prev) => ({ ...prev, [k]: v }))

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(''); setErr('')
    try {
      const d = await api.put<BizDashboard>('business/profile', {
        business_name: p.business_name, category: p.category, borough: p.borough,
        contact_name: p.contact_name, contact_phone: p.contact_phone, website: p.website, about: p.about,
      })
      onSaved(d.profile || p); setMsg('Saved ✓')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} style={{ ...cardS, display: 'grid', gap: 14, maxWidth: 620 }}>
      <div><label style={labelS}>Business name *</label><input style={inputS} required value={p.business_name} onChange={(e) => set('business_name', e.target.value)} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div><label style={labelS}>Category</label><input style={inputS} value={p.category || ''} onChange={(e) => set('category', e.target.value)} /></div>
        <div><label style={labelS}>Borough / County</label><input style={inputS} value={p.borough || ''} onChange={(e) => set('borough', e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div><label style={labelS}>Contact name</label><input style={inputS} value={p.contact_name || ''} onChange={(e) => set('contact_name', e.target.value)} /></div>
        <div><label style={labelS}>Phone</label><input style={inputS} value={p.contact_phone || ''} onChange={(e) => set('contact_phone', e.target.value)} /></div>
      </div>
      <div><label style={labelS}>Website</label><input style={inputS} value={p.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></div>
      <div><label style={labelS}>About your business</label><textarea style={{ ...inputS, minHeight: 90, resize: 'vertical' }} value={p.about || ''} onChange={(e) => set('about', e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn--solid btn--sm" disabled={busy}>{busy ? 'Saving…' : 'Save Profile'}</button>
        {msg && <span style={{ color: 'var(--gold-light)', fontSize: 13 }}>{msg}</span>}
        {err && <span style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  )
}
