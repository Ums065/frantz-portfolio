import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type AuthPayload, type User } from '../lib/api'

interface AuthState {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<User>
  register: (full_name: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function readUser(payload: AuthPayload, action: string): User {
  const user = payload.user
  if (!user || typeof user.full_name !== 'string' || typeof user.email !== 'string') {
    throw new Error(`Unexpected ${action} response from the server.`)
  }
  return user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const d = await api.get<AuthPayload>('auth/me')
    setUser(d.user ?? null)
  }

  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const d = await api.post<AuthPayload>('auth/login', { email, password })
    const nextUser = readUser(d, 'login')
    setUser(nextUser)
    return nextUser
  }

  const register = async (full_name: string, email: string, password: string) => {
    const d = await api.post<AuthPayload>('auth/register', { full_name, email, password })
    const nextUser = readUser(d, 'registration')
    setUser(nextUser)
    return nextUser
  }

  const logout = async () => {
    await api.post('auth/logout', {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, refresh, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
