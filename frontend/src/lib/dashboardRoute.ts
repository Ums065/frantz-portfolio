const ADMIN_ROLES = new Set(['admin', 'super_admin', 'editor'])
const NEW_SCHOOL_ROLES = new Set(['student', 'parent', 'school', 'teacher'])

export function resolveDashboardRoute(role?: string | null): string {
  const normalized = (role || '').toLowerCase()
  if (ADMIN_ROLES.has(normalized)) return '/admin'
  if (normalized === 'judge') return '/judge/dashboard'
  if (normalized === 'business') return '/business'
  if (NEW_SCHOOL_ROLES.has(normalized)) return '/new-school/dashboard'
  return '/dashboard'
}
