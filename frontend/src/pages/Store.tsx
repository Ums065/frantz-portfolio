import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, type InventoryRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'
import { BRAND_LOGO } from '../lib/brandAssets'
import '../styles/store.css'

const LOGO = BRAND_LOGO
const FALLBACK_IMAGE = '/assets/merch-collectible.webp'
const CART_KEY = 'fc-store-cart-v1'

type Tone = 'green' | 'amber' | 'red' | 'muted'
type CheckoutStep = 'details' | 'payment'

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

function parseLines(value: string | null | undefined) {
  return (value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function inventoryTone(row: InventoryRow): Tone {
  if (row.visibility === 'hidden') return 'muted'
  if (row.visibility === 'upcoming') return 'amber'
  if (row.stock_status === 'out') return 'red'
  if (row.stock_status === 'low') return 'amber'
  return 'green'
}

function inventoryBadge(row: InventoryRow) {
  if (row.visibility === 'hidden') return 'Hidden'
  if (row.visibility === 'upcoming') return 'Coming Soon'
  if (row.stock_status === 'out') return 'Sold Out'
  if (row.stock_status === 'low') return 'Low Stock'
  return 'Live'
}

function inventoryStatus(row: InventoryRow) {
  if (row.visibility === 'hidden') return 'Archived from public view'
  if (row.visibility === 'upcoming') return 'Future drop'
  if (row.stock_status === 'out') return 'Out of stock'
  if (row.stock_status === 'low') return `${row.stock} left`
  return `${row.stock} ready to ship`
}

function canPurchase(row: InventoryRow) {
  return row.visibility === 'live' && row.stock_status !== 'out' && row.stock > 0
}

function CartQuantityControl({ qty, onDecrease, onIncrease, compact = false }: {
  qty: number
  onDecrease: () => void
  onIncrease: () => void
  compact?: boolean
}) {
  return (
    <div className={compact ? 'line__qty' : 'qty qty--inline'}>
      <button type="button" onClick={onDecrease} aria-label="Decrease quantity">-</button>
      <span>{qty}</span>
      <button type="button" onClick={onIncrease} aria-label="Increase quantity">+</button>
    </div>
  )
}

function MerchCard({
  row,
  qty,
  onAddToCart,
  onDecrease,
  onIncrease,
  onOpenDetails,
  isPortrait = false,
  onImageLoad,
}: {
  row: InventoryRow
  qty: number
  onAddToCart: (row: InventoryRow) => void
  onDecrease: (row: InventoryRow) => void
  onIncrease: (row: InventoryRow) => void
  onOpenDetails: (row: InventoryRow) => void
  isPortrait?: boolean
  onImageLoad?: (productId: string, isPortrait: boolean) => void
}) {
  const isUpcoming = row.visibility === 'upcoming'
  const isSoldOut = row.visibility === 'live' && row.stock_status === 'out'
  const canBuy = canPurchase(row)
  const tone = inventoryTone(row)
  const status = inventoryStatus(row)
  const highlights = parseLines(row.feature_list).slice(0, 3)

  return (
    <article
      className={`card${isUpcoming ? ' preview' : ''}${isSoldOut ? ' locked' : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('button,a,input,select,textarea')) return
        onOpenDetails(row)
      }}
    >
      <span className="card__badge" style={badgeStyle(tone)}>{inventoryBadge(row)}</span>
      <button className={`card__img card__img--button${isPortrait ? ' card__img--portrait' : ''}`} type="button" onClick={() => onOpenDetails(row)} aria-label={`Open details for ${row.name}`}>
        <img
          src={row.image || FALLBACK_IMAGE}
          alt={row.name}
          loading="lazy"
          decoding="async"
          onLoad={(event) => {
            const img = event.currentTarget
            const portrait = img.naturalHeight > img.naturalWidth * 1.05
            onImageLoad?.(row.product_id, portrait)
          }}
        />
        <div className="card__quick"><span className="btn btn--sm">View Details</span></div>
        {isSoldOut ? (
          <div className="card__overlay" aria-hidden="true">
            <span>Sold Out</span>
          </div>
        ) : null}
      </button>
      <div className="card__body">
        <div className="card__cat">{row.category || 'Merch'}</div>
        <button className="card__name-btn" type="button" onClick={() => onOpenDetails(row)}>
          <h3 className="card__name">{row.name}</h3>
        </button>
        {row.tagline ? <p className="card__tagline">{row.tagline}</p> : null}
        <p className="card__desc">{row.description || 'Admin-managed merchandise item.'}</p>
        {highlights.length > 0 ? (
          <div className="card__chips" aria-label={`${row.name} highlights`}>
            {highlights.map((item) => <span key={`${row.product_id}-${item}`}>{item}</span>)}
          </div>
        ) : null}
        <div className="card__foot">
          <span className="card__status" style={statusStyle(tone)}>{status}</span>
          <span className="card__price">{formatMoney(row.price)}</span>
        </div>
        <div className="card__actions">
          {canBuy ? (
            qty > 0 ? (
              <>
                <CartQuantityControl qty={qty} onDecrease={() => onDecrease(row)} onIncrease={() => onIncrease(row)} />
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => onOpenDetails(row)}>Details</button>
              </>
            ) : (
              <>
                <button className="btn btn--solid btn--sm" type="button" onClick={() => onAddToCart(row)}>Add to Cart</button>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => onOpenDetails(row)}>Details</button>
              </>
            )
          ) : (
            <button className="btn btn--ghost btn--sm btn--full" type="button" onClick={() => onOpenDetails(row)}>
              {isUpcoming ? 'Preview Details' : 'View Details'}
            </button>
          )}
        </div>
        {canBuy && qty > 0 ? <div className="card__cart-note">{qty} item{qty > 1 ? 's' : ''} in cart</div> : null}
      </div>
    </article>
  )
}

function ProductQuickView({
  row,
  qty,
  onClose,
  onAddToCart,
  onDecrease,
  onIncrease,
  onOpenCart,
}: {
  row: InventoryRow | null
  qty: number
  onClose: () => void
  onAddToCart: (row: InventoryRow) => void
  onDecrease: (row: InventoryRow) => void
  onIncrease: (row: InventoryRow) => void
  onOpenCart: () => void
}) {
  if (!row) return null

  const features = parseLines(row.feature_list)
  const specs = parseLines(row.spec_list)
  const tone = inventoryTone(row)
  const purchasable = canPurchase(row)
  const longCopy = row.details || row.description || 'Product details will be managed from the admin dashboard.'

  return (
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qv">
        <button className="close-x" type="button" onClick={onClose} aria-label="Close details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <div className="qv__img">
          <img src={row.image || FALLBACK_IMAGE} alt={row.name} className="qv__photo" />
        </div>
        <div className="qv__body">
          <div className="qv__cat">{row.category || 'Merch'} Ã‚Â· {inventoryBadge(row)}</div>
          <h2 className="qv__name">{row.name}</h2>
          {row.tagline ? <p className="qv__tagline">{row.tagline}</p> : null}
          <div className="qv__price-row">
            <div className="qv__price">{formatMoney(row.price)}</div>
            <span className="qv__status" style={badgeStyle(tone)}>{inventoryStatus(row)}</span>
          </div>
          <p className="qv__desc">{longCopy}</p>

          <div className="qv__meta-grid">
            {features.length > 0 ? (
              <div>
                <div className="qv__label">Feature Highlights</div>
                <ul className="qv__list">
                  {features.map((item) => <li key={`${row.product_id}-feature-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {specs.length > 0 ? (
              <div>
                <div className="qv__label">Product Details</div>
                <ul className="qv__list qv__list--specs">
                  {specs.map((item) => <li key={`${row.product_id}-spec-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="qv__notes">
            {row.restock_note ? <p><strong>Availability:</strong> {row.restock_note}</p> : null}
            {row.shipping_note ? <p><strong>Shipping:</strong> {row.shipping_note}</p> : null}
          </div>

          <div className="qv__actions">
            {purchasable ? (
              <>
                {qty > 0 ? (
                  <CartQuantityControl qty={qty} onDecrease={() => onDecrease(row)} onIncrease={() => onIncrease(row)} />
                ) : (
                  <button className="btn btn--solid" type="button" onClick={() => onAddToCart(row)}>Add to Cart</button>
                )}
                <button className="btn btn--ghost" type="button" onClick={onOpenCart}>Open Cart</button>
              </>
            ) : (
              <button className="btn btn--ghost" type="button" onClick={onOpenCart}>View Cart</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
export default function Store() {
  useSeo({
    title: 'Merch Collection',
    description: 'Admin-managed merch catalog with live, sold out, and upcoming product states.',
  })

  const location = useLocation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutNote, setCheckoutNote] = useState('')
  const [successOrder, setSuccessOrder] = useState('')
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(emptyCheckoutForm)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('details')
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<InventoryRow | null>(null)
  const [portraitByProduct, setPortraitByProduct] = useState<Record<string, boolean>>({})
  const checkoutFormRef = useRef<HTMLFormElement | null>(null)

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
    if (!rows.length) return
    setCart((prev) => {
      let changed = false
      const next: CartLine[] = []
      for (const item of prev) {
        const row = rows.find((candidate) => candidate.product_id === item.product_id)
        if (!row || !canPurchase(row)) {
          changed = true
          continue
        }
        const qty = Math.min(item.qty, row.stock)
        if (qty !== item.qty) changed = true
        if (qty > 0) next.push({ product_id: item.product_id, qty })
      }
      return changed ? next : prev
    })
  }, [rows])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const mode = params.get('checkout')
    const sessionId = params.get('session_id')
    const orderNo = params.get('order')

    if (mode === 'cancelled') {
      setCheckoutNote('Checkout was cancelled. Your cart is still saved here.')
      setCheckoutOpen(false)
      setCheckoutStep('details')
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
        setCheckoutOpen(false)
        setCheckoutStep('details')
        setCartOpen(false)
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

  useEffect(() => {
    const locked = cartOpen || checkoutOpen || !!selectedProduct
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [cartOpen, checkoutOpen, selectedProduct])

  const liveItems = rows.filter((row) => row.visibility === 'live' && row.stock_status !== 'out')
  const soldOutItems = rows.filter((row) => row.visibility === 'live' && row.stock_status === 'out')
  const upcomingItems = rows.filter((row) => row.visibility === 'upcoming')
  const cartQtyMap = new Map(cart.map((item) => [item.product_id, item.qty]))
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
  const cartItemCount = cartCount(cart)

  const openProduct = (row: InventoryRow) => {
    setSelectedProduct(row)
  }


  const handlePortraitDetect = (productId: string, isPortrait: boolean) => {
    setPortraitByProduct((prev) => (prev[productId] === isPortrait ? prev : { ...prev, [productId]: isPortrait }))
  }

  const handleContinueShopping = () => {
    setCartOpen(false)
    setCheckoutOpen(false)
    setCheckoutStep('details')
    setSelectedProduct(null)
    navigate('/store', { replace: true })
  }

  const openCart = () => {
    setCheckoutOpen(false)
    setCheckoutStep('details')
    setSelectedProduct(null)
    setCartOpen(true)
  }

  const openCheckout = (step: CheckoutStep = 'details') => {
    if (cartRows.length === 0) {
      window.fcToast?.('Add at least one product before checkout.')
      return
    }
    setSelectedProduct(null)
    setCartOpen(false)
    setCheckoutError('')
    setCheckoutNote('')
    setCheckoutStep(step)
    setCheckoutOpen(true)
  }

  const closeCheckout = () => {
    if (checkoutBusy) return
    setCheckoutOpen(false)
    setCheckoutStep('details')
  }

  const continueToPayment = () => {
    if (!checkoutFormRef.current?.reportValidity()) return
    setCheckoutError('')
    setCheckoutStep('payment')
  }

  const reviewCartFromCheckout = () => {
    setCheckoutOpen(false)
    setCheckoutStep('details')
    setCartOpen(true)
  }

  const scrollToCheckout = () => {
    openCheckout()
  }

  const updateQuantity = (row: InventoryRow, nextQty: number) => {
    if (!canPurchase(row)) return

    const cappedQty = Math.max(0, Math.min(nextQty, row.stock))
    if (nextQty > row.stock) {
      window.fcToast?.(`Only ${row.stock} ${row.stock === 1 ? 'item is' : 'items are'} available for ${row.name}.`)
    }

    setCheckoutNote('')
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === row.product_id)
      if (cappedQty <= 0) {
        return prev.filter((item) => item.product_id !== row.product_id)
      }
      if (existing) {
        return prev.map((item) => (item.product_id === row.product_id ? { ...item, qty: cappedQty } : item))
      }
      return [...prev, { product_id: row.product_id, qty: cappedQty }]
    })
  }

  const addToCart = (row: InventoryRow) => {
    const currentQty = cartQtyMap.get(row.product_id) || 0
    updateQuantity(row, currentQty + 1)
    window.fcToast?.(currentQty > 0 ? `${row.name} quantity updated.` : `${row.name} added to cart.`)
  }

  const setQty = (productId: string, qty: number) => {
    const row = rows.find((item) => item.product_id === productId)
    if (!row) {
      setCart((prev) => prev.filter((item) => item.product_id !== productId))
      return
    }
    updateQuantity(row, qty)
  }

  const removeLine = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId))
    window.fcToast?.('Item removed from cart.')
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
              Home
            </NavLink>
            <NavLink className={({ isActive }) => `sh-link${isActive ? ' active' : ''}`} to="/#community">
              Community
            </NavLink>
            <NavLink className={({ isActive }) => `sh-link${isActive ? ' active' : ''}`} to="/profile">
              Profile
            </NavLink>
            <button className="cart-btn" type="button" aria-label="Open cart drawer" onClick={openCart}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" />
              </svg>
              <span className={`cart-count${cartItemCount > 0 ? ' show' : ''}`}>{cartItemCount}</span>
            </button>
          </div>
        </div>
      </header>

      <section className="shop-hero">
        <div className="wrap">
          <div className="eyebrow">Premium Merchandise Ã‚Â· Purpose Driven</div>
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
          <div className="hero-cart-panel">
            <div>
              <span className="hero-cart-panel__eyebrow">Cart Snapshot</span>
              <strong>{cartItemCount} item{cartItemCount === 1 ? '' : 's'} in cart</strong>
              <p>{cartRows.length > 0 ? `${formatMoney(total)} estimated total including shipping and tax.` : 'Add products to see a live cart summary here.'}</p>
            </div>
            <div className="hero-cart-panel__actions">
              <button className="btn btn--solid" type="button" onClick={openCart}>Open Cart</button>
              <button className="btn btn--ghost" type="button" onClick={scrollToCheckout}>Go to Checkout</button>
            </div>
          </div>
        </div>
      </section>

      <main className="wrap">
        {successOrder ? (
          <section className="confirm">
            <div className="ok">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2>Order Confirmed</h2>
            <p>{checkoutNote || 'Your payment was confirmed and your order is in motion.'}</p>
            <div className="order-no">{successOrder}</div>
            <div className="next">
              <button className="btn btn--solid" type="button" onClick={() => setSuccessOrder('')}>Continue Shopping</button>
              <button className="btn btn--ghost" type="button" onClick={openCart}>Open Cart</button>
            </div>
          </section>
        ) : null}

        {checkoutNote && !successOrder ? (
          <div className="store-note" style={{ marginTop: 24 }}>
            <div>
              <span className="section__eyebrow">Checkout Update</span>
              <h2>Cart Status</h2>
              <p>{checkoutNote}</p>
            </div>
            <div className="note-actions">
              <button className="btn btn--ghost" type="button" onClick={openCart}>Review Cart</button>
            </div>
          </div>
        ) : null}

        {checkoutError && !checkoutOpen ? <p style={{ color: '#e08a8a', margin: '8px 0 20px' }}>{checkoutError}</p> : null}
        {error ? <p style={{ color: '#e08a8a', margin: '8px 0 20px' }}>{error}</p> : null}

        {loading ? (
          <section className="section">
            <div className="empty">
              <p>Loading merchandise...</p>
            </div>
          </section>
        ) : !error ? (
          <>
            <section className="section">
              <div className="section__head">
                <div>
                  <span className="section__eyebrow">Available Now</span>
                  <h2>Shop the Current Drop</h2>
                </div>
                <p>Each live card turns into quantity controls the moment it enters the cart, so shoppers never lose track of what they added.</p>
              </div>
              <div className="grid">
                {liveItems.length > 0 ? liveItems.map((row) => (
                  <MerchCard
                    key={row.product_id}
                    row={row}
                    qty={cartQtyMap.get(row.product_id) || 0}
                    onAddToCart={addToCart}
                    onDecrease={(item) => updateQuantity(item, (cartQtyMap.get(item.product_id) || 0) - 1)}
                    onIncrease={(item) => updateQuantity(item, (cartQtyMap.get(item.product_id) || 0) + 1)}
                    onOpenDetails={openProduct}
                    onImageLoad={handlePortraitDetect}
                  />
                )) : (
                  <div className="empty">
                    <p>No live products are published yet.</p>
                  </div>
                )}
              </div>
            </section>

            {soldOutItems.length > 0 ? (
              <section className="section">
                <div className="section__head">
                  <div>
                    <span className="section__eyebrow">Recently Sold Out</span>
                    <h2>High Demand Products</h2>
                  </div>
                  <p>These products stay visible so visitors can still open the detail view and understand the collection.</p>
                </div>
                <div className="grid">
                  {soldOutItems.map((row) => (
                    <MerchCard
                      key={row.product_id}
                      row={row}
                      qty={cartQtyMap.get(row.product_id) || 0}
                      onAddToCart={addToCart}
                      onDecrease={(item) => updateQuantity(item, (cartQtyMap.get(item.product_id) || 0) - 1)}
                      onIncrease={(item) => updateQuantity(item, (cartQtyMap.get(item.product_id) || 0) + 1)}
                      onOpenDetails={openProduct}
                      onImageLoad={handlePortraitDetect}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {upcomingItems.length > 0 ? (
              <section className="section">
                <div className="section__head">
                  <div>
                    <span className="section__eyebrow">Upcoming Drops</span>
                    <h2>Preview What Is Next</h2>
                  </div>
                  <p>Admin can keep future releases visible with detailed copy, specs, and shipping context before launch.</p>
                </div>
                <div className="grid">
                  {upcomingItems.map((row) => (
                    <MerchCard
                      key={row.product_id}
                      row={row}
                      qty={cartQtyMap.get(row.product_id) || 0}
                      onAddToCart={addToCart}
                      onDecrease={(item) => updateQuantity(item, (cartQtyMap.get(item.product_id) || 0) - 1)}
                      onIncrease={(item) => updateQuantity(item, (cartQtyMap.get(item.product_id) || 0) + 1)}
                      onOpenDetails={openProduct}
                      onImageLoad={handlePortraitDetect}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="store-note" id="checkout">
              <div>
                <span className="section__eyebrow">Checkout Popup</span>
                <h2>Shipping Details And Payment Stay In One Popup</h2>
                <p>Open checkout from the cart drawer to complete address entry and payment review in the same overlay. The final payment still hands off to Stripe Checkout securely.</p>
              </div>
              <div className="note-actions">
                <button className="btn btn--ghost" type="button" onClick={scrollToCheckout}>Open Checkout Popup</button>
                <button className="btn btn--solid" type="button" onClick={openCart}>Open Cart Drawer</button>
              </div>
            </section>

            <section className="store-note">
              <div>
                <span className="section__eyebrow">Admin Managed</span>
                <h2>Product Copy Now Lives in Dashboard</h2>
                <p>Each product can now store tagline, card description, long detail copy, feature highlights, specs, shipping note, stock, and visibility from the admin inventory editor.</p>
              </div>
              <div className="note-actions">
                <button className="btn btn--ghost" type="button" onClick={scrollToCheckout}>Open Checkout Popup</button>
                <button className="btn btn--solid" type="button" onClick={openCart}>Open Cart Drawer</button>
              </div>
            </section>
          </>
        ) : null}
      </main>

      <div className={`drawer-scrim${cartOpen ? ' open' : ''}`} onClick={() => setCartOpen(false)} aria-hidden={!cartOpen} />
      <aside className={`drawer${cartOpen ? ' open' : ''}`} aria-hidden={!cartOpen}>
        <div className="drawer__head">
          <div>
            <h3>Your Cart</h3>
            <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>{cartItemCount} item{cartItemCount === 1 ? '' : 's'} selected</p>
          </div>
          <button className="close-x" type="button" onClick={() => setCartOpen(false)} aria-label="Close cart drawer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="drawer__items">
          {cartRows.length > 0 ? cartRows.map(({ row, qty }) => (
            <div className="line" key={row.product_id}>
              <button className="line__img" type="button" onClick={() => openProduct(row)} aria-label={`Open ${row.name} details`}>
                <img src={row.image || FALLBACK_IMAGE} alt={row.name} />
              </button>
              <div>
                <button className="card__name-btn" type="button" onClick={() => openProduct(row)}>
                  <span className="line__name">{row.name}</span>
                </button>
                <div className="line__meta">{row.category || 'Merch'} Ã‚Â· {formatMoney(row.price)} each</div>
                <CartQuantityControl compact qty={qty} onDecrease={() => setQty(row.product_id, qty - 1)} onIncrease={() => setQty(row.product_id, qty + 1)} />
              </div>
              <div className="line__right">
                <div className="line__price">{formatMoney(row.price * qty)}</div>
                <button className="line__rm" type="button" onClick={() => removeLine(row.product_id)}>Remove</button>
              </div>
            </div>
          )) : (
            <div className="drawer__empty">
              <p>Your cart is empty. Add products from the grid and manage quantity right inside each card.</p>
            </div>
          )}
        </div>
        <div className="drawer__foot">
          <div className="row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
          <div className="row"><span>Shipping</span><span>{shipping === 0 ? 'Free' : formatMoney(shipping)}</span></div>
          <div className="row"><span>Estimated Tax</span><span>{formatMoney(tax)}</span></div>
          <div className="row total"><span>Total</span><b>{formatMoney(total)}</b></div>
          <div className="drawer__cta">
            <button className="btn btn--ghost" type="button" onClick={handleContinueShopping}>Continue Shopping</button>
            <button className="btn btn--solid" type="button" onClick={scrollToCheckout} disabled={cartRows.length === 0}>Continue to Checkout</button>
          </div>
        </div>
      </aside>

      <button
        className="cart-fab"
        type="button"
        onClick={openCart}
        aria-label="Open cart drawer"
        hidden={cartOpen || checkoutOpen || !!selectedProduct}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" /></svg>
        <span className="cart-fab__count" hidden={cartItemCount === 0}>{cartItemCount}</span>
      </button>

      <div className={`checkout${checkoutOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-hidden={!checkoutOpen} onClick={(e) => e.target === e.currentTarget && closeCheckout()}>
        <div className="checkout__head">
          <div className="wrap">
            <div>
              <span className="section__eyebrow">Secure Checkout</span>
              <h2>Complete Your Order</h2>
            </div>
            <div className="steps" aria-label="Checkout steps">
              <div className={`step${checkoutStep === 'details' ? ' active' : checkoutStep === 'payment' ? ' done' : ''}`}>
                <span className="dot">1</span>
                <span>Address</span>
                <span className="bar" />
              </div>
              <div className={`step${checkoutStep === 'payment' ? ' active' : ''}`}>
                <span className="dot">2</span>
                <span>Payment</span>
              </div>
            </div>
            <button className="close-x" type="button" onClick={closeCheckout} aria-label="Close checkout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>

        <div className="wrap">
          <form className="checkout__body" ref={checkoutFormRef} onSubmit={handleCheckout}>
            <div style={{ display: 'grid', gap: '24px' }}>
              <section className={`co-pane${checkoutStep === 'details' ? ' active' : ''}`}>
                <div className="co-h">
                  <span className="sec-num">01</span>
                  <span>Shipping Details</span>
                </div>
                <div className="fgrid">
                  <div className="field col2">
                    <label htmlFor="checkout_customer_name">Full Name</label>
                    <input id="checkout_customer_name" type="text" required value={checkoutForm.customer_name} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, customer_name: e.target.value }))} placeholder="Your full name" />
                  </div>
                  <div className="field col2">
                    <label htmlFor="checkout_email">Email Address</label>
                    <input id="checkout_email" type="email" required value={checkoutForm.email} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="you@example.com" />
                  </div>
                  <div className="field col2">
                    <label htmlFor="checkout_address_line1">Street Address</label>
                    <input id="checkout_address_line1" type="text" required value={checkoutForm.address_line1} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, address_line1: e.target.value }))} placeholder="123 Main Street" />
                  </div>
                  <div className="field">
                    <label htmlFor="checkout_city">City</label>
                    <input id="checkout_city" type="text" required value={checkoutForm.city} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Atlanta" />
                  </div>
                  <div className="field">
                    <label htmlFor="checkout_state">State</label>
                    <input id="checkout_state" type="text" required value={checkoutForm.state} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, state: e.target.value }))} placeholder="GA" />
                  </div>
                  <div className="field col2">
                    <label htmlFor="checkout_zip_code">ZIP Code</label>
                    <input id="checkout_zip_code" type="text" required value={checkoutForm.zip_code} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, zip_code: e.target.value }))} placeholder="30303" />
                  </div>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.7, margin: '4px 0 20px' }}>
                  Fill the shipping details, then continue to the payment review inside this popup.
                </p>
                <div className="co-actions">
                  <button className="btn btn--solid" type="button" onClick={continueToPayment}>Continue to Payment</button>
                  <button className="btn btn--ghost" type="button" onClick={reviewCartFromCheckout}>Review Cart</button>
                </div>
              </section>

              <section className={`co-pane${checkoutStep === 'payment' ? ' active' : ''}`}>
                <div className="co-h">
                  <span className="sec-num">02</span>
                  <span>Payment Review</span>
                </div>
                <div className="pay-methods">
                  <div className="pay-m active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>
                    <span>Stripe Checkout</span>
                  </div>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.7, margin: '0 0 20px' }}>
                  Review the shipping address above, then proceed to the secure hosted payment page.
                </p>
                <div className="co-actions">
                  <button className="btn btn--ghost" type="button" onClick={() => setCheckoutStep('details')} disabled={checkoutBusy}>Back to Address</button>
                  <button className="btn btn--solid" type="submit" disabled={checkoutBusy || cartRows.length === 0}>
                    {checkoutBusy ? 'Redirecting...' : 'Proceed to Payment'}
                  </button>
                </div>
              </section>
            </div>

            <aside className="summary">
              <h4>Order Summary</h4>
              {checkoutError ? <p style={{ color: '#e08a8a', marginBottom: 14 }}>{checkoutError}</p> : null}
              {cartRows.length > 0 ? (
                <div className="summary__items">
                  {cartRows.map(({ row, qty }) => (
                    <div className="sum-line" key={row.product_id}>
                      <div className="sum-line__img">
                        <img src={row.image || FALLBACK_IMAGE} alt={row.name} />
                        <span className="q">{qty}</span>
                      </div>
                      <div>
                        <div className="sum-line__name">{row.name}</div>
                        <div className="sum-line__meta">{row.category || 'Merch'} ? {formatMoney(row.price)} each</div>
                      </div>
                      <div className="sum-line__price">{formatMoney(row.price * qty)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Your cart is empty. Add a product before checkout.</p>
              )}
              <div className="row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="row"><span>Shipping</span><span>{shipping === 0 ? 'Free' : formatMoney(shipping)}</span></div>
              <div className="row"><span>Estimated Tax</span><span>{formatMoney(tax)}</span></div>
              <div className="row total"><span>Total</span><b>{formatMoney(total)}</b></div>
            </aside>
          </form>
        </div>
      </div>

      <ProductQuickView
        row={selectedProduct}
        qty={selectedProduct ? cartQtyMap.get(selectedProduct.product_id) || 0 : 0}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={addToCart}
        onDecrease={(row) => updateQuantity(row, (cartQtyMap.get(row.product_id) || 0) - 1)}
        onIncrease={(row) => updateQuantity(row, (cartQtyMap.get(row.product_id) || 0) + 1)}
        onOpenCart={openCart}
      />

      <footer className="shop-foot">
        <div className="wrap">Purpose-driven merchandise, real-time cart feedback, and admin-managed product storytelling.</div>
      </footer>
    </div>
  )
}
