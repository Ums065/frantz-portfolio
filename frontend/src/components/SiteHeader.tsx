import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SocialLinks } from './SocialIcons'
import { BRAND_LOGO } from '../lib/brandAssets'
import { resolveDashboardRoute } from '../lib/dashboardRoute'
import { useI18n } from '../lib/i18n'

const logo = BRAND_LOGO

type NavItem =
  | { label: string; href: string; kind: 'route'; end?: boolean }
  | { label: string; href: string; kind: 'anchor' }
  | { label: string; href: string; kind: 'external' }

/* Shared top chrome: scroll progress bar, fixed nav, vertical social rail,
   and the mobile menu. Used on every page (Home, About, Awards).
   `home` keeps the section links as in-page hash anchors. */
export default function SiteHeader({ home = false }: { home?: boolean }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [desktopSponsorOpen, setDesktopSponsorOpen] = useState(false)
  const [mobileSponsorOpen, setMobileSponsorOpen] = useState(false)
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const desktopSponsorRef = useRef<HTMLDivElement | null>(null)
  const mobileSponsorRef = useRef<HTMLDivElement | null>(null)
  const desktopMoreRef = useRef<HTMLDivElement | null>(null)
  const dashboardHref = resolveDashboardRoute(user?.role)
  const fullName = user?.full_name || ''
  const initial = fullName.trim().charAt(0).toUpperCase() || 'U'

  // Primary links stay on the bar; everything else collapses into a "More"
  // dropdown so the header doesn't overflow. Mobile shows the full list.
  const primaryLinks: NavItem[] = [
    home
      ? { label: t('nav.home'), href: '#home', kind: 'anchor' }
      : { label: t('nav.home'), href: '/', kind: 'route', end: true },
    { label: t('nav.about'), href: '/about', kind: 'route' },
    { label: t('nav.challenge'), href: '/new-school', kind: 'route' },
    { label: t('nav.awards'), href: '/awards', kind: 'route' },
    // Temporarily hidden from the header — uncomment to restore the Partners tab.
    // { label: t('nav.partners'), href: '/partner', kind: 'route' },
    ...(user ? [{ label: t('nav.dashboard'), href: dashboardHref, kind: 'route' as const }] : []),
  ]
  const moreLinks: NavItem[] = [
    { label: t('nav.projects'), href: '/projects', kind: 'route' },
    { label: t('nav.events'), href: '/events', kind: 'route' },
    { label: t('nav.media'), href: '/media', kind: 'route' },
    { label: t('nav.merch'), href: '/store', kind: 'route' },
    { label: t('nav.news'), href: '/blog', kind: 'route' },
    { label: t('nav.contact'), href: '/contact', kind: 'route' },
  ]
  const allNavLinks: NavItem[] = [...primaryLinks, ...moreLinks]

  useEffect(() => {
    if (!menuOpen && !desktopSponsorOpen && !mobileSponsorOpen && !desktopMoreOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
      if (desktopSponsorRef.current && !desktopSponsorRef.current.contains(event.target as Node)) {
        setDesktopSponsorOpen(false)
      }
      if (mobileSponsorRef.current && !mobileSponsorRef.current.contains(event.target as Node)) {
        setMobileSponsorOpen(false)
      }
      if (desktopMoreRef.current && !desktopMoreRef.current.contains(event.target as Node)) {
        setDesktopMoreOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setDesktopSponsorOpen(false)
        setMobileSponsorOpen(false)
        setDesktopMoreOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, desktopSponsorOpen, mobileSponsorOpen, desktopMoreOpen])

  const closeMenu = () => {
    setMenuOpen(false)
    setDesktopSponsorOpen(false)
    setMobileSponsorOpen(false)
    setDesktopMoreOpen(false)
  }
  const closeDesktopSponsorMenu = () => setDesktopSponsorOpen(false)
  const closeMobileSponsorMenu = () => setMobileSponsorOpen(false)
  const closeDesktopMoreMenu = () => setDesktopMoreOpen(false)

  return (
    <>
      <div className="scroll-progress" id="scrollProgress" />

      <header className="nav" data-no-translate>
        <div className="nav__inner">
          <Link to="/" className="logo-mono" aria-label="Frantz Coutard home"><img src={logo} alt="FC monogram" /></Link>
          <nav className="nav__links">
            {primaryLinks.map((item) =>
              item.kind === 'route' ? (
                <NavLink
                  key={item.label}
                  to={item.href}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  {item.label}
                </NavLink>
              ) : item.kind === 'external' ? (
                <a key={item.label} href={item.href}>{item.label}</a>
              ) : (
                <a key={item.label} href={item.href} data-nav-section>{item.label}</a>
              ),
            )}
            <div className={`nav-dropdown${desktopMoreOpen ? ' open' : ''}`} ref={desktopMoreRef}>
              <button
                type="button"
                className="nav-dropdown__trigger"
                aria-expanded={desktopMoreOpen}
                aria-haspopup="true"
                onClick={() => setDesktopMoreOpen((open) => !open)}
              >
                {t('nav.more')}
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <div className="nav-dropdown__menu" role="menu" aria-label="More menu">
                {moreLinks.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.href}
                    onClick={closeDesktopMoreMenu}
                    role="menuitem"
                    className={({ isActive }) => (isActive ? 'active' : undefined)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
            <div className={`nav-dropdown${desktopSponsorOpen ? ' open' : ''}`} ref={desktopSponsorRef}>
              <button
                type="button"
                className="nav-dropdown__trigger"
                aria-expanded={desktopSponsorOpen}
                aria-haspopup="true"
                onClick={() => setDesktopSponsorOpen((open) => !open)}
              >
                Founding Sponsor
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <div className="nav-dropdown__menu" role="menu" aria-label="Founding Sponsor menu">
                <Link to="/become-a-founding-sponsor" onClick={closeDesktopSponsorMenu} role="menuitem">Become A Founding Sponsor</Link>
                <Link to="/founding-sponsors" onClick={closeDesktopSponsorMenu} role="menuitem">Founding Sponsors</Link>
              </div>
            </div>
            <span className="nav__indicator" aria-hidden="true" />
          </nav>
          <div className="nav__cta">
            <Link to="/demo" className="btn btn--sm" style={{ borderColor: 'var(--gold)', color: 'var(--gold-light)' }}>{t('cta.demo')}</Link>
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
                  <Link to={dashboardHref} onClick={closeMenu}>{t('nav.dashboard')}</Link>
                  <Link to="/profile" onClick={closeMenu}>{t('cta.profile')}</Link>
                  <Link to="/become-a-founding-sponsor" onClick={closeMenu}>{t('cta.foundingSponsor')}</Link>
                  <Link to="/founding-sponsors" onClick={closeMenu}>{t('cta.foundingSponsors')}</Link>
                  <button
                    type="button"
                    onClick={async () => {
                      closeMenu()
                      await logout()
                    }}
                  >
                    {t('cta.logout')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button className="btn btn--sm" data-auth="login">{t('cta.login')}</button>
                <button className="btn btn--sm btn--solid" data-auth="register">{t('cta.register')}</button>
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
          {allNavLinks.map((item) =>
            item.kind === 'route' ? (
              <NavLink
                key={item.label}
                to={item.href}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ) : item.kind === 'external' ? (
              <a key={item.label} href={item.href}>{item.label}</a>
            ) : (
              <a key={item.label} href={item.href} data-nav-section>{item.label}</a>
            ),
          )}
          <div className="mobile-menu__group" ref={mobileSponsorRef}>
            <button
              className="mobile-menu__group-trigger"
              type="button"
              aria-expanded={mobileSponsorOpen}
              onClick={() => setMobileSponsorOpen((open) => !open)}
            >
              Founding Sponsor
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className={`mobile-menu__group-links${mobileSponsorOpen ? ' open' : ''}`}>
              <Link to="/become-a-founding-sponsor" onClick={() => { closeMenu(); closeMobileSponsorMenu() }}>Become A Founding Sponsor</Link>
              <Link to="/founding-sponsors" onClick={() => { closeMenu(); closeMobileSponsorMenu() }}>Founding Sponsors</Link>
            </div>
          </div>
          <div className="mcta">
            <Link className="btn btn--sm" to="/demo" onClick={closeMenu} style={{ borderColor: 'var(--gold)', color: 'var(--gold-light)' }}>Demo Login</Link>
            {user ? (
              <>
                <Link className="btn btn--sm btn--solid" to={dashboardHref}>Dashboard</Link>
                <Link className="btn btn--sm" to="/profile">Profile</Link>
                <button className="btn btn--sm" type="button" onClick={() => logout()}>Logout</button>
              </>
            ) : (
              <>
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
