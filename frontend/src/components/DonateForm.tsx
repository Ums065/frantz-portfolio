import { useCallback, useEffect, useRef, useState } from 'react'
import { loadStripe, type Stripe as StripeJS, type StripeElements } from '@stripe/stripe-js'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

/* Online giving, on the same Stripe and PayPal accounts the store already uses.
   Both are confirmed right in this form (a Stripe Payment Element for cards,
   PayPal's own inline buttons) so no card details ever touch our servers and
   the donor never leaves the page.
   Used by the public /donate page and by the partner/sponsor/media/volunteer
   portals, where the donor's name and organisation are already known. */

interface Config {
  methods: string[]
  stripe_enabled?: boolean
  paypal_enabled?: boolean
  paypal_client_id?: string
  stripe_publishable_key?: string
  currency?: string
  designations: string[]
  org_legal_name: string
  receipts_complete: boolean
}

const PRESETS = [25, 50, 100, 250, 1000, 5000]
const money = (n: number, cur = 'usd') => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase(), maximumFractionDigits: 0 }).format(n)

declare global { interface Window { paypal?: any } }

let stripePromise: Promise<StripeJS | null> | null = null
function getStripe(publishableKey: string) {
  if (!stripePromise) stripePromise = loadStripe(publishableKey)
  return stripePromise
}

