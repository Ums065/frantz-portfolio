import { useSeo } from '../hooks/useSeo'
import { RESOURCES, RESOURCE_CATEGORY_LABELS, RESOURCE_CATEGORY_ORDER, type ResourceCategory } from '../lib/resources'

/** Public downloads hub: every official handbook, program guide, and press/partnership
 *  kit in one place. Reads the shared catalog in lib/resources.ts so it never drifts
 *  from the New School dashboard "Handbooks" tab. */
export default function Resources() {
  useSeo({
    title: 'Resources & Handbooks',
    description: 'Download official handbooks, the New School program guide, and media, partnership, and sponsorship kits for Frantz Coutard and the Leave It Better Than You Found It challenge.',
  })

  const groups = RESOURCE_CATEGORY_ORDER
    .map((cat) => ({ cat, docs: RESOURCES.filter((r) => r.category === cat) }))
    .filter((g) => g.docs.length > 0)

  return (
    <main className="page">
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Resources</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Handbooks &amp; Downloads</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto' }}>
            Official handbooks, the New School program guide, and media, partnership, and sponsorship kits — all in one place.
          </p>
        </div>
      </section>

      {groups.map(({ cat, docs }) => (
        <section className="block" style={{ paddingTop: 20 }} key={cat}>
          <div className="wrap">
            <div className="section-title reveal in"><span className="ln l" /><h2 className="gold-text">{RESOURCE_CATEGORY_LABELS[cat as ResourceCategory]}</h2><span className="ln r" /></div>
            <div className="action-grid">
              {docs.map((doc, i) => (
                <article className={`glass action-card reveal d${(i % 4) + 1}`} key={doc.url}>
                  <div className="action__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M8 13h8M8 17h6" /></svg></div>
                  <h3>{doc.label}</h3>
                  <p>{doc.description}</p>
                  <a className="btn btn--solid" href={doc.url} download>⬇ Download PDF</a>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}
    </main>
  )
}
