import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type CareerApplicantState, type CareerJob, type CareerJobDetail } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import Pager from '../components/Pager'

/* The public job board. Anyone can read it; applying needs a login and an
   age of 18 or over. Both of those are enforced on the server — this page
   only explains them, so nobody fills in a long form to be refused at the end. */

const TYPE_LABEL: Record<string, string> = {
  full_time: 'Full time', part_time: 'Part time', contract: 'Contract',
  internship: 'Internship', volunteer: 'Volunteer', freelance: 'Freelance',
}
const MODE_LABEL: Record<string, string> = { onsite: 'On site', remote: 'Remote', hybrid: 'Hybrid' }
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/* Google reads JobPosting and can surface a role in its jobs results, but only
   for a page that is actually about that one role — hence /careers/{id} rather
   than a modal with no URL of its own. Fields Google treats as required:
   title, description, datePosted, hiringOrganization, jobLocation. */
function jobLd(j: CareerJobDetail) {
  const body = [j.summary, j.description, j.responsibilities, j.requirements].filter(Boolean).join('\n\n')
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: j.title,
    description: body || j.title,
    datePosted: (j.created_at || '').slice(0, 10),
    validThrough: j.apply_deadline || undefined,
    employmentType: (j.employment_type || '').toUpperCase(),
    hiringOrganization: { '@type': 'Organization', name: j.org_name },
    jobLocationType: j.work_mode === 'remote' ? 'TELECOMMUTE' : undefined,
    jobLocation: j.location
      ? { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: j.location, addressCountry: 'US' } }
      : undefined,
    applicantLocationRequirements: j.work_mode === 'remote' ? { '@type': 'Country', name: 'USA' } : undefined,
    skills: j.skills || undefined,
    directApply: true,
    url: `https://frantzcoutard.com/careers/${j.id}`,
  }
}

