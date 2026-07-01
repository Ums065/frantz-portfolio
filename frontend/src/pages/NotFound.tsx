import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSeo } from '../hooks/useSeo'

/**
 * Catch-all 404 page for any unmatched client-side route.
 */
export default function NotFound() {
  const { pathname } = useLocation()

  useSeo({
    title: 'Page Not Found',
    description: 'The page you are looking for could not be found.',
    image: '/assets/fc-logo.webp',
  })

  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ minHeight: '62vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div
              className="gold-text reveal in"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: 'clamp(84px, 18vw, 168px)', lineHeight: 1, letterSpacing: 2 }}
            >
              404
            </div>
            <h1 className="page-hero__title gold-text reveal in d1" style={{ margin: '10px auto 12px' }}>Page Not Found</h1>
            <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto 26px', maxWidth: 520 }}>
              The page you’re looking for doesn’t exist, was moved, or the link is broken.
            </p>
            {pathname && (
              <p className="msub reveal in d2" style={{ margin: '0 auto 24px', opacity: 0.7, fontFamily: 'Consolas, Monaco, monospace' }}>
                {pathname}
              </p>
            )}
            <div className="reveal in d2" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <Link className="btn btn--solid" to="/">Back to Home</Link>
              <Link className="btn" to="/contact">Contact Us</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
