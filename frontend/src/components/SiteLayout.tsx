import { useCallback, useState, type ReactNode } from 'react'
import SiteHeader from './SiteHeader'
import SiteFooter from './SiteFooter'
import { AuthModal, RequestModal } from './Modals'
import { useSiteInteractions } from '../hooks/useSiteInteractions'
import { api } from '../lib/api'
import type { RegistrationRole } from '../context/AuthContext'

/* Page shell shared by Home, About and Awards.
   Owns the auth / request modal state and wires the DOM-level
   interactions (nav, mobile menu, toast, data-* buttons, lightbox). */
export default function SiteLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const [authRole, setAuthRole] = useState<RegistrationRole | null>(null)
  const [requestLabel, setRequestLabel] = useState<string | null>(null)

  const onAuth = useCallback((which: 'login' | 'register', role?: string) => {
    setAuthMode(which)
    setAuthRole((role as RegistrationRole) || null)
  }, [])
  const onRequest = useCallback((label: string) => setRequestLabel(label), [])
  const onSubscribe = useCallback(async (email: string) => {
    try {
      const d = await api.post<{ message: string }>('subscribe', { email })
      window.fcToast?.(d.message)
    } catch (err) {
      window.fcToast?.(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [])

  useSiteInteractions({ onAuth, onRequest, onSubscribe })

  return (
    <>
      <SiteHeader home={home} />
      {children}
      <SiteFooter />

      <AuthModal
        open={authMode !== null}
        mode={authMode ?? 'login'}
        initialRole={authRole}
        onClose={() => setAuthMode(null)}
        onMode={(m) => setAuthMode(m)}
      />
      <RequestModal label={requestLabel} onClose={() => setRequestLabel(null)} />

      <div className="lightbox" id="lightbox">
        <button className="close" data-close-lightbox aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <div className="lightbox__inner">
          <div className="lightbox__frame">
            <img id="lightbox-image" className="lightbox__image" alt="" hidden />
            <svg className="lightbox__placeholder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="2" /><path d="M21 17l-5-5-7 6" /></svg>
          </div>
          <div className="lightbox__cap" id="lightbox-cap" />
        </div>
      </div>

      <div className="toast" id="toast">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.5 2.5L16 9" /></svg>
        <span id="toast-msg" />
      </div>
    </>
  )
}
