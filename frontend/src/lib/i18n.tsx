import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type ElementType } from 'react'
import { api } from './api'

/* ============================================================================
 * i18n — instant language switching with smart, non-destructive machine
 * translation.
 *
 * Design:
 *  - Site chrome (nav / CTAs) uses a hand-written EN/ES dictionary via t() —
 *    instant + high quality, marked data-no-translate so the engine skips it.
 *  - Everything else is translated by a single module-level "engine" that walks
 *    visible text once, applies cached translations SYNCHRONOUSLY (instant), and
 *    fetches only the misses in the background (requestIdleCallback). The cache
 *    is persisted to localStorage, so repeat switches/visits are instant.
 *  - Switching back to English RESTORES the originals from a registry — it never
 *    reloads the page (route, scroll, state and inputs are preserved).
 *  - Dynamic data (emails, URLs, phones, numbers, IDs, currency) is auto-skipped
 *    by pattern; proper nouns / DB values can be marked non-translatable with the
 *    <NoTranslate> component, a `data-no-translate` attribute, the standard
 *    `translate="no"` attribute, or a `notranslate` class.
 * ==========================================================================*/

export type Lang = 'en' | 'es'

type Dict = Record<string, string>
const EN: Dict = {
  'nav.home': 'Home', 'nav.about': 'About', 'nav.projects': 'Projects', 'nav.awards': 'Awards',
  'nav.events': 'Events', 'nav.media': 'Media', 'nav.challenge': 'Challenge', 'nav.partners': 'Partners',
  'nav.dashboard': 'Dashboard', 'nav.merch': 'Merch', 'nav.news': 'News', 'nav.contact': 'Contact',
  'cta.demo': 'Demo', 'cta.demoLogin': 'Demo Login', 'cta.login': 'Login', 'cta.register': 'Register',
  'cta.profile': 'Profile', 'cta.logout': 'Logout', 'cta.foundingSponsor': 'Founding Sponsor',
  'cta.becomeFoundingSponsor': 'Become A Founding Sponsor', 'cta.foundingSponsors': 'Founding Sponsors',
  'lang.label': 'Language',
}
const ES: Dict = {
  'nav.home': 'Inicio', 'nav.about': 'Acerca de', 'nav.projects': 'Proyectos', 'nav.awards': 'Premios',
  'nav.events': 'Eventos', 'nav.media': 'Medios', 'nav.challenge': 'Desafío', 'nav.partners': 'Socios',
  'nav.dashboard': 'Panel', 'nav.merch': 'Tienda', 'nav.news': 'Noticias', 'nav.contact': 'Contacto',
  'cta.demo': 'Demo', 'cta.demoLogin': 'Acceso Demo', 'cta.login': 'Entrar', 'cta.register': 'Registrarse',
  'cta.profile': 'Perfil', 'cta.logout': 'Salir', 'cta.foundingSponsor': 'Patrocinador Fundador',
  'cta.becomeFoundingSponsor': 'Ser Patrocinador Fundador', 'cta.foundingSponsors': 'Patrocinadores Fundadores',
  'lang.label': 'Idioma',
}
const DICTS: Record<Lang, Dict> = { en: EN, es: ES }

/* -------------------------------------------------------------------------- */
/* Translation engine (module-level singleton — survives component churn)      */
/* -------------------------------------------------------------------------- */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'svg'])
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']
const NO_TR_SELECTOR = '[data-no-translate],[translate="no"],.notranslate'

// Patterns for content that must NEVER be translated (data, not UI copy).
const RE_HAS_LETTERS = /[A-Za-z]{2,}/
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RE_URL = /^(https?:\/\/|www\.|\/)/i
const RE_PHONE = /^[+(]?[\d][\d\s()+.\-]{5,}$/
const RE_DATAISH = /^[\d.,%$₹€£#:/\s()+-]+$/ // numbers, ids, currency, dates, percentages

function isTranslatable(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (!RE_HAS_LETTERS.test(s)) return false          // no real words
  if (RE_EMAIL.test(s) || RE_URL.test(s) || RE_PHONE.test(s) || RE_DATAISH.test(s)) return false
  return true
}

function loadCache(target: string): Map<string, string> {
  try {
    const raw = localStorage.getItem('fc_tr_' + target)
    if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') return new Map(Object.entries(o)) }
  } catch { /* ignore */ }
  return new Map()
}

const idle = (cb: () => void): number => {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  return w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 800 }) : window.setTimeout(cb, 80)
}

