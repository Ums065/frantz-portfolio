import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'

/* Demo login page (/demo) — one click signs in as a ready-made account for any
   role so the whole platform can be shown in a presentation. Backed by
   DEMO_MODE (api/.env); set DEMO_MODE=off to disable in production. */

interface DemoAccount { role: string; label: string; email: string }

const wrap: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 24px 60px', fontFamily: 'var(--f-body)' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)' }

export default function DemoLogin() {
  const { user, refresh, logout } = useAuth()
  const navigate = useNavigate()
  useSeo({ title: 'Demo Login', description: 'One-click demo login for every dashboard.', noindex: true })

  const [accounts, setAccounts] = useState<DemoAccount[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    api.get<{ accounts: DemoAccount[] }>('demo/accounts')
      .then((d) => setAccounts(d.accounts || []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Demo mode is off.'))
  }, [])

  const loginAs = async (role: string) => {
    setBusy(role); setErr('')
    try {
      await api.post('demo/login', { role })
      await refresh()
      navigate(resolveDashboardRoute(role))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not sign in.'); setBusy('') }
  }

  return (
    <div className="admin-page" style={wrap}>
      <div style={{ maxWidth: 940, margin: '0 auto' }}>
        <header style={{ margin: '10px 0 8px', textAlign: 'center' }}>
          <span style={eyebrow}>Presentation Mode</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 34, margin: '6px 0 8px' }}>Demo Login</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 640, margin: '0 auto', lineHeight: 1.65 }}>
            Click any role to sign in instantly as a ready-made demo account and land on that dashboard. No password needed.
          </p>
          {user && (
            <p style={{ color: 'var(--gold-light)', fontSize: 13, marginTop: 10 }}>
              Signed in as <strong>{user.full_name}</strong> ({user.role}) ·{' '}
              <button className="btn btn--sm" style={{ marginLeft: 6 }} onClick={() => navigate(resolveDashboardRoute(user.role))}>Go to dashboard</button>{' '}
              <button className="btn btn--sm" onClick={() => logout()}>Sign out</button>
            </p>
          )}
        </header>

        {err && <p style={{ color: '#ff9a9a', fontSize: 14, textAlign: 'center', margin: '16px 0' }}>{err}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14, marginTop: 22 }}>
          {accounts.map((a) => (
            <div key={a.role} className="glass" style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 18, lineHeight: 1.2 }}>{a.label}</div>
                <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 4, wordBreak: 'break-all' }}>{a.email}</div>
              </div>
              <button className="btn btn--solid btn--sm" style={{ marginTop: 'auto' }} disabled={busy === a.role} onClick={() => loginAs(a.role)}>
                {busy === a.role ? 'Signing in…' : `Login as ${a.role}`}
              </button>
            </div>
          ))}
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', marginTop: 26 }}>
          Manual sign-in also works with any email above and password <code>demo1234</code>. Disable this page in production with <code>DEMO_MODE=off</code>.
        </p>
      </div>
    </div>
  )
}
