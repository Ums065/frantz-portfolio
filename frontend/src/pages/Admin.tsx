import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api, type AnalyticsPayload, type AwardRow, type CommunityCommentRow, type CommunityThreadRow, type EventItem, type EventRsvpRow, type InventoryRow, type MediaRow, type PostDetail, type ProductVisibility, type TestimonialRow, type User } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { useLiveRefresh } from '../hooks/useLiveRefresh'
import { statHint } from '../lib/statHints'
import { resolveDashboardRoute } from '../lib/dashboardRoute'
import SponsorsAdminPanel from '../components/admin/SponsorsAdminPanel'
import GalleryAdminPanel from '../components/admin/GalleryAdminPanel'
import NsRecordDetail from '../components/NsRecordDetail'
import AdminNavIcon from '../components/admin/AdminNavIcon'
import NsProfileModal, { type ProfileView } from '../components/admin/NsProfileModal'
import JudgesAdminPanel from '../components/admin/JudgesAdminPanel'
import PartnersAdminPanel from '../components/admin/PartnersAdminPanel'
import BusinessRequestsAdminPanel from '../components/admin/BusinessRequestsAdminPanel'
import EcosystemAdminPanel from '../components/admin/EcosystemAdminPanel'
import SubmissionScoresModal from '../components/admin/SubmissionScoresModal'

const EDU_PEOPLE_PAGE_SIZE = 10

type TabKey =
  | 'overview' | 'analytics' | 'traffic' | 'requests' | 'orders' | 'subscribers' | 'contacts'
  | 'members' | 'approvals' | 'business-requests' | 'ecosystem' | 'sponsors' | 'partners' | 'awards' | 'events' | 'blog'
  | 'testimonials' | 'media' | 'gallery' | 'community' | 'rsvps' | 'inventory'
  | 'ns-schools' | 'ns-ranking' | 'ns-submissions' | 'ns-interviews' | 'ns-chat' | 'ns-trendcatch' | 'ns-judges' | 'ns-timeline'

interface NavItem { key: TabKey; label: string }
const NAV_GROUPS: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Overview', items: [
    { key: 'overview', label: 'Overview' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'traffic', label: 'Traffic' },
  ] },
  { group: 'People', items: [
    { key: 'members', label: 'User Accounts' },
    { key: 'approvals', label: 'Account Approvals' },
    { key: 'business-requests', label: 'Business Requests' },
    { key: 'ecosystem', label: 'Ecosystem' },
    { key: 'contacts', label: 'Contact Messages' },
    { key: 'subscribers', label: 'Newsletter' },
  ] },
  { group: 'Schools', items: [
    { key: 'ns-schools', label: 'School Dashboard' },
    { key: 'ns-ranking', label: 'Ranking' },
    { key: 'ns-submissions', label: 'Student Submissions' },
    { key: 'ns-judges', label: 'Judges & Scoring' },
    { key: 'ns-timeline', label: 'Challenge Timeline' },
    { key: 'ns-interviews', label: 'Business Interviews' },
    { key: 'ns-chat', label: 'Messages' },
    { key: 'ns-trendcatch', label: 'TrendCatch EDU' },
  ] },
  { group: 'Commerce', items: [
    { key: 'orders', label: 'Store Orders' },
    { key: 'inventory', label: 'Products & Inventory' },
    { key: 'sponsors', label: 'Founding Sponsors' },
  ] },
  { group: 'Engagement', items: [
    { key: 'requests', label: 'Service Requests' },
    { key: 'rsvps', label: 'Event RSVPs' },
    { key: 'community', label: 'Community' },
  ] },
  { group: 'Content', items: [
    { key: 'awards', label: 'Awards' },
    { key: 'events', label: 'Events' },
    { key: 'blog', label: 'Blog Posts' },
    { key: 'testimonials', label: 'Testimonials' },
    { key: 'media', label: 'Media Library' },
    { key: 'gallery', label: 'Gallery' },
    { key: 'partners', label: 'Partners' },
  ] },
]

interface RequestRow {
  id: number; request_type: string; full_name: string; email: string
  organization: string | null; message: string | null; status: string; created_at: string
}
interface SubRow { id: number; email: string; created_at: string }
interface ContactRow { id: number; full_name: string; email: string; message: string | null; created_at: string }
interface MemberRow {
  id: number
  full_name: string
  email: string
  role: string
  email_verified_at?: string | null
  approval_status?: string | null
  approval_note?: string | null
  approval_reviewed_by_user_id?: number | null
  approval_reviewed_by_name?: string | null
  approval_reviewed_by_email?: string | null
  approval_reviewed_by_role?: string | null
  approval_reviewed_at?: string | null
  created_at: string
  updated_at?: string | null
}
interface OrderRow {
  id: number; order_no: string; customer_name: string; email: string; items: string
  total: string; payment_method: string; payment_provider?: string | null; payment_status?: string | null; status: string; created_at: string
}
interface Submissions {
  requests: RequestRow[]; subscribers: SubRow[]; contacts: ContactRow[]; members: MemberRow[]; orders: OrderRow[]
  counts?: Partial<Record<'awards' | 'events' | 'blog' | 'testimonials' | 'media' | 'gallery' | 'inventory' | 'community' | 'rsvps' | 'sponsors' | 'business_requests' | 'ecosystem_requests' | 'sponsors_pending' | 'internships_confirmed', number>>
}

interface DetailField {
  label: string
  value: string | number
}

interface DetailSection {
  title: string
  fields: DetailField[]
}

interface DetailTable {
  title: string
  columns: string[]
  rows: Array<Record<string, string | number | null>>
}

interface UserDetailPayload {
  user: MemberRow
  sections: DetailSection[]
  tables: DetailTable[]
}

const isAdmin = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')
const approvalButtonClass = (current: string, action: 'pending' | 'approved' | 'rejected') =>
  `btn btn--sm${current === action ? ' btn--solid' : ''}`

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  return String(value)
}

