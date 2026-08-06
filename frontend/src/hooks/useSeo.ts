import { useEffect } from 'react'
import { BRAND_LOGO } from '../lib/brandAssets'

interface Seo {
  title: string
  description?: string
  image?: string
  imageAlt?: string
  /** og:type — 'website' (default), 'article' (blog posts), or 'profile'. */
  type?: 'website' | 'article' | 'profile'
  /** Comma-separated keywords (optional; low weight but harmless). */
  keywords?: string
  /** ISO datetimes for article pages (blog posts) → article:published_time/modified_time. */
  publishedTime?: string
  modifiedTime?: string
  /** Extra JSON-LD structured data for this page (object or array of objects). */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>
  /** Private/auth pages (dashboards, admin, profile) pass true so search engines skip them. */
  noindex?: boolean
}

const SITE = 'Frantz Coutard'
// Production origin — used for canonical URLs, og:url, and absolute og:image.
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

/** Remove a meta tag if present (used to clear article-only tags on non-article pages). */
function removeMeta(attr: 'name' | 'property', key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove()
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

/** Title-case a URL segment for breadcrumb names ("founding-sponsors" → "Founding Sponsors"). */
function prettifySegment(seg: string): string {
  return decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Build a BreadcrumbList JSON-LD from the current path (skips numeric id segments' names). */
function breadcrumbLd(pageTitle: string): Record<string, unknown> | null {
  const segments = window.location.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null
  const items: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
  ]
  let acc = ''
  segments.forEach((seg, i) => {
    acc += '/' + seg
    const isLast = i === segments.length - 1
    // A trailing numeric id (e.g. /blog/123) is named after the page title.
    const name = /^\d+$/.test(seg) ? pageTitle : prettifySegment(seg)
    items.push({ '@type': 'ListItem', position: i + 2, name, item: SITE_URL + acc })
  })
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items }
}

/** Replace all page-level JSON-LD blocks (data-seo="page") with the given list. */
function setJsonLd(blocks: Array<Record<string, unknown>>) {
  document.head.querySelectorAll('script[data-seo="page"]').forEach((n) => n.remove())
  for (const block of blocks) {
    const s = document.createElement('script')
    s.type = 'application/ld+json'
    s.setAttribute('data-seo', 'page')
    s.textContent = JSON.stringify(block)
    document.head.appendChild(s)
  }
}

/**
 * Sets per-page SEO: document title, description, canonical, robots, the Open
 * Graph / Twitter card tags, and page-level JSON-LD (an auto BreadcrumbList plus
 * anything passed in `jsonLd`). Lightweight (no react-helmet). Pass `noindex` on
 * private/auth pages.
 */
export function useSeo({ title, description, image, imageAlt, type, keywords, publishedTime, modifiedTime, jsonLd, noindex }: Seo) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : SITE
    const desc = description || DEFAULT_DESC
    const img = absoluteUrl(image || DEFAULT_IMAGE)
    const ogType = type || 'website'
    // Canonical is the clean path (no query string / hash) on the production origin.
    const canonical = SITE_URL + window.location.pathname

    document.title = fullTitle
    setMeta('name', 'description', desc)
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow')
    if (keywords) setMeta('name', 'keywords', keywords); else removeMeta('name', 'keywords')
    setLink('canonical', canonical)

    setMeta('property', 'og:site_name', SITE)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', desc)
    setMeta('property', 'og:image', img)
    setMeta('property', 'og:image:alt', imageAlt || fullTitle)
    setMeta('property', 'og:url', canonical)
    setMeta('property', 'og:type', ogType)
    setMeta('property', 'og:locale', 'en_US')

    // Article-only tags — set when it's an article, cleared otherwise.
    if (ogType === 'article') {
      if (publishedTime) setMeta('property', 'article:published_time', publishedTime)
      if (modifiedTime) setMeta('property', 'article:modified_time', modifiedTime)
      setMeta('property', 'article:author', SITE)
    } else {
      removeMeta('property', 'article:published_time')
      removeMeta('property', 'article:modified_time')
      removeMeta('property', 'article:author')
    }

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', desc)
    setMeta('name', 'twitter:image', img)
    setMeta('name', 'twitter:image:alt', imageAlt || fullTitle)

    // Page-level structured data: auto breadcrumb + any page-specific JSON-LD.
    const blocks: Array<Record<string, unknown>> = []
    if (!noindex) {
      const crumb = breadcrumbLd(title || SITE)
      if (crumb) blocks.push(crumb)
      if (jsonLd) blocks.push(...(Array.isArray(jsonLd) ? jsonLd : [jsonLd]))
    }
    setJsonLd(blocks)

    return () => { setJsonLd([]) }
  }, [title, description, image, imageAlt, type, keywords, publishedTime, modifiedTime, noindex, JSON.stringify(jsonLd)])
}
