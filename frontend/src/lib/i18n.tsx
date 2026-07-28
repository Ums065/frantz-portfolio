import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

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

/** Compact EN | ES language toggle for the header. */
export function LanguageToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useI18n()
  const seg = (l: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      style={{
        border: 0, background: lang === l ? 'var(--gold)' : 'transparent',
        color: lang === l ? '#1c1a14' : 'var(--gold-light)', fontWeight: 700, fontSize: 11.5,
        padding: '4px 8px', borderRadius: 999, cursor: 'pointer', letterSpacing: '.03em',
      }}
    >{label}</button>
  )
  return (
    <div title="Language / Idioma" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid var(--line)', borderRadius: 999, padding: 2, ...style }}>
      {seg('en', 'EN')}
      {seg('es', 'ES')}
    </div>
  )
}
