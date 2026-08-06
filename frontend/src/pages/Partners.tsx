import { useEffect, useMemo, useState } from 'react'
import { api, type PartnersPayload, type PartnerRow } from '../lib/api'
import { useSeo } from '../hooks/useSeo'

/* Scoped design — dark + gold, matching the rest of the site (black glass, golden accents). */
const CSS = `
.opartners{background:radial-gradient(1200px 600px at 50% -80px,rgba(212,175,55,.08),transparent 70%),#0b0a08;color:#e8e2d2;font-family:var(--f-body,Inter,system-ui,sans-serif);}
.opartners .owrap{max-width:1200px;margin:0 auto;padding:0 24px;}
.opartners .oeyebrow{font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#d4af37;}
.opartners h1,.opartners h2,.opartners h3{font-family:var(--f-serif,"Playfair Display",Georgia,serif);}
.opartners .obtn{display:inline-flex;align-items:center;gap:8px;border-radius:10px;padding:12px 22px;font-weight:700;font-size:13px;letter-spacing:.04em;text-decoration:none;cursor:pointer;border:0;transition:transform .2s ease,box-shadow .2s ease,background .2s ease;}
.opartners .obtn--gold{background:linear-gradient(135deg,#f4d774,#d4af37);color:#1a1206;box-shadow:0 8px 22px rgba(212,175,55,.28);}
.opartners .obtn--gold:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(212,175,55,.4);}
.opartners .obtn--dark{background:rgba(212,175,55,.14);color:#f4e6b8;border:1px solid rgba(212,175,55,.5);}
.opartners .obtn--dark:hover{background:rgba(212,175,55,.24);}
.opartners .obtn--ghost{background:transparent;color:#f4e6b8;border:1px solid rgba(212,175,55,.45);}
.opartners .obtn--ghost:hover{background:rgba(212,175,55,.1);}
.opartners svg{flex:none;}
/* hero */
.opartners .ohero{position:relative;background:linear-gradient(135deg,#14120b,#0b0a08);overflow:hidden;border-bottom:1px solid rgba(212,175,55,.2);}
.opartners .ohero__grid{display:grid;grid-template-columns:1.05fr .95fr;min-height:420px;}
.opartners .ohero__copy{padding:74px 0 96px;}
.opartners .ohero__copy .owrapinner{max-width:600px;margin-left:max(24px,calc((100vw - 1200px)/2 + 24px));padding-right:24px;}
.opartners .ohero h1{color:#fff;font-size:clamp(34px,4.4vw,58px);line-height:1.08;margin:14px 0 0;font-weight:700;}
.opartners .ohero__rule{width:64px;height:3px;background:linear-gradient(90deg,#d4af37,#f4d774);margin:22px 0;border-radius:2px;}
.opartners .ohero p{color:#c8c1b0;font-size:15px;line-height:1.7;max-width:440px;}
.opartners .ohero__photo{background:linear-gradient(135deg,#241d0f,#0b0a08);position:relative;}
.opartners .ohero__photo::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#0b0a08,transparent 55%);}
/* stats band */
.opartners .ostats{background:linear-gradient(135deg,rgba(30,25,13,.96),rgba(13,12,9,.98));border:1px solid rgba(212,175,55,.35);border-radius:16px;margin:-56px auto 0;position:relative;padding:28px 20px;box-shadow:0 24px 60px rgba(0,0,0,.5),0 0 40px rgba(212,175,55,.1);}
.opartners .ostats__title{text-align:center;color:#d4af37;font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;margin-bottom:20px;}
.opartners .ostats__row{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;}
.opartners .ostat{text-align:center;}
.opartners .ostat__icon{color:#d4af37;display:flex;justify-content:center;}
.opartners .ostat__val{font-family:var(--f-serif,serif);color:#fff;font-size:clamp(22px,5vw,30px);line-height:1.1;margin-top:8px;}
.opartners .ostat__lbl{color:#9a9484;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;margin-top:6px;}
/* section */
.opartners .osection{padding:58px 0;}
.opartners .ocolhead{text-align:center;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#f0ead6;margin-bottom:18px;display:flex;align-items:center;justify-content:center;gap:8px;}
.opartners .ocolhead svg{color:#d4af37;}
/* three columns */
.opartners .ocols{display:grid;grid-template-columns:1fr 1.15fr 1.15fr;gap:26px;align-items:start;}
.opartners .ofounding{background:linear-gradient(135deg,rgba(30,25,13,.9),rgba(13,12,9,.95));border:2px solid rgba(212,175,55,.55);border-radius:16px;padding:24px;text-align:center;box-shadow:0 0 34px rgba(212,175,55,.12);}
.opartners .opill{display:inline-block;background:rgba(212,175,55,.16);color:#f4d774;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:5px 12px;border:1px solid rgba(212,175,55,.35);}
.opartners .ofounding h3{font-size:22px;margin:14px 0 6px;color:#fff;}
.opartners .ofounding p{color:#a9a396;font-size:13px;margin:0 0 16px;line-height:1.6;}
.opartners .ologogrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.opartners .ologocard{background:rgba(255,255,255,.03);border:1px solid rgba(212,175,55,.22);border-radius:12px;min-height:92px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px;text-align:center;text-decoration:none;transition:box-shadow .2s,transform .2s,border-color .2s;}
.opartners .ologocard:hover{box-shadow:0 12px 28px rgba(0,0,0,.4),0 0 24px rgba(212,175,55,.16);transform:translateY(-2px);border-color:rgba(212,175,55,.5);}
.opartners .ologomark{width:46px;height:46px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--f-serif,serif);font-weight:800;font-size:17px;color:#1a1206;background:linear-gradient(135deg,#f4d774,#d4af37);}
.opartners .ologoname{color:#e8e2d2;font-weight:700;font-size:13.5px;line-height:1.2;}
.opartners .oviewall{display:block;text-align:center;margin-top:16px;color:#d4af37;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;}
.opartners .oviewall:hover{color:#f4d774;}
/* spotlight */
.opartners .ospot{background:linear-gradient(135deg,rgba(34,28,15,.96),rgba(11,10,8,.98));border:1px solid rgba(212,175,55,.35);border-radius:18px;color:#fff;padding:36px;display:grid;grid-template-columns:1fr 1.3fr;gap:30px;align-items:center;box-shadow:0 22px 60px rgba(0,0,0,.5);}
.opartners .ospot h2{color:#fff;font-size:clamp(24px,4vw,30px);margin:8px 0 12px;}
.opartners .ospot p{color:#c8c1b0;font-size:14px;line-height:1.6;}
.opartners .ospot__feat{display:grid;grid-template-columns:150px 1fr;gap:22px;align-items:center;}
.opartners .ospot__logo{background:#f6f1e6;border-radius:14px;min-height:150px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(212,175,55,.3);}
/* browse */
.opartners .obrowsehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px;}
.opartners .obrowsehead h2{font-size:clamp(24px,4.4vw,34px);color:#fff;margin:4px 0 0;}
.opartners .oresultcount{color:#9a9484;font-size:12.5px;margin:6px 0 0;}
.opartners .ofilters{display:flex;flex-wrap:wrap;gap:10px;background:rgba(255,255,255,.03);border:1px solid rgba(212,175,55,.22);border-radius:12px;padding:12px;margin-bottom:14px;align-items:center;}
.opartners .ofld{padding:10px 12px;border:1px solid rgba(212,175,55,.25);border-radius:8px;background:rgba(10,9,6,.6);color:#e8e2d2;font-size:13px;}
.opartners .ofld:focus{outline:none;border-color:rgba(212,175,55,.6);}
.opartners .ofld option{background:#14120b;color:#e8e2d2;}
.opartners .oclear{margin-left:auto;background:none;border:0;color:#d4af37;font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;padding:8px 4px;}
.opartners .oclear:hover{color:#f4d774;}
.opartners .otabs{display:flex;flex-wrap:wrap;gap:4px;background:rgba(255,255,255,.03);border:1px solid rgba(212,175,55,.22);border-radius:12px;padding:8px;margin-bottom:22px;}
.opartners .otab{border:0;background:transparent;color:#a9a396;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:9px 13px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .2s,color .2s;}
.opartners .otab:hover{color:#f0ead6;}
.opartners .otab.is-active{background:linear-gradient(135deg,#f4d774,#d4af37);color:#1a1206;}
.opartners .ogrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:18px;}
.opartners .ocard{background:linear-gradient(135deg,rgba(30,25,13,.85),rgba(13,12,9,.92));border:1px solid rgba(212,175,55,.22);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;transition:box-shadow .2s,transform .2s,border-color .2s;}
.opartners .ocard:hover{box-shadow:0 16px 34px rgba(0,0,0,.45),0 0 28px rgba(212,175,55,.16);transform:translateY(-3px);border-color:rgba(212,175,55,.5);}
.opartners .ocard__bar{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#fff;padding:7px 14px;}
.opartners .ocard__body{padding:18px;display:flex;flex-direction:column;gap:5px;flex:1;}
.opartners .ocard__logo{width:54px;height:54px;border-radius:10px;background:#f6f1e6;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:8px;border:1px solid rgba(212,175,55,.25);}
.opartners .ocard__logo span{font-family:var(--f-serif,serif);font-weight:800;font-size:18px;color:#173123;}
.opartners .ocard__logo img{max-width:88%;max-height:88%;object-fit:contain;}
.opartners .ocard__name{color:#fff;font-weight:800;font-size:16.5px;line-height:1.2;}
.opartners .ocard__meta{color:#9a9484;font-size:12.5px;}
.opartners .ocard__foot{margin-top:auto;padding-top:12px;border-top:1px solid rgba(212,175,55,.15);display:flex;flex-direction:column;gap:7px;}
.opartners .ocard__since{color:#d4af37;font-weight:700;font-size:11.5px;}
.opartners .ocard__view{color:#f4d774;font-weight:800;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;}
.opartners .oempty{color:#9a9484;text-align:center;padding:40px 0;font-size:14px;}
/* cta */
.opartners .octa{background:linear-gradient(135deg,#14120b,#0b0a08);border-top:1px solid rgba(212,175,55,.2);}
.opartners .octa__in{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:40px 0;}
.opartners .octa h2{color:#fff;font-size:clamp(22px,3.5vw,26px);margin:0 0 6px;display:flex;align-items:center;gap:10px;}
.opartners .octa p{color:#bdb6a5;font-size:14px;max-width:520px;margin:0;}
@media(max-width:900px){
  .opartners .ohero__grid{grid-template-columns:1fr;}
  .opartners .ohero__photo{min-height:180px;}
  .opartners .ohero__copy{padding:54px 0 76px;}
  .opartners .ohero__copy .owrapinner{margin:0 auto;padding:0 24px;}
  .opartners .ostats__row{grid-template-columns:repeat(3,1fr);row-gap:20px;}
  .opartners .ocols{grid-template-columns:1fr;}
  .opartners .ospot{grid-template-columns:1fr;}
  .opartners .ospot__feat{grid-template-columns:1fr;}
}
@media(max-width:560px){
  .opartners .owrap{padding:0 16px;}
  .opartners .ostats{margin-top:-32px;padding:22px 14px;}
  .opartners .ostats__row{grid-template-columns:repeat(2,1fr);gap:18px 12px;}
  .opartners .ostat__lbl{font-size:10px;}
  .opartners .ospot{padding:24px;}
  .opartners .ospot__logo{min-height:120px;}
  .opartners .ofld{flex:1 1 100%;}
  .opartners .obrowsehead{align-items:flex-start;}
}
@media(max-width:380px){
  .opartners .ostats__row{grid-template-columns:1fr 1fr;}
  .opartners .ogrid{grid-template-columns:1fr;}
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

/* Small inline gold icons (premium replacement for the old emoji). */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IconStar = ({ s = 18 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" /></svg>
const IconTrophy = ({ s = 18 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><path d="M6 4h12v3a6 6 0 0 1-12 0zM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M9 20h6M12 13v7" /></svg>
const IconBroadcast = ({ s = 18 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><circle cx="12" cy="12" r="2" /><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M9.2 9.2a4 4 0 0 0 0 5.6M14.8 9.2a4 4 0 0 1 0 5.6" /></svg>
const IconCap = ({ s = 20 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><path d="M22 9L12 5 2 9l10 4 10-4zM6 11v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" /></svg>
const IconBriefcase = ({ s = 20 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>
const IconGov = ({ s = 20 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3l8 5H4z" /></svg>
const IconHandshake = ({ s = 20 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><path d="M8 12l2.5 2.5a1.5 1.5 0 0 0 2.1 0M3 8l4-2 5 3 3-1 6 3M3 8v7l3 2M21 11v6l-3 2M12 11l2-1" /></svg>
const IconMedal = ({ s = 20 }: { s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} {...S}><circle cx="12" cy="14" r="6" /><path d="M12 11.5l1.2 2.4 2.4.3-1.8 1.7.5 2.4L12 17l-2.3 1.3.5-2.4-1.8-1.7 2.4-.3zM8 2l2 6M16 2l-2 6" /></svg>
const STAT_ICONS = [IconMedal, IconCap, IconBriefcase, IconBroadcast, IconGov, IconHandshake]

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
  const filtersActive = q.trim() !== '' || type !== 'all' || industry !== 'all' || borough !== 'all' || county !== 'all' || sort !== 'name'
  const clearFilters = () => { setQ(''); setType('all'); setIndustry('all'); setBorough('all'); setCounty('all'); setSort('name') }

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
                {page.stats.slice(0, 6).map((s, i) => {
                  const Icon = STAT_ICONS[i % STAT_ICONS.length]
                  return (
                    <div className="ostat" key={i}>
                      <div className="ostat__icon"><Icon /></div>
                      <div className="ostat__val">{s.value}</div>
                      <div className="ostat__lbl">{s.label}</div>
                    </div>
                  )
                })}
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
              <div className="ocolhead"><IconStar s={15} /> Founding Partners</div>
              {founding[0] ? (
                <div className="ofounding">
                  <span className="opill">Founding Partner</span>
                  <div style={{ margin: '14px 0' }}>{founding[0].logo_url ? <img src={founding[0].logo_url} alt={`${founding[0].name} logo`} style={{ maxHeight: 54 }} /> : <span className="ologomark" style={{ width: 54, height: 54, fontSize: 20 }}>{initials(founding[0].name)}</span>}</div>
                  <h3>{founding[0].name}</h3>
                  <p>{founding[0].blurb || 'Building stronger futures and creating opportunity for all.'}</p>
                  {founding[0].website && <a className="obtn obtn--dark" href={founding[0].website} target="_blank" rel="noreferrer">View Profile</a>}
                </div>
              ) : <p className="ocard__meta" style={{ textAlign: 'center' }}>Coming soon.</p>}
            </div>
            <div>
              <div className="ocolhead"><IconTrophy s={15} /> Presenting Sponsors</div>
              <div className="ologogrid">{presenting.map((p) => <LogoCard key={p.id} p={p} />)}</div>
              <a className="oviewall" href="#opt-browse" onClick={(e) => { e.preventDefault(); setType('all'); scrollBrowse() }}>View All Sponsors →</a>
            </div>
            <div>
              <div className="ocolhead"><IconBroadcast s={15} /> Media Partners</div>
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
                <div className="ospot__logo">{spotlight.logo_url ? <img src={spotlight.logo_url} alt={`${spotlight.name} logo`} style={{ maxWidth: '80%', maxHeight: 90 }} /> : <span className="ologomark" style={{ width: 70, height: 70, fontSize: 26 }}>{initials(spotlight.name)}</span>}</div>
                <div>
                  {spotlight.partner_type && <span className="opill">{spotlight.partner_type}</span>}
                  <h3 style={{ color: '#fff', fontSize: 22, margin: '10px 0 8px' }}>{spotlight.name}</h3>
                  <p>{spotlight.blurb || `${spotlight.name} is committed to strengthening our communities through innovative programs and strong partnerships.`}</p>
                  {spotlight.partner_since && <p style={{ marginTop: 10 }}><span className="oeyebrow">Partner Since</span><br />{spotlight.partner_since}</p>}
                  {spotlight.website && <a className="oviewall" style={{ textAlign: 'left', marginTop: 10 }} href={spotlight.website} target="_blank" rel="noreferrer">View Profile →</a>}
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
              {data && <p className="oresultcount">Showing {filtered.length} of {partners.length} partner{partners.length === 1 ? '' : 's'}</p>}
            </div>
            {page?.cta?.button_link && (
              <a className="obtn obtn--ghost" href={page.cta.button_link}>
                <svg viewBox="0 0 24 24" width="15" height="15" {...S}><path d="M12 5v14M5 12h14" /></svg>
                Become a Partner
              </a>
            )}
          </div>

          <div className="ofilters">
            <input className="ofld" style={{ flex: '2 1 200px' }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search partners…" />
            <select className="ofld" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All Partner Types</option>{(data?.types || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="all">All Industries</option>{(data?.industries || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={borough} onChange={(e) => setBorough(e.target.value)}><option value="all">All Boroughs</option>{(data?.boroughs || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={county} onChange={(e) => setCounty(e.target.value)}><option value="all">All Counties</option>{(data?.counties || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select className="ofld" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="name">A – Z</option><option value="newest">Newest</option><option value="oldest">Longest-standing</option></select>
            {filtersActive && <button type="button" className="oclear" onClick={clearFilters}>Clear all ✕</button>}
          </div>

          <div className="otabs">
            <button className={`otab ${type === 'all' ? 'is-active' : ''}`} onClick={() => setType('all')}>All Partners</button>
            {(data?.types || []).map((t) => <button key={t} className={`otab ${type === t ? 'is-active' : ''}`} onClick={() => setType(t)}>{t}</button>)}
          </div>

          {!data ? <p className="oempty">Loading partners…</p>
            : filtered.length === 0 ? <p className="oempty">No partners match your filters.{filtersActive && <> <button type="button" className="oclear" style={{ marginLeft: 4 }} onClick={clearFilters}>Clear all ✕</button></>}</p>
            : <div className="ogrid">{filtered.map((p) => <BrowseCard key={p.id} p={p} />)}</div>}
        </div>
      </section>

      {/* CTA */}
      {page?.cta && (
        <section className="octa">
          <div className="owrap octa__in">
            <div>
              <h2><IconHandshake s={24} /> {page.cta.title || 'Stronger Together'}</h2>
              <p>{page.cta.text}</p>
            </div>
            {page.cta.button_link && <a className="obtn obtn--gold" href={page.cta.button_link}>{page.cta.button_label || 'Partner With Us'} →</a>}
          </div>
        </section>
      )}
    </div>
  )
}
