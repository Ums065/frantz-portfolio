import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SocialLinks } from './SocialIcons'

const logo = '/assets/fc-logo.png'
const isAdmin = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')

/* Shared top chrome: scroll progress bar, fixed nav, vertical social rail,
   and the mobile menu. Used on every page (Home, About, Awards).
   `home` keeps the section links as in-page hash anchors; on other pages
   they become root-relative (`/#speaking`) so they route home and scroll. */
export default function SiteHeader({ home = false }: { home?: boolean }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dashboardHref = user ? (isAdmin(user.role) ? '/admin' : '/dashboard') : '/dashboard'
  const sec = (id: string) => (home ? `#${id}` : `/#${id}`)

  const navLinks: Array<[string, string, boolean]> = [
    ['Home', home ? '#home' : '/', !home],
    ['About', '/about', true],
    ['Projects', '/projects', true],
    ['Awards', '/awards', true],
    ['Speaking', sec('speaking'), false],
    ['Events', '/events', true],
    ['Media', '/media', true],
    ['Community', '/community', true],
    ['Merch', '/store', true],
    ['News', '/blog', true],
    ['Contact', sec('contact'), false],
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
            {navLinks.map(([label, href, isRoute]) =>
              isRoute ? (
                <Link key={label} to={href} data-nav>{label}</Link>
              ) : (
                <a key={label} href={href}>{label}</a>
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
                    {user.full_name.trim().charAt(0).toUpperCase() || 'U'}
                  </span>
                </button>
                <div className={`profile-menu__dropdown${menuOpen ? ' open' : ''}`}>
                  <div className="profile-menu__meta">
                    <strong>{user.full_name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <Link to={dashboardHref} onClick={closeMenu}>Dashboard</Link>
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
          {navLinks.map(([label, href, isRoute]) => (
            isRoute ? <Link key={label} to={href}>{label}</Link> : <a key={label} href={href}>{label}</a>
          ))}
          <div className="mcta">
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
