import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type PublicSponsorTier, type SponsorProgramRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'

const fallbackProgram: SponsorProgramRow = {
  id: 0,
  slug: 'leave-it-better-than-you-found-it-2026',
  name: 'Leave It Better Than You Found It',
  edition_name: '1st Annual Student Impact Challenge',
  headline: 'Support New York’s Next Generation of Problem Solvers',
  subheadline: 'Help students ages 11–19 develop leadership, entrepreneurship, communication, and problem-solving skills while creating positive change in their communities.',
  registration_opens: '2026-06-25',
  winners_announced: '2026-12-22',
  school_impact_grant_amount: 25000,
  student_scholarship_amount: 10000,
  educator_award_label: 'All-Inclusive Educator Recognition Award',
  age_range: '11-19',
  grade_range: '6-12',
  is_active: 1,
  levels: [],
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export default function FoundingSponsors() {
  const location = useLocation()
  const basePath = location.pathname.startsWith('/new-school') ? '/new-school' : ''
  const sponsorPath = `${basePath}/become-a-founding-sponsor`

  useSeo({
    title: 'Founding Sponsors',
    description: 'Published founding sponsors supporting the Student Impact Challenge.',
  })

  const [program, setProgram] = useState<SponsorProgramRow>(fallbackProgram)
  const [tiers, setTiers] = useState<PublicSponsorTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get<{ program: SponsorProgramRow; tiers: PublicSponsorTier[] }>('sponsorship/current/sponsors')
      .then((payload) => {
        if (!active) return
        setProgram(payload.program || fallbackProgram)
        setTiers(payload.tiers || [])
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load founding sponsors.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const visibleTiers = tiers.filter((tier) => tier.sponsors.length > 0)
  const totalSponsors = visibleTiers.reduce((total, tier) => total + tier.sponsors.length, 0)

  return (
    <main className="page sponsor-page sponsor-page--listing">
      <section className="sponsor-hero sponsor-hero--listing">
        <div className="wrap sponsor-hero__grid">
          <div className="sponsor-hero__copy reveal in">
            <span className="eyebrow">Founding Sponsors</span>
            <h1 className="page-hero__title gold-text">Organizations backing student problem-solvers across New York.</h1>
            <p className="page-hero__lead">
              Approved and published sponsors are recognized here by sponsorship tier. Each organization helps power scholarships,
              school grants, educator recognition, and community impact projects.
            </p>
            <div className="sponsor-actions">
              <Link className="btn btn--solid" to={sponsorPath}>Become A Founding Sponsor</Link>
              <a className="btn" href="/docs/founding_sponsor_kit.pdf" download>Download Sponsor Kit</a>
            </div>
            {error && <p className="sponsor-note sponsor-note--error">{error}</p>}
          </div>

          <aside className="glass sponsor-hero__panel reveal in">
            <span className="eyebrow">At A Glance</span>
            <h2>{program.edition_name || program.name}</h2>
            <div className="sponsor-date-list">
              <div>
                <strong>Published Sponsors</strong>
                <span>{loading ? 'Loading...' : totalSponsors}</span>
              </div>
              <div>
                <strong>Grant Goal</strong>
                <span>${program.school_impact_grant_amount.toLocaleString('en-US')}</span>
              </div>
              <div>
                <strong>Scholarship Goal</strong>
                <span>${program.student_scholarship_amount.toLocaleString('en-US')}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          {loading && <p className="sponsor-note">Loading published sponsors...</p>}

          {!loading && visibleTiers.length === 0 && (
            <div className="glass sponsor-empty-state">
              <span className="eyebrow">No Sponsors Published Yet</span>
              <h2>Founding sponsor recognition will appear here after approval and payment confirmation.</h2>
              <p>
                The sponsor system is live. Organizations can now submit interest, mail checks, and move through approval before
                they appear on this public page.
              </p>
              <Link className="btn btn--solid" to={sponsorPath}>Become A Founding Sponsor</Link>
            </div>
          )}

          {visibleTiers.map((tier) => (
            <section className="sponsor-tier-section" key={tier.slug}>
              <div className="block__head reveal in">
                <div className="section-title"><span className="ln l" /><h2 className="gold-text">{tier.name}</h2><span className="ln r" /></div>
                <p className="sub">{tier.sponsors.length} published sponsor{tier.sponsors.length === 1 ? '' : 's'} in this tier.</p>
              </div>
              <div className="sponsor-card-grid">
                {tier.sponsors.map((sponsor) => (
                  <article className="glass sponsor-card reveal in" key={sponsor.id}>
                    <div className="sponsor-card__top">
                      {sponsor.logo_url ? (
                        <img className="sponsor-card__logo" src={sponsor.logo_url} alt={`${sponsor.organization_name} logo`} loading="lazy" decoding="async" />
                      ) : (
                        <div className="sponsor-card__logo sponsor-card__logo--placeholder" aria-hidden="true">
                          {initials(sponsor.organization_name)}
                        </div>
                      )}
                      <span className="sponsor-card__badge">{sponsor.badge}</span>
                    </div>
                    <h3>{sponsor.organization_name}</h3>
                    <p className="sponsor-card__level">{sponsor.sponsorship_level_name}</p>
                    <p>{sponsor.short_description}</p>
                    {sponsor.website && (
                      <a href={sponsor.website} target="_blank" rel="noreferrer" className="sponsor-card__link">
                        Visit Website
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
