import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'

/* Lightweight i18n — no external dependency. A language toggle stores the choice
   in localStorage and t('key') looks it up in the dictionaries below (falling
   back to English, then the key). Add keys incrementally as pages are localized.
   Phase 1 covers the site chrome (header nav + CTAs). */

export type Lang = 'en' | 'es'

type Dict = Record<string, string>
const EN: Dict = {
  'nav.home': 'Home',
  'nav.about': 'About',
  'nav.projects': 'Projects',
  'nav.awards': 'Awards',
  'nav.events': 'Events',
  'nav.media': 'Media',
  'nav.challenge': 'Challenge',
  'nav.partners': 'Partners',
  'nav.dashboard': 'Dashboard',
  'nav.merch': 'Merch',
  'nav.news': 'News',
  'nav.contact': 'Contact',
  'cta.demo': 'Demo',
  'cta.demoLogin': 'Demo Login',
  'cta.login': 'Login',
  'cta.register': 'Register',
  'cta.profile': 'Profile',
  'cta.logout': 'Logout',
  'cta.foundingSponsor': 'Founding Sponsor',
  'cta.becomeFoundingSponsor': 'Become A Founding Sponsor',
  'cta.foundingSponsors': 'Founding Sponsors',
  'lang.label': 'Language',
}
const ES: Dict = {
  'nav.home': 'Inicio',
  'nav.about': 'Acerca de',
  'nav.projects': 'Proyectos',
  'nav.awards': 'Premios',
  'nav.events': 'Eventos',
  'nav.media': 'Medios',
  'nav.challenge': 'Desafío',
  'nav.partners': 'Socios',
  'nav.dashboard': 'Panel',
  'nav.merch': 'Tienda',
  'nav.news': 'Noticias',
  'nav.contact': 'Contacto',
  'cta.demo': 'Demo',
  'cta.demoLogin': 'Acceso Demo',
  'cta.login': 'Entrar',
  'cta.register': 'Registrarse',
  'cta.profile': 'Perfil',
  'cta.logout': 'Salir',
  'cta.foundingSponsor': 'Patrocinador Fundador',
  'cta.becomeFoundingSponsor': 'Ser Patrocinador Fundador',
  'cta.foundingSponsors': 'Patrocinadores Fundadores',
  'lang.label': 'Idioma',
}
const DICTS: Record<Lang, Dict> = { en: EN, es: ES }

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
  }, [lang])
  const setLang = useCallback((l: Lang) => setLangState(l), [])
  const t = useCallback((key: string, fallback?: string) => DICTS[lang][key] ?? EN[key] ?? fallback ?? key, [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx { return useContext(Ctx) }

/** Compact EN | ES language toggle. */
export function LanguageToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useI18n()
  const seg = (l: Lang, label: string) => (
    <button
      type="button"
      className={`fc-lang__seg${lang === l ? ' is-active' : ''}`}
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
    >{label}</button>
  )
  return (
    <div className="fc-lang__seg-wrap" title="Language / Idioma" style={style}>
      {seg('en', 'EN')}
      {seg('es', 'ES')}
    </div>
  )
}

/* ---- Whole-page auto-translation (machine, via /api/translate) ----
   When the language is Spanish, walk the page's visible text (+ common
   attributes) and translate it through the backend LibreTranslate proxy,
   caching results in memory. A MutationObserver re-translates dynamic content.
   Switching back to English reloads the page to restore the original source. */
const memCache: Record<string, Map<string, string>> = {}
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA'])
const looksTranslatable = (v: string) => /[A-Za-z]{2,}/.test(v)

export function AutoTranslate() {
  const { lang } = useI18n()
  const prev = useRef<Lang>(lang)

  useEffect(() => {
    const was = prev.current
    prev.current = lang
    // Returning to English: reload once to restore original text cleanly.
    if (lang === 'en') {
      if (was === 'es' && sessionStorage.getItem('fc_translated') === '1') {
        sessionStorage.removeItem('fc_translated')
        window.location.reload()
      }
      return
    }
    // Spanish (or any non-en): translate the live DOM.
    sessionStorage.setItem('fc_translated', '1')
    const target = lang
    const cache = (memCache[target] ||= new Map())
    const applied = new WeakMap<Text, string>() // node -> the translation we set
    let cancelled = false
    let observer: MutationObserver | null = null
    let timer: number | null = null

    const collect = (): Text[] => {
      const nodes: Text[] = []
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = (n as Text).parentElement
          if (!p || SKIP_TAGS.has(p.tagName) || p.closest('[data-no-translate]')) return NodeFilter.FILTER_REJECT
          const v = n.nodeValue || ''
          if (!looksTranslatable(v)) return NodeFilter.FILTER_REJECT
          if (applied.get(n as Text) === v) return NodeFilter.FILTER_REJECT // already translated, unchanged
          return NodeFilter.FILTER_ACCEPT
        },
      })
      while (w.nextNode()) nodes.push(w.currentNode as Text)
      return nodes
    }
    const applyText = (nodes: Text[]) => {
      observer?.disconnect()
      for (const n of nodes) {
        const raw = n.nodeValue || ''
        const key = raw.trim()
        const tr = key && cache.get(key)
        if (tr && tr !== key) {
          const next = raw.replace(key, tr)
          n.nodeValue = next
          applied.set(n, next)
        }
      }
      const attrs = ['placeholder', 'title', 'aria-label']
      for (const a of attrs) {
        document.querySelectorAll<HTMLElement>(`[${a}]`).forEach((el) => {
          if (el.closest('[data-no-translate]')) return
          const raw = el.getAttribute(a) || ''
          const key = raw.trim()
          const tr = key && cache.get(key)
          if (tr && tr !== key) el.setAttribute(a, tr)
        })
      }
      if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    }
    const run = async () => {
      const nodes = collect()
      const keys = new Set<string>()
      for (const n of nodes) { const k = (n.nodeValue || '').trim(); if (k && !cache.has(k)) keys.add(k) }
      document.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach((el) => {
        for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); const k = v && v.trim(); if (k && looksTranslatable(k) && !cache.has(k)) keys.add(k) }
      })
      applyText(nodes) // apply anything already cached
      const todo = [...keys]
      for (let i = 0; i < todo.length && !cancelled; i += 100) {
        const chunk = todo.slice(i, i + 100)
        try {
          const d = await api.post<{ translations: string[] }>('translate', { q: chunk, target })
          ;(d.translations || []).forEach((t, idx) => cache.set(chunk[idx], t))
        } catch { /* fail open — leave English */ }
      }
      if (!cancelled) applyText(collect())
    }
    const schedule = () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => { if (!cancelled) void run() }, 450) }

    observer = new MutationObserver(schedule)
    void run()
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => { cancelled = true; observer?.disconnect(); if (timer) window.clearTimeout(timer) }
  }, [lang])

  return null
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
