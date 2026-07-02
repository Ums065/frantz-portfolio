import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

interface JudgeRow {
  id: number
  user_id: number
  display_name: string
  email: string
  approval_status: string
  created_at: string
  reviews_submitted: number
  reviews_total: number
}

/** Admin panel: create judge accounts and list existing judges + their review counts. */
export default function JudgesAdminPanel() {
  const [judges, setJudges] = useState<JudgeRow[]>([])
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = () => {
    setBusy(true)
    api.get<{ judges: JudgeRow[] }>('admin/new-school/judges')
      .then((d) => setJudges(Array.isArray(d.judges) ? d.judges : []))
      .catch(() => setJudges([]))
      .finally(() => setBusy(false))
  }

  useEffect(() => { load() }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setMsg('')
    if (name.trim().length < 3) { setErr('Enter the judge full name.'); return }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    setSaving(true)
    try {
      await api.post('admin/new-school/judge', { full_name: name.trim(), email: email.trim().toLowerCase(), password })
      setMsg(`Judge "${name.trim()}" created.`)
      setName(''); setEmail(''); setPassword('')
      load()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create the judge.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="glass" style={{ padding: '18px 20px', marginBottom: 18, maxWidth: 620 }}>
        <h3 className="gold-text" style={{ marginTop: 0 }}>Add a Judge</h3>
        <p className="msub">Judges get their own scoring dashboard at <code>/judge/dashboard</code>. They can score submitted projects but never see automatic points or other judges' scores.</p>
        <form onSubmit={create} style={{ display: 'grid', gap: 12 }}>
          <div className="field"><label>Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Judge name" required /></div>
          <div className="field"><label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="judge@example.com" required /></div>
          <div className="field"><label>Password</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required /></div>
          {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}
          {msg && <p className="msub" style={{ color: 'var(--green-bright)' }}>{msg}</p>}
          <button type="submit" className="btn btn--solid" disabled={saving}>{saving ? 'Creating…' : 'Create Judge'}</button>
        </form>
      </div>

      <h3 className="gold-text">Judges ({judges.length})</h3>
      {busy ? <p className="msub">Loading…</p> : judges.length === 0 ? <p className="msub">No judges yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Submitted</th><th>Total</th><th>Created</th></tr></thead>
            <tbody>
              {judges.map((j) => (
                <tr key={j.id}>
                  <td>{j.display_name}</td>
                  <td>{j.email}</td>
                  <td>{j.reviews_submitted}</td>
                  <td>{j.reviews_total}</td>
                  <td>{j.created_at ? new Date(j.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
