import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useSeo } from '../hooks/useSeo'
import DonateForm from '../components/DonateForm'

/* The public giving page. Also the page Stripe returns to: it arrives with the
   donation number and session id, confirms the payment server-side and issues
   the receipt, so a donor who closes the tab still gets one on the next visit
   to this URL. */

export default function Donate() {
  useSeo({
    title: 'Donate — Student Impact Challenge',
    description: 'Fund the Student Impact Challenge: scholarships, the school-impact grant and the showcase night. A program of TrendCatch Gives Back Inc., a registered 501(c)(3) nonprofit.',
  })
  const [params] = useSearchParams()
  const donationNo = params.get('donation')
  const sessionId = params.get('session_id')
  const cancelled = params.get('cancelled')
  const [state, setState] = useState<'idle' | 'confirming' | 'done' | 'failed'>(donationNo && sessionId ? 'confirming' : 'idle')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!donationNo || !sessionId) return
    api.post<{ message: string }>('donate/confirm', { donation_no: donationNo, session_id: sessionId })
      .then((r) => { setMsg(r.message || 'Thank you — your donation is confirmed.'); setState('done') })
      .catch((e) => { setMsg(e instanceof Error ? e.message : 'We could not confirm that payment.'); setState('failed') })
  }, [donationNo, sessionId])

  return (
    <main className="page-wrap" style={{ maxWidth: 860, margin: '0 auto', padding: '0 clamp(14px,4vw,24px) 70px' }}>
      <header style={{ paddingTop: 34, textAlign: 'center' }}>
        <span className="admin-kicker">TrendCatch Gives Back Inc. · 501(c)(3)</span>
        <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(26px,5vw,38px)', margin: '6px 0 8px' }}>
          Fund the whole challenge
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, maxWidth: '60ch', margin: '0 auto' }}>
          You are not being asked to adopt one student. You are being asked to power the contest that reaches all of
          them — the scholarships, the school-impact grant, educator recognition and the showcase night.
        </p>
      </header>

      {state === 'confirming' && (
        <div className="glass" style={{ padding: 22, borderRadius: 14, marginTop: 26, textAlign: 'center' }}>
          <p className="msub" style={{ margin: 0 }}>Confirming your payment…</p>
        </div>
      )}
      {state === 'done' && (
        <div className="glass" style={{ padding: 26, borderRadius: 14, marginTop: 26, textAlign: 'center' }}>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', marginTop: 0 }}>Thank you</h2>
          <p style={{ color: '#ded8c8', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{msg}</p>
          <p className="msub" style={{ fontSize: 13, marginTop: 10 }}>
            Your official receipt is on its way by email. Keep it with your tax records.
          </p>
        </div>
      )}
      {state === 'failed' && (
        <div className="fc-dup" style={{ marginTop: 26 }}>
          {msg} If you were charged, contact the office and we will sort it out — nothing is lost.
        </div>
      )}
      {cancelled && state === 'idle' && (
        <p className="msub" style={{ textAlign: 'center', marginTop: 22 }}>
          That payment was cancelled — nothing was charged. You are welcome to try again below.
        </p>
      )}

      {state !== 'done' && (
        <section className="glass" style={{ padding: 'clamp(18px,3vw,26px)', borderRadius: 16, marginTop: 26 }}>
          <DonateForm />
        </section>
      )}

      <section style={{ marginTop: 28 }}>
        <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 20 }}>Where your gift goes</h2>
        <ul style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
          <li><strong style={{ color: '#f0ead6' }}>Student scholarships</strong> — awarded to students whose solutions reach the judges.</li>
          <li><strong style={{ color: '#f0ead6' }}>The school-impact grant</strong> — paid to the winning school, for the school.</li>
          <li><strong style={{ color: '#f0ead6' }}>Educator recognition</strong> — the teachers who run this on top of their teaching.</li>
          <li><strong style={{ color: '#f0ead6' }}>Showcase night</strong> — the evening students present their work to their community.</li>
        </ul>
        <p className="msub" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          Donations are made payable to TrendCatch Gives Back Inc. and are tax-deductible to the extent allowed by law.
          Card payments are processed by Stripe and PayPal; card details never reach our servers.
        </p>
      </section>
    </main>
  )
}
