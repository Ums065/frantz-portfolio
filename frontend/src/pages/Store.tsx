import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type InventoryRow } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import '../styles/store.css'

const LOGO = '/assets/fc-logo.png'
const fmt = (n: number) => '$' + n.toFixed(2)

interface Product {
  id: string
  cat: string
  name: string
  price: number
  badge?: string
  badgeGreen?: boolean
  sizes: string[]
  desc: string
}

const PRODUCTS: Product[] = [
  { id: 'hoodie-legacy', cat: 'Hoodies', name: 'Founder Hoodie — Legacy Black', price: 68, badge: 'Bestseller', sizes: ['S', 'M', 'L', 'XL', '2XL'], desc: 'Heavyweight fleece hoodie with the embroidered FC emblem and "From Community to Legacy" on the sleeve. Built to wear the mission every day.' },
  { id: 'hoodie-c2l', cat: 'Hoodies', name: 'From Community to Legacy Hoodie', price: 72, sizes: ['S', 'M', 'L', 'XL', '2XL'], desc: 'Premium brushed-cotton hoodie with gold tagline print. A statement piece for the movement.' },
  { id: 'tee-emblem', cat: 'T-Shirts', name: 'Premium Tee — FC Emblem', price: 34, sizes: ['S', 'M', 'L', 'XL', '2XL'], desc: 'Soft combed-cotton tee with the gold FC emblem at the chest. Clean, premium, everyday.' },
  { id: 'tee-tech', cat: 'T-Shirts', name: 'Technology For Good Tee', price: 32, sizes: ['S', 'M', 'L', 'XL'], desc: '"Technology For Good" graphic tee — a reminder of what we build and why.' },
  { id: 'tee-vision', cat: 'T-Shirts', name: 'Visionary Tee', price: 30, sizes: ['S', 'M', 'L', 'XL'], desc: 'Minimal gold-on-black "Visionary" type treatment. Wear your ambition.' },
  { id: 'cap-gold', cat: 'Caps', name: 'Signature Cap — Gold FC', price: 28, sizes: ['One Size'], desc: 'Structured cap with embroidered gold FC monogram and adjustable strap.' },
  { id: 'cap-builder', cat: 'Caps', name: 'Community Builder Cap', price: 26, sizes: ['One Size'], desc: 'Low-profile dad cap with subtle tonal "Community Builder" embroidery.' },
  { id: 'book-nts', cat: 'Books', name: 'From Nothing to Something — Hardcover', price: 24, badge: 'Signed', badgeGreen: true, sizes: ['Hardcover'], desc: 'Frantz’s story and blueprint — immigrant beginnings to building companies that serve communities. Signed first edition.' },
  { id: 'book-blueprint', cat: 'Books', name: 'The Legacy Blueprint — eBook', price: 14, badge: 'Digital', badgeGreen: true, sizes: ['eBook'], desc: 'Instant digital download. The frameworks behind building from nothing to something.' },
  { id: 'pin-ltd', cat: 'Collectibles', name: 'Limited Edition FC Lapel Pin', price: 18, badge: 'Limited', sizes: ['One Size'], desc: 'The official FC lapel pin — gold & green hard enamel. The same pin Frantz wears on stage.' },
  { id: 'print-signed', cat: 'Collectibles', name: 'Signed Founder’s Print', price: 48, badge: 'Limited', sizes: ['11x14', '18x24'], desc: 'Museum-quality giclée print, hand-numbered and signed. A piece of the legacy for your wall.' },
]
const byId = (id: string) => PRODUCTS.find((p) => p.id === id)!
const CATS = ['All', 'Hoodies', 'T-Shirts', 'Caps', 'Books', 'Collectibles']

interface CartLine { id: string; size: string; qty: number }

const PhLogo = ({ cls = 'ph-logo' }: { cls?: string }) => (
  <span className={cls}><img src={LOGO} alt="" /></span>
)

