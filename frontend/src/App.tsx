import { lazy, Suspense, type ReactNode, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { trackVisit } from './lib/api'
import Home from './components/Home'
import SiteLayout from './components/SiteLayout'
import ImpersonationBanner from './components/ImpersonationBanner'
import { AuthProvider } from './context/AuthContext'

/* /register and /register/{student|parent|teacher|school} -> the challenge page's
   registration section for that role. An unknown role falls back to student, so a
   mistyped or mis-printed link still lands on a working registration form. */
function RegisterShortcut() {
  const { role } = useParams()
  const valid = ['student', 'parent', 'teacher', 'school']
  const pick = role && valid.includes(role.toLowerCase()) ? role.toLowerCase() : 'student'
  const { search } = useLocation()
  const extra = new URLSearchParams(search)
  extra.delete('register')
  const rest = extra.toString()
  return <Navigate to={`/new-school?register=${pick}${rest ? `&${rest}` : ''}#registration`} replace />
}

const About = lazy(() => import('./pages/About'))
const Awards = lazy(() => import('./pages/Awards'))
const Blog = lazy(() => import('./pages/Blog'))
const Careers = lazy(() => import('./pages/Careers'))
const BlogPost = lazy(() => import('./pages/BlogPost'))

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Events = lazy(() => import('./pages/Events'))
const FoundingSponsor = lazy(() => import('./pages/FoundingSponsor'))
const FoundingSponsors = lazy(() => import('./pages/FoundingSponsors'))
const Media = lazy(() => import('./pages/Media'))
const NewSchool = lazy(() => import('./pages/NewSchool'))
const Winners = lazy(() => import('./pages/Winners'))
const Rules = lazy(() => import('./pages/Rules'))
const Profile = lazy(() => import('./pages/Profile'))
const Projects = lazy(() => import('./pages/Projects'))
const Resources = lazy(() => import('./pages/Resources'))
const Store = lazy(() => import('./pages/Store'))
const Donate = lazy(() => import('./pages/Donate'))
const Admin = lazy(() => import('./pages/Admin'))
const Legal = lazy(() => import('./pages/Legal'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Contact = lazy(() => import('./pages/Contact'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Judge = lazy(() => import('./pages/Judge'))
const Business = lazy(() => import('./pages/Business'))
const PartnersPage = lazy(() => import('./pages/Partners'))
const Sponsor = lazy(() => import('./pages/Sponsor'))
const Partner = lazy(() => import('./pages/Partner'))
const MediaPortal = lazy(() => import('./pages/MediaPortal'))
const Volunteer = lazy(() => import('./pages/Volunteer'))
const Fellow = lazy(() => import('./pages/Fellow'))

function RouteLoading() {
  return (
    <main className="page" aria-busy="true">
      <section className="page-hero">
        <div className="wrap" style={{ minHeight: '42vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div className="eyebrow reveal in">Loading</div>
            <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Preparing page</h1>
            <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto', maxWidth: 520 }}>
              Optimizing assets and loading the next section.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

function RoutedPage({ children, home = false, pageKey }: { children: ReactNode; home?: boolean; pageKey: string }) {
  return (
    <SiteLayout key={pageKey} home={home}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </SiteLayout>
  )
}

function PageTracker() {
  const { pathname } = useLocation()
  // One page view per route change (the initial load fires on mount).
  useEffect(() => { trackVisit(pathname) }, [pathname])
  return null
}

function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      return
    }

    const timer = window.setTimeout(() => {
      const target = document.querySelector(hash)
      if (target instanceof HTMLElement) {
        const top = target.getBoundingClientRect().top + window.scrollY - 96
        window.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'auto' })
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [pathname, hash])

  return null
}

declare global {
  interface Window { fcToast?: (msg: string) => void }
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <PageTracker />
        <ImpersonationBanner />
        <Routes>
          {/* Unique keys force SiteLayout to remount on navigation so the
              scroll-reveal observer & DOM wiring re-run for the new page. */}
          <Route path="/" element={<SiteLayout key="home" home><Home /></SiteLayout>} />
          <Route path="/about" element={<RoutedPage pageKey="about"><About /></RoutedPage>} />
          <Route path="/awards" element={<RoutedPage pageKey="awards"><Awards /></RoutedPage>} />
          <Route path="/partner" element={<RoutedPage pageKey="partner"><PartnersPage /></RoutedPage>} />
          <Route path="/projects" element={<RoutedPage pageKey="projects"><Projects /></RoutedPage>} />
          <Route path="/blog" element={<RoutedPage pageKey="blog"><Blog /></RoutedPage>} />
          <Route path="/blog/:id" element={<RoutedPage pageKey="blogpost"><BlogPost /></RoutedPage>} />
          <Route path="/careers" element={<RoutedPage pageKey="careers"><Careers /></RoutedPage>} />
          <Route path="/careers/:id" element={<RoutedPage pageKey="careers-job"><Careers /></RoutedPage>} />
          <Route path="/events" element={<RoutedPage pageKey="events"><Events /></RoutedPage>} />
          <Route path="/media" element={<RoutedPage pageKey="media"><Media /></RoutedPage>} />
          <Route path="/contact" element={<RoutedPage pageKey="contact"><Contact /></RoutedPage>} />
          <Route path="/resources" element={<RoutedPage pageKey="resources"><Resources /></RoutedPage>} />

          {/* The sponsor pages are one program. /new-school/... is the canonical address; the
              old top-level paths still work (printed kits link to them) and redirect. */}
          <Route path="/become-a-founding-sponsor" element={<Navigate to="/new-school/become-a-founding-sponsor" replace />} />
          <Route path="/founding-sponsors" element={<Navigate to="/new-school/founding-sponsors" replace />} />
          <Route path="/new-school" element={<RoutedPage pageKey="new-school"><NewSchool /></RoutedPage>} />
          {/* Short, printable entry points for flyers and QR codes. They land on the
              challenge page with that role's registration form already open. */}
          <Route path="/register" element={<RegisterShortcut />} />
          <Route path="/register/:role" element={<RegisterShortcut />} />
          <Route path="/rules" element={<RoutedPage pageKey="rules"><Rules /></RoutedPage>} />
          <Route path="/winners" element={<RoutedPage pageKey="winners"><Winners /></RoutedPage>} />
          <Route path="/new-school/become-a-founding-sponsor" element={<RoutedPage pageKey="new-school-become-a-founding-sponsor"><FoundingSponsor /></RoutedPage>} />
          <Route path="/new-school/founding-sponsors" element={<RoutedPage pageKey="new-school-founding-sponsors"><FoundingSponsors /></RoutedPage>} />
          <Route path="/new-school/dashboard" element={<RoutedPage pageKey="new-school-dashboard"><NewSchool /></RoutedPage>} />
          <Route path="/new-school/parent/:token" element={<RoutedPage pageKey="new-school-parent"><NewSchool /></RoutedPage>} />
          <Route path="/dashboard" element={<RoutedPage pageKey="dashboard"><Dashboard /></RoutedPage>} />
          <Route path="/profile" element={<RoutedPage pageKey="profile"><Profile /></RoutedPage>} />
          <Route path="/reset-password" element={<RoutedPage pageKey="reset-password"><ResetPassword /></RoutedPage>} />
          <Route path="/store" element={<Suspense fallback={<RouteLoading />}><Store /></Suspense>} />
          <Route path="/donate" element={<Suspense fallback={<RouteLoading />}><Donate /></Suspense>} />
          <Route path="/terms" element={<RoutedPage pageKey="terms"><Legal slug="terms" /></RoutedPage>} />
          <Route path="/privacy" element={<RoutedPage pageKey="privacy"><Legal slug="privacy" /></RoutedPage>} />
          <Route path="/content-disclaimer" element={<RoutedPage pageKey="content-disclaimer"><Legal slug="content-disclaimer" /></RoutedPage>} />
          <Route path="/admin" element={<Suspense fallback={<RouteLoading />}><Admin /></Suspense>} />
          <Route path="/judge/dashboard" element={<Suspense fallback={<RouteLoading />}><Judge /></Suspense>} />
          <Route path="/business" element={<Suspense fallback={<RouteLoading />}><Business /></Suspense>} />
          <Route path="/sponsor" element={<Suspense fallback={<RouteLoading />}><Sponsor /></Suspense>} />
          <Route path="/partner-portal" element={<Suspense fallback={<RouteLoading />}><Partner /></Suspense>} />
          <Route path="/media-portal" element={<Suspense fallback={<RouteLoading />}><MediaPortal /></Suspense>} />
          <Route path="/volunteer" element={<Suspense fallback={<RouteLoading />}><Volunteer /></Suspense>} />
          <Route path="/fellow" element={<Suspense fallback={<RouteLoading />}><Fellow /></Suspense>} />
          <Route path="*" element={<RoutedPage pageKey="notfound"><NotFound /></RoutedPage>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