const translator = (() => {
  let target: string = 'en' // mutable across async work; kept as string to avoid narrowing
  let cache = new Map<string, string>()
  let observer: MutationObserver | null = null
  let scheduled = false
  let running = false
  let saveTimer: number | null = null
  const orig = new WeakMap<Text, string>()   // text node -> original English
  const touched = new Set<Text>()             // text nodes we changed (for restore)
  const attrTouched: Array<{ el: Element; attr: string; original: string }> = []

  const skipEl = (el: Element | null): boolean =>
    !el || SKIP_TAGS.has(el.tagName) || !!el.closest(NO_TR_SELECTOR)

  const persist = () => {
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem('fc_tr_' + target, JSON.stringify(Object.fromEntries(cache))) } catch { /* quota */ }
    }, 1000)
  }

  const textNodes = (): Text[] => {
    const out: Text[] = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = (n as Text).parentElement
        if (skipEl(p)) return NodeFilter.FILTER_REJECT
        if (!isTranslatable(n.nodeValue || '')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    while (w.nextNode()) out.push(w.currentNode as Text)
    return out
  }

  // Apply whatever is already cached — synchronous & instant.
  const applyCached = () => {
    observer?.disconnect()
    for (const n of textNodes()) {
      const rawFull = n.nodeValue || ''
      const key = rawFull.trim()
      const tr = cache.get(key)
      if (tr && tr !== key) {
        if (!orig.has(n)) orig.set(n, rawFull)
        const next = rawFull.replace(key, tr)
        if (n.nodeValue !== next) { n.nodeValue = next; touched.add(n) }
      }
    }
    for (const a of ATTRS) {
      document.querySelectorAll<HTMLElement>(`[${a}]`).forEach((el) => {
        if (skipEl(el)) return
        const rawv = el.getAttribute(a) || ''
        const key = rawv.trim()
        if (!isTranslatable(key)) return
        const tr = cache.get(key)
        if (tr && tr !== key && el.getAttribute(a) !== tr) { attrTouched.push({ el, attr: a, original: rawv }); el.setAttribute(a, tr) }
      })
    }
    if (target !== 'en') observer?.observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  const collectMisses = (): string[] => {
    const keys = new Set<string>()
    for (const n of textNodes()) { const k = (n.nodeValue || '').trim(); if (k && !cache.has(k)) keys.add(k) }
    for (const a of ATTRS) {
      document.querySelectorAll<HTMLElement>(`[${a}]`).forEach((el) => {
        if (skipEl(el)) return
        const k = (el.getAttribute(a) || '').trim()
        if (k && isTranslatable(k) && !cache.has(k)) keys.add(k)
      })
    }
    return [...keys]
  }

  const fetchMisses = async () => {
    if (running || target === 'en') return
    running = true
    try {
      const todo = collectMisses()
      let got = false
      for (let i = 0; i < todo.length; i += 100) {
        if (target === 'en') break
        const chunk = todo.slice(i, i + 100)
        try {
          const d = await api.post<{ translations: string[] }>('translate', { q: chunk, target })
          ;(d.translations || []).forEach((tx, ix) => { if (tx && tx !== chunk[ix]) { cache.set(chunk[ix], tx); got = true } else cache.set(chunk[ix], chunk[ix]) })
        } catch { /* fail open — stays English */ }
      }
      if (got) { persist(); if (target !== 'en') applyCached() }
      else persist()
    } finally { running = false }
  }

  const schedule = () => {
    if (scheduled || target === 'en') return
    scheduled = true
    idle(() => { scheduled = false; if (target === 'en') return; applyCached(); void fetchMisses() })
  }

  const activate = (t: Lang) => {
    target = t
    cache = loadCache(t)
    if (!observer) observer = new MutationObserver(schedule)
    applyCached()        // instant: apply everything already cached
    void fetchMisses()   // background: translate the rest
  }

  const deactivate = () => {
    target = 'en'
    observer?.disconnect()
    for (const n of touched) { const o = orig.get(n); if (o != null && n.isConnected) n.nodeValue = o }
    touched.clear()
    for (const { el, attr, original } of attrTouched) { if (el.isConnected) el.setAttribute(attr, original) }
    attrTouched.length = 0
  }

  return { activate, deactivate }
})()

