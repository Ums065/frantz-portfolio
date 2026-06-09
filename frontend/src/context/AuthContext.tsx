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

function isUser(value: unknown): value is User {
  return !!value
    && typeof value === 'object'
    && typeof (value as User).full_name === 'string'
    && typeof (value as User).email === 'string'
}

function describeAuthPayload(payload: AuthPayload) {
  const user = payload.user
  const userObject = user && typeof user === 'object' ? (user as unknown as Record<string, unknown>) : null

  return {
    hasUser: isUser(user),
    payloadKeys: Object.keys(payload),
    userType: user === null ? 'null' : typeof user,
    userKeys: userObject ? Object.keys(userObject) : [],
    hasCsrfToken: typeof payload.csrfToken === 'string' && payload.csrfToken.length > 0,
  }
}

async function fetchCurrentUser(): Promise<User | null> {
  const payload = await api.get<AuthPayload>('auth/me').catch(() => null)
  return payload && isUser(payload.user) ? payload.user : null
}

async function readUser(payload: AuthPayload, action: string): Promise<User> {
  if (isUser(payload.user)) {
    return payload.user
  }

  console.error(`[auth] ${action} response did not include a valid user`, describeAuthPayload(payload))

  const fallback = await fetchCurrentUser()
  if (fallback) {
    return fallback
  }

  console.error(`[auth] ${action} fallback auth/me did not return a valid user`, describeAuthPayload(payload))
  throw new Error(`Unexpected ${action} response from the server.`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const d = await api.get<AuthPayload>('auth/me')
    setUser(isUser(d.user) ? d.user : null)
  }

  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const d = await api.post<AuthPayload>('auth/login', { email, password })
    const nextUser = await readUser(d, 'login')
    setUser(nextUser)
    return nextUser
  }

  const register = async (full_name: string, email: string, password: string) => {
    const d = await api.post<AuthPayload>('auth/register', { full_name, email, password })
    const nextUser = await readUser(d, 'registration')
    setUser(nextUser)
    return nextUser
  }

  const logout = async () => {
    try {
      await api.post('auth/logout', {})
      setUser(null)
    } finally {
      await refresh().catch(() => setUser(null))
    }
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
