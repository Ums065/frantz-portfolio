import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type PublicSponsorTier, type SponsorLevelRow, type SponsorProgramRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'
import TermsAgreement from '../components/TermsAgreement'
import { recordTermsAcceptance } from '../lib/recordTermsAcceptance'

const fallbackLevels: SponsorLevelRow[] = [
  { id: 1, slug: 'community_partner', name: 'Community Partner', minimum_amount: 1000, sort_order: 1 },
  { id: 2, slug: 'silver_sponsor', name: 'Silver Sponsor', minimum_amount: 5000, sort_order: 2 },
  { id: 3, slug: 'gold_sponsor', name: 'Gold Sponsor', minimum_amount: 10000, sort_order: 3 },
  { id: 4, slug: 'presenting_sponsor', name: 'Presenting Sponsor', minimum_amount: 25000, sort_order: 4 },
  { id: 5, slug: 'custom_sponsorship', name: 'Custom Sponsorship Amount', minimum_amount: 0, sort_order: 5 },
]

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
  levels: fallbackLevels,
  published_sponsor_count: 0,
}

const organizationTypes = [
  'Corporation',
  'Small Business',
  'Nonprofit',
  'Foundation',
  'College / University',
  'Healthcare Organization',
  'Financial Institution',
  'Government Agency',
  'Community Organization',
  'Other',
]

const interestOptions = [
  'Attend Awards Ceremony',
  'Speaking Opportunity',
  'Student Mentorship Opportunities',
  'Scholarship Naming Opportunity',
  'School Grant Naming Opportunity',
  'Future Internship Opportunities',
  'Community Partnership Opportunities',
]

const defaultPaymentInstructions = [
  'MAKE CHECK PAYABLE TO:',
  'Trend Catch Network Inc.',
  '',
  'MAIL CHECK TO:',
  'Attention: FrantzCoutard.com',
  'Leave It Better Than You Found It',
  'Suite 1400',
  '118-35 Queens Blvd',
  'Forest Hills, NY 11375',
  '',
  'IMPORTANT:',
  'Please include your organization name, contact person, email address, and sponsorship level with your check.',
]

