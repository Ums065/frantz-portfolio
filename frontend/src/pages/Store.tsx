import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { api, type InventoryRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'
import { BRAND_LOGO } from '../lib/brandAssets'
import '../styles/store.css'

const LOGO = BRAND_LOGO
const FALLBACK_IMAGE = '/assets/merch-collectible.webp'
const CART_KEY = 'fc-store-cart-v1'

type Tone = 'green' | 'amber' | 'red' | 'muted'

interface CartLine {
  product_id: string
  qty: number
}

interface CheckoutForm {
  customer_name: string
  email: string
  address_line1: string
  city: string
  state: string
  zip_code: string
}

const emptyCheckoutForm: CheckoutForm = {
  customer_name: '',
  email: '',
  address_line1: '',
  city: '',
  state: '',
  zip_code: '',
}

function badgeStyle(tone: Tone): CSSProperties {
  const palette = {
    green: { border: 'rgba(143,191,150,0.38)', color: '#8FBF96', background: 'rgba(15,91,58,0.16)' },
    amber: { border: 'rgba(201,168,76,0.38)', color: '#F5D48A', background: 'rgba(201,168,76,0.12)' },
    red: { border: 'rgba(224,138,138,0.42)', color: '#e08a8a', background: 'rgba(122,59,59,0.16)' },
    muted: { border: 'rgba(128,119,104,0.42)', color: '#807768', background: 'rgba(128,119,104,0.12)' },
  }[tone]

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    padding: '6px 11px',
    border: `1px solid ${palette.border}`,
    color: palette.color,
    background: palette.background,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  }
}