export default function Careers() {
  const { user } = useAuth()
  // /careers/{id} opens straight onto one role — a real URL people can share
  // and search engines can index.
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<CareerJob[]>([])
  const [types, setTypes] = useState<{ employment_type: string; n: number }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [openJob, setOpenJob] = useState<CareerJobDetail | null>(null)
  const [me, setMe] = useState<CareerApplicantState | null>(null)
  const per = 12

  useSeo(openJob ? {
    title: `${openJob.title} — ${openJob.org_name}`,
    description: openJob.summary || `${openJob.title} at ${openJob.org_name}. Apply online — open to applicants 18 and over.`,
    type: 'article',
    jsonLd: jobLd(openJob),
  } : {
    title: 'Careers',
    description: 'Open roles across the Frantz Coutard ecosystem and our partner organisations. Apply online — open to applicants 18 and over.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Careers & Opportunities',
      description: 'Open roles across the Frantz Coutard ecosystem and its partner organisations.',
      url: 'https://frantzcoutard.com/careers',
    },
  })

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), per: String(per) })
    if (type) p.set('type', type)
    if (q.trim()) p.set('q', q.trim())
    setLoading(true)
    api.get<{ jobs: CareerJob[]; total: number; types: { employment_type: string; n: number }[]; me: CareerApplicantState }>(`careers?${p}`)
      .then((d) => {
        setJobs(d.jobs || []); setTotal(d.total || 0); setTypes(d.types || []); setMe(d.me || null)
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [page, type, q])

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    const t = setTimeout(load, q.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  // Opening a role changes the URL, so it can be shared, bookmarked and indexed.
  const open = (id: number) => navigate(`/careers/${id}`)
  const close = () => navigate('/careers')

  useEffect(() => {
    if (!routeId) { setOpenJob(null); return }
    let live = true
    api.get<{ job: CareerJobDetail; me: CareerApplicantState }>(`careers/${routeId}`)
      .then((d) => { if (live) { setOpenJob(d.job); setMe(d.me) } })
      .catch(() => { if (live) { window.fcToast?.('That role is no longer listed.'); navigate('/careers', { replace: true }) } })
    return () => { live = false }
  }, [routeId, navigate])

  const pages = Math.max(1, Math.ceil(total / per))

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Work With Us</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Careers &amp; Opportunities</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto' }}>
            Open roles across our team and our partner organisations. Applications are open to
            anyone <strong>18 or over</strong> with an account on this site.
          </p>
          <div className="page-hero__chips reveal in d2" style={{ justifyContent: 'center', marginTop: 18 }}>
            <span className="chip">{total} open {total === 1 ? 'role' : 'roles'}</span>
            {!user && <span className="chip">Sign in to apply</span>}
          </div>
        </div>
      </section>

      <section className="block" style={{ paddingTop: 20 }}>
        <div className="wrap">
          {/* Under 18 is a real answer, not an error — say where to go instead. */}
          {me?.logged_in && me.age !== null && me.age < 18 && (
            <div className="glass careers-note">
              <strong>You need to be 18 to apply here.</strong>
              <span>
                Opportunities for younger students — internships and sponsor roles with parent
                consent — appear inside your student dashboard instead.
              </span>
            </div>
          )}

          <div className="blog-filters">
            <input className="blog-search" type="search" value={q} placeholder="Search roles, skills or place…"
              aria-label="Search roles" onChange={(e) => { setQ(e.target.value); setPage(1) }} />
            <div className="blog-cats" role="tablist" aria-label="Filter by type">
              <button type="button" role="tab" aria-selected={type === ''}
                className={`blog-cat${type === '' ? ' is-active' : ''}`} onClick={() => { setType(''); setPage(1) }}>
                All <em>{total}</em>
              </button>
              {types.map((t) => (
                <button key={t.employment_type} type="button" role="tab" aria-selected={type === t.employment_type}
                  className={`blog-cat${type === t.employment_type ? ' is-active' : ''}`}
                  onClick={() => { setType(t.employment_type); setPage(1) }}>
                  {TYPE_LABEL[t.employment_type] || t.employment_type} <em>{t.n}</em>
                </button>
              ))}
            </div>
          </div>

          {loading && <div className="careers-grid">{[0, 1, 2].map((i) => <div key={i} className="glass career-card is-skeleton" />)}</div>}

          {!loading && jobs.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px 0' }}>
              {q.trim() || type
                ? 'No role matches that. Try another word, or clear the filter.'
                : 'No roles are open right now — check back soon, or write to us through the contact page.'}
            </p>
          )}

          {!loading && jobs.length > 0 && (
            <div className="careers-grid">
              {jobs.map((j) => (
                <article className="glass career-card reveal in" key={j.id}>
                  <div className="career-card__top">
                    <span className="career-tag">{TYPE_LABEL[j.employment_type] || j.employment_type}</span>
                    <span className="career-tag career-tag--soft">{MODE_LABEL[j.work_mode] || j.work_mode}</span>
                  </div>
                  <h3>{j.title}</h3>
                  <p className="career-card__org">{j.org_name}</p>
                  {j.summary && <p className="career-card__sum">{j.summary}</p>}
                  <ul className="career-facts">
                    {j.location && <li>{j.location}</li>}
                    {j.compensation && <li>{j.compensation}</li>}
                    <li>{j.min_age}+</li>
                    {j.apply_deadline && <li>Closes {fmtDate(j.apply_deadline)}</li>}
                  </ul>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => open(j.id)}>View &amp; Apply</button>
                </article>
              ))}
            </div>
          )}

          <Pager page={page} pages={pages} total={total} unit="roles"
            onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        </div>
      </section>

      {openJob && (
        <JobModal job={openJob} me={me} onClose={close}
          onApplied={() => { close(); load() }} />
      )}
    </main>
  )
}

/* ---------------- The role, and the form ---------------- */