const initialForm = {
  organization_name: '',
  contact_person: '',
  title_position: '',
  email_address: '',
  phone_number: '',
  website: '',
  street_address: '',
  city: '',
  state: '',
  zip_code: '',
  organization_type: organizationTypes[0],
  company_bio: '',
  support_reason: '',
  sponsorship_level_slug: 'community_partner',
  sponsorship_amount: '1000',
  interests: [] as string[],
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatLongDate(value: string | null) {
  if (!value) return 'To be announced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export default function FoundingSponsor() {
  const location = useLocation()
  const basePath = location.pathname.startsWith('/new-school') ? '/new-school' : ''
  const sponsorListingPath = `${basePath}/founding-sponsors`

  useSeo({
    title: 'Become A Founding Sponsor',
    description: 'Support New York’s next generation of problem solvers through scholarships, school grants, and community impact.',
  })

  const [program, setProgram] = useState<SponsorProgramRow>(fallbackProgram)
  const [tiers, setTiers] = useState<PublicSponsorTier[]>([])
  const [paymentInstructions, setPaymentInstructions] = useState<string[]>(defaultPaymentInstructions)
  const [form, setForm] = useState(initialForm)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ level: string; amount: number; organization: string } | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      api.get<{
        program: SponsorProgramRow
        organizationTypes: string[]
        interestOptions: string[]
        paymentInstructions: string[]
      }>('sponsorship/current'),
      api.get<{ program: SponsorProgramRow; tiers: PublicSponsorTier[] }>('sponsorship/current/sponsors'),
    ])
      .then(([current, published]) => {
        if (!active) return
        const nextProgram = {
          ...current.program,
          levels: current.program.levels?.length ? current.program.levels : fallbackLevels,
        }
        setProgram(nextProgram)
        setTiers(published.tiers || [])
        setPaymentInstructions(current.paymentInstructions?.length ? current.paymentInstructions : defaultPaymentInstructions)
        const defaultLevel = nextProgram.levels[0]
        setForm((prev) => ({
          ...prev,
          organization_type: current.organizationTypes?.[0] || prev.organization_type,
          sponsorship_level_slug: defaultLevel?.slug || prev.sponsorship_level_slug,
          sponsorship_amount: String(defaultLevel?.minimum_amount || prev.sponsorship_amount),
        }))
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load sponsor details.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const levels = program.levels?.length ? program.levels : fallbackLevels
  const selectedLevel = levels.find((level) => level.slug === form.sponsorship_level_slug) || levels[0]
  const sponsorCount = tiers.reduce((total, tier) => total + tier.sponsors.length, 0)

  const impactGoals = [
    `${formatMoney(program.school_impact_grant_amount)} School Impact Grant`,
    `Up To ${formatMoney(program.student_scholarship_amount)} Student Scholarships`,
    program.educator_award_label,
    'Community Impact Projects',
    'Student Leadership Development',
    'Entrepreneurship Education',
  ]

  const timeline = [
    {
      title: 'Registration Opens',
      detail: formatLongDate(program.registration_opens),
    },
    {
      title: 'Sponsor Review & Outreach',
      detail: 'Summer and fall 2026 sponsor approvals, check tracking, and community coordination.',
    },
    {
      title: 'Awards Ceremony',
      detail: 'Approved sponsors are invited to meet students, families, educators, and school leaders.',
    },
    {
      title: 'Winners Announced',
      detail: formatLongDate(program.winners_announced),
    },
  ]

  const handleInterestToggle = (interest: string) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((item) => item !== interest)
        : [...prev.interests, interest],
    }))
  }

  const handleLevelChange = (slug: string) => {
    const level = levels.find((item) => item.slug === slug)
    setForm((prev) => ({
      ...prev,
      sponsorship_level_slug: slug,
      sponsorship_amount: slug === 'custom_sponsorship'
        ? prev.sponsorship_amount
        : String(level?.minimum_amount || prev.sponsorship_amount),
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')

    try {
      let logoUrl = ''
      if (logoFile) {
        const uploaded = await api.upload<{ url: string }>('sponsorship/upload-logo', logoFile)
        logoUrl = uploaded.url
      }

      const amount = Number(form.sponsorship_amount || 0)
      const response = await api.post<{
        application: {
          organization_name: string
          sponsorship_level_name: string
          sponsorship_amount: number
        }
        paymentInstructions: string[]
      }>('sponsorship/application', {
        ...form,
        logo_url: logoUrl,
        sponsorship_amount: amount,
        custom_amount: form.sponsorship_level_slug === 'custom_sponsorship',
      })

      setPaymentInstructions(response.paymentInstructions?.length ? response.paymentInstructions : defaultPaymentInstructions)
      setSuccess({
        organization: response.application.organization_name,
        level: response.application.sponsorship_level_name,
        amount: response.application.sponsorship_amount,
      })
      recordTermsAcceptance({ kind: 'website', signature: form.contact_person || form.organization_name, email: form.email_address, documentLabel: 'Sponsorship Application' })
      setForm({
        ...initialForm,
        organization_type: organizationTypes[0],
        sponsorship_level_slug: levels[0]?.slug || 'community_partner',
        sponsorship_amount: String(levels[0]?.minimum_amount || 1000),
      })
      setLogoFile(null)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit sponsor application.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page sponsor-page">
      <section className="sponsor-hero">
        <div className="wrap sponsor-hero__grid">
          <div className="sponsor-hero__copy reveal in">
            <span className="eyebrow">Become A Founding Sponsor</span>
            <h1 className="page-hero__title gold-text">{program.headline}</h1>
            <p className="page-hero__lead">{program.subheadline}</p>

            <div className="sponsor-hero__metrics">
              <div className="glass sponsor-metric">
                <strong>{sponsorCount}</strong>
                <span>Published Founding Sponsors</span>
              </div>
              <div className="glass sponsor-metric">
                <strong>{program.age_range}</strong>
                <span>Ages</span>
              </div>
              <div className="glass sponsor-metric">
                <strong>{program.grade_range}</strong>
                <span>Grades</span>
              </div>
            </div>

            <div className="sponsor-actions">
              <a className="btn btn--solid" href="#sponsor-interest-form">Become A Founding Sponsor</a>
              <Link className="btn" to={sponsorListingPath}>View Founding Sponsors</Link>
              <a className="btn" href="/docs/founding_sponsor_kit.pdf" download>Download Sponsor Kit</a>
            </div>

            {error && <p className="sponsor-note sponsor-note--error">{error}</p>}
            {loading && <p className="sponsor-note">Loading sponsor program details...</p>}
          </div>

          <aside className="glass sponsor-hero__panel reveal in">
            <span className="eyebrow">Impact Goals</span>
            <h2>{program.edition_name || program.name}</h2>
            <ul className="sponsor-checklist">
              {impactGoals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
            <div className="sponsor-date-list">
              <div>
                <strong>Registration Opens</strong>
                <span>{formatLongDate(program.registration_opens)}</span>
              </div>
              <div>
                <strong>Winners Announced</strong>
                <span>{formatLongDate(program.winners_announced)}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="block">
        <div className="wrap sponsor-section-grid">
          <article className="glass sponsor-content-card reveal in">
            <span className="eyebrow">Mission</span>
            <h2>Build a school-friendly movement with real community outcomes.</h2>
            <p>
              This challenge helps students interview local businesses, identify problems worth solving, and turn those insights
              into practical community impact projects. Sponsors help make that work visible, credible, and sustainable.
            </p>
          </article>

          <article className="glass sponsor-content-card reveal in">
            <span className="eyebrow">Impact</span>
            <h2>Support scholarships, school grants, and leadership development.</h2>
            <p>
              Founding sponsors help fund student scholarships, the school impact grant, educator recognition, and the larger
              infrastructure needed to run a professional statewide challenge.
            </p>
          </article>

          <article className="glass sponsor-content-card reveal in">
            <span className="eyebrow">Awards</span>
            <h2>Recognition tied to measurable educational value.</h2>
            <p>
              Sponsors are connected to scholarship recipients, school grant winners, educator recognition, and the broader story
              of students solving real problems in their communities.
            </p>
          </article>
        </div>
      </section>

      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal in">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Who Can Participate</h2><span className="ln r" /></div>
            <p className="sub">Sponsors include organizations that want to support schools, families, educators, and students.</p>
          </div>
          <div className="sponsor-ceremony__grid">
            {[
              'Principals and school leaders',
              'Teachers and educators',
              'Parents and guardians',
              'Students and student advocates',
              'Businesses and corporations',
              'Nonprofits and foundations',
              'Colleges and universities',
              'Community partners and local leaders',
            ].map((item) => (
              <div className="glass sponsor-ceremony__item reveal in" key={item}>{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="block block--alt">
        <div className="wrap">
          <div className="block__head reveal in">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Timeline</h2><span className="ln r" /></div>
            <p className="sub">Clear timing helps sponsors understand when to step in and how the year unfolds.</p>
          </div>
          <div className="sponsor-timeline">
            {timeline.map((item) => (
              <article className="glass sponsor-timeline__item reveal in" key={item.title}>
                <span className="eyebrow">{item.title}</span>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="block__head reveal in">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">How To Get Started</h2><span className="ln r" /></div>
            <p className="sub">A simple path from interest to check submission.</p>
          </div>
          <div className="sponsor-timeline">
            {[
              'Choose your sponsorship level or enter a custom amount.',
              'Complete the sponsor interest form with your organization details.',
              'Upload your logo if you want public recognition materials to be ready.',
              'Mail the check using the payment instructions shown on this page.',
            ].map((item, index) => (
              <article className="glass sponsor-timeline__item reveal in" key={item}>
                <span className="eyebrow">Step {index + 1}</span>
                <p>{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="block__head reveal in">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Sponsorship Levels</h2><span className="ln r" /></div>
            <p className="sub">Organizations can choose a defined tier or submit a custom sponsorship amount.</p>
          </div>
          <div className="sponsor-level-grid">
            {levels.map((level) => (
              <article className={`glass sponsor-level-card reveal in${level.slug === 'presenting_sponsor' ? ' sponsor-level-card--featured' : ''}`} key={level.slug}>
                <span className="eyebrow">{level.name}</span>
                <h3>{level.slug === 'custom_sponsorship' ? 'Custom Amount' : `${formatMoney(level.minimum_amount)}+`}</h3>
                <p>
                  {level.slug === 'custom_sponsorship'
                    ? 'Share the amount that fits your organization and we will align the opportunity with your goals.'
                    : 'Support student problem-solving, school visibility, and scholarship-driven community impact.'}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block block--alt">
        <div className="wrap sponsor-ceremony">
          <div className="block__head reveal in">
            <div className="section-title"><span className="ln l" /><h2 className="gold-text">Awards Ceremony</h2><span className="ln r" /></div>
            <p className="sub">Approved sponsors are invited to participate in the celebration of student and school achievement.</p>
          </div>
          <div className="sponsor-ceremony__grid">
            {[
              'Meet students',
              'Meet parents',
              'Meet educators',
              'Meet school administrators',
              'Connect with community leaders',
              'Celebrate scholarship recipients',
              'Celebrate school grant winners',
              'Be recognized for supporting education and community impact',
            ].map((item) => (
              <div className="glass sponsor-ceremony__item reveal in" key={item}>{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="block" id="sponsor-interest-form">
        <div className="wrap sponsor-form-wrap">
          <div className="sponsor-form-intro reveal in">
            <span className="eyebrow">Sponsor Interest Form</span>
            <h2 className="gold-text">Become A Founding Sponsor</h2>
            <p>
              Submit your organization details, choose a sponsorship level, and we will immediately show the check payment
              instructions. No online payments, credit cards, ACH, PayPal, or Stripe are used for this process.
            </p>
            <a className="btn" href="/docs/founding_sponsor_kit.pdf" download>Download Sponsor Kit</a>
          </div>

          <div className="glass sponsor-form-card reveal in">
            {success ? (
              <div className="sponsor-success">
                <span className="eyebrow">Application Received</span>
                <h3>{success.organization}</h3>
                <p>
                  Sponsorship level: <strong>{success.level}</strong><br />
                  Sponsorship amount: <strong>{formatMoney(success.amount)}</strong>
                </p>
                <div className="sponsor-check-instructions">
                  {paymentInstructions.map((line, index) => (
                    <div key={`${line}-${index}`}>{line || <span>&nbsp;</span>}</div>
                  ))}
                </div>
                <p className="sponsor-note">
                  Please include your organization name, contact person, email address, and sponsorship level with your check.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="sponsor-form-grid">
                  <label className="field">
                    <span>Organization Name</span>
                    <input type="text" required value={form.organization_name} onChange={(e) => setForm((prev) => ({ ...prev, organization_name: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Contact Person</span>
                    <input type="text" required value={form.contact_person} onChange={(e) => setForm((prev) => ({ ...prev, contact_person: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Title / Position</span>
                    <input type="text" required value={form.title_position} onChange={(e) => setForm((prev) => ({ ...prev, title_position: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Email Address</span>
                    <input type="email" required value={form.email_address} onChange={(e) => setForm((prev) => ({ ...prev, email_address: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Phone Number</span>
                    <input type="text" required value={form.phone_number} onChange={(e) => setForm((prev) => ({ ...prev, phone_number: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Website</span>
                    <input type="text" value={form.website} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} placeholder="https://example.org" />
                  </label>
                  <label className="field sponsor-form-grid__full">
                    <span>Street Address</span>
                    <input type="text" required value={form.street_address} onChange={(e) => setForm((prev) => ({ ...prev, street_address: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>City</span>
                    <input type="text" required value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>State</span>
                    <input type="text" required value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Zip Code</span>
                    <input type="text" required value={form.zip_code} onChange={(e) => setForm((prev) => ({ ...prev, zip_code: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Organization Type</span>
                    <select value={form.organization_type} onChange={(e) => setForm((prev) => ({ ...prev, organization_type: e.target.value }))}>
                      {organizationTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field sponsor-form-grid__full">
                    <span>Logo Upload</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                  </label>
                  <label className="field sponsor-form-grid__full">
                    <span>Company Bio</span>
                    <textarea className="fld-area" required value={form.company_bio} onChange={(e) => setForm((prev) => ({ ...prev, company_bio: e.target.value }))} />
                  </label>
                  <label className="field sponsor-form-grid__full">
                    <span>Why would you like to support this initiative?</span>
                    <textarea className="fld-area" required value={form.support_reason} onChange={(e) => setForm((prev) => ({ ...prev, support_reason: e.target.value }))} />
                  </label>
                </div>

                <div className="sponsor-form-block">
                  <span className="eyebrow">Sponsorship Level</span>
                  <div className="sponsor-level-picker">
                    {levels.map((level) => (
                      <label className={`glass sponsor-level-option ${form.sponsorship_level_slug === level.slug ? 'is-active' : ''}`} key={level.slug}>
                        <input
                          type="radio"
                          name="sponsorship_level"
                          checked={form.sponsorship_level_slug === level.slug}
                          onChange={() => handleLevelChange(level.slug)}
                        />
                        <strong>{level.name}</strong>
                        <span>{level.slug === 'custom_sponsorship' ? 'Enter your amount manually.' : `${formatMoney(level.minimum_amount)}+`}</span>
                      </label>
                    ))}
                  </div>
                  <label className="field sponsor-custom-amount">
                    <span>Sponsorship Amount</span>
                    <input
                      type="number"
                      min={selectedLevel?.slug === 'custom_sponsorship' ? 1 : selectedLevel?.minimum_amount || 0}
                      step="1"
                      required
                      value={form.sponsorship_amount}
                      onChange={(e) => setForm((prev) => ({ ...prev, sponsorship_amount: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="sponsor-form-block">
                  <span className="eyebrow">Optional Participation Interests</span>
                  <div className="sponsor-interest-grid">
                    {interestOptions.map((interest) => (
                      <label className="glass sponsor-interest-option" key={interest}>
                        <input
                          type="checkbox"
                          checked={form.interests.includes(interest)}
                          onChange={() => handleInterestToggle(interest)}
                        />
                        <span>{interest}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sponsor-check-instructions sponsor-check-instructions--compact">
                  {paymentInstructions.map((line, index) => (
                    <div key={`${line}-${index}`}>{line || <span>&nbsp;</span>}</div>
                  ))}
                </div>

                <TermsAgreement kind="website" idPrefix="sponsor" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setTermsAccepted} />
                {submitError && <p className="sponsor-note sponsor-note--error">{submitError}</p>}
                <button className="btn btn--solid" type="submit" disabled={submitting || !termsAccepted}>
                  {submitting ? 'Submitting...' : 'Become A Founding Sponsor'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
