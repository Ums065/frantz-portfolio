import { useEffect } from 'react'
import { BRAND_LOGO } from '../lib/brandAssets'

interface Seo {
  title: string
  description?: string
  image?: string
  /** Private/auth pages (dashboards, admin, profile) pass true so search engines skip them. */
  noindex?: boolean
}

const SITE = 'Frantz Coutard'
// Production origin — used for canonical URLs, og:url, and absolute og:image.
// Change here if the site is served from a different host.
const SITE_URL = 'https://frantzcoutard.com'
const DEFAULT_DESC = 'Frantz Coutard — Technology Innovator, Visionary, Community Builder. From Community to Legacy.'
const DEFAULT_IMAGE = BRAND_LOGO

/** Make a path absolute against SITE_URL (social crawlers require absolute image/URL values). */
function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return SITE_URL + (path.startsWith('/') ? path : `/${path}`)
}

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

/** Upsert a <link rel="…"> tag. */
function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Sets per-page SEO: document title, description, canonical, robots, and the
 * Open Graph / Twitter card tags. Lightweight (no react-helmet dependency); runs
 * on mount and whenever the inputs change. Pass `noindex` on private/auth pages.
 */
export function useSeo({ title, description, image, noindex }: Seo) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : SITE
    const desc = description || DEFAULT_DESC
    const img = absoluteUrl(image || DEFAULT_IMAGE)
    // Canonical is the clean path (no query string / hash) on the production origin.
    const canonical = SITE_URL + window.location.pathname

    document.title = fullTitle
    setMeta('name', 'description', desc)
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow')
    setLink('canonical', canonical)

    setMeta('property', 'og:site_name', SITE)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', desc)
    setMeta('property', 'og:image', img)
    setMeta('property', 'og:url', canonical)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:locale', 'en_US')

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', desc)
    setMeta('name', 'twitter:image', img)
  }, [title, description, image, noindex])
}
