import { Link, NavLink } from 'react-router-dom'
import { useSeo } from '../hooks/useSeo'
import { merchCatalogItems } from '../lib/merch'
import '../styles/store.css'

const LOGO = '/assets/fc-logo.png'

function MerchCard({ title, image, category, description, status }: typeof merchCatalogItems[number]) {
  const locked = status !== 'live'

  return (
    <article className={`card${locked ? ' locked' : ''}`}>
      <span className="card__badge">{locked ? 'Coming Soon' : 'Preview'}</span>
      <div className="card__img">
        <img className="card__photo" src={image} alt={title} />
        {locked && (
          <div className="card__overlay" aria-hidden="true">
            <span>Coming Soon</span>
          </div>
        )}
      </div>
      <div className="card__body">
        <div className="card__cat">{category}</div>
        <h3 className="card__name">{title}</h3>
        <p className="card__desc">{description}</p>
        <div className="card__foot">
          <span className="card__status">
            {locked ? 'Locked until launch' : 'Synced from the home collection'}
          </span>
          <span className="card__meta">{locked ? 'Future drop' : 'Featured now'}</span>
        </div>
      </div>
    </article>
  )
}

export default function Store() {
  useSeo({
    title: 'Merch Collection',
    description: 'Preview-only merch collection synced from the home page. Five live cards are visible and the rest are marked coming soon.',
  })

  const liveItems = merchCatalogItems.filter((item) => item.status === 'live')
  const comingSoonItems = merchCatalogItems.filter((item) => item.status !== 'live')

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
          <div className="eyebrow">Synced merch catalog</div>
          <h1>The Collection</h1>
          <p>The store reads from the same collection data used on the home page. Five items are live in preview and the rest stay locked until checkout is ready.</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{liveItems.length}</strong>
              <span>Visible items</span>
            </div>
            <div className="hero-stat">
              <strong>{comingSoonItems.length}</strong>
              <span>Coming soon</span>
            </div>
            <div className="hero-stat">
              <strong>No cart</strong>
              <span>No payment flow yet</span>
            </div>
          </div>
        </div>
      </section>

      <main className="wrap">
        <section className="section">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Featured preview</span>
              <h2>Home collection items</h2>
            </div>
            <p>These are the same collection cards shown on the home page. They are display-only and cannot be added to a cart.</p>
          </div>

          <div className="grid">
            {liveItems.map((item) => (
              <MerchCard key={item.id} {...item} />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section__head">
            <div>
              <span className="section__eyebrow">Coming soon</span>
              <h2>Future merch drops</h2>
            </div>
            <p>These products are part of the catalog, but they stay locked until the payment integration and purchase flow are live.</p>
          </div>

          <div className="grid">
            {comingSoonItems.map((item) => (
              <MerchCard key={item.id} {...item} />
            ))}
          </div>
        </section>

        <section className="store-note">
          <div>
            <span className="section__eyebrow">Important</span>
            <h2>Preview mode only</h2>
            <p>
              The merch catalog is synced across the home and store pages. No add to cart, checkout, or payment actions are available until we wire that in later.
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
