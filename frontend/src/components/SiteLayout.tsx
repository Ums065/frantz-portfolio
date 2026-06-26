import { useCallback, useState, type ReactNode } from 'react'
import SiteHeader from './SiteHeader'
import SiteFooter from './SiteFooter'
import { AuthModal, GallerySubmitModal, RequestModal } from './Modals'
import RegisterModal from './RegisterModal'
import type { RegistrationTag } from './ChallengeRegistration'
import { useSiteInteractions } from '../hooks/useSiteInteractions'
import { api } from '../lib/api'
import { useAuth, type RegistrationRole } from '../context/AuthContext'

/* Page shell shared by Home, About and Awards.
   Owns the auth / request modal state and wires the DOM-level
   interactions (nav, mobile menu, toast, data-* buttons, lightbox). */
export default function SiteLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  const { user } = useAuth()
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const [authRole, setAuthRole] = useState<RegistrationRole | null>(null)
  const [requestLabel, setRequestLabel] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  // "Register" opens the full challenge registration popup (same forms as the
  // /new-school page) + a Community option. "Login" still uses AuthModal.
  const [registerTag, setRegisterTag] = useState<RegistrationTag | null>(null)

  const onAuth = useCallback((which: 'login' | 'register', role?: string) => {
    if (which === 'register') {
      setAuthMode(null)
      setRegisterTag((role as RegistrationTag) || 'student')
      return
    }
    setAuthMode('login')
    setAuthRole((role as RegistrationRole) || null)
  }, [])
  const onRequest = useCallback((label: string) => setRequestLabel(label), [])
  const onGallery = useCallback(() => {
    if (!user) {
      setAuthMode('login')
      return
    }
    setGalleryOpen(true)
  }, [user])
  const onSubscribe = useCallback(async (email: string) => {
    try {
      const d = await api.post<{ message: string }>('subscribe', { email })
      window.fcToast?.(d.message)
    } catch (err) {
      window.fcToast?.(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [])

  useSiteInteractions({ onAuth, onRequest, onGallery, onSubscribe })

  return (
    <>
      <SiteHeader home={home} />
      {children}
      <SiteFooter />

      <AuthModal
        open={authMode === 'login'}
        mode="login"
        initialRole={authRole}
        onClose={() => setAuthMode(null)}
        onMode={(m) => { if (m === 'register') { setAuthMode(null); setRegisterTag('student') } else setAuthMode(m) }}
      />
      <RegisterModal
        open={registerTag !== null}
        initialTag={registerTag ?? 'student'}
        onClose={() => setRegisterTag(null)}
      />
      <RequestModal label={requestLabel} onClose={() => setRequestLabel(null)} />
      <GallerySubmitModal open={galleryOpen} onClose={() => setGalleryOpen(false)} />

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
