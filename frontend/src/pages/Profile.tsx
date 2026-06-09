import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const isAdmin = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')

export default function Profile() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <section className="profile-page">
        <div className="profile-card glass">
          <p className="profile-page__muted">Loading...</p>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="profile-page">
        <div className="profile-card glass">
          <p className="eyebrow">Member Area</p>
          <h1 className="gold-text">Profile</h1>
          <p className="profile-page__muted">Please login from the header to view your profile.</p>
          <Link className="btn btn--solid" to="/">Back to Home</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="profile-page">
      <div className="profile-card glass">
        <p className="eyebrow">Account</p>
        <h1 className="gold-text">Profile</h1>
        <div className="profile-summary">
          <div className="profile-summary__avatar" aria-hidden="true">
            {user.full_name.trim().charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h2>{user.full_name}</h2>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="profile-grid">
          <div>
            <span>Name</span>
            <strong>{user.full_name}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{user.email}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{user.role}</strong>
          </div>
          <div>
            <span>Joined</span>
            <strong>{new Date(user.created_at).toLocaleString()}</strong>
          </div>
        </div>
        <div className="profile-actions">
          <Link className="btn btn--sm btn--solid" to={isAdmin(user.role) ? '/admin' : '/dashboard'}>Dashboard</Link>
          <Link className="btn btn--sm" to="/">View Site</Link>
        </div>
      </div>
    </section>
  )
}
