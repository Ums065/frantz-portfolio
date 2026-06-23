import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type AuthPayload, type User } from '../lib/api'

export type RegistrationRole = 'community' | 'student' | 'parent' | 'school' | 'teacher'

export interface RegistrationInput {
  role: RegistrationRole
  fullName: string
  email: string
  password: string
  studentUsername?: string
  age?: string
  dateOfBirth?: string
  phoneNumber?: string
  homeAddress?: string
  schoolName?: string
  schoolId?: string
  teacherId?: string
  gradeLevel?: string
  parentName?: string
  parentPhone?: string
  parentEmail?: string
  qrToken?: string
  relationshipToStudent?: string
  governmentIdUrl?: string
  digitalSignature?: string
  schoolAddress?: string
  schoolDistrict?: string
  mainPhone?: string
  principalName?: string
  administratorPhone?: string
  roleDepartment?: string
  gradeLevelSupported?: string
  consentChecked?: boolean
}

interface AuthState {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<AuthActionResult>
  register: (input: RegistrationInput) => Promise<AuthActionResult>
  logout: () => Promise<void>
}

interface AuthActionResult {
  user: User | null
  message?: string
}

interface AuthResponseLike {
  user: unknown
  message?: string
  csrfToken?: string
}

const AuthContext = createContext<AuthState | null>(null)

function isUser(value: unknown): value is User {
  return !!value
    && typeof value === 'object'
    && typeof (value as User).full_name === 'string'
    && typeof (value as User).email === 'string'
}

function describeAuthPayload(payload: AuthResponseLike) {
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

async function readAuthResult(payload: AuthResponseLike, action: string): Promise<AuthActionResult> {
  if (isUser(payload.user)) {
    return {
      user: payload.user,
      message: payload.message,
    }
  }

  console.error(`[auth] ${action} response did not include a valid user`, describeAuthPayload(payload))

  const fallback = await fetchCurrentUser()
  if (fallback) {
    return { user: fallback, message: payload.message }
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
    const result = await readAuthResult(d, 'login')
    setUser(result.user)
    return result
  }

  const register = async (input: RegistrationInput) => {
    const role = input.role || 'community'
    let payload: AuthResponseLike

    switch (role) {
      case 'student':
        payload = await api.post<AuthResponseLike>('new-school/student/register', {
          full_name: input.fullName,
          student_username: input.studentUsername ?? '',
          age: input.age ?? '',
          date_of_birth: input.dateOfBirth ?? '',
          email: input.email,
          phone_number: input.phoneNumber ?? '',
          home_address: input.homeAddress ?? '',
          school_name: input.schoolName ?? '',
          school_id: input.schoolId ?? '',
          teacher_id: input.teacherId ?? '',
          grade_level: input.gradeLevel ?? '',
          parent_name: input.parentName ?? '',
          parent_phone: input.parentPhone ?? '',
          parent_email: input.parentEmail ?? '',
          password: input.password,
        })
        break
      case 'parent':
        payload = await api.post<AuthResponseLike>('new-school/parent/consent', {
          qr_token: input.qrToken ?? '',
          parent_full_name: input.fullName,
          relationship_to_student: input.relationshipToStudent ?? '',
          phone_number: input.phoneNumber ?? '',
          email: input.email,
          home_address: input.homeAddress ?? '',
          government_id_url: input.governmentIdUrl ?? '',
          consent_checked: input.consentChecked ?? true,
          digital_signature: input.digitalSignature ?? input.fullName,
          password: input.password,
        })
        break
      case 'school':
        payload = await api.post<AuthResponseLike>('new-school/school/register', {
          school_name: input.schoolName ?? '',
          school_address: input.schoolAddress ?? '',
          school_district: input.schoolDistrict ?? '',
          main_phone: input.mainPhone ?? '',
          principal_name: input.principalName ?? '',
          administrator_name: input.fullName,
          administrator_email: input.email,
          administrator_phone: input.administratorPhone ?? '',
          password: input.password,
        })
        break
      case 'teacher':
        payload = await api.post<AuthResponseLike>('new-school/teacher/register', {
          teacher_full_name: input.fullName,
          school_name: input.schoolName ?? '',
          school_id: input.schoolId ?? '',
          school_email: input.email,
          phone_number: input.phoneNumber ?? '',
          role_department: input.roleDepartment ?? '',
          grade_level_supported: input.gradeLevelSupported ?? '',
          password: input.password,
        })
        break
      case 'community':
      default:
        payload = await api.post<AuthResponseLike>('auth/register', {
          full_name: input.fullName,
          email: input.email,
          password: input.password,
        })
        break
    }

    const result = await readAuthResult(payload, `${role} registration`)
    setUser(result.user)
    return result
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