function JobModal({ job, me, onClose, onApplied }: {
  job: CareerJobDetail
  me: CareerApplicantState | null
  onClose: () => void

  onApplied: () => void
}) {
  const { user } = useAuth()
  const [applying, setApplying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    full_name: user?.full_name || '', email: user?.email || '', phone: '', location: '',
    date_of_birth: '', cover_note: '', resume_url: '', portfolio_url: '',
  })
  const [answers, setAnswers] = useState<string[]>(job.questions.map(() => ''))
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const upload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const d = await api.upload<{ url: string }>('careers/resume', file)
      set({ resume_url: d.url })
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.') } finally { setUploading(false) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await api.post<{ message: string }>(`careers/${job.id}/apply`, { ...form, answers })
      window.fcToast?.(r.message || 'Application sent.')
      onApplied()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send the application.') } finally { setBusy(false) }
  }

  const closed = job.closed
  const blocked = !me?.logged_in || !me.can_apply || closed

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal career-modal" style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <div className="career-card__top">
          <span className="career-tag">{TYPE_LABEL[job.employment_type] || job.employment_type}</span>
          <span className="career-tag career-tag--soft">{MODE_LABEL[job.work_mode] || job.work_mode}</span>
          {closed && <span className="career-tag career-tag--closed">Closed</span>}
        </div>
        <h3 className="gold-text" style={{ marginBottom: 4 }}>{job.title}</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
          {job.org_name}{job.location ? ` · ${job.location}` : ''}{job.compensation ? ` · ${job.compensation}` : ''}
        </p>

        {!applying && (
          <>
            {job.description && <Prose text={job.description} />}
            {job.responsibilities && <><h4 className="career-h4">What you would do</h4><Prose text={job.responsibilities} /></>}
            {job.requirements && <><h4 className="career-h4">What we are looking for</h4><Prose text={job.requirements} /></>}
            {job.skills && <p className="career-skills">{job.skills.split(',').map((s) => <span key={s}>{s.trim()}</span>)}</p>}
            {job.apply_deadline && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Applications close {fmtDate(job.apply_deadline)}.</p>}

            <div className="career-gate">
              {closed ? (
                <p>This role is closed for applications.</p>
              ) : !me?.logged_in ? (
                <>
                  <p>You need an account to apply — it keeps applications tied to a real person.</p>
                  <button className="btn btn--solid" type="button" data-auth="login" onClick={onClose}>Sign in to apply</button>
                </>
              ) : !me.can_apply ? (
                <p>{me.reason}</p>
              ) : (
                <>
                  <p>Open to applicants {Math.max(18, job.min_age)} and over.</p>
                  <button className="btn btn--solid" type="button" onClick={() => setApplying(true)}>Apply for this role</button>
                </>
              )}
            </div>
          </>
        )}

        {applying && !blocked && (
          <form onSubmit={submit}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 220px' }}><label>Full name</label>
                <input type="text" required value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} /></div>
              <div className="field" style={{ flex: '1 1 220px' }}><label>Email</label>
                <input type="email" required value={form.email} onChange={(e) => set({ email: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 220px' }}><label>Phone (optional)</label>
                <input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
              <div className="field" style={{ flex: '1 1 220px' }}><label>Where you are based (optional)</label>
                <input type="text" value={form.location} onChange={(e) => set({ location: e.target.value })} /></div>
            </div>

            {/* Asked once, then kept on the account — never asked again. */}
            {me?.needs_dob && (
              <div className="field"><label>Date of birth</label>
                <input type="date" required value={form.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
                <span className="field-hint">We ask because this board is open to applicants 18 and over.</span>
              </div>
            )}

            <div className="field"><label>Why you (a short note)</label>
              <textarea className="fld-area" style={{ minHeight: 120 }} value={form.cover_note}
                onChange={(e) => set({ cover_note: e.target.value })} placeholder="A few lines about why this role suits you." /></div>

            {job.questions.map((qq, i) => (
              <div className="field" key={i}>
                <label>{qq.question}{qq.required ? '' : ' (optional)'}</label>
                <textarea className="fld-area" required={qq.required} value={answers[i] || ''}
                  onChange={(e) => setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))} />
              </div>
            ))}

            <div className="field"><label>Résumé / CV (PDF, optional)</label>
              <input type="file" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              {uploading && <span className="field-hint">Uploading…</span>}
              {form.resume_url && <span className="field-hint">Attached — <a href={form.resume_url} target="_blank" rel="noreferrer">view file</a></span>}
            </div>
            <div className="field"><label>Portfolio or LinkedIn (optional)</label>
              <input type="url" value={form.portfolio_url} onChange={(e) => set({ portfolio_url: e.target.value })} placeholder="https://" /></div>

            {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn--solid" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send application'}</button>
              <button className="btn" type="button" onClick={() => setApplying(false)}>Back to the role</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Prose({ text }: { text: string }) {
  return <>{text.split('\n').filter(Boolean).map((p, i) => <p key={i} className="career-prose">{p}</p>)}</>
}
