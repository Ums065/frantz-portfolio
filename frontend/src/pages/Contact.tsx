import { useEffect } from 'react'
import ContactSection from '../components/ContactSection'
import { useSeo } from '../hooks/useSeo'

/**
 * Dedicated Contact page. Reuses the shared ContactSection (which posts to the
 * existing POST /contact endpoint) under a page hero.
 */
export default function Contact() {
  useSeo({
    title: 'Contact',
    description: 'Get in touch with Frantz Coutard and the team for partnerships, press, speaking, and community initiatives.',
    image: '/assets/fc-logo.webp',
  })

  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Contact</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Let’s Get In Touch</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto', maxWidth: 620 }}>
            Partnerships, press, speaking opportunities, or a community idea — send a message and the team will follow up.
          </p>
        </div>
      </section>

      <ContactSection />
    </main>
  )
}