/** Format a MySQL datetime ("2026-06-25 14:30:00") as a short readable date. */
const fmtDate = (value: unknown): string => {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Admin() {
  useSeo({ title: 'Admin Console', noindex: true })
  const { user, loading, logout, refresh: refreshAuth, impersonate } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<Submissions | null>(null)
  const [tab, setTab] = useState<TabKey>(() => {
    // Restore the last-open tab from the URL (?tab=…) so a page refresh stays put.
    const q = new URLSearchParams(window.location.search).get('tab') as TabKey | null
    const valid = !!q && NAV_GROUPS.some((g) => g.items.some((i) => i.key === q))
    return valid ? (q as TabKey) : 'overview'
  })
  // Mobile: sidebar starts collapsed (content-first); toggled by the mobile bar.
  const [navOpen, setNavOpen] = useState(false)
  // Keep the URL in sync with the active tab (replaceState → no history spam).
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('tab') !== tab) {
      url.searchParams.set('tab', tab)
      window.history.replaceState(window.history.state, '', url)
    }
  }, [tab])
  const [ovGroup, setOvGroup] = useState('People')
  const [viewBusyId, setViewBusyId] = useState<number | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [selectedUser, setSelectedUser] = useState<MemberRow | null>(null)
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailPayload | null>(null)
  const [selectedUserLoading, setSelectedUserLoading] = useState(false)
  const [selectedUserError, setSelectedUserError] = useState('')
  const [nsData, setNsData] = useState<any>(null)
  const [nsDetail, setNsDetail] = useState<{ kind: 'interview' | 'project'; record: any } | null>(null)
  const [scoreModal, setScoreModal] = useState<{ id: number; name: string } | null>(null)
  const [nsProfile, setNsProfile] = useState<ProfileView | null>(null)
  const [schoolDashId, setSchoolDashId] = useState('')
  const [rankSchoolId, setRankSchoolId] = useState('')
  const [nsExporting, setNsExporting] = useState('')
  // Bonus-points prompt: approve-with-bonus for projects (max 15); award-only for interviews (max 5).
  const [bonusModal, setBonusModal] = useState<{ kind: 'submission' | 'interview'; id: number; studentName: string; max: number; approveAfter: boolean } | null>(null)
  const [bonusValue, setBonusValue] = useState(0)
  const [bonusBusy, setBonusBusy] = useState(false)
  // Enhanced filters — Student Submissions
  const [subSchool, setSubSchool] = useState('')
  const [subStarred, setSubStarred] = useState(false)
  const [subFrom, setSubFrom] = useState('')
  const [subTo, setSubTo] = useState('')
  // Enhanced filters — Business Interviews
  const [intSchool, setIntSchool] = useState('')
  const [intCategory, setIntCategory] = useState('')
  const [intStarred, setIntStarred] = useState(false)
  const [intFrom, setIntFrom] = useState('')
  const [intTo, setIntTo] = useState('')
  // School Dashboard: grid/table view toggle + 16-per-page pagination for the school cards.
  const [schoolsView, setSchoolsView] = useState<'grid' | 'table'>('grid')
  const [schoolsPage, setSchoolsPage] = useState(1)
  const [schoolRosterTab, setSchoolRosterTab] = useState<'students' | 'teachers' | 'parents'>('students')
  const [chatThreads, setChatThreads] = useState<any[]>([])
  const [chatActiveUser, setChatActiveUser] = useState<number | null>(null)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatSearch, setChatSearch] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  // TrendCatch EDU: unclaimed schools the admin stewards until a principal claims them.
  const [nsEdu, setNsEdu] = useState<{ active: any[]; history: any[] } | null>(null)
  const [nsEduBusy, setNsEduBusy] = useState('')
  const [eduExpanded, setEduExpanded] = useState<number | null>(null)
  const [claimSchoolId, setClaimSchoolId] = useState<number | null>(null)
  const [eduTeacherPages, setEduTeacherPages] = useState<Record<number, number>>({})
  const [eduStudentPages, setEduStudentPages] = useState<Record<number, number>>({})

  const loadChatThreads = async () => {
    try { const d = await api.get<{ threads: any[] }>('admin/new-school/chats'); setChatThreads(Array.isArray(d?.threads) ? d.threads : []) } catch { setChatThreads([]) }
  }
  const openChatThread = async (userId: number) => {
    setChatActiveUser(userId)
    try {
      const d = await api.get<{ messages: any[] }>(`admin/new-school/chat?user_id=${userId}`)
      setChatMessages(Array.isArray(d?.messages) ? d.messages : [])
      setChatThreads((prev) => prev.map((thread: any) => Number(thread.thread_user_id) === userId ? { ...thread, unread_count: 0 } : thread))
    } catch {
      setChatMessages([])
    }
  }
  const sendAdminChat = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || !chatActiveUser) return
    setChatBusy(true)
    try {
      const d = await api.post<{ messages: any[] }>('admin/new-school/chat', { user_id: chatActiveUser, body: text })
      setChatMessages(Array.isArray(d?.messages) ? d.messages : [])
      setChatInput('')
      void loadChatThreads()
    } catch (err) { alert(err instanceof Error ? err.message : 'Send failed.') }
    finally { setChatBusy(false) }
  }
  const clearAdminChat = async () => {
    if (!chatActiveUser || !confirm('Clear this conversation from your view? The user keeps their own copy.')) return
    try {
      await api.post('admin/new-school/chat/clear', { user_id: chatActiveUser })
      setChatMessages([])
      setChatThreads((prev) => prev.filter((thread: any) => Number(thread.thread_user_id) !== chatActiveUser))
      setChatActiveUser(null)
    } catch (err) { alert(err instanceof Error ? err.message : 'Clear failed.') }
  }
  useEffect(() => { if (tab === 'ns-chat') void loadChatThreads() }, [tab])

  // ---- TrendCatch EDU tab ----
  const loadEdu = async () => {
    try {
      const d = await api.get<any>('admin/new-school/trendcatch')
      setNsEdu({ active: Array.isArray(d?.active) ? d.active : [], history: Array.isArray(d?.history) ? d.history : [] })
    } catch { setNsEdu({ active: [], history: [] }) }
  }
  useEffect(() => { if (tab === 'ns-trendcatch') void loadEdu() }, [tab])

  const setSchoolStatus = async (schoolId: number, status: 'registered' | 'approved' | 'rejected', busyKey: string) => {
    setNsEduBusy(busyKey)
    try {
      await api.post('admin/new-school/school/set-status', { school_id: schoolId, status })
      await loadEdu()
      await refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the school.')
    } finally {
      setNsEduBusy('')
    }
  }

  const eduRejectSchool = async (schoolId: number) => {
    await setSchoolStatus(schoolId, 'rejected', `reject-${schoolId}`)
  }
  const eduMakeLive = async (schoolId: number) => {
    setNsEduBusy(`live-${schoolId}`)
    try { await api.post('admin/new-school/school/set-status', { school_id: schoolId, status: 'approved' }); await loadEdu(); void refreshData() }
    catch (err) { alert(err instanceof Error ? err.message : 'Could not update the school.') }
    finally { setNsEduBusy('') }
  }
  const eduApproveTeacher = async (teacher: any) => {
    setNsEduBusy(`teacher-${teacher.id}`)
    try {
      await api.post('new-school/school/teacher/approve', {
        teacher_id: Number(teacher.id), teacher_name: teacher.teacher_full_name, teacher_email: teacher.school_email,
        role: teacher.role_department || 'Teacher', approval_status: 'approved', digital_signature: user?.full_name || 'Admin',
      })
      await loadEdu(); void refreshData()
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not approve the teacher.') }
    finally { setNsEduBusy('') }
  }
  const eduApproveStudent = async (student: any) => {
    setNsEduBusy(`student-${student.id}`)
    try {
      await api.post('new-school/teacher/approve', {
        student_id: Number(student.id), teacher_name: user?.full_name || 'Admin', teacher_email: user?.email || '',
        approval_status: 'approved', digital_signature: user?.full_name || 'Admin',
      })
      await loadEdu(); void refreshData()
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not approve the student.') }
    finally { setNsEduBusy('') }
  }
  const submitClaim = async (e: React.FormEvent<HTMLFormElement>, schoolId: number) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const get = (k: string) => String(fd.get(k) ?? '').trim()
    setNsEduBusy(`claim-${schoolId}`)
    try {
      await api.post('admin/new-school/school/claim', {
        school_id: schoolId,
        principal_name: get('principal_name'),
        administrator_name: get('administrator_name'),
        administrator_email: get('administrator_email'),
        administrator_phone: get('administrator_phone'),
        main_phone: get('main_phone'),
        school_address: get('school_address'),
        school_district: get('school_district'),
        school_website: get('school_website'),
        password: get('password'),
      })
      setClaimSchoolId(null)
      await loadEdu(); void refreshData()
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not claim the school.') }
    finally { setNsEduBusy('') }
  }



  const refreshData = async () => {
    // Load the main submissions AND the New School summary (student interviews +
    // project submissions) so the Command Center can review challenge activity too.
    const [main, ns] = await Promise.allSettled([
      api.get<Submissions>('admin/submissions'),
      api.get<any>('admin/new-school/summary'),
    ])
    setData(main.status === 'fulfilled' ? main.value : null)
    if (ns.status === 'fulfilled') setNsData(ns.value)
  }

  useEffect(() => {
    if (!isAdmin(user?.role)) return
    void refreshData()
    // Preload the chat + TrendCatch EDU data so their sidebar notification badges
    // (unread messages / unclaimed schools) appear without first opening each tab.
    void loadChatThreads()
    void loadEdu()
  }, [user])
  // Keep the overview achievement card + sidebar badges live without a refresh.
  useLiveRefresh(() => { void refreshData(); void loadChatThreads(); void loadEdu() }, { enabled: isAdmin(user?.role), intervalMs: 60000 })

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    try {
      await api.post<{ user: User }>('auth/admin-login', { email, password })
      await refreshAuth()
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Login failed') }
  }

  const setStatus = async (id: number, status: string) => {
    await api.put(`admin/request/${id}`, { status })
    void refreshData()
  }

  const setOrderStatus = async (id: number, status: string) => {
    await api.put(`admin/order/${id}`, { status })
    void refreshData()
  }

  const syncUpdatedUser = (updated: MemberRow) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      }
    })
    setSelectedUser((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
    setSelectedUserDetail((prev) => {
      if (!prev || prev.user.id !== updated.id) return prev
      return {
        ...prev,
        user: { ...prev.user, ...updated },
      }
    })
  }

  const openUserDetails = async (member: MemberRow) => {
    setSelectedUser(member)
    setSelectedUserDetail(null)
    setSelectedUserError('')
    setSelectedUserLoading(true)
    try {
      const detail = await api.get<UserDetailPayload>(`admin/user/${member.id}`)
      setSelectedUserDetail(detail)
    } catch (err) {
      setSelectedUserError(err instanceof Error ? err.message : 'Failed to load user details.')
    } finally {
      setSelectedUserLoading(false)
    }
  }

  const closeUserDetails = () => {
    setSelectedUser(null)
    setSelectedUserDetail(null)
    setSelectedUserError('')
    setSelectedUserLoading(false)
  }

  const setApproval = async (id: number, approval_status: 'pending' | 'approved' | 'rejected', approval_note = '') => {
    if (approval_status === 'rejected' && !confirm('Reject this account?')) return
    const result = await api.put<{ message: string; user?: MemberRow }>(`admin/user/${id}/approval`, { approval_status, approval_note })
    if (result.user) {
      syncUpdatedUser(result.user)
    }
    await refreshData()
    if (selectedUser?.id === id) {
      void openUserDetails(selectedUser)
    }
  }

  // Admin "view as user": swap the session to this user and open their real dashboard.
  const viewAsUser = async (m: MemberRow) => {
    if (viewBusyId) return
    setViewBusyId(m.id)
    try {
      const target = await impersonate(m.id)
      navigate(resolveDashboardRoute(target?.role ?? m.role))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not open that user's dashboard.")
    } finally {
      setViewBusyId(null)
    }
  }

  // Generic delete used across the data-list tabs (CRUD: the "D").
  const deleteRow = async (path: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return
    try {
      await api.del(path)
      await refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  // ---- Bulk actions (operate on an array of selected row ids) ----
  const bulkDelete = async (basePath: string, ids: number[], noun: string) => {
    if (!ids.length || !confirm(`Delete ${ids.length} ${noun}${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    const results = await Promise.allSettled(ids.map((id) => api.del(`${basePath}/${id}`)))
    await refreshData()
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) alert(`${failed} of ${ids.length} could not be deleted (they may have linked records).`)
  }

  const bulkSetApproval = async (ids: number[], approval_status: 'approved' | 'pending' | 'rejected') => {
    if (!ids.length) return
    if (approval_status === 'rejected' && !confirm(`Reject ${ids.length} account${ids.length === 1 ? '' : 's'}?`)) return
    await Promise.allSettled(ids.map((id) => api.put(`admin/user/${id}/approval`, { approval_status })))
    await refreshData()
  }

  // ---- New School: review (approve/reject) student PROJECT submissions ----
  const reviewSubmission = async (id: number, status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !confirm('Reject this submission?')) return
    try {
      await api.post('new-school/submission/review', { submission_id: id, status })
      await refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the submission.')
    }
  }
  const bulkReviewSubmissions = async (ids: number[], status: 'approved' | 'rejected') => {
    if (!ids.length) return
    if (status === 'rejected' && !confirm(`Reject ${ids.length} submission${ids.length === 1 ? '' : 's'}?`)) return
    await Promise.allSettled(ids.map((id) => api.post('new-school/submission/review', { submission_id: id, status })))
    await refreshData()
  }

  // ---- New School: admin star toggle (standout projects / interviews) ----
  const toggleStar = async (entity: 'submission' | 'interview', id: number, starred: boolean) => {
    try {
      await api.post('admin/new-school/star', { entity, id, starred })
      await refreshData()
    } catch (err) {
      window.fcToast?.(err instanceof Error ? err.message : 'Could not update star.')
    }
  }

  // ---- New School: bonus points. Approving a project prompts for bonus first (default 0);
  // the submission is approved only after the admin confirms. Interviews award up to 5. ----
  const openApproveBonus = (s: any) => { setBonusValue(0); setBonusModal({ kind: 'submission', id: Number(s.id), studentName: s.student_name || 'this student', max: 15, approveAfter: true }) }
  const openInterviewBonus = (b: any) => { setBonusValue(0); setBonusModal({ kind: 'interview', id: Number(b.id), studentName: b.student_name || 'this student', max: 5, approveAfter: false }) }
  const confirmBonus = async () => {
    if (!bonusModal) return
    const pts = Math.max(0, Math.min(bonusModal.max, Math.round(Number(bonusValue) || 0)))
    setBonusBusy(true)
    try {
      if (pts > 0) {
        await api.post('admin/new-school/points', {
          source_type: bonusModal.kind === 'submission' ? 'project' : 'interview',
          source_id: bonusModal.id,
          student_points: pts,
          teacher_points: 0,
        })
      }
      if (bonusModal.approveAfter) {
        await api.post('new-school/submission/review', { submission_id: bonusModal.id, status: 'approved' })
      }
      window.fcToast?.(
        bonusModal.approveAfter
          ? (pts > 0 ? `Approved · ${pts} bonus point${pts === 1 ? '' : 's'} to the student.` : 'Submission approved.')
          : (pts > 0 ? `${pts} bonus point${pts === 1 ? '' : 's'} awarded.` : 'No points awarded.'),
      )
      setBonusModal(null)
      await refreshData()
    } catch (err) {
      window.fcToast?.(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBonusBusy(false)
    }
  }

  const reviewableAccounts = data?.members.filter((m) => !isAdmin(m.role)) ?? []
  const pendingAccounts = reviewableAccounts.filter((m) => (m.approval_status || 'pending') === 'pending').length
  const rejectedAccounts = reviewableAccounts.filter((m) => (m.approval_status || 'pending') === 'rejected').length
  const approvalQueueCount = reviewableAccounts.filter((m) => (m.approval_status || 'pending') !== 'approved').length
  const approvedAccounts = reviewableAccounts.filter((m) => (m.approval_status || 'pending') === 'approved').length
  // Distinct roles present in the account list, for the role dropdown filter.
  const memberRoles = [...new Set((data?.members ?? []).map((m) => (m.role || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const reviewableRoles = [...new Set(reviewableAccounts.map((m) => (m.role || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

  // Per-status breakdowns for the in-tab "actual counter" strips.
  const reqRows = data?.requests ?? []
  const orderRows = data?.orders ?? []
  const reqBy = (s: string) => reqRows.filter((r) => (r.status || '').toLowerCase() === s).length
  const ordBy = (s: string) => orderRows.filter((o) => (o.status || '').toLowerCase() === s).length
  const orderRevenue = orderRows
    .filter((o) => ['paid', 'fulfilled'].includes((o.status || '').toLowerCase()))
    .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)

  // New School challenge activity (from admin/new-school/summary).
  const nsSubmissions: any[] = Array.isArray(nsData?.submissions) ? nsData.submissions : []
  const nsInterviews: any[] = Array.isArray(nsData?.businesses) ? nsData.businesses : []
  // Scholarship answers map (student_id -> {answers}); JSON keys are strings.
  const nsScholarship: Record<string, any> = nsData?.scholarship && typeof nsData.scholarship === 'object' ? nsData.scholarship : {}
  const scholarshipFor = (studentId: any) => (nsScholarship[String(studentId)]?.answers || [])
  const nsSubBy = (s: string) => nsSubmissions.filter((x) => (x.status || '').toLowerCase() === s).length
  const nsPendingReview = nsSubBy('submitted')
  const chatUnreadCount = chatThreads.reduce((sum: number, thread: any) => sum + (Number(thread.unread_count) || 0), 0)
  const filteredChatThreads = useMemo(() => {
    const query = chatSearch.trim().toLowerCase()
    if (!query) return chatThreads
    return chatThreads.filter((thread: any) => {
      const haystack = `${thread.full_name ?? ''} ${thread.email ?? ''} ${thread.role ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [chatThreads, chatSearch])

  // The search box also finds ANY registered user (not just existing conversations),
  // so the admin can start a brand-new chat with someone who hasn't messaged yet.
  const chatUserResults = useMemo(() => {
    const query = chatSearch.trim().toLowerCase()
    if (!query) return [] as any[]
    const threadIds = new Set(chatThreads.map((t: any) => Number(t.thread_user_id)))
    return (data?.members ?? [])
      .filter((m) => !isAdmin(m.role) && !threadIds.has(Number(m.id)))
      .filter((m) => `${m.full_name ?? ''} ${m.email ?? ''} ${m.role ?? ''}`.toLowerCase().includes(query))
      .slice(0, 25)
  }, [data?.members, chatThreads, chatSearch])
  const activeChatName = chatActiveUser
    ? (chatThreads.find((t: any) => Number(t.thread_user_id) === chatActiveUser)?.full_name
        || (data?.members ?? []).find((m) => Number(m.id) === chatActiveUser)?.full_name
        || `User #${chatActiveUser}`)
    : ''

  const removeChatThread = async (userId: number) => {
    if (!confirm('Remove this conversation from your admin view? It will reappear if the user sends a new message.')) return
    try {
      await api.post('admin/new-school/chat/clear', { user_id: userId })
      setChatThreads((prev) => prev.filter((thread: any) => Number(thread.thread_user_id) !== userId))
      if (chatActiveUser === userId) {
        setChatActiveUser(null)
        setChatMessages([])
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not remove the conversation.')
    }
  }

  // Schools area: ranked students/teachers, schools list + global school ranking.
  const nsStudents: any[] = Array.isArray(nsData?.students) ? nsData.students : []
  const nsTeachers: any[] = Array.isArray(nsData?.teachers) ? nsData.teachers : []
  const nsSchools: any[] = Array.isArray(nsData?.schools) ? nsData.schools : []
  const nsParents: any[] = Array.isArray(nsData?.parents) ? nsData.parents : []
  const nsSchoolRankings: any[] = Array.isArray(nsData?.school_rankings) ? nsData.school_rankings : []
  const studentSchoolMap = new Map<number, number>(nsStudents.map((s: any) => [Number(s.id), Number(s.school_id || 0)]))
  const studentsInSchool = (schoolId: number) => nsStudents.filter((s: any) => Number(s.school_id) === schoolId)
  const teachersInSchool = (schoolId: number) => nsTeachers.filter((t: any) => Number(t.school_id) === schoolId)
  const parentsInSchool = (schoolId: number) => nsParents.filter((p: any) => studentSchoolMap.get(Number(p.student_id)) === schoolId)

  // Enhanced-filter helpers for the Submissions + Interviews tabs.
  const inDateRange = (val: any, from: string, to: string) => {
    const d = String(val || '').slice(0, 10)
    if (from && (!d || d < from)) return false
    if (to && (!d || d > to)) return false
    return true
  }
  const subFiltered = nsSubmissions.filter((s: any) => {
    if (subSchool && String(studentSchoolMap.get(Number(s.student_id)) || '') !== subSchool) return false
    if (subStarred && !Number(s.is_starred)) return false
    if (!inDateRange(s.submission_date || s.created_at, subFrom, subTo)) return false
    return true
  })
  const intCategories = Array.from(new Set(nsInterviews.map((b: any) => String(b.business_category || '').trim()).filter(Boolean))).sort()
  const intFiltered = nsInterviews.filter((b: any) => {
    if (intSchool && String(studentSchoolMap.get(Number(b.student_id)) || '') !== intSchool) return false
    if (intCategory && String(b.business_category || '') !== intCategory) return false
    if (intStarred && !Number(b.is_starred)) return false
    if (!inDateRange(b.date_of_visit || b.created_at, intFrom, intTo)) return false
    return true
  })
  // School cards: 16 per page (grid or table view).
  const SCHOOLS_PAGE_SIZE = 16
  const schoolsTotalPages = Math.max(1, Math.ceil(nsSchools.length / SCHOOLS_PAGE_SIZE))
  const schoolsSafePage = Math.min(schoolsPage, schoolsTotalPages)
  const pagedSchools = nsSchools.slice((schoolsSafePage - 1) * SCHOOLS_PAGE_SIZE, schoolsSafePage * SCHOOLS_PAGE_SIZE)
  useEffect(() => { if (schoolsPage !== schoolsSafePage) setSchoolsPage(schoolsSafePage) }, [schoolsPage, schoolsSafePage])
  const byRank = (a: any, b: any) => (a.rank_position || 9999) - (b.rank_position || 9999)
  const openStudentProfile = (studentId: number) => {
    const student = nsStudents.find((s: any) => Number(s.id) === studentId)
    if (!student) return
    setNsProfile({ kind: 'student', data: {
      student,
      interviews: nsInterviews.filter((b: any) => Number(b.student_id) === studentId),
      project: nsSubmissions.find((s: any) => Number(s.student_id) === studentId) || null,
      scholarship: scholarshipFor(studentId),
    } })
  }
  const openTeacherProfile = (teacherId: number) => {
    const teacher = nsTeachers.find((t: any) => Number(t.id) === teacherId)
    if (!teacher) return
    const roster = nsStudents.filter((s: any) => Number(s.teacher_id) === teacherId).slice().sort(byRank)
    setNsProfile({ kind: 'teacher', data: { teacher, students: roster } })
  }
  // New School CSV exports — same admin endpoint the /new-school/dashboard uses, surfaced
  // here in the Analytics + School Dashboard tabs so the admin never has to leave /admin.
  const NS_EXPORT_TYPES = ['parents', 'schools', 'teachers', 'businesses', 'submissions', 'winners', 'approvals', 'notifications'] as const
  const exportNsCsv = async (type: string) => {
    setNsExporting(type)
    try {
      const data = await api.get<any>(`admin/new-school/export?type=${encodeURIComponent(type)}`)
      const blob = new Blob([data.csv || ''], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename || `new-school-${type}.csv`
      a.click()
      URL.revokeObjectURL(url)
      window.fcToast?.(`${type} export downloaded.`)
    } catch (err) {
      window.fcToast?.(err instanceof Error ? err.message : 'Could not export CSV.')
    } finally {
      setNsExporting('')
    }
  }
  const renderNsExportBar = (title = 'Export New School data (CSV)') => (
    <div className="admin-export-bar">
      <span className="admin-export-bar__label">{title}</span>
      {NS_EXPORT_TYPES.map((type) => (
        <button key={type} type="button" className="btn btn--sm" onClick={() => exportNsCsv(type)} disabled={nsExporting === type}>
          {nsExporting === type ? 'Exporting…' : `Export ${type.charAt(0).toUpperCase() + type.slice(1)}`}
        </button>
      ))}
    </div>
  )

  const selectedDashSchool = nsSchools.find((s: any) => String(s.id) === schoolDashId) || null
  const selectedRankSchool = nsSchools.find((s: any) => String(s.id) === rankSchoolId) || null
  // A clickable leaderboard list of students or teachers -> opens the profile modal.
  const renderRankList = (people: any[], kind: 'student' | 'teacher') => (
    <div className="ns-rankboard">
      {people.length === 0 && <p className="admin-muted" style={{ color: 'var(--muted)', fontSize: 13 }}>No data yet.</p>}
      {people.map((p: any, i: number) => (
        <button
          key={p.id}
          type="button"
          className="ns-rankrow"
          onClick={() => (kind === 'student' ? openStudentProfile(Number(p.id)) : openTeacherProfile(Number(p.id)))}
        >
          <span className={`ns-rankrow__rank${(p.rank_position ?? i + 1) <= 3 ? ' is-top' : ''}`}>#{p.rank_position ?? i + 1}</span>
          <span className="ns-rankrow__name">{kind === 'student' ? p.full_name : p.teacher_full_name}</span>
          <span className="ns-rankrow__meta">{kind === 'student' ? `${p.interview_count ?? 0}/10 · ${p.submission_status || '—'}` : `${p.students_total ?? 0} students`}</span>
          <span className="ns-rankrow__pts">{(kind === 'student' ? (p.final_score ?? p.student_points) : p.teacher_points) ?? 0} pts</span>
          <span className="ns-rankrow__go" aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  )

  // Sidebar badges behave like NOTIFICATION counters: only "new/actionable" items,
  // hidden when zero. Full totals live in the per-tab StatChips strips instead.
  const notifications: Partial<Record<TabKey, number>> = {
    approvals: pendingAccounts,
    members: pendingAccounts,
    'business-requests': data?.counts?.business_requests ?? 0,
    ecosystem: data?.counts?.ecosystem_requests ?? 0,
    requests: reqBy('new'),
    orders: ordBy('pending'),
    sponsors: data?.counts?.sponsors_pending ?? 0,
    contacts: data?.contacts.length ?? 0,
    'ns-submissions': nsPendingReview,
    'ns-chat': chatUnreadCount,
    'ns-trendcatch': nsEdu?.active.length ?? 0,
  }

  // Overview = a complete, clickable map of every section. Each card jumps to the
  // tab (filter) that shows that data, staying inside the admin dashboard; the
  // New School roster cards open the in-admin School Dashboard tab (optionally
  // pre-selecting the students/teachers/parents roster). `value` undefined
  // renders an "Open" chip.
  const cnt = data?.counts ?? {}
  const nsSum: Record<string, number> = nsData?.summary ?? {}
  type OvCard = { label: string; value?: number; hint: string; icon: string; tab?: TabKey; to?: string; roster?: 'students' | 'teachers' | 'parents' }
  const overviewGroups: Array<{ title: string; cards: OvCard[] }> = [
    { title: 'People', cards: [
      { label: 'User Accounts', value: data?.members.length ?? 0, hint: 'All registered users', icon: 'members', tab: 'members' },
      { label: 'Pending Approval', value: pendingAccounts, hint: 'Awaiting your review', icon: 'approvals', tab: 'approvals' },
      { label: 'Approved', value: approvedAccounts, hint: 'Live accounts', icon: 'approvals', tab: 'members' },
      { label: 'Rejected', value: rejectedAccounts, hint: 'Declined accounts', icon: 'approvals', tab: 'members' },
      { label: 'Contact Messages', value: data?.contacts.length ?? 0, hint: 'Inbound messages', icon: 'contacts', tab: 'contacts' },
      { label: 'Newsletter', value: data?.subscribers.length ?? 0, hint: 'Subscribers', icon: 'subscribers', tab: 'subscribers' },
    ] },
    { title: 'New School', cards: [
      { label: 'Schools', value: nsSum.schools ?? 0, hint: 'Registered schools', icon: 'school', tab: 'ns-schools' },
      { label: 'Students', value: nsSum.students ?? 0, hint: 'Registered students', icon: 'students', tab: 'ns-schools', roster: 'students' },
      { label: 'Teachers', value: nsSum.teachers ?? 0, hint: 'Registered teachers', icon: 'teachers', tab: 'ns-schools', roster: 'teachers' },
      { label: 'Parents', value: nsSum.parents ?? 0, hint: 'Linked parents', icon: 'parents', tab: 'ns-schools', roster: 'parents' },
      { label: 'Student Submissions', value: nsSubmissions.length, hint: 'Projects to review', icon: 'ns-submissions', tab: 'ns-submissions' },
      { label: 'Business Interviews', value: nsInterviews.length, hint: 'Logged interviews', icon: 'ns-interviews', tab: 'ns-interviews' },
      { label: 'Messages', hint: 'Chat with users', icon: 'ns-chat', tab: 'ns-chat' },
    ] },
    { title: 'Commerce', cards: [
      { label: 'Store Orders', value: orderRows.length, hint: 'Commerce records', icon: 'orders', tab: 'orders' },
      { label: 'Products & Inventory', value: cnt.inventory ?? 0, hint: 'Catalog items', icon: 'inventory', tab: 'inventory' },
      { label: 'Founding Sponsors', value: cnt.sponsors ?? 0, hint: 'Applications', icon: 'sponsors', tab: 'sponsors' },
    ] },
    { title: 'Engagement', cards: [
      { label: 'Service Requests', value: reqRows.length, hint: 'Inbound forms', icon: 'requests', tab: 'requests' },
      { label: 'Event RSVPs', value: cnt.rsvps ?? 0, hint: 'Guest responses', icon: 'rsvps', tab: 'rsvps' },
      { label: 'Community', value: cnt.community ?? 0, hint: 'Discussion threads', icon: 'community', tab: 'community' },
    ] },
    { title: 'Content', cards: [
      { label: 'Awards', value: cnt.awards ?? 0, hint: 'Award entries', icon: 'awards', tab: 'awards' },
      { label: 'Events', value: cnt.events ?? 0, hint: 'Scheduled events', icon: 'events', tab: 'events' },
      { label: 'Blog Posts', value: cnt.blog ?? 0, hint: 'Articles', icon: 'blog', tab: 'blog' },
      { label: 'Testimonials', value: cnt.testimonials ?? 0, hint: 'Published quotes', icon: 'testimonials', tab: 'testimonials' },
      { label: 'Media Library', value: cnt.media ?? 0, hint: 'Images & files', icon: 'media', tab: 'media' },
      { label: 'Gallery', value: cnt.gallery ?? 0, hint: 'Submitted files', icon: 'gallery', tab: 'gallery' },
    ] },
  ]
  const openOvCard = (card: OvCard) => {
    if (card.roster) setSchoolRosterTab(card.roster)
    if (card.tab) setTab(card.tab); else if (card.to) navigate(card.to)
  }

  if (loading) {
    return (
      <div className="admin-page" style={wrapS}>
        <div className="admin-loading glass">
          <span className="admin-kicker">Admin Dashboard</span>
          <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 30, marginTop: 8 }}>Loading secure workspace</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.65 }}>Verifying session and fetching live data...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin(user?.role)) {
    return (
      <div className="admin-page" style={wrapS}>
        <div className="admin-login glass" style={{ maxWidth: 380, margin: '80px auto', padding: 36, borderRadius: 16 }}>
          <span className="admin-kicker">Restricted access</span>
          <h2 className="gold-text" style={{ fontFamily: 'var(--f-serif)', margin: '6px 0 8px' }}>Admin Login</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.65 }}>Sign in with an administrator account.</p>
          <form onSubmit={doLogin}>
            <div className="field"><label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@frantzcoutard.com" /></div>
            <div className="field"><label>Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
            {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}
            {user && !isAdmin(user.role) && <p style={{ color: '#e08a8a', fontSize: 13 }}>This account is not an admin.</p>}
            <button className="btn btn--solid" type="submit" style={{ width: '100%', marginTop: 8 }}>Login</button>
          </form>
        </div>
      </div>
    )
  }

  const activeLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === tab)?.label ?? 'Overview'

  return (
    <div className="admin-page" style={wrapS}>
      <div className={`admin-layout${navOpen ? '' : ' is-nav-collapsed'}`}>
        <button type="button" className="admin-mobilebar" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen}>
          <span>☰&nbsp; Menu</span>
          <span className="admin-mobilebar__hint">{navOpen ? 'Tap to close' : activeLabel}</span>
        </button>
        <aside className="admin-sidebar glass">
          <div className="admin-sidebar__brand">
            <span className="admin-kicker">Admin</span>
            <strong className="gold-text">Command Center</strong>
          </div>
          <nav className="admin-nav" onClick={() => setNavOpen(false)}>
            {NAV_GROUPS.map((group) => (
              <div key={group.group} className="admin-nav__group">
                <span className="admin-nav__group-label">{group.group}</span>
                <div className="admin-nav__items">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`admin-nav__item${tab === item.key ? ' is-active' : ''}`}
                      onClick={() => setTab(item.key)}
                    >
                      <span className="admin-nav__icon" aria-hidden="true"><AdminNavIcon name={item.key} /></span>
                      <span className="admin-nav__label">{item.label}</span>
                      {notifications[item.key] ? <span className="admin-nav__badge admin-nav__badge--notify" title={`${notifications[item.key]} need attention`}>{notifications[item.key]}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="admin-sidebar__foot">
            <a className="btn btn--sm" href="/">View Site</a>
            <button className="btn btn--sm" onClick={() => logout()}>Logout</button>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-main__header glass">
            <div>
              <span className="admin-kicker">Admin Dashboard</span>
              <h1 className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, marginTop: 4 }}>{activeLabel}</h1>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Signed in as {user?.full_name} · {user?.role}</p>
            </div>
          </header>

          {tab === 'overview' && (
            <div className="admin-overview">
              <button
                type="button"
                className="admin-achievement glass"
                onClick={() => setTab('business-requests')}
                title="Open Business Requests"
              >
                <span className="admin-achievement__ico" aria-hidden="true">🎓</span>
                <span className="admin-achievement__body">
                  <strong className="admin-achievement__num gold-text">{data?.counts?.internships_confirmed ?? 0}</strong>
                  <span className="admin-achievement__label">Successful Internship{(data?.counts?.internships_confirmed ?? 0) === 1 ? '' : 's'} placed</span>
                  <span className="admin-achievement__hint">Students hired through the challenge — fully approved by admin, student & parent.</span>
                </span>
              </button>
              {approvalQueueCount > 0 && (
                <div className="admin-overview__cta glass">
                  <div>
                    <strong className="gold-text">{approvalQueueCount} account{approvalQueueCount === 1 ? '' : 's'} awaiting review</strong>
                    <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Approve or reject pending registrations from the People section.</p>
                  </div>
                  <button type="button" className="btn btn--sm btn--solid" onClick={() => setTab('approvals')}>Open approvals</button>
                </div>
              )}
              <div className="admin-ov-tabs" role="tablist" aria-label="Overview sections">
                {overviewGroups.map((group) => (
                  <button
                    key={group.title}
                    type="button"
                    role="tab"
                    aria-selected={ovGroup === group.title}
                    className={`admin-ov-tab${ovGroup === group.title ? ' is-active' : ''}`}
                    onClick={() => setOvGroup(group.title)}
                  >
                    {group.title}
                  </button>
                ))}
              </div>
              {(overviewGroups.find((g) => g.title === ovGroup) ?? overviewGroups[0]) && (
                <div className="admin-stats">
                  {(overviewGroups.find((g) => g.title === ovGroup) ?? overviewGroups[0]).cards.map((card) => (
                    <button
                      key={card.label}
                      type="button"
                      className="admin-stat admin-stat--btn glass"
                      onClick={() => openOvCard(card)}
                      title={`Open ${card.label}`}
                    >
                      <span className="admin-stat__icon" aria-hidden="true"><AdminNavIcon name={card.icon} /></span>
                      <span className="admin-stat__label">{card.label}</span>
                      <strong>{card.value === undefined ? 'Open' : card.value}</strong>
                      <p>{card.hint}</p>
                      <span className="admin-stat__go" aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <>
              {renderNsExportBar()}
              <AnalyticsAdmin />
            </>
          )}

          {tab === 'traffic' && <TrafficAdmin />}

        {tab === 'requests' && (
          <>
            <StatChips items={[
              { label: 'Total', value: reqRows.length },
              { label: 'New', value: reqBy('new'), tone: 'gold' },
              { label: 'Reviewed', value: reqBy('reviewed'), tone: 'blue' },
              { label: 'Approved', value: reqBy('approved'), tone: 'green' },
              { label: 'Closed', value: reqBy('closed'), tone: 'muted' },
            ]} />
            <DataTable
              stack
              head={['Type', 'Name', 'Email', 'Org', 'Message', 'Status', 'Date', '']}
              rows={data?.requests ?? []}
              searchPlaceholder="Search requests…"
              searchText={(r) => `${r.request_type} ${r.full_name} ${r.email} ${r.organization ?? ''} ${r.message ?? ''}`}
              statusOf={(r) => r.status}
              statusOptions={['new', 'reviewed', 'approved', 'closed']}
              rowId={(r) => r.id}
              bulkActions={[{ label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/request', ids, 'request') }]}
              renderRow={(r, checkbox) => (
                <tr key={r.id}>{checkbox}
                  <td data-label="Type">{r.request_type}</td>
                  <td data-label="Name">{r.full_name}</td>
                  <td data-label="Email">{r.email}</td>
                  <td data-label="Org">{r.organization || '—'}</td>
                  <td data-label="Message" className="admin-cell--wrap">{r.message || '—'}</td>
                  <td data-label="Status">
                    <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} style={selectS}>
                      <option value="new">new</option>
                      <option value="reviewed">reviewed</option>
                      <option value="approved">approved</option>
                      <option value="closed">closed</option>
                    </select>
                  </td>
                  <td data-label="Date">{r.created_at}</td>
                  <td><RowMenu actions={[{ label: 'Delete request', danger: true, onClick: () => void deleteRow(`admin/request/${r.id}`, 'Delete this request? This cannot be undone.') }]} /></td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'orders' && (
          <>
            <StatChips items={[
              { label: 'Total', value: orderRows.length },
              { label: 'Pending', value: ordBy('pending'), tone: 'gold' },
              { label: 'Paid', value: ordBy('paid'), tone: 'green' },
              { label: 'Fulfilled', value: ordBy('fulfilled'), tone: 'green' },
              { label: 'Cancelled', value: ordBy('cancelled'), tone: 'red' },
              { label: 'Revenue', value: `$${orderRevenue.toFixed(2)}`, tone: 'gold' },
            ]} />
            <DataTable
              stack
              head={['Order #', 'Customer', 'Email', 'Items', 'Total', 'Payment', 'Order Status', 'Date', '']}
              rows={data?.orders ?? []}
              searchPlaceholder="Search orders…"
              searchText={(o) => `${o.order_no} ${o.customer_name} ${o.email}`}
              statusOf={(o) => o.status}
              statusOptions={['pending', 'paid', 'fulfilled', 'cancelled']}
              rowId={(o) => o.id}
              bulkActions={[{ label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/order', ids, 'order') }]}
              renderRow={(o, checkbox) => {
                let items = ''
                try { items = (JSON.parse(o.items) as Array<{ name: string; qty: number; size: string }>).map((it) => `${it.qty}× ${it.name} (${it.size})`).join(', ') } catch { items = '—' }
                return (
                  <tr key={o.id}>{checkbox}
                    <td data-label="Order #">{o.order_no}</td>
                    <td data-label="Customer">{o.customer_name}</td>
                    <td data-label="Email">{o.email}</td>
                    <td data-label="Items" className="admin-cell--wrap">{items}</td>
                    <td data-label="Total">${o.total}</td>
                    <td data-label="Payment">{[o.payment_provider, o.payment_status, o.payment_method].filter(Boolean).join(' · ')}</td>
                    <td data-label="Order Status">
                      <select value={o.status} onChange={(e) => setOrderStatus(o.id, e.target.value)} style={selectS}>
                        <option value="pending">pending</option>
                        <option value="paid">paid</option>
                        <option value="fulfilled">fulfilled</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    </td>
                    <td data-label="Date">{o.created_at}</td>
                    <td><RowMenu actions={[{ label: 'Delete order', danger: true, onClick: () => void deleteRow(`admin/order/${o.id}`, `Delete order ${o.order_no}? This permanently removes the record.`) }]} /></td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'subscribers' && (
          <>
            <StatChips items={[{ label: 'Subscribers', value: data?.subscribers.length ?? 0, tone: 'gold' }]} />
            <DataTable
              stack
              head={['Email', 'Subscribed', '']}
              rows={data?.subscribers ?? []}
              searchPlaceholder="Search subscribers…"
              searchText={(s) => s.email}
              rowId={(s) => s.id}
              bulkActions={[{ label: 'Remove selected', danger: true, onClick: (ids) => bulkDelete('admin/subscriber', ids, 'subscriber') }]}
              renderRow={(s, checkbox) => (
                <tr key={s.id}>{checkbox}
                  <td data-label="Email">{s.email}</td>
                  <td data-label="Subscribed">{s.created_at}</td>
                  <td><RowMenu actions={[{ label: 'Remove subscriber', danger: true, onClick: () => void deleteRow(`admin/subscriber/${s.id}`, `Remove ${s.email} from the newsletter list?`) }]} /></td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'contacts' && (
          <>
            <StatChips items={[{ label: 'Messages', value: data?.contacts.length ?? 0, tone: 'gold' }]} />
            <DataTable
              head={['Name', 'Email', 'Message', 'Date', '']}
              rows={data?.contacts ?? []}
              searchPlaceholder="Search contacts…"
              searchText={(c) => `${c.full_name} ${c.email} ${c.message ?? ''}`}
              rowId={(c) => c.id}
              bulkActions={[{ label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/contact', ids, 'message') }]}
              renderRow={(c, checkbox) => (
                <tr key={c.id}>{checkbox}
                  <td>{c.full_name}</td>
                  <td>{c.email}</td>
                  <td>{c.message || '—'}</td>
                  <td>{c.created_at}</td>
                  <td><RowMenu actions={[{ label: 'Delete message', danger: true, onClick: () => void deleteRow(`admin/contact/${c.id}`, 'Delete this contact message?') }]} /></td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'members' && (
          <>
            <StatChips items={[
              { label: 'Total', value: data?.members.length ?? 0 },
              { label: 'Approved', value: approvedAccounts, tone: 'green' },
              { label: 'Pending', value: pendingAccounts, tone: 'gold' },
              { label: 'Rejected', value: rejectedAccounts, tone: 'red' },
            ]} />
            <DataTable
              head={['#', 'Name', 'User ID', 'Email', 'Role', 'Status', 'Joined', '']}
              rows={data?.members ?? []}
              searchPlaceholder="Search accounts…"
              searchText={(m) => `${m.full_name} ${m.email} ${m.role} ${m.id}`}
              statusOf={(m) => (isAdmin(m.role) ? 'approved' : (m.approval_status || 'pending'))}
              statusOptions={['approved', 'pending', 'rejected']}
              filter2Of={(m) => m.role}
              filter2Options={memberRoles}
              filter2AllLabel="All roles"
              rowId={(m) => m.id}
              rowSelectable={(m) => !isAdmin(m.role)}
              bulkActions={[
                { label: 'Approve selected', onClick: (ids) => bulkSetApproval(ids, 'approved') },
                { label: 'Reject selected', danger: true, onClick: (ids) => bulkSetApproval(ids, 'rejected') },
                { label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/user', ids, 'account') },
              ]}
              renderRow={(m, checkbox, index) => {
                const adminAccount = isAdmin(m.role)
                const status = adminAccount ? 'protected' : (m.approval_status || 'pending').toLowerCase()
                return (
                  <tr key={m.id}>{checkbox}
                    <td className="admin-table__idx">{index}</td>
                    <td>{m.full_name}</td>
                    <td className="admin-table__uid">#{m.id}</td>
                    <td>{m.email}</td>
                    <td>{m.role}</td>
                    <td><StatusPill status={status} /></td>
                    <td className="admin-table__date">{fmtDate(m.created_at)}</td>
                    <td>
                      {adminAccount ? (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Protected</span>
                      ) : (
                        <RowMenu actions={[
                          { label: viewBusyId === m.id ? 'Opening…' : 'View dashboard', onClick: () => void viewAsUser(m), disabled: viewBusyId === m.id },
                          { label: 'Details', onClick: () => void openUserDetails(m) },
                          { label: 'Approve', onClick: () => void setApproval(m.id, 'approved'), disabled: status === 'approved' },
                          { label: 'Keep pending', onClick: () => void setApproval(m.id, 'pending'), disabled: status === 'pending' },
                          { label: 'Reject', onClick: () => void setApproval(m.id, 'rejected'), disabled: status === 'rejected' },
                          { label: 'Delete account', danger: true, onClick: () => void deleteRow(`admin/user/${m.id}`, `Permanently delete ${m.full_name}'s account? This cannot be undone.`) },
                        ]} />
                      )}
                    </td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'approvals' && (
          <>
            <StatChips items={[
              { label: 'Pending', value: pendingAccounts, tone: 'gold' },
              { label: 'Rejected', value: rejectedAccounts, tone: 'red' },
              { label: 'Approved', value: approvedAccounts, tone: 'green' },
            ]} />
            <DataTable
              head={['#', 'Name', 'User ID', 'Email', 'Role', 'Status', 'Reviewed', '']}
              rows={(data?.members ?? []).filter((m) => !isAdmin(m.role) && (m.approval_status || 'pending') !== 'approved')}
              searchPlaceholder="Search pending accounts…"
              searchText={(m) => `${m.full_name} ${m.email} ${m.role} ${m.id}`}
              statusOf={(m) => (m.approval_status || 'pending')}
              statusOptions={['pending', 'rejected']}
              filter2Of={(m) => m.role}
              filter2Options={reviewableRoles}
              filter2AllLabel="All roles"
              rowId={(m) => m.id}
              bulkActions={[
                { label: 'Approve selected', onClick: (ids) => bulkSetApproval(ids, 'approved') },
                { label: 'Reject selected', danger: true, onClick: (ids) => bulkSetApproval(ids, 'rejected') },
                { label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/user', ids, 'account') },
              ]}
              renderRow={(m, checkbox, index) => {
                const status = (m.approval_status || 'pending').toLowerCase()
                return (
                  <tr key={m.id}>{checkbox}
                    <td className="admin-table__idx">{index}</td>
                    <td>{m.full_name}</td>
                    <td className="admin-table__uid">#{m.id}</td>
                    <td>{m.email}</td>
                    <td>{m.role}</td>
                    <td><StatusPill status={status} /></td>
                    <td>{m.approval_reviewed_at || '—'}</td>
                    <td>
                      <RowMenu actions={[
                        { label: viewBusyId === m.id ? 'Opening…' : 'View dashboard', onClick: () => void viewAsUser(m), disabled: viewBusyId === m.id },
                        { label: 'Details', onClick: () => void openUserDetails(m) },
                        { label: 'Approve', onClick: () => void setApproval(m.id, 'approved'), disabled: status === 'approved' },
                        { label: 'Keep pending', onClick: () => void setApproval(m.id, 'pending'), disabled: status === 'pending' },
                        { label: 'Reject', onClick: () => void setApproval(m.id, 'rejected'), disabled: status === 'rejected' },
                        { label: 'Delete account', danger: true, onClick: () => void deleteRow(`admin/user/${m.id}`, `Permanently delete ${m.full_name}'s account? This cannot be undone.`) },
                      ]} />
                    </td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'ns-schools' && (
          <>
            {renderNsExportBar()}
            <div className="ns-school-toolbar">
              <label className="ns-school-select">
                <span>School</span>
                <select value={schoolDashId} onChange={(e) => { setSchoolDashId(e.target.value); setSchoolRosterTab('students') }}>
                  <option value="">All schools</option>
                  {nsSchools.map((s: any) => <option key={s.id} value={s.id}>{s.school_name}</option>)}
                </select>
              </label>
              {selectedDashSchool && <button type="button" className="btn btn--sm" onClick={() => setSchoolDashId('')}>? All schools</button>}
            </div>

            {!selectedDashSchool ? (
              <>
                <StatChips items={[
                  { label: 'Schools', value: nsSchools.length },
                  { label: 'Students', value: nsStudents.length, tone: 'gold' },
                  { label: 'Teachers', value: nsTeachers.length, tone: 'blue' },
                  { label: 'Parents', value: nsParents.length, tone: 'green' },
                ]} />

                <div className="admin-section-bar">
                  <span className="admin-section-bar__title">{nsSchools.length} school{nsSchools.length === 1 ? '' : 's'}</span>
                  <div className="admin-viewtoggle" role="group" aria-label="View mode">
                    <button type="button" className={schoolsView === 'table' ? 'is-active' : ''} onClick={() => setSchoolsView('table')} title="Table view" aria-label="Table view">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="2.25" width="14" height="2.5" rx="1" /><rect x="1" y="6.75" width="14" height="2.5" rx="1" /><rect x="1" y="11.25" width="14" height="2.5" rx="1" /></svg>
                    </button>
                    <button type="button" className={schoolsView === 'grid' ? 'is-active' : ''} onClick={() => setSchoolsView('grid')} title="Grid view" aria-label="Grid view">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
                    </button>
                  </div>
                </div>

                {nsSchools.length === 0 ? (
                  <p style={{ color: 'var(--muted)' }}>No schools registered yet.</p>
                ) : schoolsView === 'grid' ? (
                  <div className="admin-stats">
                    {pagedSchools.map((s: any) => (
                      <button key={s.id} type="button" className="admin-stat admin-stat--btn glass" onClick={() => { setSchoolDashId(String(s.id)); setSchoolRosterTab('students') }} title={`Open ${s.school_name}`}>
                        <span className="admin-stat__icon" aria-hidden="true"><AdminNavIcon name="school" /></span>
                        <span className="admin-stat__label">{s.school_name}</span>
                        <strong>{studentsInSchool(Number(s.id)).length}</strong>
                        <p>{(s.school_district || '—')} · {s.status}</p>
                        <span className="admin-stat__go" aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="admin-table-wrap glass">
                    <table className="admin-table admin-table--stack">
                      <thead>
                        <tr><th className="admin-table__idx">#</th><th>School</th><th>District</th><th>Status</th><th>Students</th><th></th></tr>
                      </thead>
                      <tbody>
                        {pagedSchools.map((s: any, i: number) => (
                          <tr key={s.id} className="admin-row--clickable" onClick={() => { setSchoolDashId(String(s.id)); setSchoolRosterTab('students') }}>
                            <td className="admin-table__idx">{(schoolsSafePage - 1) * SCHOOLS_PAGE_SIZE + i + 1}</td>
                            <td data-label="School">{s.school_name}</td>
                            <td data-label="District">{s.school_district || '—'}</td>
                            <td data-label="Status"><StatusPill status={(s.status || '').toLowerCase()} /></td>
                            <td data-label="Students">{studentsInSchool(Number(s.id)).length}</td>
                            <td><span className="admin-linkcell">Open →</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {nsSchools.length > SCHOOLS_PAGE_SIZE && (
                  <div className="admin-pager">
                    <button type="button" className="btn btn--sm" disabled={schoolsSafePage <= 1} onClick={() => setSchoolsPage(schoolsSafePage - 1)}>‹ Prev</button>
                    <span className="admin-pager__info">Page {schoolsSafePage} of {schoolsTotalPages} · {nsSchools.length} schools</span>
                    <button type="button" className="btn btn--sm" disabled={schoolsSafePage >= schoolsTotalPages} onClick={() => setSchoolsPage(schoolsSafePage + 1)}>Next ›</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ns-school-head glass">
                  <div>
                    <span className="eyebrow">School &amp; Principal</span>
                    <h3 className="gold-text">{selectedDashSchool.school_name}</h3>
                    <p className="ns-school-head__meta">{[selectedDashSchool.school_district, selectedDashSchool.status].filter(Boolean).join(' · ')}</p>
                    <div className="ns-school-head__facts">
                      {selectedDashSchool.principal_name && <span><b>Principal:</b> {selectedDashSchool.principal_name}</span>}
                      {selectedDashSchool.administrator_name && <span><b>Administrator:</b> {selectedDashSchool.administrator_name}</span>}
                      {selectedDashSchool.administrator_email && <span><b>Email:</b> {selectedDashSchool.administrator_email}</span>}
                      {(selectedDashSchool.administrator_phone || selectedDashSchool.main_phone) && <span><b>Phone:</b> {selectedDashSchool.administrator_phone || selectedDashSchool.main_phone}</span>}
                      {selectedDashSchool.school_address && <span><b>Address:</b> {selectedDashSchool.school_address}</span>}
                    </div>
                  </div>
                </div>

                <StatChips items={[
                  { label: 'Students', value: studentsInSchool(Number(selectedDashSchool.id)).length, tone: 'gold' },
                  { label: 'Teachers', value: teachersInSchool(Number(selectedDashSchool.id)).length, tone: 'blue' },
                  { label: 'Parents', value: parentsInSchool(Number(selectedDashSchool.id)).length, tone: 'green' },
                ]} />

                <div className="admin-ov-tabs" role="tablist" aria-label="School roster" style={{ marginBottom: 14 }}>
                  {(['students', 'teachers', 'parents'] as const).map((rt) => (
                    <button key={rt} type="button" role="tab" aria-selected={schoolRosterTab === rt}
                      className={`admin-ov-tab${schoolRosterTab === rt ? ' is-active' : ''}`} onClick={() => setSchoolRosterTab(rt)}>
                      {rt === 'students' ? 'Students' : rt === 'teachers' ? 'Teachers' : 'Parents'}
                    </button>
                  ))}
                </div>

                {schoolRosterTab === 'students' && (
                  <DataTable
                    stack
                    head={['#', 'Rank', 'Student', 'Participant', 'Points', 'Interviews', 'Status', '']}
                    rows={studentsInSchool(Number(selectedDashSchool.id)).slice().sort(byRank)}
                    searchPlaceholder="Search students…"
                    searchText={(s: any) => `${s.full_name ?? ''} ${s.participant_id ?? ''}`}
                    rowId={(s: any) => s.id}
                    renderRow={(s: any, _cb: any, i?: number) => (
                      <tr key={s.id} className="admin-row--clickable" onClick={() => openStudentProfile(Number(s.id))}>
                        <td className="admin-table__idx">{i}</td>
                        <td data-label="Rank">#{s.rank_position ?? '—'}</td>
                        <td data-label="Student">{s.full_name}</td>
                        <td data-label="Participant" className="admin-table__uid">{s.participant_id || '—'}</td>
                        <td data-label="Points">{s.final_score ?? s.student_points ?? 0}</td>
                        <td data-label="Interviews">{s.interview_count ?? 0}/10</td>
                        <td data-label="Status">{s.submission_status || '—'}</td>
                        <td><span className="admin-linkcell">View →</span></td>
                      </tr>
                    )}
                  />
                )}
                {schoolRosterTab === 'teachers' && (
                  <DataTable
                    stack
                    head={['#', 'Rank', 'Teacher', 'Students', 'Points', 'Status', '']}
                    rows={teachersInSchool(Number(selectedDashSchool.id)).slice().sort(byRank)}
                    searchPlaceholder="Search teachers…"
                    searchText={(t: any) => `${t.teacher_full_name ?? ''} ${t.role_department ?? ''}`}
                    rowId={(t: any) => t.id}
                    renderRow={(t: any, _cb: any, i?: number) => (
                      <tr key={t.id} className="admin-row--clickable" onClick={() => openTeacherProfile(Number(t.id))}>
                        <td className="admin-table__idx">{i}</td>
                        <td data-label="Rank">#{t.rank_position ?? '—'}</td>
                        <td data-label="Teacher">{t.teacher_full_name}</td>
                        <td data-label="Students">{t.students_total ?? 0}</td>
                        <td data-label="Points">{t.teacher_points ?? 0}</td>
                        <td data-label="Status">{t.status || '—'}</td>
                        <td><span className="admin-linkcell">View →</span></td>
                      </tr>
                    )}
                  />
                )}
                {schoolRosterTab === 'parents' && (
                  <DataTable
                    stack
                    head={['#', 'Parent', 'Student', 'Relationship', 'Link status']}
                    rows={parentsInSchool(Number(selectedDashSchool.id))}
                    searchPlaceholder="Search parents…"
                    searchText={(p: any) => `${p.parent_full_name ?? ''} ${p.student_name ?? ''}`}
                    rowId={(p: any) => p.id}
                    renderRow={(p: any, _cb: any, i?: number) => (
                      <tr key={p.id} className={p.student_id ? 'admin-row--clickable' : ''} onClick={() => p.student_id && openStudentProfile(Number(p.student_id))}>
                        <td className="admin-table__idx">{i}</td>
                        <td data-label="Parent">{p.parent_full_name || '—'}</td>
                        <td data-label="Student">{p.student_name || '—'}</td>
                        <td data-label="Relationship">{p.relationship || p.relationship_to_student || '—'}</td>
                        <td data-label="Link status">{p.link_status || '—'}</td>
                      </tr>
                    )}
                  />
                )}
              </>
            )}
          </>
        )}

        {tab === 'ns-ranking' && (
          <>
            <div className="ns-school-toolbar">
              <label className="ns-school-select">
                <span>School</span>
                <select value={rankSchoolId} onChange={(e) => setRankSchoolId(e.target.value)}>
                  <option value="">All schools (global)</option>
                  {nsSchools.map((s: any) => <option key={s.id} value={s.id}>{s.school_name}</option>)}
                </select>
              </label>
              {selectedRankSchool && <button type="button" className="btn btn--sm" onClick={() => setRankSchoolId('')}>? Global ranking</button>}
            </div>

            {!selectedRankSchool ? (
              <>
                <div className="ns-rank-section">
                  <h4 className="ns-rank-title">School ranking</h4>
                  <DataTable
                    stack
                    head={['Rank', 'School', 'Students', 'Movement']}
                    rows={nsSchoolRankings}
                    searchPlaceholder="Search schools…"
                    searchText={(s: any) => `${s.school_name ?? ''}`}
                    rowId={(s: any) => s.school_id}
                    renderRow={(s: any) => (
                      <tr key={s.school_id} className="admin-row--clickable" onClick={() => setRankSchoolId(String(s.school_id))}>
                        <td data-label="Rank"><span className={`ns-rankrow__rank${(s.rank ?? 99) <= 3 ? ' is-top' : ''}`}>#{s.rank}</span></td>
                        <td data-label="School">{s.school_name}</td>
                        <td data-label="Students">{s.student_count}</td>
                        <td data-label="Movement">{s.movement > 0 ? `? ${s.movement}` : s.movement < 0 ? `? ${Math.abs(s.movement)}` : '—'}</td>
                      </tr>
                    )}
                  />
                </div>
                <div className="ns-rank-columns">
                  <div className="ns-rank-col glass"><h4 className="ns-rank-title">Top students (global)</h4>{renderRankList(nsStudents.slice().sort(byRank).slice(0, 10), 'student')}</div>
                  <div className="ns-rank-col glass"><h4 className="ns-rank-title">Top teachers (global)</h4>{renderRankList(nsTeachers.slice().sort(byRank).slice(0, 10), 'teacher')}</div>
                </div>
              </>
            ) : (
              <>
                <div className="ns-school-head glass">
                  <div>
                    <span className="eyebrow">School ranking</span>
                    <h3 className="gold-text">{selectedRankSchool.school_name}</h3>
                    <p className="ns-school-head__meta">Top students &amp; teachers · click anyone to read full details</p>
                  </div>
                </div>
                <div className="ns-rank-columns">
                  <div className="ns-rank-col glass"><h4 className="ns-rank-title">Top students</h4>{renderRankList(studentsInSchool(Number(selectedRankSchool.id)).slice().sort(byRank), 'student')}</div>
                  <div className="ns-rank-col glass"><h4 className="ns-rank-title">Top teachers</h4>{renderRankList(teachersInSchool(Number(selectedRankSchool.id)).slice().sort(byRank), 'teacher')}</div>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'ns-submissions' && (
          <>
            <StatChips items={[
              { label: 'Total', value: nsSubmissions.length },
              { label: 'Pending', value: nsSubBy('submitted'), tone: 'gold' },
              { label: 'Approved', value: nsSubBy('approved'), tone: 'green' },
              { label: 'Rejected', value: nsSubBy('rejected'), tone: 'red' },
              { label: 'Winners', value: nsSubBy('winner'), tone: 'blue' },
            ]} />
            <div className="admin-filterbar">
              <select value={subSchool} onChange={(e) => setSubSchool(e.target.value)} aria-label="Filter by school">
                <option value="">All schools</option>
                {nsSchools.map((sc: any) => <option key={sc.id} value={String(sc.id)}>{sc.school_name}</option>)}
              </select>
              <label className="admin-filterbar__date"><span>From</span><input type="date" value={subFrom} onChange={(e) => setSubFrom(e.target.value)} /></label>
              <label className="admin-filterbar__date"><span>To</span><input type="date" value={subTo} onChange={(e) => setSubTo(e.target.value)} /></label>
              <label className="admin-filterbar__check"><input type="checkbox" checked={subStarred} onChange={(e) => setSubStarred(e.target.checked)} /> Starred only</label>
              {(subSchool || subFrom || subTo || subStarred) && <button type="button" className="btn btn--sm" onClick={() => { setSubSchool(''); setSubFrom(''); setSubTo(''); setSubStarred(false) }}>Clear filters</button>}
            </div>
            <DataTable
              stack
              head={['#', 'Participant', 'Student', 'Problem', 'Status', 'Score', '★', '']}
              rows={subFiltered}
              searchPlaceholder="Search submissions…"
              searchText={(s) => `${s.student_name ?? ''} ${s.participant_id ?? ''} ${s.problem_identified ?? ''}`}
              statusOf={(s) => (s.status || '')}
              statusOptions={['submitted', 'approved', 'rejected', 'winner', 'draft']}
              rowId={(s) => s.id}
              bulkActions={[
                { label: 'Approve selected', onClick: (ids) => bulkReviewSubmissions(ids, 'approved') },
                { label: 'Reject selected', danger: true, onClick: (ids) => bulkReviewSubmissions(ids, 'rejected') },
              ]}
              renderRow={(s, checkbox, index) => {
                const st = (s.status || '').toLowerCase()
                return (
                  <tr key={s.id}>{checkbox}
                    <td className="admin-table__idx">{index}</td>
                    <td className="admin-table__uid" data-label="Participant">{s.participant_id || '—'}</td>
                    <td data-label="Student"><button type="button" className="admin-linkcell" onClick={() => setNsDetail({ kind: 'project', record: s })}>{s.student_name}</button></td>
                    <td data-label="Problem" className="admin-cell--wrap">
                      <button type="button" className="admin-linkcell" style={{ textAlign: 'inherit' }} onClick={() => setNsDetail({ kind: 'project', record: s })}>
                        {s.problem_identified ? `${String(s.problem_identified).slice(0, 80)}${String(s.problem_identified).length > 80 ? '…' : ''}` : 'View details'}
                      </button>
                    </td>
                    <td data-label="Status"><StatusPill status={st} /></td>
                    <td data-label="Score">{s.score ?? '—'}</td>
                    <td data-label="Star">
                      <button type="button" className={`ns-star${Number(s.is_starred) ? ' is-on' : ''}`} title={Number(s.is_starred) ? 'Unstar' : 'Star'} aria-label="Toggle star" onClick={() => void toggleStar('submission', s.id, !Number(s.is_starred))}>{Number(s.is_starred) ? '★' : '☆'}</button>
                    </td>
                    <td>
                      <RowMenu actions={[
                        { label: 'View full details', onClick: () => setNsDetail({ kind: 'project', record: s }) },
                        { label: 'Judge scores', onClick: () => setScoreModal({ id: s.id, name: s.student_name || '' }) },
                        { label: 'Approve + bonus points', onClick: () => openApproveBonus(s), disabled: st === 'approved' || st === 'winner' },
                        { label: 'Reject', danger: true, onClick: () => void reviewSubmission(s.id, 'rejected'), disabled: st === 'rejected' },
                        { label: 'Open in New School dashboard', onClick: () => navigate('/new-school/dashboard') },
                      ]} />
                    </td>
                  </tr>
                )
              }}
            />
          </>
        )}

        {tab === 'ns-judges' && <JudgesAdminPanel />}

        {tab === 'ns-timeline' && <TimelineAdmin />}

        {tab === 'ns-interviews' && (
          <>
            <StatChips items={[{ label: 'Business Interviews', value: nsInterviews.length, tone: 'gold' }]} />
            <div className="admin-filterbar">
              <select value={intSchool} onChange={(e) => setIntSchool(e.target.value)} aria-label="Filter by school">
                <option value="">All schools</option>
                {nsSchools.map((sc: any) => <option key={sc.id} value={String(sc.id)}>{sc.school_name}</option>)}
              </select>
              <select value={intCategory} onChange={(e) => setIntCategory(e.target.value)} aria-label="Filter by category">
                <option value="">All categories</option>
                {intCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="admin-filterbar__date"><span>From</span><input type="date" value={intFrom} onChange={(e) => setIntFrom(e.target.value)} /></label>
              <label className="admin-filterbar__date"><span>To</span><input type="date" value={intTo} onChange={(e) => setIntTo(e.target.value)} /></label>
              <label className="admin-filterbar__check"><input type="checkbox" checked={intStarred} onChange={(e) => setIntStarred(e.target.checked)} /> Starred only</label>
              {(intSchool || intCategory || intFrom || intTo || intStarred) && <button type="button" className="btn btn--sm" onClick={() => { setIntSchool(''); setIntCategory(''); setIntFrom(''); setIntTo(''); setIntStarred(false) }}>Clear filters</button>}
            </div>
            <DataTable
              stack
              head={['#', 'Student', 'Participant', 'Business', 'Visit', 'Date', '★', '']}
              rows={intFiltered}
              searchPlaceholder="Search interviews…"
              searchText={(b) => `${b.student_name ?? ''} ${b.participant_id ?? ''} ${b.business_name ?? ''}`}
              renderRow={(b, _checkbox, index) => (
                <tr key={b.id} className="admin-row--clickable" onClick={() => setNsDetail({ kind: 'interview', record: b })}>
                  <td className="admin-table__idx">{index}</td>
                  <td data-label="Student">{b.student_name}</td>
                  <td className="admin-table__uid" data-label="Participant">{b.participant_id || '—'}</td>
                  <td data-label="Business">{b.business_name}</td>
                  <td data-label="Visit">{b.visit_number ?? '—'}</td>
                  <td data-label="Date">{b.date_of_visit || b.created_at || '—'}</td>
                  <td data-label="Star" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className={`ns-star${Number(b.is_starred) ? ' is-on' : ''}`} title={Number(b.is_starred) ? 'Unstar' : 'Star'} aria-label="Toggle star" onClick={() => void toggleStar('interview', b.id, !Number(b.is_starred))}>{Number(b.is_starred) ? '★' : '☆'}</button>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <RowMenu actions={[
                      { label: 'View full details', onClick: () => setNsDetail({ kind: 'interview', record: b }) },
                      { label: 'Award bonus points (max 5)', onClick: () => openInterviewBonus(b) },
                    ]} />
                  </td>
                </tr>
              )}
            />
          </>
        )}

        {tab === 'ns-chat' && (
          <div className="admin-chat">
            <div className="admin-chat__list">
              <div className="admin-chat__list-head">
                <span>Conversations</span>
                <div className="admin-chat__list-meta">
                  {chatUnreadCount > 0 && <span className="admin-chat__notify">{chatUnreadCount}</span>}
                  <span>{chatThreads.length}</span>
                </div>
              </div>
              <div className="admin-chat__search">
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search any user to chat (name, email, role)"
                />
              </div>
              {chatThreads.length === 0 && !chatSearch.trim() && (
                <p className="admin-chat__empty">No messages yet. Search a name above to start a chat.</p>
              )}
              {filteredChatThreads.map((t: any) => (
                <button
                  key={t.thread_user_id}
                  type="button"
                  className={`admin-chat__thread${chatActiveUser === Number(t.thread_user_id) ? ' is-active' : ''}`}
                  onClick={() => void openChatThread(Number(t.thread_user_id))}
                >
                  <div className="admin-chat__thread-head">
                    <strong>{t.full_name || `User #${t.thread_user_id}`}</strong>
                    <div className="admin-chat__thread-actions">
                      {Number(t.unread_count || 0) > 0 && <span className="admin-chat__notify">{Number(t.unread_count)}</span>}
                      <button
                        type="button"
                        className="admin-chat__remove"
                        onClick={(e) => { e.stopPropagation(); void removeChatThread(Number(t.thread_user_id)) }}
                        aria-label={`Remove ${t.full_name || `User #${t.thread_user_id}`}`}
                        title="Remove from admin view"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <span>{t.role} · {t.total} msg{Number(t.total) === 1 ? '' : 's'}</span>
                </button>
              ))}
              {chatUserResults.length > 0 && (
                <div className="admin-chat__results">
                  <span className="admin-chat__results-label">Start a new chat</span>
                  {chatUserResults.map((m: any) => (
                    <button
                      key={`new-${m.id}`}
                      type="button"
                      className={`admin-chat__thread admin-chat__thread--new${chatActiveUser === Number(m.id) ? ' is-active' : ''}`}
                      onClick={() => void openChatThread(Number(m.id))}
                    >
                      <div className="admin-chat__thread-head"><strong>{m.full_name || `User #${m.id}`}</strong></div>
                      <span>{m.role}{m.email ? ` · ${m.email}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {chatSearch.trim() && filteredChatThreads.length === 0 && chatUserResults.length === 0 && (
                <p className="admin-chat__empty">No people match your search.</p>
              )}
            </div>
            <div className="admin-chat__pane">
              {!chatActiveUser ? (
                <p className="admin-chat__empty">Select a conversation to read and reply.</p>
              ) : (
                <>
                  <div className="admin-chat__pane-head">
                    <strong>{activeChatName}</strong>
                    <button type="button" className="btn btn--sm" onClick={() => void clearAdminChat()}>Clear chat</button>
                  </div>
                  <div className="admin-chat__log">
                    {chatMessages.length === 0 && <p className="admin-chat__empty">No messages in your view.</p>}
                    {chatMessages.map((m: any) => (
                      <div key={m.id} className={`admin-chat__msg admin-chat__msg--${m.sender === 'admin' ? 'me' : 'user'}`}>
                        <span className="admin-chat__who">{m.sender === 'admin' ? 'You (Admin)' : 'User'}</span>
                        <p>{m.body}</p>
                        <span className="admin-chat__time">{m.created_at}</span>
                      </div>
                    ))}
                  </div>
                  <form className="admin-chat__form" onSubmit={sendAdminChat}>
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type a reply…" maxLength={2000} />
                    <button className="btn btn--solid btn--sm" type="submit" disabled={chatBusy || !chatInput.trim()}>{chatBusy ? 'Sending…' : 'Send'}</button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'ns-trendcatch' && (
          <>
            <StatChips items={[
              { label: 'Unclaimed schools', value: nsEdu?.active.length ?? 0, tone: 'gold' },
              { label: 'Members waiting', value: (nsEdu?.active ?? []).reduce((n: number, s: any) => n + (Number(s.user_count) || 0), 0) },
              { label: 'Claimed (history)', value: nsEdu?.history.length ?? 0, tone: 'green' },
            ]} />
            <p className="ns-edu-intro">
              Schools that joined through &ldquo;Register under TrendCatch EDU&rdquo; (their school wasn&rsquo;t listed yet). You steward each one — approve its teachers &amp; students and <strong>Make live</strong> so it appears in the public dropdown — until a principal <strong>claims</strong> it and takes over.
            </p>

            {(nsEdu?.active ?? []).length === 0 && (
              <Table head={['TrendCatch EDU']}><tr><td style={tdS}>No unclaimed schools right now.</td></tr></Table>
            )}

            {(nsEdu?.active ?? []).map((school: any) => {
              const open = eduExpanded === school.id
              const claiming = claimSchoolId === school.id
              const teacherRows = Array.isArray(school.teachers) ? school.teachers : []
              const studentRows = Array.isArray(school.students) ? school.students : []
              const teacherPageCount = Math.max(1, Math.ceil(teacherRows.length / EDU_PEOPLE_PAGE_SIZE))
              const studentPageCount = Math.max(1, Math.ceil(studentRows.length / EDU_PEOPLE_PAGE_SIZE))
              const teacherPage = Math.min(eduTeacherPages[school.id] || 1, teacherPageCount)
              const studentPage = Math.min(eduStudentPages[school.id] || 1, studentPageCount)
              const visibleTeachers = teacherRows.slice((teacherPage - 1) * EDU_PEOPLE_PAGE_SIZE, teacherPage * EDU_PEOPLE_PAGE_SIZE)
              const visibleStudents = studentRows.slice((studentPage - 1) * EDU_PEOPLE_PAGE_SIZE, studentPage * EDU_PEOPLE_PAGE_SIZE)
              return (
                <div key={school.id} className="glass ns-edu-card">
                  <div className="ns-edu-card__top">
                    <div className="ns-edu-card__id">
                      <h4>{school.school_name}</h4>
                      <p className="ns-edu-card__meta">{school.administrator_email || 'no email'}{school.school_website ? ` · ${school.school_website}` : ''}</p>
                      <p className="ns-edu-card__meta">{[school.school_district, school.main_phone, school.principal_name].filter(Boolean).join(' · ') || 'Awaiting school details'}</p>
                      <div className="ns-edu-tags">
                        <span className={`ns-edu-badge ns-edu-badge--${school.status === 'approved' ? 'live' : 'pending'}`}>
                          {school.status === 'approved' ? 'Live in dropdown' : 'Not live yet'}
                        </span>
                        <span className="ns-edu-count">{school.user_count} <small>member{Number(school.user_count) === 1 ? '' : 's'}</small></span>
                      </div>
                    </div>
                    <div className="ns-edu-actions">
                      <button type="button" className="btn btn--sm" onClick={() => setEduExpanded(open ? null : school.id)}>
                        {open ? 'Hide people' : `People (${(school.teachers?.length || 0) + (school.students?.length || 0)})`}
                      </button>
                      {school.status !== 'approved' && (
                        <button type="button" className="btn btn--sm btn--solid" disabled={nsEduBusy === `live-${school.id}`} onClick={() => void eduMakeLive(school.id)}>
                          {nsEduBusy === `live-${school.id}` ? 'Saving…' : 'Make live'}
                        </button>
                      )}
                      {school.status !== 'rejected' && school.status !== 'approved' && (
                        <button type="button" className="btn btn--sm" disabled={nsEduBusy === `reject-${school.id}`} onClick={() => void eduRejectSchool(school.id)}>
                          {nsEduBusy === `reject-${school.id}` ? 'Saving...' : 'Reject'}
                        </button>
                      )}
                      <button type="button" className="btn btn--sm" onClick={() => setClaimSchoolId(claiming ? null : school.id)}>
                        {claiming ? 'Cancel claim' : 'Claim'}
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="ns-edu-people">
                      <div className="ns-edu-col glass">
                        <div className="ns-edu-col__head">
                          <h5>Teachers ({teacherRows.length})</h5>
                          {teacherRows.length > EDU_PEOPLE_PAGE_SIZE && (
                            <div className="ns-edu-pager">
                              <button type="button" className="btn btn--sm" disabled={teacherPage <= 1} onClick={() => setEduTeacherPages((prev) => ({ ...prev, [school.id]: Math.max(1, teacherPage - 1) }))}>Prev</button>
                              <span>{teacherPage}/{teacherPageCount}</span>
                              <button type="button" className="btn btn--sm" disabled={teacherPage >= teacherPageCount} onClick={() => setEduTeacherPages((prev) => ({ ...prev, [school.id]: Math.min(teacherPageCount, teacherPage + 1) }))}>Next</button>
                            </div>
                          )}
                        </div>
                        {teacherRows.length === 0 && <p className="ns-edu-empty">None yet.</p>}
                        {visibleTeachers.map((t: any) => (
                          <div key={t.id} className="ns-edu-person ns-edu-person--clickable" role="button" tabIndex={0} onClick={() => openTeacherProfile(Number(t.id))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTeacherProfile(Number(t.id)) } }}>
                            <span className="ns-edu-person__name">{t.teacher_full_name}</span>
                            <span className="ns-edu-person__status">{t.status}</span>
                            {t.status !== 'approved'
                              ? <button type="button" className="btn btn--sm btn--solid" disabled={nsEduBusy === `teacher-${t.id}`} onClick={(event) => { event.stopPropagation(); void eduApproveTeacher(t) }}>{nsEduBusy === `teacher-${t.id}` ? '�' : 'Approve'}</button>
                              : <span className="ns-edu-person__ok">? Approved</span>}
                          </div>
                        ))}
                      </div>
                      <div className="ns-edu-col glass">
                        <div className="ns-edu-col__head">
                          <h5>Students ({studentRows.length})</h5>
                          {studentRows.length > EDU_PEOPLE_PAGE_SIZE && (
                            <div className="ns-edu-pager">
                              <button type="button" className="btn btn--sm" disabled={studentPage <= 1} onClick={() => setEduStudentPages((prev) => ({ ...prev, [school.id]: Math.max(1, studentPage - 1) }))}>Prev</button>
                              <span>{studentPage}/{studentPageCount}</span>
                              <button type="button" className="btn btn--sm" disabled={studentPage >= studentPageCount} onClick={() => setEduStudentPages((prev) => ({ ...prev, [school.id]: Math.min(studentPageCount, studentPage + 1) }))}>Next</button>
                            </div>
                          )}
                        </div>
                        {studentRows.length === 0 && <p className="ns-edu-empty">None yet.</p>}
                        {visibleStudents.map((s: any) => (
                          <div key={s.id} className="ns-edu-person ns-edu-person--clickable" role="button" tabIndex={0} onClick={() => openStudentProfile(Number(s.id))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStudentProfile(Number(s.id)) } }}>
                            <span className="ns-edu-person__name">{s.full_name}</span>
                            <span className="ns-edu-person__status">{s.teacher_approval_status || '�'}</span>
                            {s.teacher_approval_status !== 'approved'
                              ? <button type="button" className="btn btn--sm btn--solid" disabled={nsEduBusy === `student-${s.id}`} onClick={(event) => { event.stopPropagation(); void eduApproveStudent(s) }}>{nsEduBusy === `student-${s.id}` ? '�' : 'Approve'}</button>
                              : <span className="ns-edu-person__ok">? Approved</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {claiming && (
                    <form onSubmit={(e) => void submitClaim(e, school.id)} className="glass ns-edu-claim">
                      <strong className="ns-edu-claim__title">Claim {school.school_name} for a principal</strong>
                      <p className="ns-edu-claim__note">
                        Creates the principal&rsquo;s login and hands the school (and its {school.user_count} member{Number(school.user_count) === 1 ? '' : 's'}) to them. They manage it from then on; it moves to the claimed history below.
                      </p>
                      <div className="ns-edu-claim__grid">
                        <label>Principal name<input name="principal_name" required /></label>
                        <label>Administrator name<input name="administrator_name" placeholder="(defaults to principal)" /></label>
                        <label>Principal email<input name="administrator_email" type="email" required defaultValue={school.administrator_email || ''} /></label>
                        <label>Principal phone<input name="administrator_phone" required /></label>
                        <label>Main phone<input name="main_phone" placeholder="(defaults to principal phone)" /></label>
                        <label>District<input name="school_district" required /></label>
                        <label>Address<input name="school_address" required /></label>
                        <label>Website<input name="school_website" defaultValue={school.school_website || ''} /></label>
                        <label>Principal password<input name="password" type="password" minLength={6} required /></label>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn btn--sm btn--solid" disabled={nsEduBusy === `claim-${school.id}`}>{nsEduBusy === `claim-${school.id}` ? 'Claiming…' : 'Claim & hand over'}</button>
                        <button type="button" className="btn btn--sm" onClick={() => setClaimSchoolId(null)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              )
            })}

            {(nsEdu?.history ?? []).length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 className="gold-text" style={{ fontSize: 16, marginBottom: 10 }}>Claimed history</h3>
                <Table stack head={['School', 'Members', 'Claimed']}>
                  {(nsEdu?.history ?? []).map((s: any) => (
                    <tr key={s.id}>
                      <td style={tdS} data-label="School">{s.school_name}</td>
                      <td style={tdS} data-label="Members">{s.user_count}</td>
                      <td style={tdS} data-label="Claimed">{s.claimed_at || '—'}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </>
        )}

        {tab === 'sponsors' && <SponsorsAdminPanel />}

        {tab === 'partners' && <PartnersAdminPanel />}
        {tab === 'business-requests' && <BusinessRequestsAdminPanel />}
        {tab === 'ecosystem' && <EcosystemAdminPanel />}
        {tab === 'awards' && <AwardsAdmin />}
        {tab === 'events' && <EventsAdmin />}
        {tab === 'blog' && <PostsAdmin />}
        {tab === 'testimonials' && <TestimonialsAdmin />}
        {tab === 'media' && <MediaAdmin />}
        {tab === 'gallery' && <GalleryAdminPanel />}
        {tab === 'community' && <CommunityAdmin />}
        {tab === 'rsvps' && <RsvpsAdmin />}
        {tab === 'inventory' && <InventoryAdmin />}
        </main>
      </div>

      <UserDetailModal
        open={!!selectedUser}
        summary={selectedUser}
        detail={selectedUserDetail}
        loading={selectedUserLoading}
        error={selectedUserError}
        onClose={closeUserDetails}
        onApproval={(status) => selectedUser && void setApproval(selectedUser.id, status)}
      />

      <NsRecordDetail
        open={!!nsDetail}
        onClose={() => setNsDetail(null)}
        kind={nsDetail?.kind || 'project'}
        record={nsDetail?.record || null}
        scholarship={nsDetail ? scholarshipFor(nsDetail.record?.student_id) : []}
        showStudent
      />

      <NsProfileModal
        open={!!nsProfile}
        onClose={() => setNsProfile(null)}
        view={nsProfile}
        onOpenStudent={(id) => openStudentProfile(id)}
      />

      {scoreModal && (
        <SubmissionScoresModal submissionId={scoreModal.id} studentName={scoreModal.name} onClose={() => setScoreModal(null)} />
      )}

      {bonusModal && createPortal((
        <div className="admin-bonus-overlay" role="dialog" aria-modal="true" onClick={() => { if (!bonusBusy) setBonusModal(null) }}>
          <div className="admin-bonus-card glass" onClick={(e) => e.stopPropagation()}>
            <h3>{bonusModal.approveAfter ? 'Approve project & award bonus points' : 'Award bonus points'}</h3>
            <p>
              {bonusModal.approveAfter
                ? <>Award bonus points to <strong>{bonusModal.studentName}</strong>, then approve the project. Approval happens only after you confirm. Leave 0 to approve with no bonus.</>
                : <>Award bonus points to <strong>{bonusModal.studentName}</strong> for this business interview.</>}
            </p>
            <label className="admin-bonus-field">
              <span>Bonus points for the student (0–{bonusModal.max})</span>
              <input
                type="number"
                min={0}
                max={bonusModal.max}
                value={bonusValue}
                autoFocus
                onChange={(e) => setBonusValue(Math.max(0, Math.min(bonusModal.max, Math.round(Number(e.target.value) || 0))))}
              />
            </label>
            <p className="admin-bonus-note">These points are allocated to the student and update the ranking table immediately.</p>
            <div className="admin-bonus-actions">
              <button type="button" className="btn" onClick={() => setBonusModal(null)} disabled={bonusBusy}>Cancel</button>
              <button type="button" className="btn btn--solid" onClick={() => void confirmBonus()} disabled={bonusBusy}>
                {bonusBusy ? 'Saving…' : bonusModal.approveAfter ? 'Confirm & Approve' : 'Award points'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}

function UserDetailModal({
  open,
  summary,
  detail,
  loading,
  error,
  onClose,
  onApproval,
}: {
  open: boolean
  summary: MemberRow | null
  detail: UserDetailPayload | null
  loading: boolean
  error: string
  onClose: () => void
  onApproval: (status: 'pending' | 'approved' | 'rejected') => void
}) {
  if (!open || !summary) return null

  const status = (detail?.user.approval_status || summary.approval_status || 'pending').toLowerCase()
  const reviewer = detail?.user.approval_reviewed_by_name
    ? `${detail.user.approval_reviewed_by_name}${detail.user.approval_reviewed_by_email ? ` (${detail.user.approval_reviewed_by_email})` : ''}`
    : '—'

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h3 className="gold-text">{summary.full_name}</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
              {summary.email} · {summary.role}
            </p>
          </div>
          <span className={`status-pill ${status === 'approved' ? 'status-pill--approved' : status === 'rejected' ? 'status-pill--closed' : 'status-pill--new'}`}>
            {status}
          </span>
        </div>

        {loading && <p style={{ color: 'var(--muted)', marginTop: 18 }}>Loading user details…</p>}
        {error && <p style={{ color: '#e08a8a', marginTop: 18 }}>{error}</p>}

        {!loading && !error && detail && (
          <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
            {detail.sections.map((section) => (
              <section key={section.title} className="glass" style={{ padding: 18, borderRadius: 14 }}>
                <h4 className="gold-text" style={{ fontSize: 18, marginBottom: 12 }}>{section.title}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {section.fields.map((field) => (
                    <div key={field.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>
                        {field.label}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word' }}>{displayValue(field.value)}</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {detail.tables.map((table) => (
              <section key={table.title} className="glass admin-table-wrap" style={{ padding: 18, borderRadius: 14 }}>
                <h4 className="gold-text" style={{ fontSize: 18, marginBottom: 12 }}>{table.title}</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr>
                      {table.columns.map((column) => (
                        <th key={column} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr key={`${table.title}-${index}`}>
                        {Object.values(row).map((value, cellIndex) => (
                          <td key={cellIndex} style={{ padding: '11px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top', lineHeight: 1.5 }}>
                            {displayValue(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
          <button type="button" className={approvalButtonClass(status, 'approved')} disabled={loading} onClick={() => onApproval('approved')}>
            Approve
          </button>
          <button type="button" className={approvalButtonClass(status, 'pending')} disabled={loading} onClick={() => onApproval('pending')}>
            Keep Pending
          </button>
          <button type="button" className={approvalButtonClass(status, 'rejected')} disabled={loading} onClick={() => onApproval('rejected')}>
            Reject
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 12, alignSelf: 'center', marginLeft: 'auto' }}>Reviewed by: {reviewer}</span>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Awards management (CRUD + image upload) ---------------- */
const emptyAward: AwardRow = {
  id: 0, title: '', year: '', level: 'Business', presenter: '', short_text: '',
  description: '', image: '', is_featured: 0, sort_order: 0,
}
const LEVELS = ['National', 'Federal', 'State', 'County', 'Nonprofit', 'Business']

function AwardsAdmin() {
  const [rows, setRows] = useState<AwardRow[]>([])
  const [editing, setEditing] = useState<AwardRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ awards: AwardRow[] }>('admin/awards').then((d) => setRows(d.awards)).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (patch: Partial<AwardRow>) => setEditing((e) => (e ? { ...e, ...patch } : e))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/award/${editing.id}`, editing)
      else await api.post('admin/award', editing)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally { setBusy(false) }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this award?')) return
    await api.del(`admin/award/${id}`)
    load()
  }

  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const d = await api.upload<{ url: string }>('admin/upload', file)
      set({ image: d.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} awards · shown on the public Awards page</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyAward, sort_order: rows.length + 1 })}>+ Add Award</button>
      </div>

      <Table stack head={['', 'Title', 'Year', 'Level', 'Featured', 'Order', 'Actions']}>
        {rows.map((a) => (
          <tr key={a.id} style={rowS}>
            <td style={tdS}>{a.image ? <img src={a.image} alt={a.title ? `${a.title} award` : 'Award image'} style={{ width: 40, height: 52, objectFit: 'cover', borderRadius: 4 }} /> : '—'}</td>
            <td style={tdS} data-label="Title">{a.title}</td>
            <td style={tdS} data-label="Year">{a.year || '—'}</td>
            <td style={tdS} data-label="Level">{a.level || '—'}</td>
            <td style={tdS} data-label="Featured">{a.is_featured ? '★' : '—'}</td>
            <td style={tdS} data-label="Order">{a.sort_order}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--sm" onClick={() => setEditing(a)}>Edit</button>
                <button className="btn btn--sm" onClick={() => remove(a.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editing.id ? 'Edit Award' : 'New Award'}</h3>

            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Year</label>
                <input type="text" value={editing.year ?? ''} onChange={(e) => set({ year: e.target.value })} placeholder="2026" /></div>
              <div className="field" style={{ flex: 1 }}><label>Level</label>
                <select value={editing.level ?? ''} onChange={(e) => set({ level: e.target.value })} style={fldSelectS}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select></div>
              <div className="field" style={{ flex: '0 0 80px' }}><label>Order</label>
                <input type="number" value={editing.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} /></div>
            </div>

            <div className="field"><label>Presenter</label>
              <input type="text" value={editing.presenter ?? ''} onChange={(e) => set({ presenter: e.target.value })} placeholder="e.g. U.S. Senator Charles E. Schumer" /></div>

            <div className="field"><label>Short summary</label>
              <textarea className="fld-area" value={editing.short_text ?? ''} onChange={(e) => set({ short_text: e.target.value })} /></div>

            <div className="field"><label>Full description</label>
              <textarea className="fld-area" style={{ minHeight: 120 }} value={editing.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></div>

            <div className="field"><label>Image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.image && <img src={editing.image} alt="" style={{ width: 54, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload Image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.image ?? ''} onChange={(e) => set({ image: e.target.value })} placeholder="/assets/awards/example.webp" style={{ marginTop: 8 }} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured award (shown in the “Featured Awards” row)
            </label>

            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Award'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

const fldSelectS: React.CSSProperties = { width: '100%', background: 'rgba(0,0,0,0.45)', border: '1px solid var(--line)', borderRadius: 9, padding: '13px 15px', color: '#fff', fontFamily: 'inherit', fontSize: 14, outline: 'none' }

/* ---------------- Events management (CRUD) ---------------- */
const emptyEvent: EventItem = { id: 0, title: '', location: '', role: '', event_date: '', is_past: 0 }

function EventsAdmin() {
  const [rows, setRows] = useState<EventItem[]>([])
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ events: EventItem[] }>('admin/events').then((d) => setRows(d.events)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<EventItem>) => setEditing((e) => (e ? { ...e, ...patch } : e))

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/event/${editing.id}`, editing)
      else await api.post('admin/event', editing)
      setEditing(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') } finally { setBusy(false) }
  }
  const remove = async (id: number) => { if (!confirm('Delete this event?')) return; await api.del(`admin/event/${id}`); load() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} events · shown on the Events page &amp; home</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyEvent })}>+ Add Event</button>
      </div>
      <Table stack head={['Title', 'Location', 'Role', 'Date', 'Past', 'Actions']}>
        {rows.map((ev) => (
          <tr key={ev.id} style={rowS}>
            <td style={tdS} data-label="Title">{ev.title}</td>
            <td style={tdS} data-label="Location">{ev.location || '—'}</td>
            <td style={tdS} data-label="Role">{ev.role || '—'}</td>
            <td style={tdS} data-label="Date">{ev.event_date}</td>
            <td style={tdS} data-label="Past">{ev.is_past ? 'Yes' : '—'}</td>
            <td style={tdS}><div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--sm" onClick={() => setEditing(ev)}>Edit</button>
              <button className="btn btn--sm" onClick={() => remove(ev.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
            </div></td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 480 }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Event' : 'New Event'}</h3>
            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Location</label>
                <input type="text" value={editing.location} onChange={(e) => set({ location: e.target.value })} /></div>
              <div className="field" style={{ flex: 1 }}><label>Role</label>
                <input type="text" value={editing.role} onChange={(e) => set({ role: e.target.value })} placeholder="Keynote Speaker" /></div>
            </div>
            <div className="field"><label>Date</label>
              <input type="date" required value={editing.event_date} onChange={(e) => set({ event_date: e.target.value })} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_past} onChange={(e) => set({ is_past: e.target.checked ? 1 : 0 })} />
              Past event (shown under “Past Appearances”)
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Event'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ---------------- Blog posts management (CRUD + cover upload) ---------------- */
const emptyPost: PostDetail = { id: 0, title: '', category: '', excerpt: '', body: '', cover_image: '', is_featured: 0, published_at: '' }

function PostsAdmin() {
  const [rows, setRows] = useState<PostDetail[]>([])
  const [editing, setEditing] = useState<PostDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ posts: PostDetail[] }>('admin/posts').then((d) => setRows(d.posts)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<PostDetail>) => setEditing((e) => (e ? { ...e, ...patch } : e))

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/post/${editing.id}`, editing)
      else await api.post('admin/post', editing)
      setEditing(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') } finally { setBusy(false) }
  }
  const remove = async (id: number) => { if (!confirm('Delete this post?')) return; await api.del(`admin/post/${id}`); load() }
  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try { const d = await api.upload<{ url: string }>('admin/upload', file); set({ cover_image: d.url }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.') } finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} articles · shown on the Blog page &amp; home</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyPost })}>+ Add Article</button>
      </div>
      <Table stack head={['', 'Title', 'Category', 'Featured', 'Published', 'Actions']}>
        {rows.map((p) => (
          <tr key={p.id} style={rowS}>
            <td style={tdS}>{p.cover_image ? <img src={p.cover_image} alt={p.title ? `${p.title} cover` : 'Post cover'} style={{ width: 52, height: 32, objectFit: 'cover', borderRadius: 4 }} /> : '—'}</td>
            <td style={tdS} data-label="Title">{p.title}</td>
            <td style={tdS} data-label="Category">{p.category || '—'}</td>
            <td style={tdS} data-label="Featured">{p.is_featured ? '★' : '—'}</td>
            <td style={tdS} data-label="Published">{p.published_at}</td>
            <td style={tdS}><div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--sm" onClick={() => setEditing(p)}>Edit</button>
              <button className="btn btn--sm" onClick={() => remove(p.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
            </div></td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Article' : 'New Article'}</h3>
            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Category</label>
                <input type="text" value={editing.category} onChange={(e) => set({ category: e.target.value })} placeholder="Featured / Tech News / My Story" /></div>
              <div className="field" style={{ flex: 1 }}><label>Published date</label>
                <input type="date" value={editing.published_at} onChange={(e) => set({ published_at: e.target.value })} /></div>
            </div>
            <div className="field"><label>Excerpt</label>
              <textarea className="fld-area" value={editing.excerpt} onChange={(e) => set({ excerpt: e.target.value })} /></div>
            <div className="field"><label>Body (separate paragraphs with a blank line)</label>
              <textarea className="fld-area" style={{ minHeight: 160 }} value={editing.body} onChange={(e) => set({ body: e.target.value })} /></div>
            <div className="field"><label>Cover image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.cover_image && <img src={editing.cover_image} alt="" style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload Cover'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.cover_image ?? ''} onChange={(e) => set({ cover_image: e.target.value })} placeholder="/api/uploads/media/..." style={{ marginTop: 8 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured (large card on the home blog section)
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Article'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ---------------- Analytics ---------------- */
function AnalyticsAdmin() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AnalyticsPayload>('admin/analytics').then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Could not load analytics.'))
  }, [])

  const cards = [
    ['Users', data?.totals.users ?? 0],
    ['Members', data?.totals.members ?? 0],
    ['Pending', data?.totals.pending_accounts ?? 0],
    ['Approved', data?.totals.approved_accounts ?? 0],
    ['Rejected', data?.totals.rejected_accounts ?? 0],
    ['Requests', data?.totals.requests ?? 0],
    ['Orders', data?.totals.orders ?? 0],
    ['Revenue', `$${(data?.totals.revenue ?? 0).toFixed(2)}`],
    ['Subscribers', data?.totals.subscribers ?? 0],
    ['Contacts', data?.totals.contacts ?? 0],
    ['Media Items', data?.totals.media ?? 0],
    ['Community Threads', data?.totals.community_threads ?? 0],
    ['Community Comments', data?.totals.community_comments ?? 0],
    ['Event RSVPs', data?.totals.event_rsvps ?? 0],
    ['Inventory Items', data?.totals.inventory_items ?? 0],
    ['Low Stock', data?.totals.low_stock ?? 0],
  ] as const

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
      {data?.traffic && (
        <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
          <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
            <h3 className="gold-text">Website Traffic</h3>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>First-party page views — daily reach &amp; total visits</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(150px,100%),1fr))', gap: 14, marginBottom: 20 }}>
            {([
              ['Total visits', data.traffic.total],
              ['Visits today', data.traffic.today],
              ['Last 7 days', data.traffic.last_7],
              ['Last 30 days', data.traffic.last_30],
              ['Unique visitors', data.traffic.unique_total],
              ['Unique today', data.traffic.unique_today],
              ['Unique (30d)', data.traffic.unique_30],
            ] as const).map(([label, value]) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: 14, borderRadius: 12 }}>
                <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
                <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 24, marginTop: 6 }}>{value.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 10, fontSize: 12, color: '#e9e1d0', textTransform: 'uppercase', letterSpacing: '.08em' }}>Daily visits (last 30 days)</div>
          <DailyTraffic rows={data.traffic.daily} />
          <div style={{ marginTop: 20 }}>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#e9e1d0', textTransform: 'uppercase', letterSpacing: '.08em' }}>Top pages (30 days)</div>
            <SeriesBars rows={data.traffic.top_pages || []} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(160px,100%),1fr))', gap: 14 }}>
        {cards.map(([label, value]) => (
          <div key={label} className="glass" style={{ padding: 18, borderRadius: 14 }}>
            <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
            <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, marginTop: 8 }}>{value}</div>
          </div>
        ))}
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
        <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
          <h3 className="gold-text">Request Breakdown</h3>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Latest counts from the live database</span>
        </div>
        <SeriesBars rows={data?.request_types || []} />
      </div>

      <div className="dashboard-cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))' }}>
        <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
          <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
            <h3 className="gold-text">Request Status</h3>
          </div>
          <SeriesBars rows={data?.request_statuses || []} />
        </div>
        <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
          <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
            <h3 className="gold-text">Order Status</h3>
          </div>
          <SeriesBars rows={data?.order_statuses || []} />
        </div>
      </div>

      <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
        <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
          <h3 className="gold-text">Content Mix</h3>
        </div>
        <SeriesBars rows={data?.content_mix || []} />
      </div>
    </div>
  )
}

/* ---------------- Traffic (dedicated tab) ---------------- */
type LinkedUser = { full_name: string; email: string; role: string }
type VisitorRow = { token: string; visits: number; first_seen: number; last_seen: number; last_path: string; user_name: string | null; user_email: string | null; user_role: string | null }
type VisitorList = { visitors: VisitorRow[]; scope: string; page: number; per_page: number; total: number; total_pages: number }
type VisitRow = { ts: number; path: string; referrer: string | null; user_agent: string | null }

function TrafficAdmin() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<AnalyticsPayload>('admin/analytics').then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Could not load traffic.'))
  }, [])

  // Drill-down: click a tile → list visitors; click a visitor → their full visit timeline.
  const [scope, setScope] = useState<null | 'all' | 'repeat' | 'new'>(null)
  const [vd, setVd] = useState<VisitorList | null>(null)
  const [vpage, setVpage] = useState(1)
  const [selToken, setSelToken] = useState<string | null>(null)
  const [visits, setVisits] = useState<VisitRow[] | null>(null)
  const [selUser, setSelUser] = useState<LinkedUser | null>(null)

  useEffect(() => {
    if (!scope || selToken) return
    setVd(null)
    api.get<VisitorList>(`admin/traffic/visitors?scope=${scope}&page=${vpage}`).then(setVd).catch(() => setVd(null))
  }, [scope, vpage, selToken])

  useEffect(() => {
    if (!selToken) { setVisits(null); setSelUser(null); return }
    setVisits(null); setSelUser(null)
    api.get<{ visits: VisitRow[]; user: LinkedUser | null }>(`admin/traffic/visitor?token=${encodeURIComponent(selToken)}`)
      .then((d) => { setVisits(d.visits); setSelUser(d.user || null) })
      .catch(() => setVisits([]))
  }, [selToken])

  const fmtTs = (s: number) => `${new Date(s * 1000).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
  const openScope = (s: 'all' | 'repeat' | 'new') => { setScope(s); setVpage(1); setSelToken(null) }
  const closeModal = () => { setScope(null); setSelToken(null); setVd(null); setVisits(null) }

  const t = data?.traffic
  if (error) return <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>
  if (!t) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading traffic…</p>

  const repeated = t.repeated_visitors ?? 0
  const newV = t.new_visitors ?? 0
  const returnRate = repeated + newV > 0 ? Math.round((repeated / (repeated + newV)) * 100) : 0
  const avgPerVisitor = t.unique_total > 0 ? (t.total / t.unique_total).toFixed(1) : '0'

  const tile = (label: string, value: string | number, hint?: string, onClick?: () => void) => (
    <div key={label} onClick={onClick} role={onClick ? 'button' : undefined}
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${onClick ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.06)'}`, padding: 16, borderRadius: 12, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
      <div className="gold-text" style={{ fontFamily: 'var(--f-serif)', fontSize: 26, marginTop: 6 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {hint && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>{hint}</div>}
      {onClick && <div style={{ color: 'var(--gold)', fontSize: 11, marginTop: 6, fontWeight: 600 }}>View visitors →</div>}
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
      <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
        <div className="dashboard-section-head" style={{ marginBottom: 18 }}>
          <h3 className="gold-text">Website Traffic</h3>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>First-party page views — who visits, how often, and where they land</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(150px,100%),1fr))', gap: 14 }}>
          {tile('Total visits', t.total, 'All page views ever')}
          {tile('Visits today', t.today)}
          {tile('Last 7 days', t.last_7)}
          {tile('Last 30 days', t.last_30)}
          {tile('Unique visitors', t.unique_total, 'Distinct people', () => openScope('all'))}
          {tile('Repeat visitors', repeated, `${returnRate}% came back`, () => openScope('repeat'))}
          {tile('New visitors', newV, 'Visited once', () => openScope('new'))}
          {tile('Avg visits / person', avgPerVisitor)}
        </div>
      </div>

      <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
        <div style={{ marginBottom: 12, fontSize: 12, color: '#e9e1d0', textTransform: 'uppercase', letterSpacing: '.08em' }}>Daily visits (last 30 days)</div>
        <DailyTraffic rows={t.daily} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 18 }}>
        <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
          <div style={{ marginBottom: 12, fontSize: 12, color: '#e9e1d0', textTransform: 'uppercase', letterSpacing: '.08em' }}>Top pages (30 days)</div>
          <SeriesBars rows={t.top_pages || []} />
        </div>
        <div className="glass" style={{ padding: 22, borderRadius: 14, minWidth: 0 }}>
          <div style={{ marginBottom: 12, fontSize: 12, color: '#e9e1d0', textTransform: 'uppercase', letterSpacing: '.08em' }}>Where visitors come from (30 days)</div>
          <SeriesBars rows={t.top_referrers || []} />
        </div>
      </div>

      {scope && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth: 760, width: '96vw', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left', padding: 0, background: 'var(--bg-2, #14130d)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'linear-gradient(180deg,#1c1a12,#14130d)', borderBottom: '1px solid var(--line)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>Traffic detail</div>
                <h3 className="gold-text" style={{ margin: '4px 0 0', fontFamily: 'var(--f-serif)', fontSize: 20 }}>
                  {selToken ? 'Visitor activity' : scope === 'repeat' ? 'Repeat visitors' : scope === 'new' ? 'New visitors' : 'All visitors'}
                </h3>
              </div>
              <button onClick={closeModal} aria-label="Close" title="Close"
                style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)', color: 'var(--ivory)', fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {selToken ? (
                <>
                  <button className="btn btn--sm" onClick={() => setSelToken(null)} style={{ marginBottom: 14 }}>‹ Back to visitors</button>
                  {selUser
                    ? <p style={{ margin: '0 0 4px', color: 'var(--ivory)' }}>👤 <strong className="gold-text">{selUser.full_name}</strong> · {selUser.email} <span className="msub">({selUser.role})</span></p>
                    : <p className="msub" style={{ margin: '0 0 4px' }}>👤 Anonymous visitor (never signed in)</p>}
                  <p className="msub" style={{ fontSize: 12, marginTop: 0 }}>Visitor ID <code>{selToken.slice(0, 12)}…</code> · {visits?.length || 0} page views (latest 200)</p>
                  {!visits ? <p className="msub">Loading…</p> : visits.length === 0 ? <p className="msub">No visits.</p> : (
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-table--stack">
                        <thead><tr><th>When (ET)</th><th>Page</th><th>Came from</th></tr></thead>
                        <tbody>{visits.map((v, i) => (
                          <tr key={i}><td className="msub" style={{ fontSize: 12 }} data-label="When (ET)">{fmtTs(v.ts)}</td><td data-label="Page">{v.path}</td><td className="msub" style={{ fontSize: 12 }} data-label="Came from">{v.referrer || '(direct)'}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : !vd ? <p className="msub">Loading…</p> : vd.visitors.length === 0 ? <p className="msub">No visitors yet.</p> : (
                <>
                  <p className="msub" style={{ fontSize: 12, marginTop: 0 }}>{vd.total} visitor{vd.total === 1 ? '' : 's'} — click one to see every visit. Visitors are anonymous first-party IDs.</p>
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-table--stack">
                      <thead><tr><th>User</th><th>Visitor ID</th><th>Visits</th><th>First seen</th><th>Last seen</th><th>Last page</th></tr></thead>
                      <tbody>{vd.visitors.map((v) => (
                        <tr key={v.token} onClick={() => setSelToken(v.token)} style={{ cursor: 'pointer' }}>
                          <td data-label="User">{v.user_name
                            ? <><strong>{v.user_name}</strong><div className="msub" style={{ fontSize: 12 }}>{v.user_email}{v.user_role ? ` · ${v.user_role}` : ''}</div></>
                            : <span className="msub">Anonymous</span>}</td>
                          <td data-label="Visitor ID"><code style={{ fontSize: 12 }}>{v.token.slice(0, 10)}…</code></td>
                          <td data-label="Visits"><strong className="gold-text">{v.visits}</strong></td>
                          <td className="msub" style={{ fontSize: 12 }} data-label="First seen">{fmtTs(v.first_seen)}</td>
                          <td className="msub" style={{ fontSize: 12 }} data-label="Last seen">{fmtTs(v.last_seen)}</td>
                          <td className="msub" style={{ fontSize: 12 }} data-label="Last page">{v.last_path}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {vd.total_pages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
                      <button className="btn btn--sm" disabled={vd.page <= 1} onClick={() => setVpage((p) => p - 1)}>‹ Prev</button>
                      <span className="msub" style={{ fontSize: 13 }}>Page {vd.page} of {vd.total_pages}</span>
                      <button className="btn btn--sm" disabled={vd.page >= vd.total_pages} onClick={() => setVpage((p) => p + 1)}>Next ›</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Challenge Timeline (admin-editable) ---------------- */
type Milestone = { phase: string; when: string; highlight?: boolean }
type SubmissionWindow = { open_date: string; deadline: string; mode: string; is_open: boolean }
type Ceremony = { date: string; venue: string; description: string; link: string }
function TimelineAdmin() {
  const [rows, setRows] = useState<Milestone[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const [reg, setReg] = useState<SubmissionWindow>({ open_date: '', deadline: '', mode: 'auto', is_open: true })
  const [regBusy, setRegBusy] = useState(false); const [regMsg, setRegMsg] = useState(''); const [regErr, setRegErr] = useState('')
  const [cer, setCer] = useState<Ceremony>({ date: '', venue: '', description: '', link: '' })
  const [cerBusy, setCerBusy] = useState(false); const [cerMsg, setCerMsg] = useState(''); const [cerErr, setCerErr] = useState('')
  const [winnersPub, setWinnersPub] = useState(false)
  const [sub, setSub] = useState<'deadline' | 'winners' | 'ceremony' | 'timeline'>('deadline')
  useEffect(() => {
    api.get<{ timeline: Milestone[] }>('admin/new-school/timeline').then((d) => setRows(d.timeline || [])).catch(() => {})
    api.get<{ submission_window: SubmissionWindow }>('admin/new-school/submission-window').then((d) => setReg(d.submission_window)).catch(() => {})
    api.get<{ ceremony: Ceremony }>('admin/new-school/ceremony').then((d) => setCer(d.ceremony)).catch(() => {})
    api.get<{ settings: { winners_published: boolean } }>('admin/new-school/settings').then((d) => setWinnersPub(!!d.settings.winners_published)).catch(() => {})
  }, [])
  const [pendingPublish, setPendingPublish] = useState<boolean | null>(null)
  const [pubBusy, setPubBusy] = useState(false)
  const applyPublish = async () => {
    if (pendingPublish === null) return
    const next = pendingPublish
    setPubBusy(true)
    try {
      await api.post('admin/new-school/settings', { winners_published: next })
      setWinnersPub(next); setPendingPublish(null)
    } catch { /* keep modal open on failure */ } finally { setPubBusy(false) }
  }
  const saveCer = async () => {
    setCerBusy(true); setCerMsg(''); setCerErr('')
    try {
      const d = await api.put<{ ceremony: Ceremony }>('admin/new-school/ceremony', cer)
      setCer(d.ceremony); setCerMsg('Award ceremony saved.')
    } catch (e) { setCerErr(e instanceof Error ? e.message : 'Could not save the ceremony.') } finally { setCerBusy(false) }
  }
  const saveReg = async () => {
    setRegBusy(true); setRegMsg(''); setRegErr('')
    try {
      const d = await api.put<{ submission_window: SubmissionWindow }>('admin/new-school/submission-window', { open_date: reg.open_date, deadline: reg.deadline, mode: reg.mode })
      setReg(d.submission_window); setRegMsg('Submission deadline saved — live for students now.')
    } catch (e) { setRegErr(e instanceof Error ? e.message : 'Could not save the submission deadline.') } finally { setRegBusy(false) }
  }
  const update = (i: number, patch: Partial<Milestone>) => setRows((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i))
  const add = () => setRows((r) => [...r, { phase: '', when: '', highlight: false }])
  const move = (i: number, dir: number) => setRows((r) => { const n = [...r]; const j = i + dir; if (j < 0 || j >= n.length) return n;[n[i], n[j]] = [n[j], n[i]]; return n })
  const save = async () => {
    setBusy(true); setMsg(''); setErr('')
    try {
      const d = await api.put<{ timeline: Milestone[] }>('admin/new-school/timeline', { timeline: rows.filter((r) => r.phase.trim() || r.when.trim()) })
      setRows(d.timeline || []); setMsg('Timeline saved — it is now live on the New School page.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the timeline.') } finally { setBusy(false) }
  }
  const inp = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,0.04)', color: 'var(--ivory)', fontSize: 13, width: '100%' }
  const optStyle = { background: '#181509', color: 'var(--ivory)' }
  const fieldLabel = { display: 'grid', gap: 5, fontSize: 11, fontWeight: 600 as const, letterSpacing: '.04em', textTransform: 'uppercase' as const, color: 'var(--muted)' }
  const pill = (label: string, ok: boolean) => (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap', color: '#14110a', background: ok ? 'var(--green-bright, #7bd88f)' : '#e0a15a' }}>{label}</span>
  )
  const cardHead = (n: number, title: string, sub: string, right?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <span style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,168,76,0.14)', border: '1px solid var(--gold)', color: 'var(--gold-light)', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 className="gold-text" style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        <p className="msub" style={{ margin: '2px 0 0', fontSize: 12 }}>{sub}</p>
      </div>
      {right}
    </div>
  )
  const cardStyle = { padding: '18px 20px' }
  const subTabs: Array<{ key: typeof sub; label: string; right?: React.ReactNode }> = [
    { key: 'deadline', label: 'Submission Deadline', right: pill(reg.is_open ? 'Open' : 'Closed', reg.is_open) },
    { key: 'winners', label: 'Publish Winners', right: pill(winnersPub ? 'Live' : 'Hidden', winnersPub) },
    { key: 'ceremony', label: 'Award Ceremony' },
    { key: 'timeline', label: `Timeline (${rows.length})` },
  ]
  const tabBtn = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap',
    padding: '9px 14px', borderRadius: '10px 10px 0 0', fontSize: 13, fontWeight: 600,
    border: '1px solid var(--line)', borderBottom: 'none',
    background: active ? 'var(--bg-2, #14130d)' : 'transparent', color: active ? 'var(--gold-light)' : 'var(--muted)',
  })
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
        {subTabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setSub(t.key)} style={tabBtn(sub === t.key)}>
            {t.label}{t.right}
          </button>
        ))}
      </div>

      {/* 1 — Submission deadline */}
      {sub === 'deadline' && (
      <div className="glass" style={cardStyle}>
        {cardHead(1, 'Submission Deadline', 'Gate for business interviews & project submissions', pill(reg.is_open ? 'Open' : 'Closed', reg.is_open))}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Registration &amp; dashboards always stay open — this only controls whether students can still submit. <strong>Auto</strong> = open between the dates, closes after the deadline. <strong>Force open / closed</strong> overrides the dates.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <label style={fieldLabel}>Submissions open
            <input type="date" value={reg.open_date} onChange={(e) => setReg((r) => ({ ...r, open_date: e.target.value }))} style={inp} /></label>
          <label style={fieldLabel}>Submission deadline
            <input type="date" value={reg.deadline} onChange={(e) => setReg((r) => ({ ...r, deadline: e.target.value }))} style={inp} /></label>
          <label style={fieldLabel}>Mode
            <select value={reg.mode} onChange={(e) => setReg((r) => ({ ...r, mode: e.target.value }))} style={inp}>
              <option style={optStyle} value="auto">Auto (by dates)</option>
              <option style={optStyle} value="open">Force open</option>
              <option style={optStyle} value="closed">Force closed</option>
            </select></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--solid btn--sm" type="button" onClick={saveReg} disabled={regBusy}>{regBusy ? 'Saving…' : 'Save Deadline'}</button>
          {regErr && <span className="msub" style={{ color: '#e08a8a' }}>{regErr}</span>}
          {regMsg && <span className="msub" style={{ color: 'var(--green-bright)' }}>{regMsg}</span>}
        </div>
      </div>
      )}

      {/* 2 — Publish winners */}
      {sub === 'winners' && (
      <div className="glass" style={cardStyle}>
        {cardHead(2, 'Publish Winners', 'Reveal the winners board & ceremony on the public site', pill(winnersPub ? 'Live' : 'Hidden', winnersPub))}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Publishing reveals the winners board &amp; award ceremony on the public New School page and <strong>locks all judge scoring &amp; points</strong>. You'll be asked to confirm first.</p>
        <button
          type="button"
          className={winnersPub ? 'btn btn--sm' : 'btn btn--solid btn--sm'}
          onClick={() => setPendingPublish(!winnersPub)}
          style={winnersPub ? { color: '#e08a8a', borderColor: '#e08a8a' } : undefined}
        >
          {winnersPub ? 'Unpublish results' : 'Publish winners & lock scoring'}
        </button>
        <p className="msub" style={{ marginTop: 10, marginBottom: 0 }}>Status: <strong style={{ color: winnersPub ? 'var(--green-bright)' : '#e08a8a' }}>{winnersPub ? 'LIVE — winners visible to everyone' : 'Hidden — winners not shown publicly'}</strong></p>
      </div>
      )}

      {/* 3 — Award ceremony */}
      {sub === 'ceremony' && (
      <div className="glass" style={cardStyle}>
        {cardHead(3, 'Award Ceremony', 'Details shown in the public Results section after winners are published')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <label style={fieldLabel}>Date <span style={{ textTransform: 'none', fontWeight: 400 }}>(free text)</span>
            <input value={cer.date} onChange={(e) => setCer((c) => ({ ...c, date: e.target.value }))} placeholder="e.g. Early 2027" style={inp} /></label>
          <label style={fieldLabel}>Venue / location
            <input value={cer.venue} onChange={(e) => setCer((c) => ({ ...c, venue: e.target.value }))} placeholder="e.g. City Hall, Yonkers NY" style={inp} /></label>
          <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>Description
            <textarea value={cer.description} onChange={(e) => setCer((c) => ({ ...c, description: e.target.value }))} placeholder="Short details about the ceremony…" rows={2} style={{ ...inp, resize: 'vertical' }} /></label>
          <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>RSVP / details link
            <input value={cer.link} onChange={(e) => setCer((c) => ({ ...c, link: e.target.value }))} placeholder="https://…" style={inp} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--solid btn--sm" type="button" onClick={saveCer} disabled={cerBusy}>{cerBusy ? 'Saving…' : 'Save Ceremony'}</button>
          {cerErr && <span className="msub" style={{ color: '#e08a8a' }}>{cerErr}</span>}
          {cerMsg && <span className="msub" style={{ color: 'var(--green-bright)' }}>{cerMsg}</span>}
        </div>
      </div>
      )}

      {/* 4 — Timeline milestones */}
      {sub === 'timeline' && (
      <div className="glass" style={cardStyle}>
        {cardHead(4, 'Timeline Milestones', 'The dated steps shown on the public New School page', <span className="msub" style={{ fontSize: 12 }}>{rows.length} step{rows.length === 1 ? '' : 's'}</span>)}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Reorder with ↑ ↓ · tick ★ to gold-highlight a step (e.g. Winners Announced) · ✕ to remove.</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="admin-tl-head" style={{ padding: '0 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            <span>#</span><span>Milestone</span><span>When</span><span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {rows.map((row, i) => (
            <div key={i} className="admin-tl-row" style={{ background: row.highlight ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${row.highlight ? 'var(--gold)' : 'var(--line)'}`, borderRadius: 10, padding: '9px 12px' }}>
              <span className="msub" style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{i + 1}</span>
              <input value={row.phase} onChange={(e) => update(i, { phase: e.target.value })} placeholder="Milestone name" style={inp} />
              <input value={row.when} onChange={(e) => update(i, { when: e.target.value })} placeholder="e.g. June 27, 2026" style={inp} />
              <div className="admin-tl-row__actions" style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button type="button" title="Highlight" onClick={() => update(i, { highlight: !row.highlight })} style={{ cursor: 'pointer', background: 'none', border: 0, fontSize: 16, color: row.highlight ? 'var(--gold)' : 'var(--muted)', padding: 2 }}>★</button>
                <button className="btn btn--sm" type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ padding: '4px 8px' }}>↑</button>
                <button className="btn btn--sm" type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1} style={{ padding: '4px 8px' }}>↓</button>
                <button className="btn btn--sm" type="button" title="Remove" style={{ color: '#e08a8a', borderColor: '#e08a8a', padding: '4px 8px' }} onClick={() => remove(i)}>✕</button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="msub">No milestones yet — add the first one.</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--sm" type="button" onClick={add}>+ Add milestone</button>
          <button className="btn btn--solid btn--sm" type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Timeline'}</button>
          {err && <span className="msub" style={{ color: '#e08a8a' }}>{err}</span>}
          {msg && <span className="msub" style={{ color: 'var(--green-bright)' }}>{msg}</span>}
        </div>
      </div>
      )}

      {/* Publish/unpublish confirmation */}
      {pendingPublish !== null && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && !pubBusy && setPendingPublish(null)}>
          <div className="modal" style={{ maxWidth: 460, width: '94vw', textAlign: 'left', padding: 0, background: 'var(--bg-2, #14130d)' }}>
            <div style={{ borderBottom: '1px solid var(--line)', padding: '16px 22px' }}>
              <h3 className="gold-text" style={{ margin: 0, fontFamily: 'var(--f-serif)' }}>{pendingPublish ? 'Publish results?' : 'Unpublish results?'}</h3>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {pendingPublish ? (
                <p style={{ margin: '0 0 12px', color: 'var(--ivory)', lineHeight: 1.6 }}>
                  This reveals the <strong>winners board &amp; award ceremony publicly</strong> on the New School page and <strong>locks the competition</strong>:
                </p>
              ) : (
                <p style={{ margin: '0 0 12px', color: 'var(--ivory)', lineHeight: 1.6 }}>
                  This <strong>hides the winners</strong> from the public site again and <strong>re-opens</strong> judge scoring &amp; points. Use only if you published by mistake.
                </p>
              )}
              {pendingPublish && (
                <ul style={{ margin: '0 0 14px', paddingLeft: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 }}>
                  <li>Judges can no longer score or edit any scores.</li>
                  <li>No more bonus points can be awarded.</li>
                  <li>Projects stay viewable, but nothing can be changed.</li>
                </ul>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn--sm" type="button" onClick={() => setPendingPublish(null)} disabled={pubBusy}>Cancel</button>
                <button className="btn btn--solid btn--sm" type="button" onClick={applyPublish} disabled={pubBusy}>
                  {pubBusy ? 'Working…' : pendingPublish ? 'Yes, publish & lock' : 'Yes, unpublish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DailyTraffic({ rows }: { rows: Array<{ label: string; value: number; unique: number }> }) {
  if (!rows.length) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No visits tracked yet — data appears here as people browse the site.</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 170, overflowX: 'auto', paddingBottom: 4 }}>
      {rows.map((r) => (
        <div
          key={r.label}
          title={`${r.label} — ${r.value} visit${r.value === 1 ? '' : 's'}, ${r.unique} unique`}
          style={{ flex: '1 0 16px', minWidth: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
        >
          <div style={{ width: '70%', height: `${Math.max(2, (r.value / max) * 130)}px`, borderRadius: '4px 4px 0 0', background: 'var(--gold-grad)' }} />
          <span style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.label.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

function SeriesBars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  if (!rows.length) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No data yet.</p>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 6, minWidth: 0 }}>
            <span title={row.label} style={{ color: '#e9e1d0', textTransform: 'uppercase', letterSpacing: '.08em', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
            <strong style={{ color: 'var(--gold-light)', flex: '0 0 auto' }}>{row.value}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ width: `${(row.value / max) * 100}%`, height: '100%', background: 'var(--gold-grad)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Testimonials management ---------------- */
const emptyTestimonial: TestimonialRow = {
  id: 0,
  quote: '',
  author_name: '',
  author_title: '',
  company: '',
  image: '',
  is_featured: 0,
  sort_order: 0,
  created_at: '',
}

function TestimonialsAdmin() {
  const [rows, setRows] = useState<TestimonialRow[]>([])
  const [editing, setEditing] = useState<TestimonialRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ testimonials: TestimonialRow[] }>('admin/testimonials').then((d) => setRows(d.testimonials)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<TestimonialRow>) => setEditing((row) => (row ? { ...row, ...patch } : row))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/testimonial/${editing.id}`, editing)
      else await api.post('admin/testimonial', editing)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this testimonial?')) return
    await api.del(`admin/testimonial/${id}`)
    load()
  }

  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const d = await api.upload<{ url: string }>('admin/upload', file)
      set({ image: d.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} testimonials shown on the public Media and Community pages</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyTestimonial, sort_order: rows.length + 1 })}>+ Add Testimonial</button>
      </div>

      <Table stack head={['Quote', 'Author', 'Company', 'Featured', 'Order', 'Actions']}>
        {rows.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={{ ...tdS, maxWidth: 300 }} data-label="Quote">{row.quote}</td>
            <td style={tdS} data-label="Author">{row.author_name}</td>
            <td style={tdS} data-label="Company">{row.company || '—'}</td>
            <td style={tdS} data-label="Featured">{row.is_featured ? '★' : '—'}</td>
            <td style={tdS} data-label="Order">{row.sort_order}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--sm" onClick={() => setEditing(row)}>Edit</button>
                <button className="btn btn--sm" onClick={() => remove(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Testimonial' : 'New Testimonial'}</h3>
            <div className="field"><label>Quote</label>
              <textarea className="fld-area" style={{ minHeight: 110 }} value={editing.quote} onChange={(e) => set({ quote: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Author name</label>
                <input type="text" required value={editing.author_name} onChange={(e) => set({ author_name: e.target.value })} /></div>
              <div className="field" style={{ width: 120 }}><label>Order</label>
                <input type="number" value={editing.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Title</label>
                <input type="text" value={editing.author_title || ''} onChange={(e) => set({ author_title: e.target.value })} placeholder="Program Lead" /></div>
              <div className="field" style={{ flex: 1 }}><label>Company</label>
                <input type="text" value={editing.company || ''} onChange={(e) => set({ company: e.target.value })} placeholder="Organization / company" /></div>
            </div>
            <div className="field"><label>Image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.image && <img src={editing.image} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload Image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.image || ''} onChange={(e) => set({ image: e.target.value })} placeholder="/assets/..." style={{ marginTop: 8 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured testimonial
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Testimonial'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

/* ---------------- Media management ---------------- */
const emptyMedia: MediaRow = {
  id: 0,
  title: '',
  type: 'article',
  summary: '',
  body: '',
  image: '',
  link_url: '',
  published_at: '',
  is_featured: 0,
  sort_order: 0,
}
const MEDIA_TYPES = ['podcast', 'interview', 'tv', 'press_release', 'article', 'photo', 'video'] as const

function MediaAdmin() {
  const [rows, setRows] = useState<MediaRow[]>([])
  const [editing, setEditing] = useState<MediaRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ media: MediaRow[] }>('admin/media').then((d) => setRows(d.media)).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (patch: Partial<MediaRow>) => setEditing((row) => (row ? { ...row, ...patch } : row))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      if (editing.id) await api.put(`admin/media/${editing.id}`, editing)
      else await api.post('admin/media', editing)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this media item?')) return
    await api.del(`admin/media/${id}`)
    load()
  }

  const onUpload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const d = await api.upload<{ url: string }>('admin/upload', file)
      set({ image: d.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} media items shown on the public Media Center</p>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyMedia, sort_order: rows.length + 1 })}>+ Add Media</button>
      </div>

      <Table stack head={['Title', 'Type', 'Featured', 'Published', 'Actions']}>
        {rows.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={tdS} data-label="Title">{row.title}</td>
            <td style={tdS} data-label="Type">{row.type}</td>
            <td style={tdS} data-label="Featured">{row.is_featured ? '★' : '—'}</td>
            <td style={tdS} data-label="Published">{row.published_at || '—'}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn--sm" onClick={() => setEditing(row)}>Edit</button>
                <button className="btn btn--sm" onClick={() => remove(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h3 className="gold-text">{editing.id ? 'Edit Media Item' : 'New Media Item'}</h3>
            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Type</label>
                <select value={editing.type} onChange={(e) => set({ type: e.target.value })} style={fldSelectS}>
                  {MEDIA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select></div>
              <div className="field" style={{ width: 120 }}><label>Order</label>
                <input type="number" value={editing.sort_order} onChange={(e) => set({ sort_order: Number(e.target.value) })} /></div>
            </div>
            <div className="field"><label>Summary</label>
              <textarea className="fld-area" value={editing.summary || ''} onChange={(e) => set({ summary: e.target.value })} /></div>
            <div className="field"><label>Body</label>
              <textarea className="fld-area" style={{ minHeight: 130 }} value={editing.body || ''} onChange={(e) => set({ body: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Link URL</label>
                <input type="text" value={editing.link_url || ''} onChange={(e) => set({ link_url: e.target.value })} placeholder="/blog/1" /></div>
              <div className="field" style={{ flex: 1 }}><label>Published date</label>
                <input type="date" value={editing.published_at || ''} onChange={(e) => set({ published_at: e.target.value })} /></div>
            </div>
            <div className="field"><label>Image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editing.image && <img src={editing.image} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload Image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                </label>
              </div>
              <input type="text" value={editing.image || ''} onChange={(e) => set({ image: e.target.value })} placeholder="/assets/..." style={{ marginTop: 8 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => set({ is_featured: e.target.checked ? 1 : 0 })} />
              Featured item
            </label>
            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Media'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

const emptyCommunityThread: CommunityThreadRow = {
  id: 0,
  title: '',
  body: '',
  audience: 'member',
  author_name: '',
  is_pinned: 0,
  created_at: '',
}

function CommunityAdmin() {
  const [threads, setThreads] = useState<CommunityThreadRow[]>([])
  const [comments, setComments] = useState<CommunityCommentRow[]>([])
  const [editing, setEditing] = useState<CommunityThreadRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    api.get<{ threads: CommunityThreadRow[]; comments: CommunityCommentRow[] }>('admin/community')
      .then((d) => {
        setThreads(d.threads)
        setComments(d.comments)
      })
      .catch(() => {})

  useEffect(() => { load() }, [])
  const set = (patch: Partial<CommunityThreadRow>) => setEditing((row) => (row ? { ...row, ...patch } : row))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true); setError('')
    try {
      const payload = {
        title: editing.title,
        body: editing.body,
        audience: editing.audience,
        is_pinned: editing.is_pinned,
      }
      if (editing.id) await api.put(`admin/community/thread/${editing.id}`, payload)
      else await api.post('community/thread', payload)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const removeThread = async (id: number) => {
    if (!confirm('Delete this thread?')) return
    await api.del(`admin/community/thread/${id}`)
    load()
  }

  const removeComment = async (id: number) => {
    if (!confirm('Delete this comment?')) return
    await api.del(`admin/community/comment/${id}`)
    load()
  }

  const threadTitleById = Object.fromEntries(threads.map((row) => [row.id, row.title]))

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Community Board</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{threads.length} threads · {comments.length} comments</p>
        </div>
        <button className="btn btn--sm btn--solid" onClick={() => setEditing({ ...emptyCommunityThread })}>+ Add Thread</button>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <Table stack head={['Title', 'Audience', 'Pinned', 'Comments', 'Author', 'Date', 'Actions']}>
        {threads.map((row) => (
          <tr key={row.id} style={rowS}>
            <td data-label="Title" style={{ ...tdS, whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: 280 }}>{row.title}</td>
            <td data-label="Audience" style={tdS}>{row.audience}</td>
            <td data-label="Pinned" style={tdS}>{row.is_pinned ? 'Yes' : '—'}</td>
            <td data-label="Comments" style={tdS}>{row.comment_count ?? 0}</td>
            <td data-label="Author" style={tdS}>{row.author_name}</td>
            <td data-label="Date" style={tdS}>{row.created_at}</td>
            <td style={tdS}>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn btn--sm" onClick={() => setEditing(row)}>Edit</button>
                <button className="btn btn--sm" onClick={() => removeThread(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Table stack head={['Thread', 'Author', 'Comment', 'Date', 'Actions']}>
        {comments.map((row) => (
          <tr key={row.id} style={rowS}>
            <td data-label="Thread" style={tdS}>{threadTitleById[row.thread_id] || `Thread #${row.thread_id}`}</td>
            <td data-label="Author" style={tdS}>{row.author_name}</td>
            <td data-label="Comment" style={{ ...tdS, whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: 380 }}>{row.body}</td>
            <td data-label="Date" style={tdS}>{row.created_at}</td>
            <td style={tdS}>
              <button className="btn btn--sm" onClick={() => removeComment(row.id)} style={{ borderColor: '#7a3b3b', color: '#e08a8a' }}>Delete</button>
            </td>
          </tr>
        ))}
      </Table>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={save}>
            <button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editing.id ? 'Edit Thread' : 'New Thread'}</h3>

            <div className="field"><label>Title</label>
              <input type="text" required value={editing.title} onChange={(e) => set({ title: e.target.value })} /></div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="field" style={{ flex: 1 }}><label>Audience</label>
                <select value={editing.audience} onChange={(e) => set({ audience: e.target.value as CommunityThreadRow['audience'] })} style={fldSelectS}>
                  <option value="public">public</option>
                  <option value="member">member</option>
                  <option value="vip">vip</option>
                </select></div>
              <div className="field" style={{ width: 120 }}><label>Thread ID</label>
                <input type="text" value={editing.id || 'new'} disabled /></div>
            </div>

            <div className="field"><label>Body</label>
              <textarea className="fld-area" style={{ minHeight: 160 }} required value={editing.body} onChange={(e) => set({ body: e.target.value })} /></div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8d3c6', margin: '4px 0 16px' }}>
              <input type="checkbox" checked={!!editing.is_pinned} onChange={(e) => set({ is_pinned: e.target.checked ? 1 : 0 })} />
              Pin this thread
            </label>

            {error && <p className="msub" style={{ color: '#e08a8a' }}>{error}</p>}
            <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save Thread'}</button>
          </form>
        </div>
      )}
    </div>
  )
}

function RsvpsAdmin() {
  const [rows, setRows] = useState<EventRsvpRow[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = () => api.get<{ rsvps: EventRsvpRow[] }>('admin/event-rsvps').then((d) => setRows(d.rsvps)).catch(() => {})
  useEffect(() => { load() }, [])

  const update = async (id: number, status: string) => {
    setBusyId(id); setError('')
    try {
      await api.put(`admin/event-rsvp/${id}`, { status })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update RSVP.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Event RSVPs</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} RSVP records from the live database</p>
        </div>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <Table stack head={['Event', 'Name', 'Email', 'Status', 'Code', 'Notes', 'Date']}>
        {rows.map((row) => (
          <tr key={row.id} style={rowS}>
            <td style={tdS} data-label="Event">
              <div style={{ fontWeight: 600, color: '#f0e3bf' }}>{row.event_title || `Event #${row.event_id}`}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{row.location || '—'}{row.event_date ? ` · ${row.event_date}` : ''}</div>
            </td>
            <td style={tdS} data-label="Name">{row.full_name}</td>
            <td style={tdS} data-label="Email">{row.email}</td>
            <td style={tdS} data-label="Status">
              <select value={row.status} onChange={(e) => update(row.id, e.target.value)} style={selectS} disabled={busyId === row.id}>
                <option value="going">going</option>
                <option value="maybe">maybe</option>
                <option value="interested">interested</option>
                <option value="cancelled">cancelled</option>
              </select>
            </td>
            <td style={{ ...tdS, fontFamily: 'monospace', letterSpacing: '.04em' }} data-label="Code">{row.confirmation_code}</td>
            <td style={{ ...tdS, whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: 260 }} data-label="Notes">{row.notes || '—'}</td>
            <td style={tdS} data-label="Date">{row.created_at}</td>
          </tr>
        ))}
      </Table>
    </div>
  )
}

type InventoryDraft = {
  product_id: string
  name: string
  category: string
  tagline: string
  description: string
  details: string
  feature_list: string
  spec_list: string
  shipping_note: string
  image: string
  price: string
  stock: string
  low_stock_threshold: string
  visibility: ProductVisibility
  restock_note: string
  sort_order: string
}

const inventoryDraftFromRow = (row: InventoryRow): InventoryDraft => ({
  product_id: row.product_id,
  name: row.name || '',
  category: row.category || '',
  tagline: row.tagline || '',
  description: row.description || '',
  details: row.details || '',
  feature_list: row.feature_list || '',
  spec_list: row.spec_list || '',
  shipping_note: row.shipping_note || '',
  image: row.image || '',
  price: String(row.price ?? 0),
  stock: String(row.stock ?? 0),
  low_stock_threshold: String(row.low_stock_threshold ?? 0),
  visibility: row.visibility,
  restock_note: row.restock_note || '',
  sort_order: String(row.sort_order ?? 0),
})

const emptyInventoryDraft = (sortOrder: number): InventoryDraft => ({
  product_id: '',
  name: '',
  category: '',
  tagline: '',
  description: '',
  details: '',
  feature_list: '',
  spec_list: '',
  shipping_note: '',
  image: '',
  price: '0',
  stock: '0',
  low_stock_threshold: '5',
  visibility: 'upcoming',
  restock_note: '',
  sort_order: String(sortOrder),
})

const inventoryTone = (row: Pick<InventoryRow, 'visibility' | 'stock_status'>): { label: string; tone: 'green' | 'amber' | 'red' | 'muted' } => {
  if (row.visibility === 'hidden') return { label: 'Hidden', tone: 'muted' }
  if (row.visibility === 'upcoming') return { label: 'Upcoming', tone: 'amber' }
  if (row.stock_status === 'out') return { label: 'Sold out', tone: 'red' }
  if (row.stock_status === 'low') return { label: 'Low stock', tone: 'amber' }
  return { label: 'Live', tone: 'green' }
}

const badgePill = (tone: 'green' | 'amber' | 'red' | 'muted'): React.CSSProperties => {
  const palette = {
    green: { border: 'rgba(143,191,150,0.38)', color: '#8FBF96', background: 'rgba(15,91,58,0.16)' },
    amber: { border: 'rgba(201,168,76,0.38)', color: '#F5D48A', background: 'rgba(201,168,76,0.12)' },
    red: { border: 'rgba(224,138,138,0.42)', color: '#e08a8a', background: 'rgba(122,59,59,0.16)' },
    muted: { border: 'rgba(128,119,104,0.42)', color: '#807768', background: 'rgba(128,119,104,0.12)' },
  }[tone]

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    padding: '6px 10px',
    border: `1px solid ${palette.border}`,
    color: palette.color,
    background: palette.background,
    fontSize: 11,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  }
}

function InventoryAdmin() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [editing, setEditing] = useState<InventoryDraft | null>(null)
  const [editingIsNew, setEditingIsNew] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>())
  const [error, setError] = useState('')

  const load = () =>
    api.get<{ inventory: InventoryRow[] }>('admin/inventory')
      .then((d) => setRows(d.inventory))
      .catch(() => {})

  useEffect(() => { void load() }, [])

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev
      const currentIds = new Set(rows.map((row) => row.product_id))
      let changed = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (currentIds.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [rows])

  const isBusy = busyId !== null || bulkBusy
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.product_id)),
    [rows, selectedIds],
  )
  const selectedCount = selectedRows.length
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.product_id))
  const nextSortOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1
  const liveCount = rows.filter((row) => row.visibility === 'live').length
  const upcomingCount = rows.filter((row) => row.visibility === 'upcoming').length
  const hiddenCount = rows.filter((row) => row.visibility === 'hidden').length
  const soldOutCount = rows.filter((row) => row.visibility === 'live' && row.stock_status === 'out').length

  const clearSelection = () => setSelectedIds(new Set<string>())

  const inventoryRowPayload = (row: InventoryRow, visibility: ProductVisibility = row.visibility): Record<string, unknown> => ({
    name: row.name,
    category: row.category,
    tagline: row.tagline,
    description: row.description,
    details: row.details,
    feature_list: row.feature_list,
    spec_list: row.spec_list,
    shipping_note: row.shipping_note,
    image: row.image,
    price: row.price,
    stock: row.stock,
    low_stock_threshold: row.low_stock_threshold,
    visibility,
    restock_note: row.restock_note,
    sort_order: row.sort_order,
  })

  const inventoryDraftPayload = (draft: InventoryDraft): Record<string, unknown> => ({
    name: draft.name.trim(),
    category: draft.category.trim() || null,
    tagline: draft.tagline.trim() || null,
    description: draft.description.trim() || null,
    details: draft.details.trim() || null,
    feature_list: draft.feature_list.trim() || null,
    spec_list: draft.spec_list.trim() || null,
    shipping_note: draft.shipping_note.trim() || null,
    image: draft.image.trim() || null,
    price: Number(draft.price || 0),
    stock: Number(draft.stock || 0),
    low_stock_threshold: Number(draft.low_stock_threshold || 0),
    visibility: draft.visibility,
    restock_note: draft.restock_note.trim() || null,
    sort_order: Number(draft.sort_order || 0),
  })

  const openNewProduct = () => {
    if (isBusy) return
    setError('')
    setEditingIsNew(true)
    setEditing(emptyInventoryDraft(nextSortOrder))
  }

  const openEditProduct = (row: InventoryRow) => {
    if (isBusy) return
    setError('')
    setEditingIsNew(false)
    setEditing(inventoryDraftFromRow(row))
  }

  const toggleSelected = (productId: string) => {
    if (isBusy) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (isBusy) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) rows.forEach((row) => next.delete(row.product_id))
      else rows.forEach((row) => next.add(row.product_id))
      return next
    })
  }

  const saveRow = async (productId: string, payload: Record<string, unknown>) => {
    setBusyId(productId)
    setError('')
    try {
      await api.put(`admin/inventory/${encodeURIComponent(productId)}`, payload)
      await load()
      clearSelection()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update merch product.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const deleteRow = async (row: InventoryRow) => {
    if (!window.confirm(`Delete ${row.name} (${row.product_id})? This cannot be undone.`)) return
    setBusyId(row.product_id)
    setError('')
    try {
      await api.del(`admin/inventory/${encodeURIComponent(row.product_id)}`)
      await load()
      clearSelection()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete merch product.')
    } finally {
      setBusyId(null)
    }
  }

  const saveEditing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return

    const productId = editing.product_id.trim()
    if (!productId) {
      setError('Product ID is required.')
      return
    }
    if (!editing.name.trim()) {
      setError('Product name is required.')
      return
    }

    const ok = await saveRow(productId, inventoryDraftPayload(editing))

    if (ok) {
      setEditing(null)
      setEditingIsNew(false)
    }
  }

  const applyVisibility = async (row: InventoryRow, visibility: ProductVisibility) => {
    await saveRow(row.product_id, inventoryRowPayload(row, visibility))
  }

  const bulkUpdateVisibility = async (visibility: ProductVisibility) => {
    if (!selectedRows.length) return
    setBulkBusy(true)
    setError('')
    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => api.put(`admin/inventory/${encodeURIComponent(row.product_id)}`, inventoryRowPayload(row, visibility))),
      )
      await load()
      const failed = results.find((result) => result.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        const reason = failed.reason
        setError(reason instanceof Error ? reason.message : 'Some products could not be updated.')
      } else {
        clearSelection()
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkDeleteSelected = async () => {
    if (!selectedRows.length) return
    const count = selectedRows.length
    if (!window.confirm(`Delete ${count} selected product${count === 1 ? '' : 's'}? This cannot be undone.`)) return

    setBulkBusy(true)
    setError('')
    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => api.del(`admin/inventory/${encodeURIComponent(row.product_id)}`)),
      )
      await load()
      const failed = results.find((result) => result.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        const reason = failed.reason
        setError(reason instanceof Error ? reason.message : 'Some products could not be deleted.')
      } else {
        clearSelection()
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const submitLabel = bulkBusy ? 'Working...' : busyId ? 'Saving...' : 'Save Product'

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Products & Inventory</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            {rows.length} products - {liveCount} live - {upcomingCount} upcoming - {hiddenCount} hidden - {soldOutCount} sold out
          </p>
        </div>
        <button className="btn btn--sm btn--solid" onClick={openNewProduct} disabled={isBusy}>+ Add Product</button>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      {selectedCount > 0 && (
        <div className="admin-bulkbar">
          <span className="admin-bulkbar__count">{selectedCount} selected</span>
          <button type="button" className="btn btn--sm" onClick={() => void bulkUpdateVisibility('live')} disabled={isBusy}>Set live</button>
          <button type="button" className="btn btn--sm" onClick={() => void bulkUpdateVisibility('upcoming')} disabled={isBusy}>Set upcoming</button>
          <button type="button" className="btn btn--sm" onClick={() => void bulkUpdateVisibility('hidden')} disabled={isBusy}>Hide selected</button>
          <button type="button" className="btn btn--sm admin-bulkbar__danger" onClick={() => void bulkDeleteSelected()} disabled={isBusy}>Delete selected</button>
          <button type="button" className="btn btn--sm" onClick={clearSelection} disabled={isBusy}>Clear</button>
        </div>
      )}

      <div className="admin-table-wrap glass">
        <table className="admin-table admin-table--stack">
          <thead>
            <tr>
              <th className="admin-table__check">
                <input
                  type="checkbox"
                  aria-label="Select all products"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={isBusy || rows.length === 0}
                />
              </th>
              <th>Product</th>
              <th>Visibility</th>
              <th>Stock</th>
              <th>Threshold</th>
              <th>Status</th>
              <th>Price</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length
              ? rows.map((row) => {
                  const tone = inventoryTone(row)
                  const visibilityLabel = row.visibility === 'hidden' ? 'Restore' : 'Hide'
                  return (
                    <tr key={row.product_id}>
                      <td className="admin-table__check">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selectedIds.has(row.product_id)}
                          onChange={() => toggleSelected(row.product_id)}
                          disabled={isBusy}
                        />
                      </td>
                      <td data-label="Product">
                        <div style={{ fontWeight: 600, color: '#f0e3bf' }}>{row.name}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                          {row.product_id} - {row.category || 'Uncategorized'}
                        </div>
                      </td>
                      <td data-label="Visibility">
                        <span style={badgePill(row.visibility === 'hidden' ? 'muted' : row.visibility === 'upcoming' ? 'amber' : 'green')}>
                          {row.visibility}
                        </span>
                      </td>
                      <td data-label="Stock">{row.stock}</td>
                      <td data-label="Threshold">{row.low_stock_threshold}</td>
                      <td data-label="Status">
                        <span style={badgePill(tone.tone)}>{tone.label}</span>
                      </td>
                      <td data-label="Price">${Number(row.price || 0).toFixed(2)}</td>
                      <td data-label="Updated">{row.updated_at || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn btn--sm" onClick={() => openEditProduct(row)} disabled={isBusy}>Edit</button>
                          <button className="btn btn--sm" onClick={() => void applyVisibility(row, row.visibility === 'hidden' ? 'live' : 'hidden')} disabled={isBusy}>
                            {visibilityLabel}
                          </button>
                          <RowMenu
                            disabled={isBusy}
                            actions={[
                              { label: 'Edit product', onClick: () => openEditProduct(row), disabled: isBusy },
                              { label: 'Set live', onClick: () => void applyVisibility(row, 'live'), disabled: isBusy },
                              { label: 'Set upcoming', onClick: () => void applyVisibility(row, 'upcoming'), disabled: isBusy },
                              { label: row.visibility === 'hidden' ? 'Restore to live' : 'Hide product', onClick: () => void applyVisibility(row, row.visibility === 'hidden' ? 'live' : 'hidden'), disabled: isBusy },
                              { label: 'Delete product', danger: true, onClick: () => void deleteRow(row), disabled: isBusy },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              : <tr><td className="admin-table__empty" colSpan={9}>No inventory items found.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && !isBusy && (setEditing(null), setEditingIsNew(false))}>
          <form className="modal" style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }} onSubmit={saveEditing}>
            <button type="button" className="close" onClick={() => { setEditing(null); setEditingIsNew(false) }} aria-label="Close" disabled={isBusy}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h3 className="gold-text">{editingIsNew ? 'New Product' : 'Edit Product'}</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '4px 0 18px' }}>
              Hidden removes the product from the public store, upcoming keeps it visible as a future drop, and live publishes it.
            </p>

            <div className="field">
              <label>Product ID</label>
              <input
                type="text"
                required
                value={editing.product_id}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, product_id: e.target.value } : prev))}
                placeholder="hoodie-spring-drop"
                disabled={!editingIsNew}
              />
            </div>

            <div className="field">
              <label>Product Name</label>
              <input type="text" required value={editing.name} onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))} />
            </div>

            <div className="fgrid">
              <div className="field">
                <label>Category</label>
                <input type="text" value={editing.category} onChange={(e) => setEditing((prev) => (prev ? { ...prev, category: e.target.value } : prev))} placeholder="Hoodies, Caps, Books" />
              </div>
              <div className="field">
                <label>Price</label>
                <input type="number" min="0" step="0.01" value={editing.price} onChange={(e) => setEditing((prev) => (prev ? { ...prev, price: e.target.value } : prev))} />
              </div>
              <div className="field">
                <label>Visibility</label>
                <select value={editing.visibility} onChange={(e) => setEditing((prev) => (prev ? { ...prev, visibility: e.target.value as ProductVisibility } : prev))} style={fldSelectS}>
                  <option value="live">Live</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
              <div className="field">
                <label>Sort Order</label>
                <input type="number" min="0" value={editing.sort_order} onChange={(e) => setEditing((prev) => (prev ? { ...prev, sort_order: e.target.value } : prev))} />
              </div>
              <div className="field">
                <label>Stock</label>
                <input type="number" min="0" value={editing.stock} onChange={(e) => setEditing((prev) => (prev ? { ...prev, stock: e.target.value } : prev))} />
              </div>
              <div className="field">
                <label>Low Stock Threshold</label>
                <input type="number" min="0" value={editing.low_stock_threshold} onChange={(e) => setEditing((prev) => (prev ? { ...prev, low_stock_threshold: e.target.value } : prev))} />
              </div>
            </div>

            <div className="field">
              <label>Image URL</label>
              <input type="text" value={editing.image} onChange={(e) => setEditing((prev) => (prev ? { ...prev, image: e.target.value } : prev))} placeholder="/assets/merch-hoodie.webp" />
            </div>

            <div className="field">
              <label>Tagline</label>
              <input type="text" value={editing.tagline} onChange={(e) => setEditing((prev) => (prev ? { ...prev, tagline: e.target.value } : prev))} placeholder="Short product line shown near the title" />
            </div>

            <div className="field">
              <label>Card Description</label>
              <textarea className="fld-area" style={{ minHeight: 100 }} value={editing.description} onChange={(e) => setEditing((prev) => (prev ? { ...prev, description: e.target.value } : prev))} placeholder="Short description for store cards" />
            </div>

            <div className="field">
              <label>Detailed Story</label>
              <textarea className="fld-area" style={{ minHeight: 140 }} value={editing.details} onChange={(e) => setEditing((prev) => (prev ? { ...prev, details: e.target.value } : prev))} placeholder="Longer product detail content for the quick-view modal" />
            </div>

            <div className="fgrid">
              <div className="field">
                <label>Feature Highlights</label>
                <textarea className="fld-area" style={{ minHeight: 140 }} value={editing.feature_list} onChange={(e) => setEditing((prev) => (prev ? { ...prev, feature_list: e.target.value } : prev))} placeholder={"One highlight per line\nHeavyweight fleece\nEmbroidered emblem"} />
              </div>
              <div className="field">
                <label>Product Specs</label>
                <textarea className="fld-area" style={{ minHeight: 140 }} value={editing.spec_list} onChange={(e) => setEditing((prev) => (prev ? { ...prev, spec_list: e.target.value } : prev))} placeholder={"One spec per line\nFit: Relaxed\nCollection: Core"} />
              </div>
            </div>

            <div className="fgrid">
              <div className="field">
                <label>Shipping Note</label>
                <input type="text" value={editing.shipping_note} onChange={(e) => setEditing((prev) => (prev ? { ...prev, shipping_note: e.target.value } : prev))} placeholder="Ships in 2-4 business days" />
              </div>
              <div className="field">
                <label>Restock Note</label>
                <input type="text" value={editing.restock_note} onChange={(e) => setEditing((prev) => (prev ? { ...prev, restock_note: e.target.value } : prev))} placeholder="Core collection stock" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 6 }}>
              <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, maxWidth: 420 }}>
                Set visibility to <strong>live</strong> when you want it on the store, <strong>upcoming</strong> when it should preview publicly, and <strong>hidden</strong> to remove it from the public site.
              </p>
              <button type="submit" className="btn btn--solid" disabled={isBusy}>
                {submitLabel}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function InventoryAdminLegacy() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, { stock: string; low_stock_threshold: string; restock_note: string }>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = () =>
    api.get<{ inventory: InventoryRow[] }>('admin/inventory')
      .then((d) => {
        setRows(d.inventory)
        setDrafts(Object.fromEntries(
          d.inventory.map((row) => [row.product_id, {
            stock: String(row.stock),
            low_stock_threshold: String(row.low_stock_threshold),
            restock_note: row.restock_note || '',
          }]),
        ))
      })
      .catch(() => {})

  useEffect(() => { load() }, [])

  const setDraft = (productId: string, patch: Partial<{ stock: string; low_stock_threshold: string; restock_note: string }>) => {
    setDrafts((prev) => ({
      ...prev,
      [productId]: {
        stock: prev[productId]?.stock ?? '',
        low_stock_threshold: prev[productId]?.low_stock_threshold ?? '',
        restock_note: prev[productId]?.restock_note ?? '',
        ...patch,
      },
    }))
  }

  const save = async (productId: string) => {
    const draft = drafts[productId]
    if (!draft) return
    setBusyId(productId); setError('')
    try {
      await api.put(`admin/inventory/${productId}`, {
        stock: Number(draft.stock || 0),
        low_stock_threshold: Number(draft.low_stock_threshold || 0),
        restock_note: draft.restock_note,
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update inventory.')
    } finally {
      setBusyId(null)
    }
  }

  const lowStock = rows.filter((row) => row.status !== 'in').length

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
      <div className="glass" style={{ padding: 20, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 className="gold-text">Inventory</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} products · {lowStock} need attention</p>
        </div>
      </div>

      {error && <p style={{ color: '#e08a8a', fontSize: 13 }}>{error}</p>}

      <Table head={['Product', 'Stock', 'Threshold', 'Status', 'Restock note', 'Updated', 'Actions']}>
        {rows.map((row) => {
          const draft = drafts[row.product_id] || {
            stock: String(row.stock),
            low_stock_threshold: String(row.low_stock_threshold),
            restock_note: row.restock_note || '',
          }
          return (
            <tr key={row.product_id} style={rowS}>
              <td style={tdS}>
                <div style={{ fontWeight: 600, color: '#f0e3bf' }}>{row.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{row.product_id} · ${row.price.toFixed(2)}</div>
              </td>
              <td style={tdS}>
                <input type="number" min="0" value={draft.stock} onChange={(e) => setDraft(row.product_id, { stock: e.target.value })} style={{ width: 92, ...selectS }} />
              </td>
              <td style={tdS}>
                <input type="number" min="0" value={draft.low_stock_threshold} onChange={(e) => setDraft(row.product_id, { low_stock_threshold: e.target.value })} style={{ width: 92, ...selectS }} />
              </td>
              <td style={tdS}>
                <span className={`card__badge${row.status === 'out' ? ' red' : row.status === 'low' ? ' amber' : ' green'}`} style={{ position: 'static', display: 'inline-flex' }}>
                  {row.status === 'out' ? 'Sold out' : row.status === 'low' ? 'Low stock' : 'In stock'}
                </span>
              </td>
              <td style={{ ...tdS, minWidth: 220 }}>
                <input type="text" value={draft.restock_note} onChange={(e) => setDraft(row.product_id, { restock_note: e.target.value })} placeholder="Restock note" style={{ width: '100%', ...selectS }} />
              </td>
              <td style={tdS}>{row.updated_at || '—'}</td>
              <td style={tdS}>
                <button className="btn btn--sm btn--solid" onClick={() => save(row.product_id)} disabled={busyId === row.product_id}>
                  {busyId === row.product_id ? 'Saving…' : 'Save'}
                </button>
              </td>
            </tr>
          )
        })}
      </Table>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  const cls = ['approved', 'paid', 'fulfilled', 'going', 'protected', 'active'].includes(s)
    ? 'status-pill--approved'
    : ['rejected', 'closed', 'cancelled'].includes(s)
      ? 'status-pill--closed'
      : 'status-pill--new'
  return <span className={`status-pill ${cls}`}>{status}</span>
}

interface StatChipItem { label: string; value: number | string; tone?: 'gold' | 'green' | 'red' | 'blue' | 'muted'; hint?: string }
/** In-tab "actual counter" strip — the full breakdown, distinct from the sidebar notification badges.
 *  Hovering a chip shows a short description of what the counter means. */
function StatChips({ items }: { items: StatChipItem[] }) {
  return (
    <div className="admin-statchips">
      {items.map((it) => (
        <div key={it.label} className={`admin-statchip${it.tone ? ` admin-statchip--${it.tone}` : ''}`} data-hint={statHint(it.label, it.hint)}>
          <strong>{it.value}</strong>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

interface MenuAction { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
/**
 * Compact 3-dot (kebab) actions menu for table rows. The dropdown is rendered in a
 * portal on document.body (NOT inside the table) because the admin cards use
 * `.glass { backdrop-filter / transform }`, which would otherwise become the
 * containing block for a fixed element and clip it inside the overflow scroller.
 * Fixed-positioned at the trigger; closes on outside click, Escape, scroll, or resize.
 */
function RowMenu({ actions, disabled = false }: { actions: MenuAction[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div className="row-menu">
      <button ref={triggerRef} type="button" className="row-menu__trigger" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle}>
        <span /><span /><span />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="row-menu__dropdown" role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}>
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`row-menu__item${a.danger ? ' row-menu__item--danger' : ''}`}
              disabled={a.disabled}
              onClick={() => { setOpen(false); a.onClick() }}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

interface BulkAction { label: string; danger?: boolean; onClick: (ids: number[]) => void | Promise<void> }
interface DataTableProps<T> {
  head: string[]
  rows: T[]
  renderRow: (row: T, checkbox?: React.ReactNode, index?: number) => React.ReactNode
  searchText?: (row: T) => string
  statusOf?: (row: T) => string
  statusOptions?: string[]
  /** Optional second dropdown filter (e.g. by role). */
  filter2Of?: (row: T) => string
  filter2Options?: string[]
  filter2AllLabel?: string
  searchPlaceholder?: string
  pageSize?: number
  rowId?: (row: T) => number
  rowSelectable?: (row: T) => boolean
  bulkActions?: BulkAction[]
  /** On phones, render each row as a stacked card (cells need data-label). */
  stack?: boolean
}

/** List table with search, status filter, result counter, pagination, and optional bulk selection/actions. */
function DataTable<T>({ head, rows, renderRow, searchText, statusOf, statusOptions, filter2Of, filter2Options, filter2AllLabel, searchPlaceholder, pageSize = 10, rowId, rowSelectable, bulkActions, stack }: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [filter2, setFilter2] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const bulkEnabled = !!(rowId && bulkActions && bulkActions.length)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (q && searchText && !searchText(row).toLowerCase().includes(q)) return false
      if (statusFilter !== 'all' && statusOf && (statusOf(row) || '').toLowerCase() !== statusFilter) return false
      if (filter2 !== 'all' && filter2Of && (filter2Of(row) || '').toLowerCase() !== filter2) return false
      return true
    })
  }, [rows, query, statusFilter, filter2, searchText, statusOf, filter2Of])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  useEffect(() => { if (page !== safePage) setPage(safePage) }, [page, safePage])
  const start = (safePage - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const isSelectable = (row: T) => bulkEnabled && (!rowSelectable || rowSelectable(row))
  const pageSelectableIds = bulkEnabled ? pageRows.filter(isSelectable).map((r) => rowId!(r)) : []
  const allPageSelected = pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selected.has(id))
  const selectedIds = [...selected]

  const toggleOne = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const togglePage = () => setSelected((prev) => {
    const next = new Set(prev)
    if (allPageSelected) pageSelectableIds.forEach((id) => next.delete(id))
    else pageSelectableIds.forEach((id) => next.add(id))
    return next
  })
  const clearSelection = () => setSelected(new Set())
  const runBulk = async (action: BulkAction) => {
    if (!selectedIds.length) return
    await action.onClick(selectedIds)
    clearSelection()
  }

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        {searchText && (
          <input
            className="admin-toolbar__search"
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder={searchPlaceholder || 'Search…'}
          />
        )}
        {statusOptions && statusOf && (
          <select
            className="admin-toolbar__filter"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <option value="all">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>
        )}
        {filter2Options && filter2Options.length > 0 && filter2Of && (
          <select
            className="admin-toolbar__filter"
            value={filter2}
            onChange={(e) => { setFilter2(e.target.value); setPage(1) }}
          >
            <option value="all">{filter2AllLabel || 'All'}</option>
            {filter2Options.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>
        )}
        <span className="admin-toolbar__count">
          {filtered.length === rows.length ? `${rows.length}` : `${filtered.length} of ${rows.length}`} {rows.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      {bulkEnabled && selectedIds.length > 0 && (
        <div className="admin-bulkbar">
          <span className="admin-bulkbar__count">{selectedIds.length} selected</span>
          {bulkActions!.map((a, i) => (
            <button
              key={i}
              type="button"
              className={`btn btn--sm${a.danger ? ' admin-bulkbar__danger' : ''}`}
              onClick={() => void runBulk(a)}
            >
              {a.label}
            </button>
          ))}
          <button type="button" className="btn btn--sm" onClick={clearSelection}>Clear</button>
        </div>
      )}

      <div className="admin-table-wrap glass">
        <table className={`admin-table${stack ? ' admin-table--stack' : ''}`}>
          <thead>
            <tr>
              {bulkEnabled && (
                <th className="admin-table__check">
                  <input type="checkbox" aria-label="Select all on page" checked={allPageSelected} onChange={togglePage} />
                </th>
              )}
              {head.map((h, i) => <th key={h || `col-${i}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.length
              ? pageRows.map((row, i) => renderRow(
                  row,
                  bulkEnabled
                    ? (isSelectable(row)
                        ? <td className="admin-table__check"><input type="checkbox" aria-label="Select row" checked={selected.has(rowId!(row))} onChange={() => toggleOne(rowId!(row))} /></td>
                        : <td className="admin-table__check" />)
                    : undefined,
                  start + i + 1,
                ))
              : <tr><td className="admin-table__empty" colSpan={head.length + (bulkEnabled ? 1 : 0)}>No matching records.</td></tr>}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="admin-pager">
          <button type="button" className="btn btn--sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹ Prev</button>
          <span className="admin-pager__label">Page {safePage} of {pageCount}</span>
          <button type="button" className="btn btn--sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>Next ›</button>
        </div>
      )}
    </div>
  )
}

function Table({ head, children, stack }: { head: string[]; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className="glass admin-table-wrap" style={{ borderRadius: 14 }}>
      <table className={stack ? 'admin-table--stack' : undefined} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
        <thead>
          <tr>{head.map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const wrapS: React.CSSProperties = { minHeight: '100vh', color: 'var(--white)', padding: '0 clamp(12px,4vw,24px) 60px', fontFamily: 'var(--f-body)' }
const thS: React.CSSProperties = { textAlign: 'left', padding: '14px 16px', color: 'var(--gold-light)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.06em' }
const tdS: React.CSSProperties = { padding: '13px 16px', verticalAlign: 'top', color: '#d8d3c6', whiteSpace: 'nowrap' }
const rowS: React.CSSProperties = { borderBottom: '1px solid rgba(201,168,76,0.08)' }
const selectS: React.CSSProperties = { background: '#15130c', color: '#e7d8a8', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px' }















