import { useEffect } from 'react'

/**
 * Injects (and keeps in sync) a <script type="application/ld+json"> block in the
 * document head for rich-result structured data — Event, Product, BlogPosting, etc.
 * Google reads JSON-LD from the rendered DOM, so this works for the client-rendered
 * SPA. Pass `null`/`undefined` (e.g. while data is still loading) to render nothing.
 *
 * `id` must be stable and unique per schema block so re-renders update in place
 * instead of stacking duplicate <script> tags.
 */
export function useJsonLd(id: string, data: unknown | null | undefined) {
  useEffect(() => {
    const elId = `jsonld-${id}`
    const existing = document.getElementById(elId)
    if (!data) {
      existing?.remove()
      return
    }
    const el = existing ?? document.createElement('script')
    if (!existing) {
      el.id = elId
      ;(el as HTMLScriptElement).type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
    return () => { document.getElementById(elId)?.remove() }
  }, [id, data])
}
