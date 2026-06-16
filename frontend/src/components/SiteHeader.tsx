import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SocialLinks } from './SocialIcons'
import { BRAND_LOGO } from '../lib/brandAssets'
import { resolveDashboardRoute } from '../lib/dashboardRoute'

const logo = BRAND_LOGO

type NavItem =
  | { label: string; href: string; kind: 'route'; end?: boolean }
  | { label: string; href: string; kind: 'anchor' }

/* Shared top chrome: scroll progress bar, fixed nav, vertical social rail,
   and the mobile menu. Used on every page (Home, About, Awards).
   `home` keeps the section links as in-page hash anchors. */
export default function SiteHeader({ home = false }: { home?: boolean }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dashboardHref = resolveDashboardRoute(user?.role)
  const fullName = user?.full_name || ''
  const initial = fullName.trim().charAt(0).toUpperCase() || 'U'

  const navLinks: NavItem[] = [
    home
      ? { label: 'Home', href: '#home', kind: 'anchor' }
      : { label: 'Home', href: '/', kind: 'route', end: true },
    { label: 'About', href: '/about', kind: 'route' },
    { label: 'Projects', href: '/projects', kind: 'route' },
    { label: 'Awards', href: '/awards', kind: 'route' },
    { label: 'Events', href: '/events', kind: 'route' },
    { label: 'Media', href: '/media', kind: 'route' },
    { label: 'Community', href: '/community', kind: 'route' },
    { label: 'Challenge', href: '/new-school', kind: 'route' },
    ...(user ? [{ label: 'Dashboard', href: dashboardHref, kind: 'route' as const }] : []),
    { label: 'Merch', href: '/store', kind: 'route' },
    { label: 'News', href: '/blog', kind: 'route' },
  ]

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      <div className="scroll-progress" id="scrollProgress" />

      <header className="nav">
        <div className="nav__inner">
          <Link to="/" className="logo-mono" aria-label="Frantz Coutard home"><img src={logo} alt="FC monogram" /></Link>
          <nav className="nav__links">
            {navLinks.map((item) =>
              item.kind === 'route' ? (
                <NavLink
                  key={item.label}
                  to={item.href}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  {item.label}
                </NavLink>
              ) : (
                <a key={item.label} href={item.href} data-nav-section>{item.label}</a>
              ),
            )}
            <span className="nav__indicator" aria-hidden="true" />
          </nav>
          <div className="nav__cta">
            {user ? (
              <div className="profile-menu" ref={menuRef}>
                <button
                  className="profile-menu__trigger"
                  type="button"
                  aria-label="Open profile menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span className="profile-menu__avatar" aria-hidden="true">
                    {initial}
                  </span>
                </button>
                <div className={`profile-menu__dropdown${menuOpen ? ' open' : ''}`}>
                  <div className="profile-menu__meta">
                    <strong>{fullName}</strong>
                    <span>{user.email}</span>
                  </div>
                  <Link to={dashboardHref} onClick={closeMenu}>Dashboard</Link>
                  <Link to="/demo-login" onClick={closeMenu}>Demo Login</Link>
                  <Link to="/profile" onClick={closeMenu}>Profile</Link>
                  <button
                    type="button"
                    onClick={async () => {
                      closeMenu()
                      await logout()
                    }}
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link className="btn btn--sm" to="/demo-login">Demo Login</Link>
                <button className="btn btn--sm" data-auth="login">Login</button>
                <button className="btn btn--sm btn--solid" data-auth="register">Register</button>
              </>
            )}
          </div>
          <button className="menu-toggle" aria-label="Open menu">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
        </div>
      </header>

      <SocialLinks variant="rail" />

      <div className="mobile-menu">
        <button className="close-m" aria-label="Close menu"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <div className="m-scroll">
          {navLinks.map((item) =>
            item.kind === 'route' ? (
              <NavLink
                key={item.label}
                to={item.href}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ) : (
              <a key={item.label} href={item.href} data-nav-section>{item.label}</a>
            ),
          )}
          <div className="mcta">
            {user ? (
              <>
                <Link className="btn btn--sm" to="/demo-login">Demo Login</Link>
                <Link className="btn btn--sm btn--solid" to={dashboardHref}>Dashboard</Link>
                <Link className="btn btn--sm" to="/profile">Profile</Link>
                <button className="btn btn--sm" type="button" onClick={() => logout()}>Logout</button>
              </>
            ) : (
              <>
                <Link className="btn btn--sm" to="/demo-login">Demo Login</Link>
                <button className="btn btn--sm" data-auth="login">Login</button>
                <button className="btn btn--sm btn--solid" data-auth="register">Register</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