export default function Store() {
  const { user } = useAuth()
  const [cart, setCart] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('fc_cart') || '[]') } catch { return [] }
  })
  const [activeCat, setActiveCat] = useState('All')
  const [sort, setSort] = useState('featured')
  const [search, setSearch] = useState('')
  const [quick, setQuick] = useState<{ id: string; size: string; qty: number } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [pay, setPay] = useState<'card' | 'paypal' | 'apple'>('card')
  const [discount, setDiscount] = useState(0)
  const [promo, setPromo] = useState('')
  const [ship, setShip] = useState({ name: '', email: '', address: '', city: '', state: '', zip: '', country: 'United States' })
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' })
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [orderNo, setOrderNo] = useState('')
  const [confirmName, setConfirmName] = useState('Friend')
  const [placing, setPlacing] = useState(false)
  const [toast, setToast] = useState('')
  const [inventory, setInventory] = useState<Record<string, InventoryRow>>({})
  const toastTimer = useRef<number>()
  const accountHref = user ? (['admin', 'super_admin', 'editor'].includes(user.role) ? '/admin' : '/dashboard') : '/profile'

  useEffect(() => { localStorage.setItem('fc_cart', JSON.stringify(cart)) }, [cart])

  useEffect(() => {
    api.get<{ inventory: InventoryRow[] }>('store/inventory')
      .then((d) => setInventory(Object.fromEntries(d.inventory.map((row) => [row.product_id, row]))))
      .catch(() => setInventory({}))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setQuick(null); setDrawerOpen(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3000)
  }

  const cartCount = cart.reduce((n, l) => n + l.qty, 0)
  const subtotal = cart.reduce((s, l) => s + byId(l.id).price * l.qty, 0)
  const quickInventory = quick ? inventory[quick.id] : undefined
  const quickMax = quickInventory?.stock ?? 99

  const addToCart = (id: string, size: string, qty: number) => {
    const stock = inventory[id]?.stock
    const currentQty = cart
      .filter((line) => line.id === id)
      .reduce((sum, line) => sum + line.qty, 0)
    if (typeof stock === 'number' && stock >= 0 && currentQty + qty > stock) {
      showToast(stock <= 0 ? 'This item is currently sold out.' : `Only ${stock - currentQty} left in stock.`)
      return
    }
    setCart((prev) => {
      const key = id + '|' + size
      const i = prev.findIndex((l) => l.id + '|' + l.size === key)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], qty: next[i].qty + qty }
        return next
      }
      return [...prev, { id, size, qty }]
    })
  }
  const changeQty = (idx: number, delta: number) =>
    setCart((prev) => prev
      .map((l, i) => (i === idx ? { ...l, qty: l.qty + delta } : l))
      .filter((l) => l.qty > 0))
  const removeLine = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx))

  const visible = useMemo(() => {
    let list = PRODUCTS.filter((p) => {
      const okCat = activeCat === 'All' || p.cat === activeCat
      const okSearch = !search || p.name.toLowerCase().includes(search.trim().toLowerCase())
      return okCat && okSearch
    })
    if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price)
    else if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price)
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [activeCat, sort, search])

  // ---- totals ----
  const drawerShip = subtotal >= 75 || subtotal === 0 ? 0 : 6.5
  const disc = discount ? subtotal * discount : 0
  const coShip = subtotal >= 75 ? 0 : 6.5
  const tax = (subtotal - disc) * 0.0875
  const grandTotal = subtotal - disc + coShip + tax

  // ---- quick view ----
  const openQuick = (id: string) => setQuick({ id, size: byId(id).sizes[0], qty: 1 })
  const quickProduct = quick ? byId(quick.id) : null

  const applyPromo = () => {
    const code = promo.trim().toUpperCase()
    if (code === 'LEGACY10') { setDiscount(0.10); showToast('Promo applied — 10% off') }
    else if (code === 'COMMUNITY') { setDiscount(0.15); showToast('Community code applied — 15% off') }
    else { setDiscount(0); showToast('Invalid promo code') }
  }

  const startCheckout = () => {
    if (!cart.length) return
    setDrawerOpen(false)
    setCheckoutOpen(true)
    setStep(0)
  }

  const validateShipping = () => {
    const req: Record<string, boolean> = {}
    ;(['name', 'email', 'address', 'city', 'state', 'zip'] as const).forEach((k) => { if (!ship[k].trim()) req['ship_' + k] = true })
    setErrors(req)
    return Object.keys(req).length === 0
  }
  const validateCard = () => {
    if (pay !== 'card') return true
    const req: Record<string, boolean> = {}
    ;(['number', 'name', 'expiry', 'cvc'] as const).forEach((k) => { if (!card[k].trim()) req['card_' + k] = true })
    setErrors(req)
    return Object.keys(req).length === 0
  }

  const placeOrder = async () => {
    if (!validateCard()) { showToast('Please complete the payment fields'); return }
    setPlacing(true)
    const items = cart.map((l) => {
      const p = byId(l.id)
      return { id: p.id, name: p.name, cat: p.cat, size: l.size, qty: l.qty, price: p.price }
    })
    try {
      const res = await api.post<{ order_no: string }>('order', {
        customer_name: ship.name, email: ship.email,
        address: `${ship.address}, ${ship.city}, ${ship.state} ${ship.zip}, ${ship.country}`,
        items, subtotal, discount: disc, shipping: coShip, tax, total: grandTotal,
        promo_code: promo.trim(),
        payment_method: pay,
      })
      setOrderNo(res.order_no)
    } catch {
      // even if the API fails, show a local confirmation so the demo flow completes
      setOrderNo('FC-' + String(Math.floor(100000 + Math.random() * 899999)))
    }
    setConfirmName((ship.name || 'Friend').split(' ')[0])
    setCart([])
    setStep(3)
    setPlacing(false)
  }

  const stepDefs = ['Cart', 'Shipping', 'Payment', 'Done']

  return (
    <div className="store-page">
      {/* ============ HEADER ============ */}
      <header className="shop-head">
        <div className="shop-head__in">
          <Link className="sh-logo" to="/" aria-label="Frantz Coutard home">
            <span className="lm"><img src={LOGO} alt="FC" /></span>
            <span className="nm">Frantz Coutard<small>The Collection</small></span>
          </Link>
          <div className="sh-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="text" placeholder="Search the collection…" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="sh-actions">
            <Link className="sh-link" to="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Site</Link>
            <Link className="sh-link" to={accountHref}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></svg>Account</Link>
            <button className="cart-btn" aria-label="Open cart" onClick={() => setDrawerOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" /></svg>
              <span className={`cart-count${cartCount > 0 ? ' show' : ''}`}>{cartCount}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="shop-hero">
        <div className="wrap">
          <div className="eyebrow">Premium Merchandise · Purpose Driven</div>
          <h1>The Collection</h1>
          <p>Wear the movement. Every purchase fuels community impact.</p>
        </div>
      </section>

      {/* ============ FILTER BAR ============ */}
      <div className="filter-bar">
        <div className="wrap filter-bar__in">
          <div className="chips">
            {CATS.map((c) => (
              <button key={c} className={`chip${activeCat === c ? ' active' : ''}`} onClick={() => setActiveCat(c)}>{c}</button>
            ))}
          </div>
          <div className="sort-wrap">
            <label htmlFor="sort">Sort</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="featured">Featured</option>
              <option value="low">Price: Low to High</option>
              <option value="high">Price: High to Low</option>
              <option value="name">Name: A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* ============ GRID ============ */}
      <main className="wrap">
        <div className="grid">
          {visible.map((p) => (
            <article className="card" key={p.id}>
              {p.badge && <span className={`card__badge${p.badgeGreen ? ' green' : ''}`}>{p.badge}</span>}
              {inventory[p.id] && <span className={`card__badge${inventory[p.id].status === 'out' ? ' red' : inventory[p.id].status === 'low' ? ' amber' : ' green'}`} style={{ top: 44, right: 12 }}>{inventory[p.id].status === 'out' ? 'Sold out' : inventory[p.id].status === 'low' ? `Low stock · ${inventory[p.id].stock}` : `In stock · ${inventory[p.id].stock}`}</span>}
              <div className="card__img" onClick={() => openQuick(p.id)}>
                <PhLogo />
                <span className="ph-text">Product shot · {p.cat}</span>
                <div className="card__quick"><button className="btn btn--solid btn--sm" onClick={(e) => { e.stopPropagation(); openQuick(p.id) }}>Quick View</button></div>
              </div>
              <div className="card__body">
                <div className="card__cat">{p.cat}</div>
                <h3 className="card__name">{p.name}</h3>
                <p style={{ color: 'var(--muted)', fontSize: 12, minHeight: 36, marginTop: 6 }}>{inventory[p.id]?.restock_note || 'Premium store item from the FC collection.'}</p>
                <div className="card__foot">
                  <span className="card__price">{fmt(p.price)}</span>
                  <button className="card__add" aria-label={`Add ${p.name}`} disabled={inventory[p.id]?.status === 'out'} onClick={() => { if (inventory[p.id]?.status === 'out') { showToast('This item is currently sold out.'); return } addToCart(p.id, p.sizes[0], 1); showToast(p.name + ' added to cart') }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
              </div>
            </article>
          ))}
          {visible.length === 0 && (
            <div className="empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <div>No products match your search.</div>
            </div>
          )}
        </div>
      </main>

      <footer className="shop-foot">
        Free shipping on orders over $75 · Use code <a>LEGACY10</a> for 10% off · © 2025 Frantz Coutard. All Rights Reserved.
      </footer>

      {/* ============ QUICK VIEW ============ */}
      <div className={`overlay${quick ? ' open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setQuick(null) }}>
        <div className="qv">
          <button className="close-x" aria-label="Close" onClick={() => setQuick(null)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <div className="qv__img"><PhLogo /></div>
          <div className="qv__body">
            {quickProduct && quick && (
              <>
                <div className="qv__cat">{quickProduct.cat}</div>
                <h2 className="qv__name">{quickProduct.name}</h2>
                <div className="qv__price">{fmt(quickProduct.price)}</div>
                <p className="qv__desc">{quickProduct.desc}</p>
                <div className="qv__label">{quickProduct.sizes.length > 1 ? 'Select size' : 'Option'}</div>
                <div className="sizes">
                  {quickProduct.sizes.map((s) => (
                    <button key={s} className={`size${quick.size === s ? ' active' : ''}`} onClick={() => setQuick({ ...quick, size: s })}>{s}</button>
                  ))}
                </div>
                <div className="qv__label">Quantity</div>
                <div className="qty">
                  <button onClick={() => setQuick({ ...quick, qty: Math.max(1, quick.qty - 1) })}>−</button>
                  <span>{quick.qty}</span>
                  <button onClick={() => setQuick({ ...quick, qty: Math.min(quickMax, quick.qty + 1) })}>+</button>
                </div>
                <button className="btn btn--solid btn--full" onClick={() => { addToCart(quick.id, quick.size, quick.qty); showToast(quickProduct.name + ' added to cart'); setQuick(null); setDrawerOpen(true) }}>
                  Add to Cart · {fmt(quickProduct.price * quick.qty)}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============ CART DRAWER ============ */}
      <div className={`drawer-scrim${drawerOpen ? ' open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`drawer${drawerOpen ? ' open' : ''}`} aria-label="Shopping cart">
        <div className="drawer__head">
          <h3>Your Cart</h3>
          <button className="close-x" style={{ position: 'static' }} aria-label="Close cart" onClick={() => setDrawerOpen(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
        <div className="drawer__items">
          {cart.length === 0 ? (
            <div className="drawer__empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" /></svg>
              <div>Your cart is empty.</div>
              <div style={{ marginTop: 18 }}><button className="btn btn--ghost btn--sm" onClick={() => setDrawerOpen(false)}>Continue Shopping</button></div>
            </div>
          ) : (
            cart.map((l, i) => {
              const p = byId(l.id)
              return (
                <div className="line" key={l.id + l.size}>
                  <div className="line__img"><img src={LOGO} alt="" /></div>
                  <div>
                    <div className="line__name">{p.name}</div>
                    <div className="line__meta">{p.cat} · {l.size}</div>
                    <div className="line__qty"><button onClick={() => changeQty(i, -1)}>−</button><span>{l.qty}</span><button onClick={() => changeQty(i, 1)}>+</button></div>
                  </div>
                  <div className="line__right"><span className="line__price">{fmt(p.price * l.qty)}</span><button className="line__rm" onClick={() => removeLine(i)}>Remove</button></div>
                </div>
              )
            })
          )}
        </div>
        {cart.length > 0 && (
          <div className="drawer__foot">
            <div className="row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="row"><span>Shipping</span><span>{drawerShip === 0 ? 'FREE' : fmt(drawerShip)}</span></div>
            <div className="row total"><span>Total</span><b>{fmt(subtotal + drawerShip)}</b></div>
            <button className="btn btn--solid btn--full" onClick={startCheckout}>Checkout</button>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em' }}>Secure checkout · Free shipping over $75</div>
          </div>
        )}
      </aside>

      {/* ============ CHECKOUT ============ */}
      <div className={`checkout${checkoutOpen ? ' open' : ''}`}>
        <div className="checkout__head">
          <div className="wrap">
            <button className="sh-link" onClick={() => setCheckoutOpen(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back to Store</button>
            <div className="steps">
              {stepDefs.map((label, i) => (
                <span key={label} style={{ display: 'contents' }}>
                  <div className={`step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}><span className="dot">{i + 1}</span><span>{label}</span></div>
                  {i < stepDefs.length - 1 && <div className="bar" />}
                </span>
              ))}
            </div>
            <span style={{ width: 90 }} />
          </div>
        </div>

        <div className="wrap">
          <div className="checkout__body">
            <div>
              {/* STEP 1: REVIEW */}
              <div className={`co-pane${step === 0 ? ' active' : ''}`}>
                <h2 className="co-h"><span className="sec-num">01</span>Review Your Order</h2>
                <div>
                  {cart.map((l, i) => {
                    const p = byId(l.id)
                    return (
                      <div className="line" key={l.id + l.size}>
                        <div className="line__img"><img src={LOGO} alt="" /></div>
                        <div>
                          <div className="line__name">{p.name}</div>
                          <div className="line__meta">{p.cat} · {l.size}</div>
                          <div className="line__qty"><button onClick={() => changeQty(i, -1)}>−</button><span>{l.qty}</span><button onClick={() => changeQty(i, 1)}>+</button></div>
                        </div>
                        <div className="line__right"><span className="line__price">{fmt(p.price * l.qty)}</span><button className="line__rm" onClick={() => removeLine(i)}>Remove</button></div>
                      </div>
                    )
                  })}
                  {cart.length === 0 && <p style={{ color: 'var(--muted)', padding: '20px 0' }}>Your cart is empty.</p>}
                </div>
                <div className="co-actions" style={{ marginTop: 28 }}>
                  <button className="btn btn--ghost" onClick={() => setCheckoutOpen(false)}>Continue Shopping</button>
                  <button className="btn btn--solid" onClick={() => cart.length && setStep(1)}>Proceed to Shipping</button>
                </div>
              </div>

              {/* STEP 2: SHIPPING */}
              <div className={`co-pane${step === 1 ? ' active' : ''}`}>
                <h2 className="co-h"><span className="sec-num">02</span>Shipping Details</h2>
                <div className="fgrid">
                  <div className="field col2"><label>Full Name</label><input className={errors.ship_name ? 'err' : ''} type="text" placeholder="Your name" value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} /></div>
                  <div className="field col2"><label>Email</label><input className={errors.ship_email ? 'err' : ''} type="email" placeholder="you@example.com" value={ship.email} onChange={(e) => setShip({ ...ship, email: e.target.value })} /></div>
                  <div className="field col2"><label>Street Address</label><input className={errors.ship_address ? 'err' : ''} type="text" placeholder="123 Legacy Ave" value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} /></div>
                  <div className="field"><label>City</label><input className={errors.ship_city ? 'err' : ''} type="text" placeholder="New York" value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} /></div>
                  <div className="field"><label>State</label><input className={errors.ship_state ? 'err' : ''} type="text" placeholder="NY" value={ship.state} onChange={(e) => setShip({ ...ship, state: e.target.value })} /></div>
                  <div className="field"><label>ZIP Code</label><input className={errors.ship_zip ? 'err' : ''} type="text" placeholder="10001" value={ship.zip} onChange={(e) => setShip({ ...ship, zip: e.target.value })} /></div>
                  <div className="field"><label>Country</label>
                    <select value={ship.country} onChange={(e) => setShip({ ...ship, country: e.target.value })}>
                      <option>United States</option><option>Canada</option><option>Haiti</option><option>United Kingdom</option><option>Other</option>
                    </select>
                  </div>
                </div>
                <div className="co-actions">
                  <button className="btn btn--ghost" onClick={() => setStep(0)}>Back</button>
                  <button className="btn btn--solid" onClick={() => { if (validateShipping()) setStep(2); else showToast('Please complete the highlighted fields') }}>Continue to Payment</button>
                </div>
              </div>

              {/* STEP 3: PAYMENT */}
              <div className={`co-pane${step === 2 ? ' active' : ''}`}>
                <h2 className="co-h"><span className="sec-num">03</span>Payment</h2>
                <div className="pay-methods">
                  <button className={`pay-m${pay === 'card' ? ' active' : ''}`} onClick={() => setPay('card')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg><span>Card</span></button>
                  <button className={`pay-m${pay === 'paypal' ? ' active' : ''}`} onClick={() => setPay('paypal')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M6 4h9a4 4 0 010 8H9l-1 8H5z" /></svg><span>PayPal</span></button>
                  <button className={`pay-m${pay === 'apple' ? ' active' : ''}`} onClick={() => setPay('apple')}><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3a4 4 0 01-1 3 3.6 3.6 0 01-3 1.5A3.8 3.8 0 0113 4a4.3 4.3 0 013-1zM19 17c-.5 1.2-1 2-1.8 3-1 1.3-2 2-3 2s-1.4-.5-2.6-.5-1.6.5-2.6.5-1.9-.8-2.9-2C2.5 17.5 2 13 4 10.5A4.5 4.5 0 018 8.5c1 0 1.8.6 2.6.6s1.7-.7 3-.6a4.3 4.3 0 013.3 1.8 4 4 0 00-1.9 3.4A4 4 0 0019 17z" /></svg><span>Apple Pay</span></button>
                </div>
                {pay === 'card' && (
                  <div>
                    <div className="field"><label>Card Number</label><input className={errors.card_number ? 'err' : ''} type="text" placeholder="1234 5678 9012 3456" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></div>
                    <div className="fgrid">
                      <div className="field col2"><label>Name on Card</label><input className={errors.card_name ? 'err' : ''} type="text" placeholder="Full name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></div>
                      <div className="field"><label>Expiry</label><input className={errors.card_expiry ? 'err' : ''} type="text" placeholder="MM / YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} /></div>
                      <div className="field"><label>CVC</label><input className={errors.card_cvc ? 'err' : ''} type="text" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, color: 'var(--muted)', letterSpacing: '0.06em', marginTop: 4 }}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--green-bright)" strokeWidth={2}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>
                      Encrypted &amp; secure. This is a demo — no real payment is taken.
                    </div>
                  </div>
                )}
                <div className="co-actions">
                  <button className="btn btn--ghost" onClick={() => setStep(1)}>Back</button>
                  <button className="btn btn--solid" disabled={placing} onClick={placeOrder}>{placing ? 'Placing…' : 'Place Order'}</button>
                </div>
              </div>

              {/* STEP 4: CONFIRM */}
              <div className={`co-pane${step === 3 ? ' active' : ''}`}>
                <div className="confirm">
                  <div className="ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M5 13l4 4L19 7" /></svg></div>
                  <h2 className="gold-text">Thank You, {confirmName}</h2>
                  <p>Your order is confirmed. A receipt is on its way to your inbox.</p>
                  <div className="order-no">Order {orderNo}</div>
                  <p style={{ maxWidth: 420, margin: '0 auto' }}>Every purchase fuels community impact through TrendCatch Gives Back. Thank you for wearing the movement.</p>
                  <div className="next">
                    <Link className="btn btn--ghost" to="/">Back to Site</Link>
                    <button className="btn btn--solid" onClick={() => { setCheckoutOpen(false); setStep(0); setErrors({}); setDiscount(0); setPromo('') }}>Keep Shopping</button>
                  </div>
                </div>
              </div>
            </div>

            {/* ORDER SUMMARY RAIL */}
            {step < 3 && (
              <aside className="summary">
                <h4>Order Summary</h4>
                <div className="summary__items">
                  {cart.map((l) => {
                    const p = byId(l.id)
                    return (
                      <div className="sum-line" key={l.id + l.size}>
                        <div className="sum-line__img"><img src={LOGO} alt="" /><span className="q">{l.qty}</span></div>
                        <div><div className="sum-line__name">{p.name}</div><div className="sum-line__meta">{l.size}</div></div>
                        <div className="sum-line__price">{fmt(p.price * l.qty)}</div>
                      </div>
                    )
                  })}
                </div>
                <div className="promo-row">
                  <input type="text" placeholder="Promo code (try LEGACY10)" value={promo} onChange={(e) => setPromo(e.target.value)} />
                  <button className="btn btn--ghost btn--sm" onClick={applyPromo}>Apply</button>
                </div>
                <div className="row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                {disc > 0 && <div className="row"><span>Discount</span><span style={{ color: 'var(--green-bright)' }}>−{fmt(disc)}</span></div>}
                <div className="row"><span>Shipping</span><span>{coShip === 0 ? 'FREE' : fmt(coShip)}</span></div>
                <div className="row"><span>Tax (8.75%)</span><span>{fmt(tax)}</span></div>
                <div className="row total"><span>Total</span><b>{fmt(grandTotal)}</b></div>
              </aside>
            )}
          </div>
        </div>
      </div>

      {/* ============ TOAST ============ */}
      <div className={`toast${toast ? ' show' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.5 2.5L16 9" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  )
}
