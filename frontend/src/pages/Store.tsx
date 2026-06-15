import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { api, type InventoryRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'
import { BRAND_LOGO } from '../lib/brandAssets'
import '../styles/store.css'

const LOGO = BRAND_LOGO
const FALLBACK_IMAGE = '/assets/merch-collectible.webp'

type Tone = 'green' | 'amber' | 'red' | 'muted'

function badgeStyle(tone: Tone): React.CSSProperties {
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

function statusStyle(tone: Tone): React.CSSProperties {
  return {
    color:
      tone === 'green' ? '#8FBF96'
        : tone === 'amber' ? '#F5D48A'
          : tone === 'red' ? '#e08a8a'
            : '#807768',
  }
}

function MerchCard({ row }: { row: InventoryRow }) {
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
      </div>
    </article>
  )
}

export default function Store() {
  useSeo({
    title: 'Merch Collection',
    description: 'Admin-managed merch catalog with live, sold out, and upcoming product states.',
  })

  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const liveItems = rows.filter((row) => row.visibility === 'live' && row.stock_status !== 'out')
  const soldOutItems = rows.filter((row) => row.visibility === 'live' && row.stock_status === 'out')
  const upcomingItems = rows.filter((row) => row.visibility === 'upcoming')

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
          </div>
        </div>
      </header>

      <section className="shop-hero">
        <div className="wrap">
          <div className="eyebrow">Admin-managed merch catalog</div>
          <h1>The Collection</h1>
          <p>Products can be published as live, parked as upcoming, or hidden from the public store while still staying in the admin console.</p>
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
              <MerchCard key={item.product_id} row={item} />
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
              <MerchCard key={item.product_id} row={item} />
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
              <MerchCard key={item.product_id} row={item} />
            ))}
            {!loading && upcomingItems.length === 0 && (
              <div className="empty">
                <p>No upcoming products are queued yet.</p>
              </div>
            )}
          </div>
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
