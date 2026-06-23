import { useSeo } from '../hooks/useSeo'
import { LEGAL_DOCS, type LegalSlug } from '../lib/terms'

/** Renders a public legal document (/terms, /privacy, /content-disclaimer). */
export default function Legal({ slug }: { slug: LegalSlug }) {
  const doc = LEGAL_DOCS[slug]
  useSeo({ title: doc.title, description: doc.intro[0]?.slice(0, 155) })

  return (
    <section className="block legal-page">
      <div className="wrap">
        <div className="legal-page__head reveal in">
          <span className="eyebrow">Legal</span>
          <h1>{doc.title}</h1>
          <p className="legal-page__meta">
            {doc.version} · Effective {doc.effectiveDate}
          </p>
          {doc.intro.map((p, i) => (
            <p className="legal-page__intro" key={i}>{p}</p>
          ))}
        </div>
        <div className="legal-page__body glass reveal in">
          {doc.sections.map((section, i) => (
            <section className="legal-section" key={i}>
              {section.heading && <h2>{section.heading}</h2>}
              {section.paragraphs?.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
