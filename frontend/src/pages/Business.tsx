import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'

/* Business Portal — the "receive solutions & interact" dashboard for a local
   business owner. Self-contained: it owns the login / register / pending /
   dashboard states so a business can go from signup to reviewing student ideas
   without leaving the page. Reads the existing student→business interview and
   solution data (matched to the account by business name). */

const WRAP_S: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 24px 60px', fontFamily: 'var(--f-body)' }
const cardS: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }
const labelS: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', marginBottom: 6 }
const inputS: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '11px 13px', color: 'var(--ivory)', fontSize: 14 }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)' }
const thS: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', color: 'var(--gold-light)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.06em' }
const tdS: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'top', color: '#d8d3c6', borderBottom: '1px solid rgba(201,168,76,0.08)' }

interface BizSolution {
  submission_id: number
  status: string
  problem_identified: string
  proposed_solution: string
  how_it_helps: string
  expected_impact: string
  video_url: string | null
  written_url: string | null
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
  student_name: string
  school_name: string
  grade_level: string | null
  solution: BizSolution | null
  solution_pending: boolean
}
interface BizRating {
  rating: number
  would_implement: boolean
  already_implemented: boolean
  need_more_info: boolean
  note: string
}
interface BizDashboard {
  profile: { business_name: string; category: string | null; borough: string | null; contact_name: string | null; contact_phone: string | null; website: string | null; about: string | null } | null
  interviews: BizInterview[]
  impact: { interviews: number; students: number; solutions: number }
  ratings: Record<string, BizRating>
}

type Tab = 'interviews' | 'solutions' | 'impact'

const ADMIN_ROLES = ['admin', 'super_admin', 'editor']

