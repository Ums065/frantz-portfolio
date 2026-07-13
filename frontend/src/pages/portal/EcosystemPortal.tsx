import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useSeo } from '../../hooks/useSeo'
import { resolveDashboardRoute } from '../../lib/dashboardRoute'

/* Shared shell for the ecosystem role portals (Sponsor / Partner / Media /
   Volunteer). Owns the login / register / pending / wrong-role states and the
   authenticated page frame; each concrete portal supplies a config + a
   renderDashboard() for its role-specific body. Keeps every portal lean and
   visually consistent with the Business/Judge/Admin dark+gold theme. */

export const S = {
  wrap: { minHeight: '100vh', color: 'var(--white)', padding: '0 24px 60px', fontFamily: 'var(--f-body)' } as React.CSSProperties,
  card: { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 } as React.CSSProperties,
  label: { display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gold-light)', marginBottom: 6 } as React.CSSProperties,
  input: { width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 9, padding: '11px 13px', color: 'var(--ivory)', fontSize: 14 } as React.CSSProperties,
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)' } as React.CSSProperties,
}

export function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ ...S.card, textAlign: 'center' }}>
      <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, fontWeight: 800 }}>{value}</div>
      <div style={{ ...S.eyebrow, marginTop: 4 }}>{label}</div>
    </div>
  )
}

export function DownloadList({ items }: { items?: Array<{ label: string; url: string }> }) {
  if (!items?.length) return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Nothing here yet.</p>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {items.map((r) => (
        <a key={r.url + r.label} className="btn btn--sm" href={r.url} target="_blank" rel="noreferrer">⬇ {r.label}</a>
      ))}
    </div>
  )
}

const ecoDate = (ts: number) => { try { return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const ecoStatus = (s: string): React.CSSProperties => {
  const m: Record<string, string> = { approved: 'var(--gold-light)', declined: '#ff9a9a', info_needed: 'var(--gold)', pending: 'var(--muted)' }
  return { color: m[s] || 'var(--muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', flex: '0 0 auto' }
}

export interface EcoDoc { id: number; doc_type: string; label: string; url: string; created_ts: number }
export interface EcoReq { id: number; req_type: string; message: string; status: string; admin_note: string; created_ts: number }
export interface EcoAnn { id: number; title: string; body: string; created_ts: number }

/** A titled card section with an optional action on the right. */
export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={S.eyebrow}>{title}</div>{right}
      </div>
      {children}
    </section>
  )
}

export function EcoDocuments({ docs }: { docs?: EcoDoc[] }) {
  if (!docs?.length) return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No documents have been issued to your account yet.</p>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {docs.map((d) => <a key={d.id} className="btn btn--sm" href={d.url} target="_blank" rel="noreferrer">⬇ {d.label}{d.doc_type && d.doc_type !== 'document' ? ` · ${d.doc_type}` : ''}</a>)}
    </div>
  )
}

export function EcoAnnouncements({ items }: { items?: EcoAnn[] }) {
  if (!items?.length) return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No announcements yet.</p>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((a) => (
        <div key={a.id} style={{ borderLeft: '2px solid var(--gold)', paddingLeft: 12 }}>
          <div style={{ color: 'var(--ivory)', fontWeight: 700, fontSize: 14 }}>{a.title}</div>
          {a.body && <div style={{ color: '#d8d3c6', fontSize: 13, marginTop: 2, lineHeight: 1.55 }}>{a.body}</div>}
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>{ecoDate(a.created_ts)}</div>
        </div>
      ))}
    </div>
  )
}

export function EcoRequests({ items }: { items?: EcoReq[] }) {
  if (!items?.length) return <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No requests yet.</p>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
          <div>
            <span style={{ color: 'var(--ivory)', fontWeight: 700, textTransform: 'capitalize' }}>{r.req_type}</span>
            {r.message && <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{r.message}</div>}
            {r.admin_note && <div style={{ color: 'var(--gold-light)', fontSize: 12.5 }}>Admin: {r.admin_note}</div>}
            <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{ecoDate(r.created_ts)}</div>
          </div>
          <span style={ecoStatus(r.status)}>{r.status.replace('_', ' ')}</span>
        </div>
      ))}
    </div>
  )
}

/** Logo/branding uploader — posts to ecosystem/{role}/logo then reloads. */
export function LogoUploader({ role, current, reload }: { role: string; current?: string; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ width: 60, height: 60, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {current ? <img src={current} alt="logo" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} /> : <span style={{ color: 'var(--muted)', fontSize: 10 }}>No logo</span>}
      </div>
      <label className="btn btn--sm" style={{ cursor: 'pointer' }}>{busy ? 'Uploading…' : (current ? 'Replace logo' : 'Upload logo')}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => { const f = e.target.files?.[0] || null; e.target.value = ''; if (!f) return; setBusy(true); try { await api.upload(`ecosystem/${role}/logo`, f); reload() } catch { /* ignore */ } finally { setBusy(false) } }} />
      </label>
    </div>
  )
}

