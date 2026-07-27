import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/* Public winners showcase. Reads the public New School overview; winners are only
   present once an admin publishes them (ns_winners_published). Before that, a
   friendly "coming soon" message shows. */

interface Winner {
  id: number
  place: 'first' | 'second' | 'third' | string
  scholarship_amount: number | string
  student_name: string
  grade_level?: string
  school_name?: string
}
const PLACE = { first: { label: '1st Place', medal: '🥇', order: 1 }, second: { label: '2nd Place', medal: '🥈', order: 2 }, third: { label: '3rd Place', medal: '🥉', order: 3 } } as const

export default function Winners() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [published, setPublished] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ winners?: Winner[]; winners_published?: boolean }>('new-school/overview')
      .then((d) => { setWinners(Array.isArray(d.winners) ? d.winners : []); setPublished(!!d.winners_published) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const sorted = [...winners].sort((a, b) => (PLACE[a.place as keyof typeof PLACE]?.order ?? 9) - (PLACE[b.place as keyof typeof PLACE]?.order ?? 9))
  const money = (v: number | string) => (Number(v) > 0 ? `$${Number(v).toLocaleString()}` : '')

  return (
    <div className="admin-page" style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(20px,4vw,40px) 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <span className="eyebrow" style={{ color: 'var(--gold)' }}>Community Business Impact Challenge</span>
        <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(28px,6vw,44px)', margin: '8px 0 6px' }}>🏆 Our Winners</h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
          Celebrating the students who left their community better than they found it.
        </p>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>
      ) : !published || sorted.length === 0 ? (
        <div className="glass" style={{ maxWidth: 560, margin: '20px auto', padding: 32, borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎖️</div>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 22, margin: '0 0 8px' }}>Winners coming soon</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Judging is under way. The winners will be announced here once results are published — check back soon!
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 18 }}>
          {sorted.map((w) => {
            const p = PLACE[w.place as keyof typeof PLACE]
            return (
              <div key={w.id} className="glass" style={{ padding: 26, borderRadius: 16, textAlign: 'center', border: '1px solid rgba(201,168,76,0.35)', background: 'linear-gradient(160deg, rgba(212,175,90,0.12), rgba(255,255,255,0.03))' }}>
                <div style={{ fontSize: 46, lineHeight: 1 }}>{p?.medal ?? '🏅'}</div>
                <div style={{ color: 'var(--gold-light)', fontWeight: 800, letterSpacing: '.06em', marginTop: 8, fontSize: 14, textTransform: 'uppercase' }}>{p?.label ?? 'Winner'}</div>
                <div style={{ fontFamily: 'var(--f-serif)', fontSize: 24, color: '#fff', margin: '10px 0 2px' }}>{w.student_name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{[w.school_name, w.grade_level].filter(Boolean).join(' · ')}</div>
                {money(w.scholarship_amount) && <div style={{ color: '#8fd6a3', fontWeight: 700, marginTop: 12, fontSize: 16 }}>{money(w.scholarship_amount)} scholarship</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