export default function Business() {
  const { user, loading, login, refresh, logout } = useAuth()
  const navigate = useNavigate()
  useSeo({ title: 'Business Portal', description: 'Receive student solutions to your business challenges and rate their ideas.', noindex: true })

  const role = (user?.role || '').toLowerCase()
  const isBusiness = role === 'business'
  const isAdmin = ADMIN_ROLES.includes(role)
  const approved = (user?.approval_status === 'approved') || isAdmin

  const [data, setData] = useState<BizDashboard | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('interviews')
  const [navOpen, setNavOpen] = useState(false)

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
              Students across New York interviewed local businesses and built solutions to real challenges. Register your business to see who interviewed you, review their ideas, and rate them.
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
  const solutionInterviews = interviews.filter((i) => i.solution)
  const NAV: Array<{ key: Tab; label: string }> = [
    { key: 'interviews', label: `Interviews (${interviews.length})` },
    { key: 'solutions', label: `Student Solutions (${solutionInterviews.length})` },
    { key: 'impact', label: 'My Impact' },
  ]

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
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                    <thead><tr><th style={thS}>Student</th><th style={thS}>School</th><th style={thS}>Visited</th><th style={thS}>Challenge they logged</th><th style={thS}>Solution</th></tr></thead>
                    <tbody>
                      {interviews.map((i) => (
                        <tr key={i.id}>
                          <td style={tdS}>{i.student_name}{i.verified && <span title="Signed / verified visit" style={{ color: 'var(--gold)', marginLeft: 6 }}>✓</span>}</td>
                          <td style={tdS}>{i.school_name}{i.grade_level ? ` · ${i.grade_level}` : ''}</td>
                          <td style={tdS}>{i.date_of_visit || '—'}</td>
                          <td style={{ ...tdS, maxWidth: 300 }}>{i.main_challenge || '—'}</td>
                          <td style={tdS}>{i.solution ? <span style={{ color: 'var(--gold-light)' }}>Submitted</span> : i.solution_pending ? <span style={{ color: 'var(--muted)' }}>In progress</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {tab === 'solutions' && (
            solutionInterviews.length === 0
              ? <Empty text="No submitted student solutions yet. When a student who interviewed you submits their solution, it will appear here for you to review and rate." />
              : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {solutionInterviews.map((i) => (
                    <SolutionCard key={i.solution!.submission_id} interview={i} rating={data?.ratings?.[String(i.solution!.submission_id)]} onSaved={(map) => setData((d) => d ? { ...d, ratings: map } : d)} />
                  ))}
                </div>
              )
          )}

          {tab === 'impact' && (
            <div style={{ ...cardS }}>
              <p style={{ color: '#d8d3c6', lineHeight: 1.7, marginTop: 0 }}>
                <strong className="gold-text">{data?.profile?.business_name}</strong> has been part of <strong>{impact.interviews}</strong> student interview{impact.interviews === 1 ? '' : 's'},
                engaging <strong>{impact.students}</strong> student{impact.students === 1 ? '' : 's'} and receiving <strong>{impact.solutions}</strong> solution{impact.solutions === 1 ? '' : 's'} to your real-world challenges.
              </p>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>Every rating you give helps students learn what real businesses value. Thank you for being part of the movement.</p>
            </div>
          )}
        </main>
      </div>
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

function SolutionCard({ interview, rating, onSaved }: { interview: BizInterview; rating?: BizRating; onSaved: (map: Record<string, BizRating>) => void }) {
  const s = interview.solution!
  const [stars, setStars] = useState(rating?.rating ?? 0)
  const [wi, setWi] = useState(!!rating?.would_implement)
  const [ai, setAi] = useState(!!rating?.already_implemented)
  const [nmi, setNmi] = useState(!!rating?.need_more_info)
  const [note, setNote] = useState(rating?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setBusy(true); setErr(''); setSaved(false)
    try {
      const r = await api.post<{ ratings: Record<string, BizRating> }>(`business/rate/${s.submission_id}`, {
        rating: stars, would_implement: wi, already_implemented: ai, need_more_info: nmi, note,
      })
      onSaved(r.ratings || {}); setSaved(true)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save your rating.') }
    finally { setBusy(false) }
  }

  const field = (label: string, text: string) => text
    ? <div style={{ marginTop: 10 }}><div style={{ ...eyebrow, color: 'var(--gold-light)' }}>{label}</div><p style={{ color: '#d8d3c6', margin: '3px 0 0', lineHeight: 1.6 }}>{text}</p></div>
    : null

  return (
    <div style={cardS}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 19 }}>{interview.student_name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{interview.school_name}{interview.grade_level ? ` · ${interview.grade_level}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {s.video_url && <a className="btn btn--sm" href={s.video_url} target="_blank" rel="noreferrer">▶ Video</a>}
          {s.written_url && <a className="btn btn--sm" href={s.written_url} target="_blank" rel="noreferrer">📄 Document</a>}
        </div>
      </div>

      {field('Problem identified', s.problem_identified)}
      {field('Proposed solution', s.proposed_solution)}
      {field('How it helps', s.how_it_helps)}
      {field('Expected impact', s.expected_impact)}

      {/* rating */}
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ ...eyebrow, marginBottom: 8 }}>Rate this idea</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n} stars`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, lineHeight: 1, color: n <= stars ? 'var(--gold)' : 'rgba(255,255,255,0.25)' }}>★</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 10 }}>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', color: 'var(--ivory)', fontSize: 13 }}><input type="checkbox" checked={wi} onChange={(e) => setWi(e.target.checked)} /> Would implement</label>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', color: 'var(--ivory)', fontSize: 13 }}><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> Already implemented</label>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', color: 'var(--ivory)', fontSize: 13 }}><input type="checkbox" checked={nmi} onChange={(e) => setNmi(e.target.checked)} /> Need more info</label>
        </div>
        <textarea style={{ ...inputS, minHeight: 60, resize: 'vertical' }} placeholder="Optional note to the student…" value={note} onChange={(e) => setNote(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
          <button className="btn btn--solid btn--sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Rating'}</button>
          {saved && <span style={{ color: 'var(--gold-light)', fontSize: 13 }}>Saved ✓</span>}
          {err && <span style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</span>}
        </div>
      </div>
    </div>
  )
}
