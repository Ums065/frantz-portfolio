import { Link, NavLink } from 'react-router-dom'
import { useSeo } from '../hooks/useSeo'
import '../styles/store.css'

const LOGO = '/assets/fc-logo.png'

interface Product {
  category: string
  name: string
  priceLabel: string
  description: string
  tag?: string
}

const PRODUCTS: Product[] = [
  {
    category: 'Hoodies',
    name: 'Founder Hoodie - Legacy Black',
    priceLabel: '$68',
    description: 'Heavyweight fleece hoodie with the FC emblem and "From Community to Legacy" sleeve detail.',
    tag: 'Bestseller',
  },
  {
    category: 'Hoodies',
    name: 'From Community to Legacy Hoodie',
    priceLabel: '$72',
    description: 'Premium brushed cotton hoodie with a gold tagline print. Built as a statement piece.',
  },
  {
    category: 'T-Shirts',
    name: 'Premium Tee - FC Emblem',
    priceLabel: '$34',
    description: 'Soft combed cotton tee with a gold FC emblem on the chest. Clean, minimal, everyday wear.',
  },
  {
    category: 'T-Shirts',
    name: 'Technology For Good Tee',
    priceLabel: '$32',
    description: 'A direct reminder of the mission behind the brand - practical, simple, and purpose driven.',
  },
  {
    category: 'T-Shirts',
    name: 'Visionary Tee',
    priceLabel: '$30',
    description: 'Minimal gold-on-black treatment for a sharper look that still stays within the brand palette.',
  },
  {
    category: 'Caps',
    name: 'Signature Cap - Gold FC',
    priceLabel: 'TBA',
    description: 'Structured cap with embroidered monogram and an adjustable strap. Releasing after checkout is ready.',
    tag: 'Coming Soon',
  },
  {
    category: 'Caps',
    name: 'Community Builder Cap',
    priceLabel: 'TBA',
    description: 'Low-profile cap with tonal embroidery. Locked until the merch flow is live.',
    tag: 'Coming Soon',
  },
  {
    category: 'Books',
    name: 'From Nothing to Something - Hardcover',
    priceLabel: 'TBA',
    description: 'Signed first edition hardcover focused on the story and blueprint behind the mission.',
    tag: 'Signed',
  },
  {
    category: 'Books',
    name: 'The Legacy Blueprint - eBook',
    priceLabel: 'TBA',
    description: 'Digital edition planned for launch after the payment integration is complete.',
    tag: 'Digital',
  },
  {
    category: 'Collectibles',
    name: 'Limited Edition FC Lapel Pin',
    priceLabel: 'TBA',
    description: 'Gold and green enamel pin reserved for a future drop. No purchase actions are enabled here.',
    tag: 'Limited',
  },
  {
    category: 'Collectibles',
    name: 'Signed Founders Print',
    priceLabel: 'TBA',
    description: 'Museum-quality print for the wall, held for a later release.',
    tag: 'Limited',
  },
]

const FEATURED_LIMIT = 5
const FEATURED_PRODUCTS = PRODUCTS.slice(0, FEATURED_LIMIT)
const COMING_SOON_PRODUCTS = PRODUCTS.slice(FEATURED_LIMIT)

const PhLogo = ({ cls = 'ph-logo' }: { cls?: string }) => (
  <span className={cls}>
    <img src={LOGO} alt="" />
  </span>
)

function ProductCard({ product, locked }: { product: Product; locked?: boolean }) {
  return (
    <article className={`card${locked ? ' locked' : ''}`}>
      <span className="card__badge">{locked ? 'Coming Soon' : product.tag || 'Preview'}</span>
      <div className="card__img">
        <PhLogo />
        <div className="card__overlay" aria-hidden="true">
          <span>{locked ? 'Coming Soon' : 'Preview Only'}</span>
        </div>
      </div>
      <div className="card__body">
        <div className="card__cat">{product.category}</div>
        <h3 className="card__name">{product.name}</h3>
        <p className="card__desc">{product.description}</p>
        <div className="card__foot">
          <span className="card__price">{product.priceLabel}</span>
          <span className="card__meta">{locked ? 'Locked until checkout is ready' : 'Display only - no cart'}</span>
        </div>
      </div>
    </article>
  )
}

export default function Store() {
  useSeo({
    title: 'Merch Preview',
    description: 'Preview-only merch page with five visible products and the rest marked coming soon until checkout is live.',
  })

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
          <div className="eyebrow">Merch preview only</div>
          <h1>The Collection</h1>
          <p>Five products are visible now. The rest stay in Coming Soon until payment integration is live.</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{FEATURED_PRODUCTS.length}</strong>
              <span>Visible products</span>
            </div>
            <div className="hero-stat">
              <strong>{COMING_SOON_PRODUCTS.length}</strong>
              <span>Coming soon</span>
            </div>
            <div className="hero-stat">
              <strong>No cart</strong>
              <span>No checkout yet</span>
            </div>
          </div>
        </div>
      </section>

      <main className="wrap">
        <section className="section">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Featured preview</span>
              <h2>5 products only</h2>
            </div>
            <p>These cards are display-only. There is no add to cart, no quick buy, and no payment flow on this page.</p>
          </div>

          <div className="grid">
            {FEATURED_PRODUCTS.map((product) => (
              <ProductCard key={product.name} product={product} />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Coming soon</span>
              <h2>Rest of the collection</h2>
            </div>
            <p>Everything below is locked until we finish the payment integration and release the merch flow.</p>
          </div>

          <div className="grid">
            {COMING_SOON_PRODUCTS.map((product) => (
              <ProductCard key={product.name} product={product} locked />
            ))}
          </div>
        </section>

        <section className="store-note">
          <div>
            <span className="section__eyebrow">Important</span>
            <h2>Purchase flow paused</h2>
            <p>
              Nothing on this page can be added to cart or checked out. Once payment is ready, we can wire the merch
              flow back in without changing the collection structure.
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
          <p>Preview mode only. All purchase actions remain disabled until checkout and payment are integrated.</p>
        </div>
      </footer>
    </div>
  )
}
