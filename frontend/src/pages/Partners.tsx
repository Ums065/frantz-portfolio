import { useEffect, useMemo, useState } from 'react'
import { api, type PartnersPayload, type PartnerRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'

/* Scoped design matching the "Our Partners" reference: forest green + cream + gold. */
const CSS = `
.opartners{background:#efe9dc;color:#20302a;font-family:var(--f-body,Inter,system-ui,sans-serif);}
.opartners .owrap{max-width:1200px;margin:0 auto;padding:0 24px;}
.opartners .oeyebrow{font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#c9a24c;}
.opartners h1,.opartners h2,.opartners h3{font-family:var(--f-serif,"Playfair Display",Georgia,serif);}
.opartners .obtn{display:inline-flex;align-items:center;gap:8px;border-radius:8px;padding:11px 20px;font-weight:700;font-size:13px;letter-spacing:.04em;text-decoration:none;cursor:pointer;border:0;}
.opartners .obtn--gold{background:#c9a24c;color:#1c2b22;}
.opartners .obtn--dark{background:#183324;color:#fff;}
.opartners .obtn--ghost{background:transparent;color:#1c2b22;border:1px solid #cbb98f;}
/* hero */
.opartners .ohero{position:relative;background:#173123;overflow:hidden;}
.opartners .ohero__grid{display:grid;grid-template-columns:1.05fr .95fr;min-height:440px;}
.opartners .ohero__copy{padding:70px 0 90px;}
.opartners .ohero__copy .owrapinner{max-width:600px;margin-left:max(24px,calc((100vw - 1200px)/2 + 24px));padding-right:24px;}
.opartners .ohero h1{color:#fff;font-size:clamp(34px,4.4vw,58px);line-height:1.08;margin:14px 0 0;font-weight:700;}
.opartners .ohero__rule{width:64px;height:3px;background:#c9a24c;margin:22px 0;}
.opartners .ohero p{color:#cfe0d4;font-size:15px;line-height:1.7;max-width:440px;}
.opartners .ohero__photo{background:linear-gradient(135deg,#1f4130,#2c5a41 55%,#3c7256);position:relative;}
.opartners .ohero__photo::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#173123,transparent 40%);}
/* stats band */
.opartners .ostats{background:#1c3a29;border:1px solid #2c5540;border-radius:14px;margin:-56px auto 0;position:relative;padding:26px 20px;box-shadow:0 24px 60px rgba(0,0,0,.25);}
.opartners .ostats__title{text-align:center;color:#c9a24c;font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;margin-bottom:18px;}
.opartners .ostats__row{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;}
.opartners .ostat{text-align:center;}
.opartners .ostat__icon{font-size:20px;color:#c9a24c;}
.opartners .ostat__val{font-family:var(--f-serif,serif);color:#fff;font-size:30px;line-height:1.1;margin-top:6px;}
.opartners .ostat__lbl{color:#a9c3b3;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;margin-top:6px;}
/* section */
.opartners .osection{padding:56px 0;}
.opartners .ocolhead{text-align:center;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#20302a;margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:7px;}
/* three columns */
.opartners .ocols{display:grid;grid-template-columns:1fr 1.15fr 1.15fr;gap:26px;align-items:start;}
.opartners .ofounding{background:#fff;border:2px solid #c9a24c;border-radius:14px;padding:22px;text-align:center;}
.opartners .opill{display:inline-block;background:#efe3c6;color:#8a6d24;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:5px 12px;}
.opartners .ofounding h3{font-size:22px;margin:14px 0 6px;color:#1c2b22;}
.opartners .ofounding p{color:#5c6b62;font-size:13px;margin:0 0 16px;}
.opartners .ologogrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.opartners .ologocard{background:#fff;border:1px solid #e6dfce;border-radius:12px;min-height:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:14px;text-align:center;text-decoration:none;transition:box-shadow .15s,transform .15s;}
.opartners .ologocard:hover{box-shadow:0 10px 24px rgba(0,0,0,.1);transform:translateY(-2px);}
.opartners .ologomark{width:46px;height:46px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--f-serif,serif);font-weight:800;font-size:17px;color:#fff;background:linear-gradient(135deg,#c9a24c,#a5812f);}
.opartners .ologoname{color:#1c2b22;font-weight:700;font-size:13.5px;line-height:1.2;}
.opartners .oviewall{display:block;text-align:center;margin-top:16px;color:#20302a;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;}
/* spotlight */
.opartners .ospot{background:#173123;border-radius:16px;color:#fff;padding:34px;display:grid;grid-template-columns:1fr 1.3fr;gap:30px;align-items:center;}
.opartners .ospot h2{color:#fff;font-size:30px;margin:8px 0 12px;}
.opartners .ospot p{color:#cfe0d4;font-size:14px;line-height:1.6;}
.opartners .ospot__feat{display:grid;grid-template-columns:150px 1fr;gap:20px;align-items:center;}
.opartners .ospot__logo{background:#fff;border-radius:14px;min-height:150px;display:flex;align-items:center;justify-content:center;}
/* browse */
.opartners .obrowsehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px;}
.opartners .obrowsehead h2{font-size:34px;color:#1c2b22;margin:4px 0 0;}
.opartners .ofilters{display:flex;flex-wrap:wrap;gap:10px;background:#fff;border:1px solid #e6dfce;border-radius:12px;padding:12px;margin-bottom:14px;}
.opartners .ofld{padding:9px 12px;border:1px solid #e0d8c4;border-radius:8px;background:#faf7ef;color:#20302a;font-size:13px;}
.opartners .otabs{display:flex;flex-wrap:wrap;gap:4px;background:#fff;border:1px solid #e6dfce;border-radius:12px;padding:8px;margin-bottom:20px;}
.opartners .otab{border:0;background:transparent;color:#5c6b62;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:9px 12px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}
.opartners .otab.is-active{background:#173123;color:#fff;}
.opartners .ogrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px;}
.opartners .ocard{background:#fff;border:1px solid #e6dfce;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;transition:box-shadow .15s,transform .15s;}
.opartners .ocard:hover{box-shadow:0 14px 30px rgba(0,0,0,.12);transform:translateY(-3px);}
.opartners .ocard__bar{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#fff;padding:7px 14px;}
.opartners .ocard__body{padding:18px;display:flex;flex-direction:column;gap:5px;flex:1;}
.opartners .ocard__logo{width:52px;height:52px;border-radius:10px;background:#f4efe3;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:8px;}
.opartners .ocard__logo span{font-family:var(--f-serif,serif);font-weight:800;font-size:18px;color:#173123;}
.opartners .ocard__logo img{max-width:88%;max-height:88%;object-fit:contain;}
.opartners .ocard__name{color:#1c2b22;font-weight:800;font-size:16.5px;line-height:1.2;}
.opartners .ocard__meta{color:#6b7a70;font-size:12.5px;}
.opartners .ocard__foot{margin-top:auto;padding-top:12px;border-top:1px solid #eee4d2;display:flex;flex-direction:column;gap:7px;}
.opartners .ocard__since{color:#8a6d24;font-weight:700;font-size:11.5px;}
.opartners .ocard__view{color:#173123;font-weight:800;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;}
/* cta */
.opartners .octa{background:#173123;}
.opartners .octa__in{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:34px 0;}
.opartners .octa h2{color:#fff;font-size:26px;margin:0 0 6px;}
.opartners .octa p{color:#bcd0c2;font-size:14px;max-width:520px;margin:0;}
@media(max-width:900px){
  .opartners .ohero__grid{grid-template-columns:1fr;}
  .opartners .ohero__photo{min-height:180px;}
  .opartners .ohero__copy .owrapinner{margin:0 auto;padding:0 24px;}
  .opartners .ostats__row{grid-template-columns:repeat(3,1fr);row-gap:20px;}
  .opartners .ocols{grid-template-columns:1fr;}
  .opartners .ospot{grid-template-columns:1fr;}
  .opartners .ospot__feat{grid-template-columns:1fr;}
}
`

const TYPE_BAR: Record<string, string> = {
  school: '#2f7d62', business: '#c9a24c', government: '#173123', media: '#3c7256', venue: '#20302a',
  founding: '#a5812f', presenting: '#8a6d24', corporate: '#4a6b3f', nonprofit: '#5c6b62', technology: '#2f6d7d', financial: '#7d5a2f', civic: '#173123', community: '#2f7d62',
}
const barColor = (t?: string | null): string => {
  const k = (t || '').toLowerCase()
  for (const key of Object.keys(TYPE_BAR)) if (k.includes(key)) return TYPE_BAR[key]
  return '#c9a24c'
}
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '★'

function LogoCard({ p }: { p: PartnerRow }) {
  const inner = (
    <>
      {p.logo_url
        ? <img src={p.logo_url} alt={p.name} loading="lazy" style={{ maxWidth: '90%', maxHeight: 46, objectFit: 'contain' }} />
        : <span className="ologomark">{initials(p.name)}</span>}
      <span className="ologoname">{p.name}</span>
    </>
  )
  return p.website
    ? <a className="ologocard" href={p.website} target="_blank" rel="noreferrer">{inner}</a>
    : <div className="ologocard">{inner}</div>
}

function BrowseCard({ p }: { p: PartnerRow }) {
  const body = (
    <>
      <div className="ocard__bar" style={{ background: barColor(p.partner_type) }}>{p.partner_type || 'Partner'}</div>
      <div className="ocard__body">
        <div className="ocard__logo">
          {p.logo_url ? <img src={p.logo_url} alt={p.name} loading="lazy" /> : <span>{initials(p.name)}</span>}
        </div>
        <span className="ocard__name">{p.name}</span>
        {p.industry && <span className="ocard__meta">{p.industry}</span>}
        {p.location && <span className="ocard__meta">{p.location}</span>}
        <div className="ocard__foot">
          {p.partner_since && <span className="ocard__since">Partner Since {p.partner_since}</span>}
          <span className="ocard__view">View Profile →</span>
        </div>
      </div>
    </>
  )
  return p.website
    ? <a className="ocard" href={p.website} target="_blank" rel="noreferrer">{body}</a>
    : <div className="ocard">{body}</div>
}

export default function Partners() {
  useSeo({ title: 'Our Partners', description: 'The organizations, schools, businesses, media, and government partners powering New York’s largest student problem-solving movement.' })
  const [data, setData] = useState<PartnersPayload | null>(null)
  const [q, setQ] = useState(''); const [type, setType] = useState('all')
  const [industry, setIndustry] = useState('all'); const [borough, setBorough] = useState('all'); const [county, setCounty] = useState('all')
  const [sort, setSort] = useState<'name' | 'newest' | 'oldest'>('name')

  useEffect(() => { window.scrollTo(0, 0); api.get<PartnersPayload>('partners').then(setData).catch(() => setData(null)) }, [])

  const partners = data?.partners || []
  const page = data?.page
  const founding = partners.filter((p) => /founding/i.test(p.partner_type || ''))
  const media = partners.filter((p) => p.is_media_partner)
  const presenting = partners.filter((p) => !p.is_media_partner && /presenting|sponsor/i.test(p.partner_type || '')).slice(0, 6)
  const spotlight = partners.find((p) => p.is_featured) || null

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    const out = partners.filter((p) => {
      if (type !== 'all' && p.partner_type !== type) return false
      if (industry !== 'all' && p.industry !== industry) return false
      if (borough !== 'all' && p.borough !== borough) return false
      if (county !== 'all' && p.county !== county) return false
      if (n && !(`${p.name} ${p.partner_type || ''} ${p.industry || ''} ${p.location || ''}`.toLowerCase().includes(n))) return false
      return true
    })
    const yr = (p: PartnerRow) => Number(p.partner_since) || 0
    out.sort((a, b) => sort === 'newest' ? yr(b) - yr(a) : sort === 'oldest' ? yr(a) - yr(b) : a.name.localeCompare(b.name))
    return out
  }, [partners, q, type, industry, borough, county, sort])

  const scrollBrowse = () => document.getElementById('opt-browse')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="opartners">
      <style>{CSS}</style>

      {/* Hero */}
      <section className="ohero">
        <div className="ohero__grid">
          <div className="ohero__copy">
            <div className="owrapinner">
              <span className="oeyebrow">Our Partners</span>
              <h1>{page?.hero.subtitle || 'Building Stronger Communities Together'}</h1>
              <div className="ohero__rule" />
              <p>{page?.hero.tagline || 'Every organization here has chosen to invest in innovation, education, entrepreneurship, and stronger local communities.'}</p>
            </div>
          </div>
          <div className="ohero__photo" aria-hidden="true" style={page?.hero.image ? { backgroundImage: `url("${page.hero.image}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
        </div>
        <div className="owrap">
          {!!page?.stats?.length && (
            <div className="ostats">
              <div className="ostats__title">Our Growing Partnership Network</div>
              <div className="ostats__row">
                {page.stats.slice(0, 6).map((s, i) => (
                  <div className="ostat" key={i}>
                    <div className="ostat__icon">{['🏅', '🎓', '💼', '📡', '🏛️', '🤝'][i % 6]}</div>
                    <div className="ostat__val">{s.value}</div>
                    <div className="ostat__lbl">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Founding / Presenting / Media columns */}
      <section className="osection">
        <div className="owrap">
          <div className="ocols">
            <div>
              <div className="ocolhead">★ Founding Partners</div>
              {founding[0] ? (
                <div className="ofounding">
                  <span className="opill">Founding Partner</span>
                  <div style={{ margin: '14px 0' }}>{founding[0].logo_url ? <img src={founding[0].logo_url} alt="" style={{ maxHeight: 54 }} /> : <span className="ologomark" style={{ width: 54, height: 54, fontSize: 20 }}>{initials(founding[0].name)}</span>}</div>
                  <h3>{founding[0].name}</h3>
                  <p>{founding[0].blurb || 'Building stronger futures and creating opportunity for all.'}</p>
                  {founding[0].website && <a className="obtn obtn--dark" href={founding[0].website} target="_blank" rel="noreferrer">View Profile</a>}
                </div>
              ) : <p className="ocard__meta" style={{ textAlign: 'center' }}>Coming soon.</p>}
            </div>
            <div>
              <div className="ocolhead">🏆 Presenting Sponsors</div>
              <div className="ologogrid">{presenting.map((p) => <LogoCard key={p.id} p={p} />)}</div>
              <a className="oviewall" href="#opt-browse" onClick={(e) => { e.preventDefault(); setType('all'); scrollBrowse() }}>View All Sponsors →</a>
            </div>
            <div>
              <div className="ocolhead">📡 Media Partners</div>
              <div className="ologogrid">{media.slice(0, 6).map((p) => <LogoCard key={p.id} p={p} />)}</div>
              <a className="oviewall" href="#opt-browse" onClick={(e) => { e.preventDefault(); const t = (data?.types || []).find((x) => /media/i.test(x)); if (t) setType(t); scrollBrowse() }}>View All Media Partners →</a>
            </div>
          </div>
        </div>
      </section>

      {/* Spotlight */}
      {spotlight && (
        <section className="osection" style={{ paddingTop: 0 }}>
          <div className="owrap">
            <div className="ospot">
              <div>
                <span className="oeyebrow">Partner Spotlight</span>
                <h2>This Month&apos;s Featured Partner</h2>
                <p>We are proud to recognize organizations that go above and beyond to support our mission and make a lasting impact in our communities.</p>
              </div>
              <div className="ospot__feat">
                <div className="ospot__logo">{spotlight.logo_url ? <img src={spotlight.logo_url} alt="" style={{ maxWidth: '80%', maxHeight: 90 }} /> : <span className="ologomark" style={{ width: 70, height: 70, fontSize: 26 }}>{initials(spotlight.name)}</span>}</div>
                <div>
                  {spotlight.partner_type && <span className="opill" style={{ background: '#2c5540', color: '#cfe0d4' }}>{spotlight.partner_type}</span>}
                  <h3 style={{ color: '#fff', fontSize: 22, margin: '10px 0 8px' }}>{spotlight.name}</h3>
                  <p>{spotlight.blurb || `${spotlight.name} is committed to strengthening our communities through innovative programs and strong partnerships.`}</p>
                  {spotlight.partner_since && <p style={{ marginTop: 10 }}><span className="oeyebrow">Partner Since</span><br />{spotlight.partner_since}</p>}
                  {spotlight.website && <a className="oviewall" style={{ textAlign: 'left', color: '#c9a24c', marginTop: 10 }} href={spotlight.website} target="_blank" rel="noreferrer">View Profile →</a>}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Browse */}
      <section className="osection" id="opt-browse" style={{ paddingTop: 0 }}>
        <div className="owrap">
          <div className="obrowsehead">
            <div>
              <span className="oeyebrow">Browse Our Partners</span>
              <h2>A Network of Commitment &amp; Impact</h2>
            </div>
            {page?.cta?.button_link && <a className="obtn obtn--ghost" href={page.cta.button_link}>➕ Become a Partner</a>}
          </div>

          <div className="ofilters">
            <input className="ofld" style={{ flex: '2 1 200px' }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search partners…" />
            <select className="ofld" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All Partner Types</option>{(data?.types || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="all">All Industries</option>{(data?.industries || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={borough} onChange={(e) => setBorough(e.target.value)}><option value="all">All Boroughs</option>{(data?.boroughs || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={county} onChange={(e) => setCounty(e.target.value)}><option value="all">All Counties</option>{(data?.counties || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="name">A – Z</option><option value="newest">Newest</option><option value="oldest">Longest-standing</option></select>
          </div>

          <div className="otabs">
            <button className={`otab ${type === 'all' ? 'is-active' : ''}`} onClick={() => setType('all')}>All Partners</button>
            {(data?.types || []).map((t) => <button key={t} className={`otab ${type === t ? 'is-active' : ''}`} onClick={() => setType(t)}>{t}</button>)}
          </div>

          {!data ? <p className="ocard__meta">Loading partners…</p>
            : filtered.length === 0 ? <p className="ocard__meta">No partners match your filters.</p>
            : <div className="ogrid">{filtered.map((p) => <BrowseCard key={p.id} p={p} />)}</div>}
        </div>
      </section>

      {/* CTA */}
      {page?.cta && (
        <section className="octa">
          <div className="owrap octa__in">
            <div>
              <h2>🤝 {page.cta.title || 'Stronger Together'}</h2>
              <p>{page.cta.text}</p>
            </div>
            {page.cta.button_link && <a className="obtn obtn--gold" href={page.cta.button_link}>{page.cta.button_label || 'Partner With Us'} →</a>}
          </div>
        </section>
      )}
    </div>
  )
}