function statusStyle(tone: Tone): CSSProperties {
  return {
    color:
      tone === 'green' ? '#8FBF96'
        : tone === 'amber' ? '#F5D48A'
          : tone === 'red' ? '#e08a8a'
            : '#807768',
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function cartCount(cart: CartLine[]) {
  return cart.reduce((sum, item) => sum + item.qty, 0)
}

function combineAddress(form: CheckoutForm) {
  return [form.address_line1, form.city, form.state, form.zip_code].filter(Boolean).join(', ')
}

function MerchCard({
  row,
  onAddToCart,
}: {
  row: InventoryRow
  onAddToCart: (row: InventoryRow) => void
}) {
  const hidden = row.visibility === 'hidden'
  const upcoming = row.visibility === 'upcoming'
  const soldOut = row.visibility === 'live' && row.stock_status === 'out'
  const lowStock = row.visibility === 'live' && row.stock_status === 'low'
  const locked = upcoming || soldOut
  const tone: Tone = hidden ? 'muted' : upcoming ? 'amber' : soldOut ? 'red' : lowStock ? 'amber' : 'green'
  const badge = hidden ? 'Hidden' : upcoming ? 'Coming Soon' : soldOut ? 'Sold Out' : lowStock ? 'Low Stock' : 'Live'
  const status = hidden ? 'Archived from public view' : upcoming ? 'Future drop' : soldOut ? 'Out of stock' : lowStock ? `${row.stock} left` : 'Available now'
  const meta = hidden ? 'Admin only' : upcoming ? 'Preview only' : `$${row.price.toFixed(2)}`

  return (
    <article className={`card${locked ? ' locked' : ''}`}>
      <span className="card__badge" style={badgeStyle(tone)}>{badge}</span>
      <div className="card__img">
        <img
          className="card__photo"
          src={row.image || FALLBACK_IMAGE}
          alt={row.name}
          loading="lazy"
          decoding="async"
        />
        {locked && (
          <div className="card__overlay" aria-hidden="true">
            <span>{upcoming ? 'Coming Soon' : 'Sold Out'}</span>
          </div>
        )}
      </div>
      <div className="card__body">
        <div className="card__cat">{row.category || 'Merch'}</div>
        <h3 className="card__name">{row.name}</h3>
        <p className="card__desc">{row.description || 'Admin-managed merchandise item.'}</p>
        <div className="card__foot">
          <span className="card__status" style={statusStyle(tone)}>{status}</span>
          <span className="card__meta">{meta}</span>
        </div>
        {!locked && (
          <button className="btn btn--solid btn--sm" type="button" style={{ marginTop: 14, width: '100%' }} onClick={() => onAddToCart(row)}>
            Add to Cart
          </button>
        )}
      </div>
    </article>
  )
}

export default function Store() {
  useSeo({
    title: 'Merch Collection',
    description: 'Admin-managed merch catalog with live, sold out, and upcoming product states.',
  })

  const location = useLocation()
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutNote, setCheckoutNote] = useState('')
  const [successOrder, setSuccessOrder] = useState<string>('')
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(emptyCheckoutForm)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get<{ inventory: InventoryRow[] }>('store/inventory')
      .then((payload) => {
        if (!active) return
        setRows(payload.inventory)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load merch catalog.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved) as CartLine[]
      if (Array.isArray(parsed)) {
        setCart(parsed.filter((item) => typeof item.product_id === 'string' && Number.isFinite(Number(item.qty))))
      }
    } catch {
      localStorage.removeItem(CART_KEY)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const mode = params.get('checkout')
    const sessionId = params.get('session_id')
    const orderNo = params.get('order')

    if (mode === 'cancelled') {
      setCheckoutNote('Checkout was cancelled. Your cart is still saved here.')
      return
    }

    if (mode !== 'success' || !sessionId) {
      return
    }

    let active = true
    setCheckoutBusy(true)
    setCheckoutError('')
    api.post<{ message: string; order_no: string; payment_status: string }>('store/checkout/confirm', {
      session_id: sessionId,
      order_no: orderNo || '',
    })
      .then((payload) => {
        if (!active) return
        setSuccessOrder(payload.order_no)
        setCheckoutNote(payload.message || 'Payment confirmed.')
        setCart([])
        localStorage.removeItem(CART_KEY)
        setCheckoutForm(emptyCheckoutForm)
      })
      .catch((err) => {
        if (!active) return
        setCheckoutError(err instanceof Error ? err.message : 'Could not verify payment.')
      })
      .finally(() => {
        if (active) setCheckoutBusy(false)
      })

    return () => {
      active = false
    }
  }, [location.search])

  const liveItems = rows.filter((row) => row.visibility === 'live' && row.stock_status !== 'out')
  const soldOutItems = rows.filter((row) => row.visibility === 'live' && row.stock_status === 'out')
  const upcomingItems = rows.filter((row) => row.visibility === 'upcoming')
  const cartRows = cart
    .map((line) => {
      const row = rows.find((item) => item.product_id === line.product_id)
      return row ? { row, qty: line.qty } : null
    })
    .filter((item): item is { row: InventoryRow; qty: number } => Boolean(item))

  const subtotal = cartRows.reduce((sum, item) => sum + item.row.price * item.qty, 0)
  const shipping = subtotal >= 75 || subtotal === 0 ? 0 : 8
  const tax = subtotal * 0.0875
  const total = subtotal + shipping + tax

  const scrollToCheckout = () => {
    document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const addToCart = (row: InventoryRow) => {
    if (row.visibility !== 'live' || row.stock_status === 'out') {
      return
    }
    setCheckoutNote('')
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === row.product_id)
      if (existing) {
        return prev.map((item) => (item.product_id === row.product_id ? { ...item, qty: item.qty + 1 } : item))
      }
      return [...prev, { product_id: row.product_id, qty: 1 }]
    })
  }

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.product_id !== productId))
      return
    }
    setCart((prev) => prev.map((item) => (item.product_id === productId ? { ...item, qty } : item)))
  }

  const removeLine = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId))
  }

  const handleCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCheckoutBusy(true)
    setCheckoutError('')
    setCheckoutNote('')

    try {
      if (cartRows.length === 0) {
        throw new Error('Add at least one product before checkout.')
      }

      const response = await api.post<{
        order_no: string
        checkout_url: string
        payment_provider: string
      }>('store/checkout', {
        ...checkoutForm,
        address: combineAddress(checkoutForm),
        items: cartRows.map((item) => ({
          id: item.row.product_id,
          qty: item.qty,
        })),
        payment_method: 'stripe_checkout',
      })

      window.location.href = response.checkout_url
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not start checkout.')
    } finally {
      setCheckoutBusy(false)
    }
  }

  return (
    <div className="store-page merch-preview">
      <header className="shop-head">
        <div className="shop-head__in">
          <Link className="sh-logo" to="/" aria-label="Frantz Coutard home">
            <span className="lm"><img src={LOGO} alt="FC" /></span>
            <span className="nm">Frantz Coutard<small>The Collection</small></span>
          </Link>

          <div className="sh-actions">
            <NavLink className={({ isActive }) => `sh-link${isActive ? ' active' : ''}`} to="/" end>
              Site
            </NavLink>
            <NavLink className={({ isActive }) => `sh-link${isActive ? ' active' : ''}`} to="/community">
              Community
            </NavLink>
            <NavLink className={({ isActive }) => `sh-link${isActive ? ' active' : ''}`} to="/profile">
              Profile
            </NavLink>
            <button className="cart-btn" type="button" aria-label="Jump to checkout" onClick={scrollToCheckout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" />
              </svg>
              <span className={`cart-count${cartCount(cart) > 0 ? ' show' : ''}`}>{cartCount(cart)}</span>
            </button>
          </div>
        </div>
      </header>

      <section className="shop-hero">
        <div className="wrap">
          <div className="eyebrow">Premium Merchandise · Purpose Driven</div>
          <h1>The Collection</h1>
          <p>Wear the movement. Every purchase fuels community impact.</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{liveItems.length}</strong>
              <span>Live items</span>
            </div>
            <div className="hero-stat">
              <strong>{soldOutItems.length}</strong>
              <span>Out of stock</span>
            </div>
            <div className="hero-stat">
              <strong>{upcomingItems.length}</strong>
              <span>Upcoming drops</span>
            </div>
          </div>
        </div>
      </section>

      <main className="wrap">
        {loading && (
          <section className="store-note" style={{ marginTop: 0 }}>
            <div>
              <span className="section__eyebrow">Loading</span>
              <h2>Fetching merch catalog</h2>
              <p>One moment while the latest product states load from the admin database.</p>
            </div>
          </section>
        )}

        {error && (
          <section className="store-note" style={{ marginTop: 0 }}>
            <div>
              <span className="section__eyebrow">Error</span>
              <h2>Could not load merch</h2>
              <p>{error}</p>
            </div>
          </section>
        )}

        {checkoutNote && (
          <section className="store-note" style={{ marginTop: 0 }}>
            <div>
              <span className="section__eyebrow">Checkout</span>
              <h2>{successOrder ? `Order ${successOrder} confirmed` : 'Checkout update'}</h2>
              <p>{checkoutNote}</p>
            </div>
            <div className="note-actions">
              <button className="btn btn--solid" type="button" onClick={scrollToCheckout}>Review Cart</button>
              <Link className="btn btn--ghost" to="/">Back to Site</Link>
            </div>
          </section>
        )}

        <section className="section">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Live now</span>
              <h2>Available collection</h2>
            </div>
            <p>These products are live and can stay visible even when stock drops low or runs out.</p>
          </div>

          <div className="grid">
            {liveItems.map((item) => (
              <MerchCard key={item.product_id} row={item} onAddToCart={addToCart} />
            ))}
            {!loading && liveItems.length === 0 && (
              <div className="empty">
                <p>No live products are published right now.</p>
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Out of stock</span>
              <h2>Sold out items</h2>
            </div>
            <p>Live items remain visible here when stock reaches zero so the public knows they are temporarily unavailable.</p>
          </div>

          <div className="grid">
            {soldOutItems.map((item) => (
              <MerchCard key={item.product_id} row={item} onAddToCart={addToCart} />
            ))}
            {!loading && soldOutItems.length === 0 && (
              <div className="empty">
                <p>No live products are sold out right now.</p>
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Coming soon</span>
              <h2>Upcoming drops</h2>
            </div>
            <p>Park products here when you want them visible to the public but not yet available for the main collection.</p>
          </div>

          <div className="grid">
            {upcomingItems.map((item) => (
              <MerchCard key={item.product_id} row={item} onAddToCart={addToCart} />
            ))}
            {!loading && upcomingItems.length === 0 && (
              <div className="empty">
                <p>No upcoming products are queued yet.</p>
              </div>
            )}
          </div>
        </section>

        <section className="section" id="checkout">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Secure checkout</span>
              <h2>Checkout with Stripe</h2>
            </div>
            <p>Submit your shipping details and continue to a secure payment page. Card, Apple Pay, and Google Pay are handled by Stripe.</p>
          </div>

          <form className="store-checkout__body" onSubmit={handleCheckout}>
            <div className="summary">
              <h4>Shipping Details</h4>
              <div className="fgrid">
                <div className="field col2">
                  <label>Full Name</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.customer_name}
                    onChange={(e) => setCheckoutForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                    placeholder="Your name"
                  />
                </div>
                <div className="field col2">
                  <label>Email</label>
                  <input
                    type="email"
                    required
                    value={checkoutForm.email}
                    onChange={(e) => setCheckoutForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="field col2">
                  <label>Street Address</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.address_line1}
                    onChange={(e) => setCheckoutForm((prev) => ({ ...prev, address_line1: e.target.value }))}
                    placeholder="123 Legacy Ave"
                  />
                </div>
                <div className="field">
                  <label>City</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.city}
                    onChange={(e) => setCheckoutForm((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="New York"
                  />
                </div>
                <div className="field">
                  <label>State</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.state}
                    onChange={(e) => setCheckoutForm((prev) => ({ ...prev, state: e.target.value }))}
                    placeholder="NY"
                  />
                </div>
                <div className="field col2">
                  <label>ZIP Code</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.zip_code}
                    onChange={(e) => setCheckoutForm((prev) => ({ ...prev, zip_code: e.target.value }))}
                    placeholder="10001"
                  />
                </div>
              </div>
              <div className="store-note" style={{ margin: '20px 0 0', padding: 18 }}>
                <div>
                  <span className="section__eyebrow">Payment</span>
                  <h2 style={{ margin: '8px 0 8px' }}>Hosted checkout only</h2>
                  <p style={{ marginBottom: 0 }}>
                    No card numbers are collected here. Stripe handles the payment page securely after you submit this form.
                  </p>
                </div>
              </div>
              {checkoutError && <p className="sponsor-note sponsor-note--error" style={{ marginTop: 14 }}>{checkoutError}</p>}
              <div className="co-actions">
                <button className="btn btn--solid" type="submit" disabled={checkoutBusy || cartRows.length === 0}>
                  {checkoutBusy ? 'Starting Checkout...' : 'Continue to Secure Checkout'}
                </button>
                <button className="btn btn--ghost" type="button" onClick={scrollToCheckout} disabled={checkoutBusy}>
                  Review Cart
                </button>
              </div>
            </div>

            <aside className="summary">
              <h4>Order Summary</h4>
              <div className="summary__items">
                {cartRows.map(({ row, qty }) => (
                  <div className="line" key={row.product_id}>
                    <div className="line__img">
                      <img src={row.image || FALLBACK_IMAGE} alt={row.name} />
                    </div>
                    <div>
                      <div className="line__name">{row.name}</div>
                      <div className="line__meta">{row.category || 'Merch'} · {formatMoney(row.price)} each</div>
                      <div className="line__qty" style={{ marginTop: 10 }}>
                        <button type="button" onClick={() => setQty(row.product_id, qty - 1)} aria-label={`Decrease ${row.name}`}>-</button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => setQty(row.product_id, qty + 1)} aria-label={`Increase ${row.name}`}>+</button>
                      </div>
                    </div>
                    <div className="line__right">
                      <div className="line__price">{formatMoney(row.price * qty)}</div>
                      <button className="line__rm" type="button" onClick={() => removeLine(row.product_id)}>Remove</button>
                    </div>
                  </div>
                ))}

                {cartRows.length === 0 && (
                  <div className="drawer__empty">
                    <p>Add live items to your cart to begin checkout.</p>
                  </div>
                )}
              </div>

              <div className="drawer__foot" style={{ padding: '18px 0 0', borderTop: '0' }}>
                <div className="row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
                <div className="row"><span>Shipping</span><span>{shipping === 0 ? 'FREE' : formatMoney(shipping)}</span></div>
                <div className="row"><span>Tax (8.75%)</span><span>{formatMoney(tax)}</span></div>
                <div className="row total"><span>Total</span><b>{formatMoney(total)}</b></div>
              </div>
            </aside>
          </form>
        </section>

        <section className="store-note">
          <div>
            <span className="section__eyebrow">Important</span>
            <h2>Managed from admin</h2>
            <p>
              Product details, stock, and visibility are controlled from the admin dashboard. Hidden items stay in the back office,
              upcoming items preview publicly, and live items render on the storefront.
            </p>
          </div>
          <div className="note-actions">
            <Link className="btn btn--solid" to="/community">Join Community</Link>
            <Link className="btn btn--ghost" to="/">Back to Site</Link>
          </div>
        </section>
      </main>

      <footer className="shop-foot">
        <div className="wrap">
          <p>Merch catalog status is controlled in the admin console.</p>
        </div>
      </footer>
    </div>
  )
}
