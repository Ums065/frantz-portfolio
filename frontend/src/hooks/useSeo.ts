import { useEffect } from 'react'

interface Seo {
  title: string
  description?: string
  image?: string
}

const SITE = 'Frantz Coutard'
const DEFAULT_DESC = 'Frantz Coutard — Technology Innovator, Visionary, Community Builder. From Community to Legacy.'
const DEFAULT_IMAGE = '/assets/frantz-portrait.webp'

/** Upsert a <meta> tag by name or property. */
function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * Sets the document title + description + Open Graph / Twitter tags per page.
 * Lightweight (no react-helmet dependency); runs on mount and when inputs change.
 */
export function useSeo({ title, description, image }: Seo) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : SITE
    const desc = description || DEFAULT_DESC
    const img = image || DEFAULT_IMAGE
    const url = window.location.href

    document.title = fullTitle
    setMeta('name', 'description', desc)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', desc)
    setMeta('property', 'og:image', img)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:type', 'website')
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', desc)
    setMeta('name', 'twitter:image', img)
  }, [title, description, image])
}