/** A button that opens a small modal to raise an ecosystem request (with an
    optional note), then reloads. Consistent, mobile-friendly (no browser prompt). */
export function RequestButton({ role, reqType, label, reload, solid }: { role: string; reqType: string; label: string; reload: () => void; solid?: boolean }) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await api.post(`ecosystem/${role}/request`, { req_type: reqType, message: msg })
      setDone(true); reload()
      setTimeout(() => { setOpen(false); setDone(false); setMsg('') }, 900)
    } catch { /* ignore */ } finally { setBusy(false) }
  }
  return (
    <>
      <button className={`btn btn--sm${solid ? ' btn--solid' : ''}`} onClick={() => setOpen(true)}>{label}</button>
      {open && createPortal(
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
          <div className="glass" style={{ maxWidth: 440, width: '92%', margin: '14vh auto', padding: 24, borderRadius: 16 }}>
            <div style={S.eyebrow}>{label}</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 12px', lineHeight: 1.5 }}>Add an optional note for the program team, then send. They'll review and follow up.</p>
            <textarea style={{ ...S.input, minHeight: 84, resize: 'vertical' }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Optional note…" autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn--sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button className="btn btn--sm btn--solid" onClick={submit} disabled={busy || done}>{done ? 'Sent ✓' : busy ? 'Sending…' : 'Send Request'}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  )
}

export interface PortalField { key: string; label: string; kind?: 'text' | 'select' | 'textarea'; options?: string[]; placeholder?: string; full?: boolean }
export interface PortalConfig {
  role: string
  title: string
  tagline: string
  orgLabel?: string
  extraFields?: PortalField[]
  renderDashboard: (data: any, reload: () => void, ctx: { logout: () => void }) => ReactNode
}

const ADMIN_ROLES = ['admin', 'super_admin', 'editor']

export default function EcosystemPortal({ config }: { config: PortalConfig }) {
  const { role, title, tagline, orgLabel, extraFields = [], renderDashboard } = config
  const { user, loading, login, refresh, logout } = useAuth()
  const navigate = useNavigate()
  useSeo({ title: `${title}`, description: tagline, noindex: true })

  const uRole = (user?.role || '').toLowerCase()
  const isRole = uRole === role
  const isAdmin = ADMIN_ROLES.includes(uRole)
  const approved = (user?.approval_status === 'approved') || isAdmin

  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [busy, setBusy] = useState('')
  const [f, setF] = useState<Record<string, string>>({})
  const [agree, setAgree] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  const ref = (() => { try { return new URLSearchParams(window.location.search).get('ref')?.trim() || '' } catch { return '' } })()

  const reload = useCallback(async () => {
    if (!user || !(isRole || isAdmin) || !approved) return
    try { setData(await api.get(`ecosystem/${role}/dashboard`)); setErr('') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load your dashboard.') }
  }, [user, isRole, isAdmin, approved, role])

  useEffect(() => { void reload() }, [reload])

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const doLogin = async (e: FormEvent) => {
    e.preventDefault(); setBusy('login'); setErr('')
    try { const r = await login(loginEmail.trim(), loginPass); if (!r.user) setErr(r.message || 'Sign in failed.') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Sign in failed.') }
    finally { setBusy('') }
  }

  const doRegister = async (e: FormEvent) => {
    e.preventDefault(); setBusy('register'); setErr('')
    try {
      await api.post(`ecosystem/${role}/register`, {
        full_name: (f.full_name || '').trim(),
        email: (f.email || '').trim(),
        password: f.password || '',
        org_name: (f.org_name || '').trim(),
        contact_phone: (f.contact_phone || '').trim(),
        website: (f.website || '').trim(),
        about: (f.about || '').trim(),
        ref,
        ...Object.fromEntries(extraFields.map((x) => [x.key, (f[x.key] || '').trim()])),
      })
      await refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Registration failed.') }
    finally { setBusy('') }
  }

  // ---- loading ----
  if (loading) {
    return (
      <div className="admin-page" style={S.wrap}>
        <div className="glass" style={{ maxWidth: 420, margin: '90px auto', padding: 36, borderRadius: 16, textAlign: 'center' }}>
          <span style={S.eyebrow}>{title}</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, marginTop: 8 }}>Loading…</h1>
        </div>
      </div>
    )
  }

  // ---- not signed in ----
  if (!user) {
    return (
      <div className="admin-page" style={S.wrap}>
        <div className="glass" style={{ maxWidth: 580, margin: '48px auto', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '26px 30px 0' }}>
            <span style={S.eyebrow}>{title}</span>
            <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, margin: '6px 0 6px' }}>{title}</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.65 }}>{tagline}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button className={`btn btn--sm${mode === 'register' ? ' btn--solid' : ''}`} onClick={() => { setMode('register'); setErr('') }}>Register</button>
              <button className={`btn btn--sm${mode === 'login' ? ' btn--solid' : ''}`} onClick={() => { setMode('login'); setErr('') }}>Sign In</button>
            </div>
          </div>
          {err && <p style={{ color: '#ff9a9a', fontSize: 13, padding: '12px 30px 0' }}>{err}</p>}

          {mode === 'login' ? (
            <form onSubmit={doLogin} style={{ padding: '18px 30px 30px', display: 'grid', gap: 14 }}>
              <div><label style={S.label}>Email</label><input style={S.input} type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /></div>
              <div><label style={S.label}>Password</label><input style={S.input} type="password" required value={loginPass} onChange={(e) => setLoginPass(e.target.value)} /></div>
              <button className="btn btn--solid" disabled={busy === 'login'}>{busy === 'login' ? 'Signing in…' : 'Sign In'}</button>
            </form>
          ) : (
            <form onSubmit={doRegister} style={{ padding: '18px 30px 30px', display: 'grid', gap: 14 }}>
              {orgLabel && <div><label style={S.label}>{orgLabel} *</label><input style={S.input} required value={f.org_name || ''} onChange={(e) => set('org_name', e.target.value)} /></div>}
              {extraFields.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: extraFields.length > 1 ? 'repeat(auto-fit, minmax(150px, 1fr))' : '1fr', gap: 12 }}>
                  {extraFields.map((x) => (
                    <div key={x.key} style={x.full ? { gridColumn: '1 / -1' } : undefined}>
                      <label style={S.label}>{x.label}</label>
                      {x.kind === 'select' ? (
                        <select style={S.input} value={f[x.key] || ''} onChange={(e) => set(x.key, e.target.value)}>
                          <option value="">Select…</option>
                          {(x.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : x.kind === 'textarea' ? (
                        <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={f[x.key] || ''} onChange={(e) => set(x.key, e.target.value)} placeholder={x.placeholder} />
                      ) : (
                        <input style={S.input} value={f[x.key] || ''} onChange={(e) => set(x.key, e.target.value)} placeholder={x.placeholder} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div><label style={S.label}>Your name (contact) *</label><input style={S.input} required value={f.full_name || ''} onChange={(e) => set('full_name', e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div><label style={S.label}>Email *</label><input style={S.input} type="email" required value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
                <div><label style={S.label}>Phone</label><input style={S.input} value={f.contact_phone || ''} onChange={(e) => set('contact_phone', e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <div><label style={S.label}>Website</label><input style={S.input} value={f.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://…" /></div>
                <div><label style={S.label}>Password *</label><input style={S.input} type="password" required value={f.password || ''} onChange={(e) => set('password', e.target.value)} placeholder="6+ characters" /></div>
              </div>
              <div><label style={S.label}>About</label><textarea style={{ ...S.input, minHeight: 64, resize: 'vertical' }} value={f.about || ''} onChange={(e) => set('about', e.target.value)} /></div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--ivory)', fontSize: 13 }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I agree to the platform terms and confirm the information above is accurate.</span>
              </label>
              <button className="btn btn--solid" disabled={busy === 'register' || !agree}>{busy === 'register' ? 'Submitting…' : 'Create Account'}</button>
              <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>New accounts are reviewed by an admin before your dashboard unlocks.</p>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ---- wrong role ----
  if (!isRole && !isAdmin) {
    return (
      <div className="admin-page" style={S.wrap}>
        <div className="glass" style={{ maxWidth: 460, margin: '80px auto', padding: 36, borderRadius: 16, textAlign: 'center' }}>
          <span style={S.eyebrow}>{title}</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 8px' }}>Different Account Type</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.65 }}>You're signed in with a {uRole || 'different'} account. This portal is for {role} accounts.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn--solid" onClick={() => navigate(resolveDashboardRoute(uRole))}>My Dashboard</button>
            <button className="btn" onClick={() => logout()}>Sign Out</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- pending ----
  if (isRole && !approved) {
    return (
      <div className="admin-page" style={S.wrap}>
        <div className="glass" style={{ maxWidth: 480, margin: '80px auto', padding: 36, borderRadius: 16, textAlign: 'center' }}>
          <span style={S.eyebrow}>{title}</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 10px' }}>Account Pending Approval</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>Thanks for registering. An admin is reviewing your account and your dashboard will unlock once it's approved.</p>
          <button className="btn" onClick={() => logout()}>Sign Out</button>
        </div>
      </div>
    )
  }

  // ---- approved dashboard ----
  return (
    <div className="admin-page" style={S.wrap}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, margin: '8px 0 22px' }}>
          <div>
            <span style={S.eyebrow}>{title}</span>
            <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, margin: '4px 0 0' }}>{data?.profile?.org_name || title}</h1>
          </div>
          <button className="btn btn--sm" onClick={() => logout()}>Sign Out</button>
        </header>
        {err && <p style={{ color: '#ff9a9a', fontSize: 13, marginBottom: 14 }}>{err}</p>}
        {renderDashboard(data, () => { void reload() }, { logout })}
      </div>
    </div>
  )
}