/* -------------------------------------------------------------------------- */
/* React context                                                              */
/* -------------------------------------------------------------------------- */

interface I18nCtx { lang: Lang; setLang: (l: Lang) => void; t: (key: string, fallback?: string) => string }
const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, t: (k, f) => f ?? k })

function initialLang(): Lang {
  try { const s = localStorage.getItem('fc_lang'); if (s === 'es' || s === 'en') return s } catch { /* ignore */ }
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    try { localStorage.setItem('fc_lang', lang) } catch { /* ignore */ }
    try { document.documentElement.lang = lang } catch { /* ignore */ }
    // Drive the translation engine — no page reload, instant from cache.
    if (lang === 'en') translator.deactivate()
    else translator.activate(lang)
  }, [lang])

  const setLang = useCallback((l: Lang) => setLangState(l), [])
  const t = useCallback((key: string, fallback?: string) => DICTS[lang][key] ?? EN[key] ?? fallback ?? key, [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx { return useContext(Ctx) }

/** Wrap DB values / proper nouns (names, cities, brands…) so they're never auto-translated. */
export function NoTranslate({ children, as, ...rest }: { children: ReactNode; as?: ElementType } & Record<string, unknown>) {
  const Tag = (as ?? 'span') as ElementType
  return <Tag translate="no" className="notranslate" data-no-translate {...rest}>{children}</Tag>
}

/** Deprecated no-op — the engine is now driven by LanguageProvider. Kept so
 *  existing <AutoTranslate/> mounts don't break. */
export function AutoTranslate() { return null }

/* -------------------------------------------------------------------------- */
/* Language toggle UI                                                         */
/* -------------------------------------------------------------------------- */

export function LanguageToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useI18n()
  const seg = (l: Lang, label: string) => (
    <button type="button" className={`fc-lang__seg${lang === l ? ' is-active' : ''}`} onClick={() => setLang(l)} aria-pressed={lang === l}>{label}</button>
  )
  return (
    <div className="fc-lang__seg-wrap" title="Language / Idioma" style={style}>
      {seg('en', 'EN')}
      {seg('es', 'ES')}
    </div>
  )
}

const LANG_CSS = `
.fc-lang { position: fixed; right: 18px; bottom: 18px; z-index: 90; }
.fc-lang__pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px;
  background: linear-gradient(150deg, rgba(38,33,18,0.96), rgba(20,19,15,0.96));
  border: 1px solid rgba(201,168,76,0.45); border-radius: 999px;
  box-shadow: 0 10px 30px -10px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05);
  backdrop-filter: blur(8px); transition: transform .25s var(--ease,ease), box-shadow .25s; }
.fc-lang__pill:hover { transform: translateY(-2px); box-shadow: 0 16px 40px -12px rgba(0,0,0,0.85); }
.fc-lang__globe { display: grid; place-items: center; width: 22px; height: 22px; color: var(--gold-light); }
.fc-lang__globe svg { width: 18px; height: 18px; }
.fc-lang__seg-wrap { display: inline-flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.35);
  border: 1px solid rgba(201,168,76,0.25); border-radius: 999px; padding: 3px; }
.fc-lang__seg { border: 0; background: transparent; color: var(--gold-light); font-weight: 800; font-size: 11.5px;
  letter-spacing: .06em; padding: 5px 11px; border-radius: 999px; cursor: pointer; transition: all .2s; line-height: 1; }
.fc-lang__seg:hover:not(.is-active) { color: #fff; background: rgba(201,168,76,0.15); }
.fc-lang__seg.is-active { background: linear-gradient(180deg, #f6e2a8, #c9a84c); color: #1c1a14; box-shadow: 0 2px 8px -2px rgba(201,168,76,0.6); }
@media (max-width: 640px) { .fc-lang { right: 12px; bottom: 12px; } .fc-lang__pill { padding: 5px 6px 5px 10px; } }
`

/** Site-wide floating language widget, pinned bottom-right on every page. */
export function FloatingLanguageToggle() {
  return (
    <div className="fc-lang" data-no-translate>
      <style>{LANG_CSS}</style>
      <div className="fc-lang__pill" title="Language / Idioma">
        <span className="fc-lang__globe" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z" /></svg>
        </span>
        <LanguageToggle />
      </div>
    </div>
  )
}
