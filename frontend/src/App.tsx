import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import SiteLayout from './components/SiteLayout'
import { AuthProvider } from './context/AuthContext'

const About = lazy(() => import('./pages/About'))
const Awards = lazy(() => import('./pages/Awards'))
const Blog = lazy(() => import('./pages/Blog'))
const BlogPost = lazy(() => import('./pages/BlogPost'))
const Community = lazy(() => import('./pages/Community'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Events = lazy(() => import('./pages/Events'))
const Media = lazy(() => import('./pages/Media'))
const NewSchool = lazy(() => import('./pages/NewSchool'))
const Profile = lazy(() => import('./pages/Profile'))
const Projects = lazy(() => import('./pages/Projects'))
const Store = lazy(() => import('./pages/Store'))
const Admin = lazy(() => import('./pages/Admin'))

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

declare global {
  interface Window { fcToast?: (msg: string) => void }
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Unique keys force SiteLayout to remount on navigation so the
              scroll-reveal observer & DOM wiring re-run for the new page. */}
          <Route path="/" element={<SiteLayout key="home" home><Home /></SiteLayout>} />
          <Route path="/about" element={<RoutedPage pageKey="about"><About /></RoutedPage>} />
          <Route path="/awards" element={<RoutedPage pageKey="awards"><Awards /></RoutedPage>} />
          <Route path="/projects" element={<RoutedPage pageKey="projects"><Projects /></RoutedPage>} />
          <Route path="/blog" element={<RoutedPage pageKey="blog"><Blog /></RoutedPage>} />
          <Route path="/blog/:id" element={<RoutedPage pageKey="blogpost"><BlogPost /></RoutedPage>} />
          <Route path="/events" element={<RoutedPage pageKey="events"><Events /></RoutedPage>} />
          <Route path="/media" element={<RoutedPage pageKey="media"><Media /></RoutedPage>} />
          <Route path="/community" element={<RoutedPage pageKey="community"><Community /></RoutedPage>} />
          <Route path="/new-school" element={<RoutedPage pageKey="new-school"><NewSchool /></RoutedPage>} />
          <Route path="/new-school/parent/:token" element={<RoutedPage pageKey="new-school-parent"><NewSchool /></RoutedPage>} />
          <Route path="/dashboard" element={<RoutedPage pageKey="dashboard"><Dashboard /></RoutedPage>} />
          <Route path="/profile" element={<RoutedPage pageKey="profile"><Profile /></RoutedPage>} />
          <Route path="/store" element={<Suspense fallback={<RouteLoading />}><Store /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<RouteLoading />}><Admin /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
