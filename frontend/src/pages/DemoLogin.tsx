import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'

const DEMO_PASSWORD = 'DemoPass123!'

type DemoAccount = {
  key: 'admin' | 'school' | 'teacher' | 'student' | 'parent'
  roleLabel: string
  name: string
  email: string
  description: string
  dashboardLabel: string
}

const demoAccounts: DemoAccount[] = [
  {
    key: 'admin',
    roleLabel: 'Admin',
    name: 'New School Admin',
    email: 'newschool.admin@frantzcoutard.test',
    description: 'Approvals, exports, winner publishing, and site management.',
    dashboardLabel: '/admin',
  },
  {
    key: 'school',
    roleLabel: 'School Principal',
    name: 'New School Academy Admin',
    email: 'newschool.school@frantzcoutard.test',
    description: 'School verification, teacher approvals, student lists, and rankings.',
    dashboardLabel: '/new-school/dashboard',
  },
  {
    key: 'teacher',
    roleLabel: 'Teacher',
    name: 'Coach Rivera',
    email: 'newschool.teacher@frantzcoutard.test',
    description: 'Student approvals, submissions, and teacher leaderboard review.',
    dashboardLabel: '/new-school/dashboard',
  },
  {
    key: 'student',
    roleLabel: 'Student',
    name: 'Ariana Carter',
    email: 'newschool.student.alpha@frantzcoutard.test',
    description: 'Student dashboard, problem and solution submission, and rankings.',
    dashboardLabel: '/new-school/dashboard',
  },
  {
    key: 'parent',
    roleLabel: 'Parent',
    name: 'Monica Carter',
    email: 'newschool.parent.alpha@frantzcoutard.test',
    description: 'Consent review and student activity monitoring.',
    dashboardLabel: '/new-school/dashboard',
  },
]

export default function DemoLogin() {
  useSeo({
    title: 'Demo Login',
    description: 'One-click demo login for the New School dashboards and admin workspace.',
    noindex: true,
  })

  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const [busyKey, setBusyKey] = useState<DemoAccount['key'] | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const currentRoute = resolveDashboardRoute(user?.role)

  const openDashboard = async (account: DemoAccount) => {
    setBusyKey(account.key)
    setError('')
    setMessage('')
    try {
      const result = await login(account.email, DEMO_PASSWORD)
      const target = resolveDashboardRoute(result.user?.role)
      setMessage(`Signed in as ${result.user?.full_name || account.name}. Opening ${target}.`)
      window.fcToast?.(`Signed in as ${account.roleLabel}.`)
      navigate(target, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in with the demo account.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <main className="page demo-login-page">
      <section className="page-hero demo-login-hero">
        <div className="wrap demo-login-hero__inner">
          <div>
            <div className="eyebrow reveal in">Temporary Access</div>
            <h1 className="page-hero__title gold-text reveal in" style={{ marginTop: 14, marginBottom: 18 }}>
              Demo Login
            </h1>
            <p className="page-hero__lead reveal in d1">
              Use the buttons below to sign in as a seeded admin, school principal, teacher, student, or parent.
              Every account uses the same temporary password.
            </p>
            <div className="demo-login-chips reveal in d2">
              <span className="chip">Shared password: <code>{DEMO_PASSWORD}</code></span>
              <span className="chip">Seed command: <code>npm run seed:new-school</code></span>
              <span className="chip">Role route: admin to <code>/admin</code>, school roles to <code>/new-school/dashboard</code></span>
            </div>
          </div>

          <div className="glass demo-login-hero__panel reveal in d1">
            <p className="eyebrow" style={{ marginBottom: 0 }}>Current Session</p>
            {user ? (
              <>
                <strong className="gold-text" style={{ fontSize: 20, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {user.full_name}
                </strong>
                <p className="demo-login-note" style={{ margin: 0 }}>
                  Role: <code>{user.role}</code><br />
                  Approved status: <code>{user.approval_status || 'approved'}</code><br />
                  Current dashboard: <code>{currentRoute}</code>
                </p>
                <div className="demo-login-panel__actions">
                  <Link className="btn btn--solid btn--sm" to={currentRoute}>Open Dashboard</Link>
                  <button className="btn btn--sm" type="button" onClick={() => logout()}>
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <>
                <strong className="gold-text" style={{ fontSize: 20, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Ready to test
                </strong>
                <p className="demo-login-note" style={{ margin: 0 }}>
                  Pick a role below and the app will sign in with the seeded account, then route you to the right dashboard.
                </p>
                <div className="demo-login-panel__actions">
                <Link className="btn btn--solid btn--sm" to="/new-school">Open New School</Link>
                  <Link className="btn btn--sm" to="/">Back Home</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="wrap demo-login-grid">
        <div className="demo-login-role-grid">
          {demoAccounts.map((account) => (
            <article key={account.key} className="glass demo-login-card">
              <div className="demo-login-card__head">
                <div>
                  <div className="demo-login-card__role">{account.roleLabel}</div>
                  <h2 className="demo-login-card__title">{account.name}</h2>
                </div>
                <span className="ns-board__badge" style={{ whiteSpace: 'nowrap' }}>
                  {account.dashboardLabel}
                </span>
              </div>
              <p className="demo-login-card__desc">{account.description}</p>
              <div className="demo-login-card__credentials">
                <div><span>Email</span> <code>{account.email}</code></div>
                <div><span>Password</span> <code>{DEMO_PASSWORD}</code></div>
              </div>
              <button
                className="btn btn--solid"
                type="button"
                disabled={busyKey !== null}
                onClick={() => openDashboard(account)}
              >
                {busyKey === account.key ? 'Signing in...' : `Login as ${account.roleLabel}`}
              </button>
            </article>
          ))}
        </div>

        <aside className="glass demo-login-panel">
          <div>
            <p className="eyebrow">Why This Exists</p>
            <h2 className="gold-text" style={{ margin: '10px 0 12px', fontSize: 24, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Fast role testing
            </h2>
            <p className="demo-login-note">
              This page is for local testing. It gives you direct access to the seeded dashboards without typing the
              credentials every time.
            </p>
          </div>

          <div className="demo-login-panel__list">
            <div className="demo-login-panel__item">
              <strong>Admin</strong>
              <p>Review schools, teachers, submissions, winners, and exports.</p>
              <span>Target: /admin</span>
            </div>
            <div className="demo-login-panel__item">
              <strong>School Roles</strong>
              <p>Principal, teacher, student, and parent flows all open the private New School dashboard.</p>
              <span>Target: /new-school/dashboard</span>
            </div>
            <div className="demo-login-panel__item">
              <strong>Seeded Data</strong>
              <p>If the buttons fail, run <code>npm run seed:new-school</code> first so the sample accounts exist.</p>
              <span>Temporary only</span>
            </div>
          </div>

          {error && (
            <p className="demo-login-note" style={{ color: '#e08a8a' }}>{error}</p>
          )}
          {message && (
            <p className="demo-login-note" style={{ color: '#b9d8c4' }}>{message}</p>
          )}
        </aside>
      </section>
    </main>
  )
}