export default function DonateForm({ compact }: { compact?: boolean } = {}) {
  const { user } = useAuth()
  const [cfg, setCfg] = useState<Config | null>(null)
  const [amount, setAmount] = useState<number>(100)
  const [custom, setCustom] = useState('')
  const [f, setF] = useState({ donor_name: '', email: '', organization: '', designation: '', message: '', is_anonymous: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const [ppReady, setPpReady] = useState(false)
  const [stripeIntent, setStripeIntent] = useState<{ donationNo: string; clientSecret: string; amount: number } | null>(null)
  const [payingCard, setPayingCard] = useState(false)
  const cardMountRef = useRef<HTMLDivElement | null>(null)
  const stripeRef = useRef<StripeJS | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentElementRef = useRef<any>(null)

  useEffect(() => {
    api.get<Config>('donate/config').then(setCfg).catch(() => setErr('Could not load the donation form.'))
  }, [])
  // Prefill from the signed-in account — a partner or sponsor should not retype it.
  useEffect(() => {
    if (!user) return
    setF((p) => ({
      ...p,
      donor_name: p.donor_name || user.full_name || '',
      email: p.email || user.email || '',
    }))
  }, [user])

  const value = custom.trim() !== '' ? Math.max(0, Number(custom) || 0) : amount
  const cur = cfg?.currency || 'usd'
  const canPay = value >= 1 && f.donor_name.trim() !== '' && f.email.trim() !== ''

  /* Stripe: create the donation + a PaymentIntent, then confirm the card right here (no redirect). */
  const startCardPayment = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.post<{ donation_no: string; client_secret: string }>('donate/checkout', { ...f, amount: value, provider: 'stripe' })
      if (!r.client_secret) throw new Error('Stripe did not return a payment.')
      setStripeIntent({ donationNo: r.donation_no, clientSecret: r.client_secret, amount: value })
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the payment.') } finally { setBusy(false) }
  }

  // Mount the Stripe Payment Element as soon as we have a client secret + the card mount point.
  useEffect(() => {
    if (!stripeIntent || !cfg?.stripe_publishable_key) return
    let cancelled = false
    getStripe(cfg.stripe_publishable_key).then((stripe) => {
      if (cancelled || !stripe || !cardMountRef.current) return
      const elements = stripe.elements({ clientSecret: stripeIntent.clientSecret })
      const paymentElement = elements.create('payment')
      paymentElement.mount(cardMountRef.current)
      stripeRef.current = stripe
      elementsRef.current = elements
      paymentElementRef.current = paymentElement
    })
    return () => {
      cancelled = true
      paymentElementRef.current?.unmount()
      paymentElementRef.current = null
      elementsRef.current = null
    }
  }, [stripeIntent, cfg?.stripe_publishable_key])

  // Editing the amount/name/email after starting a card payment would pay the OLD
  // values while showing the NEW ones — invalidate the in-progress intent instead.
  useEffect(() => {
    setStripeIntent((cur) => (cur ? null : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, f.donor_name, f.email, f.designation])

  const payWithStripe = async () => {
    if (!stripeRef.current || !elementsRef.current || !stripeIntent) return
    setPayingCard(true); setErr('')
    try {
      const { error, paymentIntent } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        redirect: 'if_required',
      })
      if (error) throw new Error(error.message || 'Card payment failed.')
      if (!paymentIntent || paymentIntent.status !== 'succeeded') throw new Error('Payment was not completed.')
      const r = await api.post<{ message: string }>('donate/confirm-stripe-intent', {
        donation_no: stripeIntent.donationNo,
        payment_intent_id: paymentIntent.id,
      })
      setDone(r.message || 'Thank you — your donation is confirmed.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Card payment failed.') } finally { setPayingCard(false) }
  }

  /* PayPal: load their SDK once, then approve in their popup and capture here. */
  const mountPayPal = useCallback((node: HTMLDivElement | null) => {
    if (!node || ppReady || !cfg?.paypal_enabled || !cfg.paypal_client_id) return
    const start = () => {
      if (!window.paypal) return
      setPpReady(true)
      node.innerHTML = ''
      window.paypal.Buttons({
        style: { color: 'gold', shape: 'pill', label: 'donate' },
        createOrder: async () => {
          const r = await api.post<{ paypal_order_id: string; donation_no: string }>('donate/checkout', { ...f, amount: value, provider: 'paypal' })
          // Remember which donation this PayPal order belongs to, for the capture.
          node.dataset.donationNo = r.donation_no
          return r.paypal_order_id
        },
        onApprove: async (data: any) => {
          try {
            const r = await api.post<{ message: string }>('donate/paypal-capture', {
              donation_no: node.dataset.donationNo, paypal_order_id: data.orderID,
            })
            setDone(r.message || 'Thank you — your donation is confirmed.')
          } catch (e) { setErr(e instanceof Error ? e.message : 'PayPal could not complete the payment.') }
        },
        onError: () => setErr('PayPal could not complete the payment.'),
      }).render(node)
    }
    if (window.paypal) { start(); return }
    const s = document.createElement('script')
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypal_client_id)}&currency=${cur.toUpperCase()}&intent=capture`
    s.onload = start
    document.body.appendChild(s)
  }, [cfg, f, value, cur, ppReady])

  if (done) {
    return (
      <div className="fc-empty">
        <span style={{ fontSize: 34 }}>♥</span>
        <h4>{done}</h4>
        <p className="msub">Your receipt is on its way to {f.email}. Keep it with your tax records.</p>
      </div>
    )
  }

  return (
    <div className="don-form">
      {!compact && (
        <p className="msub" style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          Your gift funds the Student Impact Challenge itself — the scholarships, the school-impact grant and the
          showcase night — rather than any one student. {cfg?.org_legal_name} is a registered 501(c)(3) nonprofit,
          and you will get a receipt for your tax records straight away.
        </p>
      )}

      <fieldset className="don-amounts">
        <legend className="fc-fld" style={{ marginBottom: 6 }}>Choose an amount</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`btn btn--sm${value === p && custom.trim() === '' ? ' btn--solid' : ''}`}
              onClick={() => { setAmount(p); setCustom('') }}>{money(p, cur)}</button>
          ))}
        </div>
        <label className="fc-fld" style={{ marginTop: 10 }}>Or another amount
          <input className="fc-input" type="number" min={1} step="1" value={custom}
            onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 75" />
        </label>
      </fieldset>

      <div className="don-grid">
        <label className="fc-fld">Your name <span style={{ textTransform: 'none', fontWeight: 400 }}>(for the receipt)</span>
          <input className="fc-input" value={f.donor_name} onChange={(e) => setF({ ...f, donor_name: e.target.value })} />
        </label>
        <label className="fc-fld">Email
          <input className="fc-input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="fc-fld">Organisation <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
          <input className="fc-input" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} placeholder="If this gift is from a company or foundation" />
        </label>
        <label className="fc-fld">Put it towards
          <select className="fc-input" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })}>
            <option value="" style={{ background: '#14120b' }}>Where it is needed most</option>
            {(cfg?.designations || []).filter((d) => d !== 'Where it is needed most').map((d) => (
              <option key={d} value={d} style={{ background: '#14120b' }}>{d}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="fc-fld" style={{ display: 'block', marginTop: 10 }}>A note with your gift <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
        <textarea className="fc-input" rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </label>
      <label className="msub" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
        <input type="checkbox" checked={f.is_anonymous} onChange={(e) => setF({ ...f, is_anonymous: e.target.checked })} />
        Do not list my name publicly (we still need it for the receipt)
      </label>

      {err && <p className="msub" style={{ color: '#e08a8a' }}>{err}</p>}

      <div className="don-pay">
        <div style={{ fontFamily: 'var(--f-serif)', fontSize: 22, color: 'var(--gold-light)' }}>
          {value >= 1 ? money(value, cur) : '—'}
        </div>
        <div style={{ display: 'grid', gap: 10, flex: '1 1 240px' }}>
          {cfg?.stripe_enabled && (
            !stripeIntent ? (
              <button className="btn btn--solid" disabled={!canPay || busy} onClick={startCardPayment}>
                {busy ? 'Preparing secure payment…' : 'Give by card'}
              </button>
            ) : (
              <div>
                <div ref={cardMountRef} style={{ marginBottom: 12 }} />
                <button className="btn btn--solid" disabled={payingCard} onClick={payWithStripe}>
                  {payingCard ? 'Processing…' : `Give ${money(stripeIntent.amount, cur)} by card`}
                </button>
              </div>
            )
          )}
          {cfg?.paypal_enabled && (
            <div>
              {canPay
                ? <div ref={mountPayPal} />
                : <p className="msub" style={{ fontSize: 12 }}>Fill in your name, email and an amount to pay with PayPal.</p>}
            </div>
          )}
          {cfg && !cfg.stripe_enabled && !cfg.paypal_enabled && (
            <p className="msub" style={{ color: '#e0a86c', fontSize: 13 }}>
              Online giving is not switched on yet. Please contact the office to donate.
            </p>
          )}
        </div>
      </div>

      <p className="msub" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
        Card details are entered directly into Stripe's secure payment form and never reach our servers.
        {cfg && !cfg.receipts_complete && ' Your receipt will be issued immediately; the office will confirm the tax details on it.'}
      </p>
    </div>
  )
}
