import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import SiteLayout from './components/SiteLayout'
import About from './pages/About'
import Awards from './pages/Awards'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import Community from './pages/Community'
import Events from './pages/Events'
import Admin from './pages/Admin'
import Dashboard from './pages/Dashboard'
import Media from './pages/Media'
import Profile from './pages/Profile'
import Projects from './pages/Projects'
import Store from './pages/Store'
import { AuthProvider } from './context/AuthContext'

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
          <Route path="/about" element={<SiteLayout key="about"><About /></SiteLayout>} />
          <Route path="/awards" element={<SiteLayout key="awards"><Awards /></SiteLayout>} />
          <Route path="/projects" element={<SiteLayout key="projects"><Projects /></SiteLayout>} />
          <Route path="/blog" element={<SiteLayout key="blog"><Blog /></SiteLayout>} />
          <Route path="/blog/:id" element={<SiteLayout key="blogpost"><BlogPost /></SiteLayout>} />
          <Route path="/events" element={<SiteLayout key="events"><Events /></SiteLayout>} />
          <Route path="/media" element={<SiteLayout key="media"><Media /></SiteLayout>} />
          <Route path="/community" element={<SiteLayout key="community"><Community /></SiteLayout>} />
          <Route path="/dashboard" element={<SiteLayout key="dashboard"><Dashboard /></SiteLayout>} />
          <Route path="/profile" element={<SiteLayout key="profile"><Profile /></SiteLayout>} />
          <Route path="/store" element={<Store />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
