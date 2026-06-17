import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { buildLocalQrDataUri } from '../lib/localQr.js'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'

const isAdminRole = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')

const value = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const checked = (fd: FormData, key: string) => fd.get(key) !== null
const fileValue = (fd: FormData, key: string) => {
  const item = fd.get(key)
  return item instanceof File && item.size > 0 ? item : null
}
const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const formatMoney = (amount: any) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(amount || 0))

const formatDateLabel = (value?: string) => {
  if (!value) return 'To be announced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '')
  const escaped = text.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

const buildCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(','))
  })
  return lines.join('\n')
}

const downloadCsvFile = (filename: string, rows: Record<string, unknown>[]) => {
  const csv = buildCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const qrImageSrc = (target?: string) => {
  if (!target || typeof window === 'undefined') return ''
  try {
    const absolute = new URL(target, window.location.origin).toString()
    return buildLocalQrDataUri(absolute)
  } catch {
    return ''
  }
}

async function uploadIfPresent(file: File | null): Promise<string> {
  if (!file) return ''
  const res = await api.upload<{ url: string }>('new-school/upload', file)
  return res.url
}

function clipText(text: string, max = 120) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

type RegistrationTag = 'student' | 'parent' | 'school' | 'teacher'
type DashboardTabKey = 'overview' | 'profile' | 'activity' | 'rankings' | 'records' | 'approvals' | 'reviews' | 'notifications' | 'data'
type SchoolRecordsTabKey = 'students' | 'teachers' | 'interviews' | 'approvals' | 'projects'
type DashboardTabConfig = { key: DashboardTabKey; label: string; hint: string; badge?: string }

const registrationOptions: Array<{
  key: RegistrationTag
  title: string
  detail: string
}> = [
  { key: 'student', title: 'Student', detail: 'Create the challenge participant profile.' },
  { key: 'parent', title: 'Parent', detail: 'Use the QR consent flow to approve participation.' },
  { key: 'school', title: 'School', detail: 'Register the school account and approval workspace.' },
  { key: 'teacher', title: 'Teacher', detail: 'Register the teacher dashboard and tracking view.' },
]

const participantCards = [
  {
    kicker: 'Open To',
    title: 'Students Ages 11-19',
    detail: 'Lead the interviews, identify the problem, and turn ideas into a solution.',
  },
  {
    kicker: 'Support',
    title: 'Parents',
    detail: 'Give consent, support the student, and stay informed through the QR flow.',
  },
  {
    kicker: 'Guide',
    title: 'Teachers',
    detail: 'Track progress, confirm readiness, and help guide each project.',
  },
  {
    kicker: 'Verify',
    title: 'Schools',
    detail: 'Verify participation and support the challenge at the building level.',
  },
  {
    kicker: 'Partner',
    title: 'Community Partners',
    detail: 'Share real business challenges and help students learn from the field.',
  },
]

const dashboardTabsByRole: Record<string, DashboardTabConfig[]> = {
  student: [
    { key: 'overview', label: 'Overview', hint: 'Status and progress' },
    { key: 'profile', label: 'Profile', hint: 'Approvals and identity' },
    { key: 'activity', label: 'Activity', hint: 'Business and submission work' },
    { key: 'rankings', label: 'Rankings', hint: 'Competition board' },
    { key: 'notifications', label: 'Alerts', hint: 'Unread updates' },
  ],
  parent: [
    { key: 'overview', label: 'Overview', hint: 'Consent and student snapshot' },
    { key: 'profile', label: 'Profile', hint: 'Linked student details' },
    { key: 'rankings', label: 'Rankings', hint: 'Competition board' },
    { key: 'notifications', label: 'Alerts', hint: 'Unread updates' },
  ],
  school: [
    { key: 'overview', label: 'Overview', hint: 'School summary' },
    { key: 'profile', label: 'Profile', hint: 'School identity' },
    { key: 'approvals', label: 'Approvals', hint: 'Teacher & student review' },
    { key: 'rankings', label: 'Rankings', hint: 'Competition board' },
    { key: 'records', label: 'Records', hint: 'Students & submissions' },
    { key: 'reviews', label: 'Reviews', hint: 'Submission tools' },
    { key: 'notifications', label: 'Alerts', hint: 'Notifications' },
  ],
  teacher: [
    { key: 'overview', label: 'Overview', hint: 'Teacher summary' },
    { key: 'profile', label: 'Profile', hint: 'Teacher identity' },
    { key: 'approvals', label: 'Approvals', hint: 'Student review tools' },
    { key: 'rankings', label: 'Rankings', hint: 'Teacher competition board' },
    { key: 'records', label: 'Records', hint: 'Students and submissions' },
    { key: 'reviews', label: 'Reports', hint: 'Leaderboards and exports' },
    { key: 'notifications', label: 'Alerts', hint: 'Unread updates' },
  ],
  admin: [
    { key: 'overview', label: 'Overview', hint: 'Platform summary' },
    { key: 'profile', label: 'Profile', hint: 'Platform identity' },
    { key: 'data', label: 'Data', hint: 'Schools, parents, approvals' },
    { key: 'reviews', label: 'Reviews', hint: 'Submission decisions' },
    { key: 'rankings', label: 'Rankings', hint: 'Global leaderboard' },
    { key: 'notifications', label: 'Alerts', hint: 'Unread updates' },
  ],
}

const movementSteps = [
  {
    badge: '①',
    title: 'Register',
    detail: 'Create the student, parent, school, or teacher profile to get started.',
  },
  {
    badge: '②',
    title: 'Interview 10 Local Businesses',
    detail: 'Collect real feedback from the community and document each visit.',
  },
  {
    badge: '③',
    title: 'Identify A Community Problem',
    detail: 'Turn interview notes into a clear problem statement worth solving.',
  },
  {
    badge: '④',
    title: 'Develop A Solution',
    detail: 'Build a practical plan that can make a measurable difference.',
  },
  {
    badge: '⑤',
    title: 'Submit Your Project',
    detail: 'Upload the final video and written summary for review.',
  },
  {
    badge: '⑥',
    title: 'Compete For Scholarships & School Grants',
    detail: 'Enter the judging stage for awards and recognition.',
  },
]

export default function NewSchool() {
  const { token } = useParams()
  const location = useLocation()
  const { user, loading, refresh } = useAuth()
  const isDashboardRoute = location.pathname.startsWith('/new-school/dashboard')
  const [overview, setOverview] = useState<any>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [adminSummary, setAdminSummary] = useState<any>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<DashboardTabKey>('overview')
  const [parentLink, setParentLink] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [registrationTag, setRegistrationTag] = useState<RegistrationTag>('student')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [studentSchoolSearch, setStudentSchoolSearch] = useState('')
  const [studentTeacherId, setStudentTeacherId] = useState('')
  const [teacherSchoolSearch, setTeacherSchoolSearch] = useState('')
  const [parentSchoolSearch, setParentSchoolSearch] = useState('')
  const [parentTeacherId, setParentTeacherId] = useState('')
  const [parentParticipantId, setParentParticipantId] = useState('')
  const [schoolTeacherApprovalId, setSchoolTeacherApprovalId] = useState('')
  const [schoolRecordsTab, setSchoolRecordsTab] = useState<SchoolRecordsTabKey>('students')
  const [schoolSubmissionReviewId, setSchoolSubmissionReviewId] = useState('')

  useSeo({
    title: isDashboardRoute ? 'New School Dashboard' : 'What Problem Will You Solve?',
    description: isDashboardRoute
      ? 'Private role dashboard for approved students, parents, schools, teachers, and admins.'
      : 'Join New York\'s Largest Student Problem-Solving Movement - student registration, parent QR consent, school and teacher approval, business interviews, and scholarship submissions.',
  })

  const accountApprovalStatus = (user?.approval_status || 'approved').toString()
  const hasApprovedChallengeAccess = !user || isAdminRole(user.role) || accountApprovalStatus === 'approved'
  const dashboardHref = user ? resolveDashboardRoute(user.role) : '/demo-login'

  const showNotice = (tone: 'success' | 'error' | 'info', text: string) => {
    setNotice({ tone, text })
    window.fcToast?.(text)
  }

  const handleError = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback
    showNotice('error', message)
  }

  const openRegistrationTag = (tag: RegistrationTag) => {
    setRegistrationTag(tag)
    window.requestAnimationFrame(() => {
      document.getElementById('registration')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const reloadOverview = async () => {
    const data = await api.get<any>('new-school/overview')
    setOverview(data)
  }

  const reloadDashboard = async () => {
    if (!user) return
    setDashboardLoading(true)
    try {
      if (isAdminRole(user.role)) {
        const data = await api.get<any>('admin/new-school/summary')
        setAdminSummary(data)
        setDashboard(null)
        return
      }
      const data = await api.get<any>('new-school/dashboard')
      setDashboard(data)
      setAdminSummary(null)
    } finally {
      setDashboardLoading(false)
    }
  }

  const reloadParentLink = async (qrToken: string) => {
    const data = await api.get<any>(`new-school/parent/${qrToken}`)
    setParentLink(data)
    setParentParticipantId(data?.student?.participant_id || '')
    setParentSchoolSearch(data?.school?.school_name || '')
    setParentTeacherId(data?.teacher?.id ? String(data.teacher.id) : '')
  }

  const markNotificationRead = async (notificationId: number) => {
    if (!notificationId) return
    try {
      await api.post<any>(`new-school/notifications/${notificationId}/read`, {})
      await reloadDashboard()
    } catch (err) {
      handleError(err, 'Could not update the notification.')
    }
  }

  useEffect(() => {
    if (isDashboardRoute) {
      setOverview(null)
      return
    }

    let alive = true
    let inFlight = false
    const syncOverview = async () => {
      if (!alive || inFlight) return
      inFlight = true
      try {
        await reloadOverview()
      } catch (err) {
        handleError(err, 'Could not load challenge overview.')
      } finally {
        inFlight = false
      }
    }

    void syncOverview()
    const interval = window.setInterval(() => {
      void syncOverview()
    }, 30000)

    return () => {
      alive = false
      window.clearInterval(interval)
    }
  }, [isDashboardRoute])

  useEffect(() => {
    if (loading) return
    if (!isDashboardRoute) {
      setDashboard(null)
      setAdminSummary(null)
      return
    }
    if (user) {
      if (hasApprovedChallengeAccess) {
        reloadDashboard().catch((err) => handleError(err, 'Could not load dashboard data.'))
      } else {
        setDashboard(null)
        setAdminSummary(null)
      }
    } else {
      setDashboard(null)
      setAdminSummary(null)
    }
  }, [user, loading, hasApprovedChallengeAccess, isDashboardRoute])

  useEffect(() => {
    if (!token) {
      setParentLink(null)
      setParentParticipantId('')
      setParentSchoolSearch('')
      setParentTeacherId('')
      return
    }
    setRegistrationTag('parent')
    reloadParentLink(token).catch((err) => handleError(err, 'Could not load the QR consent record.'))
  }, [token])

  useEffect(() => {
    if (token) {
      document.getElementById('parent-consent')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [token, parentLink])

  useEffect(() => {
    if (!isDashboardRoute) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isDashboardRoute, loading, user])

  const submitStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('student')
    try {
      const fd = new FormData(event.currentTarget)
      const password = value(fd, 'password')
      const confirmPassword = value(fd, 'confirm_password')
      const acknowledged = checked(fd, 'student_acknowledgement')
      if (password !== confirmPassword) {
        throw new Error('Student password and confirmation must match.')
      }
      if (!acknowledged) {
        throw new Error('Please confirm the student participation acknowledgement.')
      }
      const payload = {
        full_name: value(fd, 'full_name'),
        student_username: value(fd, 'student_username'),
        age: Number(value(fd, 'age')),
        date_of_birth: value(fd, 'date_of_birth'),
        email: value(fd, 'email'),
        password,
        phone_number: value(fd, 'phone_number'),
        home_address: value(fd, 'home_address'),
        school_id: Number(value(fd, 'school_id') || 0) || undefined,
        school_name: value(fd, 'school_name'),
        teacher_id: Number(value(fd, 'teacher_id') || 0) || undefined,
        grade_level: value(fd, 'grade_level'),
        parent_name: value(fd, 'parent_name'),
        parent_phone: value(fd, 'parent_phone'),
        parent_email: value(fd, 'parent_email'),
        student_acknowledgement: acknowledged,
      }
      const res = await api.post<any>('new-school/student/register', payload)
      showNotice('success', res.message || 'Student registered.')
      event.currentTarget.reset()
      setStudentSchoolSearch('')
      setStudentTeacherId('')
      await refresh()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Student registration failed.')
    } finally {
      setBusy('')
    }
  }

  const submitParent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('parent')
    try {
      const fd = new FormData(event.currentTarget)
      const governmentId = fileValue(fd, 'government_id_file')
      const governmentIdUrl = await uploadIfPresent(governmentId)
      const payload = {
        token: value(fd, 'token') || token || parentLink?.token || '',
        participant_id: value(fd, 'participant_id'),
        parent_full_name: value(fd, 'parent_full_name'),
        relationship_to_student: value(fd, 'relationship_to_student'),
        phone_number: value(fd, 'phone_number'),
        email: value(fd, 'email'),
        home_address: value(fd, 'home_address'),
        password: value(fd, 'password'),
        government_id_url: governmentIdUrl,
        consent_checked: checked(fd, 'consent_checked'),
        digital_signature: value(fd, 'digital_signature'),
        preferred_contact_method: value(fd, 'preferred_contact_method'),
        school_id: Number(value(fd, 'school_id') || 0) || undefined,
        teacher_id: Number(value(fd, 'teacher_id') || 0) || undefined,
      }
      const res = await api.post<any>('new-school/parent/consent', payload)
      showNotice('success', res.message || 'Parent consent saved.')
      event.currentTarget.reset()
      setParentParticipantId('')
      setParentSchoolSearch('')
      setParentTeacherId('')
      await refresh()
      await reloadOverview()
      if (payload.token) {
        await reloadParentLink(payload.token)
      }
    } catch (err) {
      handleError(err, 'Parent consent failed.')
    } finally {
      setBusy('')
    }
  }

  const submitSchool = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('school')
    try {
      const fd = new FormData(event.currentTarget)
      const payload = {
        school_name: value(fd, 'school_name'),
        school_address: value(fd, 'school_address'),
        school_district: value(fd, 'school_district'),
        school_type: value(fd, 'school_type'),
        main_phone: value(fd, 'main_phone'),
        principal_name: value(fd, 'principal_name'),
        administrator_name: value(fd, 'administrator_name'),
        administrator_email: value(fd, 'administrator_email'),
        administrator_phone: value(fd, 'administrator_phone'),
        school_website: value(fd, 'school_website'),
        password: value(fd, 'password'),
      }
      const res = await api.post<any>('new-school/school/register', payload)
      showNotice('success', res.message || 'School registered.')
      event.currentTarget.reset()
      await refresh()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'School registration failed.')
    } finally {
      setBusy('')
    }
  }

  const submitTeacher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('teacher')
    try {
      const fd = new FormData(event.currentTarget)
      const schoolId = Number(value(fd, 'school_id'))
      const payload = {
        teacher_full_name: value(fd, 'teacher_full_name'),
        school_id: schoolId > 0 ? schoolId : undefined,
        school_name: value(fd, 'school_name'),
        school_email: value(fd, 'school_email'),
        phone_number: value(fd, 'phone_number'),
        role_department: value(fd, 'role_department'),
        grade_level_supported: value(fd, 'grade_level_supported'),
        teacher_tag: value(fd, 'teacher_tag'),
        employee_id: value(fd, 'employee_id'),
        password: value(fd, 'password'),
      }
      const res = await api.post<any>('new-school/teacher/register', payload)
      showNotice('success', res.message || 'Teacher registered.')
      event.currentTarget.reset()
      setTeacherSchoolSearch('')
      await refresh()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Teacher registration failed.')
    } finally {
      setBusy('')
    }
  }

  const submitBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('business')
    try {
      const fd = new FormData(event.currentTarget)
      const payload = {
        student_id: Number(value(fd, 'student_id') || dashboard?.student?.id || parentLink?.student?.id || 0) || undefined,
        visit_number: Number(value(fd, 'visit_number') || 0) || undefined,
        business_name: value(fd, 'business_name'),
        owner_name: value(fd, 'owner_name'),
        business_phone: value(fd, 'business_phone'),
        business_address: value(fd, 'business_address'),
        business_category: value(fd, 'business_category'),
        date_of_visit: value(fd, 'date_of_visit'),
        has_website: checked(fd, 'has_website'),
        has_google_profile: checked(fd, 'has_google_profile'),
        uses_social_media: checked(fd, 'uses_social_media'),
        uses_digital_signage: checked(fd, 'uses_digital_signage'),
        offers_rewards: checked(fd, 'offers_rewards'),
        has_online_ordering: checked(fd, 'has_online_ordering'),
        has_delivery_options: checked(fd, 'has_delivery_options'),
        main_challenge: value(fd, 'main_challenge'),
        student_notes: value(fd, 'student_notes'),
      }
      const res = await api.post<any>('new-school/business', payload)
      showNotice('success', res.message || 'Business interview saved.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Business interview could not be saved.')
    } finally {
      setBusy('')
    }
  }

  const submitSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('submission')
    try {
      const fd = new FormData(event.currentTarget)
      const videoUrl = await uploadIfPresent(fileValue(fd, 'video_file'))
      const writtenUrl = await uploadIfPresent(fileValue(fd, 'written_file'))
      const payload = {
        student_id: Number(value(fd, 'student_id') || dashboard?.student?.id || parentLink?.student?.id || 0) || undefined,
        source_business_id: Number(value(fd, 'source_business_id') || 0) || undefined,
        problem_identified: value(fd, 'problem_identified'),
        why_it_matters: value(fd, 'why_it_matters'),
        proposed_solution: value(fd, 'proposed_solution'),
        how_it_helps: value(fd, 'how_it_helps'),
        expected_impact: value(fd, 'expected_impact'),
        video_url: videoUrl,
        written_url: writtenUrl,
      }
      const res = await api.post<any>('new-school/submission', payload)
      showNotice('success', res.message || 'Submission saved.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Final submission failed.')
    } finally {
      setBusy('')
    }
  }

  const submitSchoolApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('school-approval')
    try {
      const fd = new FormData(event.currentTarget)
      const payload = {
        participant_id: value(fd, 'participant_id'),
        student_id: Number(value(fd, 'student_id') || 0) || undefined,
        school_staff_name: value(fd, 'school_staff_name'),
        role: value(fd, 'role'),
        school_email: value(fd, 'school_email'),
        approval_status: value(fd, 'approval_status') || 'approved',
        notes: value(fd, 'notes'),
        digital_signature: value(fd, 'digital_signature'),
      }
      const res = await api.post<any>('new-school/school/approve', payload)
      showNotice('success', res.message || 'School approval saved.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'School approval failed.')
    } finally {
      setBusy('')
    }
  }

  const submitTeacherApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('teacher-approval')
    try {
      const fd = new FormData(event.currentTarget)
      const payload = {
        participant_id: value(fd, 'participant_id'),
        student_id: Number(value(fd, 'student_id') || 0) || undefined,
        teacher_name: value(fd, 'teacher_name'),
        teacher_email: value(fd, 'teacher_email'),
        role: value(fd, 'role'),
        approval_status: value(fd, 'approval_status') || 'approved',
        notes: value(fd, 'notes'),
        digital_signature: value(fd, 'digital_signature'),
      }
      const res = await api.post<any>('new-school/teacher/approve', payload)
      showNotice('success', res.message || 'Teacher approval saved.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Teacher approval failed.')
    } finally {
      setBusy('')
    }
  }

  const submitSchoolTeacherApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('school-teacher-approval')
    try {
      const fd = new FormData(event.currentTarget)
      const teacherId = Number(value(fd, 'teacher_id') || 0)
      if (!teacherId) {
        throw new Error('Select a teacher to review.')
      }
      const payload = {
        teacher_id: teacherId,
        teacher_name: value(fd, 'teacher_name') || selectedSchoolTeacher?.teacher_full_name || '',
        teacher_email: value(fd, 'teacher_email') || selectedSchoolTeacher?.school_email || '',
        role: value(fd, 'role') || selectedSchoolTeacher?.role_department || 'Teacher',
        approval_status: value(fd, 'approval_status') || 'approved',
        notes: value(fd, 'notes'),
        digital_signature: value(fd, 'digital_signature'),
      }
      const res = await api.post<any>('new-school/school/teacher/approve', payload)
      showNotice('success', res.message || 'Teacher verification saved.')
      event.currentTarget.reset()
      setSchoolTeacherApprovalId('')
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Teacher verification failed.')
    } finally {
      setBusy('')
    }
  }

  const submitSubmissionReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('submission-review')
    try {
      const fd = new FormData(event.currentTarget)
      const submissionId = Number(value(fd, 'submission_id') || 0)
      if (!submissionId) {
        throw new Error('Select a submission to review.')
      }
      const payload = {
        submission_id: submissionId,
        status: value(fd, 'status') || 'approved',
        reviewer_notes: value(fd, 'reviewer_notes'),
        score: value(fd, 'score'),
        rank_position: Number(value(fd, 'rank_position') || 0) || undefined,
      }
      const res = await api.post<any>('new-school/submission/review', payload)
      showNotice('success', res.message || 'Submission review saved.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not update the submission review.')
    } finally {
      setBusy('')
    }
  }

  const submitAdminReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('admin-review')
    try {
      const fd = new FormData(event.currentTarget)
      const submissionId = Number(value(fd, 'submission_id') || 0)
      if (!submissionId) {
        throw new Error('Select a submission to review.')
      }
      const payload = {
        status: value(fd, 'status') || 'submitted',
        score: value(fd, 'score'),
        rank_position: Number(value(fd, 'rank_position') || 0) || undefined,
        place: value(fd, 'place'),
        scholarship_amount: Number(value(fd, 'scholarship_amount') || 0) || undefined,
        reviewer_notes: value(fd, 'reviewer_notes'),
      }
      const res = await api.put<any>(`admin/new-school/submission/${submissionId}`, payload)
      showNotice('success', res.message || 'Submission updated.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not update submission.')
    } finally {
      setBusy('')
    }
  }

  const exportCsv = async (type: string) => {
    setBusy(`export-${type}`)
    try {
      const data = await api.get<any>(`admin/new-school/export?type=${encodeURIComponent(type)}`)
      const blob = new Blob([data.csv || ''], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename || `new-school-${type}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showNotice('success', `${type} export downloaded.`)
    } catch (err) {
      handleError(err, 'Could not export CSV.')
    } finally {
      setBusy('')
    }
  }

  const publishWinners = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('publish')
    try {
      const fd = new FormData(event.currentTarget)
      const winners = [1, 2, 3]
        .map((slot) => ({
          submission_id: Number(value(fd, `winner_${slot}_submission_id`) || 0),
          place: value(fd, `winner_${slot}_place`),
          scholarship_amount: Number(value(fd, `winner_${slot}_amount`) || 0),
          rank_position: slot,
        }))
        .filter((row) => row.submission_id > 0 && row.place && row.scholarship_amount > 0)

      const res = await api.post<any>('admin/new-school/winners/publish', { winners })
      showNotice('success', res.message || 'Winners published.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not publish winners.')
    } finally {
      setBusy('')
    }
  }

  const summary = overview?.summary || {}
  const schools = Array.isArray(overview?.schools) ? overview.schools : []
  const teachers = Array.isArray(overview?.teachers) ? overview.teachers : []
  const winners = Array.isArray(overview?.winners) ? overview.winners : []
  const challenge = overview?.challenge || {}
  const leaderboards = overview?.leaderboards || {}
  const leaderboardSchools = asArray<any>(leaderboards.schools)
  const leaderboardStudents = asArray<any>(leaderboards.students)
  const latestWinner = winners[0] || null
  const topSchool = leaderboardSchools[0] || null
  const topStudent = leaderboardStudents[0] || null
  const deadlineLabel = formatDateLabel(challenge.deadline)
  const deadlineDate = challenge.deadline ? new Date(challenge.deadline) : null
  const deadlineDays = deadlineDate && !Number.isNaN(deadlineDate.getTime())
    ? Math.max(0, Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000))
    : null
  const scholarshipsAwarded = winners.reduce((total: number, winner: any) => total + Number(winner.scholarship_amount || 0), 0)
  const completionPercent = Number(summary.students ?? 0) > 0
    ? Math.min(100, Math.round((Number(summary.submissions ?? 0) / Number(summary.students ?? 0)) * 100))
    : 0
  const movementStats: Array<{ label: string; value: string | number }> = [
    { label: 'Schools Registered', value: Number(summary.schools ?? 0) },
    { label: 'Students Registered', value: Number(summary.students ?? 0) },
    { label: 'Business Interviews Completed', value: Number(summary.businesses ?? 0) },
    // Each final submission represents one community problem identified and solved.
    { label: 'Community Problems Identified', value: Number(summary.submissions ?? 0) },
    { label: 'Scholarships Awarded', value: formatMoney(scholarshipsAwarded) },
  ]
  const studentDashboard = dashboard?.role === 'student' ? dashboard : null
  const parentDashboard = dashboard?.role === 'parent' ? dashboard : null
  const schoolDashboard = dashboard?.role === 'school' ? dashboard : null
  const teacherDashboard = dashboard?.role === 'teacher' ? dashboard : null
  const adminDashboard = adminSummary || (dashboard?.role === 'admin' ? dashboard : null)
  const dashboardRole = adminDashboard ? 'admin' : studentDashboard ? 'student' : parentDashboard ? 'parent' : schoolDashboard ? 'school' : teacherDashboard ? 'teacher' : ''
  const selectedBusinessId = studentDashboard?.submission?.source_business_id || ''
  const canStudentSubmit = !!studentDashboard?.can_submit
  const teacherScore = teacherDashboard
    ? Math.round(
        (teacherDashboard.summary?.students_total || 0) * 5 +
          (teacherDashboard.summary?.parent_approved || 0) * 8 +
          (teacherDashboard.summary?.school_approved || 0) * 8 +
          (teacherDashboard.summary?.teacher_approved || 0) * 8 +
          (teacherDashboard.summary?.eligible_to_submit || 0) * 18 +
          (teacherDashboard.summary?.submitted || 0) * 28 +
          (teacherDashboard.summary?.interviews_total || 0) * 2,
      )
    : 0
  const teacherProgress = Math.min(100, Math.round(teacherScore / 8))
  const studentProgress = studentDashboard
    ? Math.round(Math.min(100, ((studentDashboard.interview_count || 0) / 10) * 100))
    : 0
  const studentStatusProgress = studentDashboard
    ? Math.round(((studentDashboard.status_tracker || []).filter((step: any) => step.complete).length / Math.max((studentDashboard.status_tracker || []).length, 1)) * 100)
    : 0
  const parentReadinessProgress = parentDashboard
    ? Math.round([
        parentDashboard.student_context?.student?.parent_consent_status,
        parentDashboard.student_context?.student?.school_approval_status,
        parentDashboard.student_context?.student?.teacher_approval_status,
        parentDashboard.student_context?.student?.submission_status,
      ].filter((status) => status && !['pending', 'locked', 'draft'].includes(String(status).toLowerCase())).length / 4 * 100)
    : 0
  const schoolReadinessProgress = schoolDashboard
    ? Math.round(Math.min(100, (((schoolDashboard.summary.teacher_approved || 0) + (schoolDashboard.summary.school_approved || 0) + (schoolDashboard.summary.parent_approved || 0)) / Math.max(Number(schoolDashboard.summary.students_total || 0), 1)) * 100))
    : 0
  const teacherReadinessProgress = teacherDashboard
    ? Math.round(Math.min(100, (((teacherDashboard.summary.teacher_approved || 0) + (teacherDashboard.summary.submitted || 0)) / Math.max(Number(teacherDashboard.summary.students_total || 0), 1)) * 100))
    : 0
  const adminReadinessProgress = adminDashboard
    ? Math.round(Math.min(100, (((adminDashboard.summary.submissions || 0) + (adminDashboard.summary.winners || 0)) / Math.max(Number(adminDashboard.summary.students || 0), 1)) * 100))
    : 0
  const currentSchoolEmail = schoolDashboard?.school?.administrator_email || user?.email || ''
  const currentTeacherEmail = teacherDashboard?.teacher?.school_email || user?.email || ''
  const studentNotifications = asArray<any>(studentDashboard?.notifications)
  const parentNotifications = asArray<any>(parentDashboard?.student_context?.notifications)
  const schoolNotifications = asArray<any>(schoolDashboard?.notifications)
  const teacherNotifications = asArray<any>(teacherDashboard?.notifications)
  const schoolBusinesses = asArray<any>(schoolDashboard?.businesses)
  const schoolSubmissions = asArray<any>(schoolDashboard?.submissions)
  const schoolApprovals = asArray<any>(schoolDashboard?.approvals)
  const schoolWinners = asArray<any>(schoolDashboard?.winners)
  const teacherBusinesses = asArray<any>(teacherDashboard?.businesses)
  const teacherSubmissions = asArray<any>(teacherDashboard?.submissions)
  const teacherApprovals = asArray<any>(teacherDashboard?.approvals)
  const teacherWinners = asArray<any>(teacherDashboard?.winners)
  const adminParents = asArray<any>(adminDashboard?.parents)
  const adminApprovals = asArray<any>(adminDashboard?.approvals)
  const adminBusinesses = asArray<any>(adminDashboard?.businesses)
  const adminNotifications = asArray<any>(adminDashboard?.notifications)
  const adminSchools = asArray<any>(adminDashboard?.schools)
  const adminStudentSummary = adminDashboard?.student_summary || {}
  const studentSchoolRankings = asArray<any>(studentDashboard?.rankings?.school?.leaderboard)
  const studentTeacherRankings = asArray<any>(studentDashboard?.rankings?.teacher?.leaderboard)
  const schoolRankedStudents = asArray<any>(schoolDashboard?.rankings?.students)
  const schoolRankedTeachers = asArray<any>(schoolDashboard?.rankings?.teachers)
  const teacherRankedStudents = asArray<any>(teacherDashboard?.rankings?.students)
  const teacherRankedTeachers = asArray<any>(teacherDashboard?.rankings?.teachers)

  useEffect(() => {
    if (!isDashboardRoute) return
    setDashboardTab((current) => {
      const nextTab = dashboardTabs.find((tab) => tab.key === current) ? current : dashboardTabs[0]?.key || 'overview'
      return nextTab
    })
  }, [dashboardRole, isDashboardRoute])

  const approvedSchool = (query: string) =>
    schools.find((school: any) => String(school.school_name || '').toLowerCase() === query.trim().toLowerCase()) || null
  const teachersForSchool = (schoolId?: number | string) =>
    teachers.filter((teacher: any) => Number(teacher.school_id || 0) === Number(schoolId || 0))
  const matchedStudentSchool = approvedSchool(studentSchoolSearch)
  const matchedTeacherSchool = approvedSchool(teacherSchoolSearch)
  const matchedParentSchool = approvedSchool(parentSchoolSearch)
  const studentSchoolTeachers = matchedStudentSchool ? teachersForSchool(matchedStudentSchool.id) : []
  const parentSchoolTeachers = matchedParentSchool ? teachersForSchool(matchedParentSchool.id) : []
  const selectedSchoolTeacher = schoolDashboard?.teachers?.find((teacher: any) => String(teacher.id) === String(schoolTeacherApprovalId)) || null
  const currentParticipantId = studentDashboard?.student?.participant_id || parentDashboard?.student_context?.student?.participant_id || ''
  const studentUnreadNotifications = studentNotifications.filter((item: any) => !item.is_read)
  const parentUnreadNotifications = parentNotifications.filter((item: any) => !item.is_read)
  const schoolUnreadNotifications = schoolNotifications.filter((item: any) => !item.is_read)
  const teacherUnreadNotifications = teacherNotifications.filter((item: any) => !item.is_read)
  const adminUnreadNotifications = adminNotifications.filter((item: any) => !item.is_read)
  const schoolRecordsTabs: Array<{ key: SchoolRecordsTabKey; label: string; hint: string; count: number }> = [
    { key: 'students', label: 'Students', hint: 'Roster', count: schoolDashboard?.students?.length || 0 },
    { key: 'teachers', label: 'Teachers', hint: 'Faculty list', count: schoolDashboard?.teachers?.length || 0 },
    { key: 'interviews', label: 'Interviews', hint: 'Business visits', count: schoolBusinesses.length },
    { key: 'approvals', label: 'Approvals', hint: 'Verified records', count: schoolApprovals.length },
    { key: 'projects', label: 'Projects', hint: 'Final submissions', count: schoolSubmissions.length },
  ]
  const schoolSelectedSubmission = schoolSubmissions.find((row: any) => String(row.id) === String(schoolSubmissionReviewId)) || schoolSubmissions[0] || null
  const schoolReviewQueue = schoolSubmissions.slice(0, 5)
  const schoolWinnersQueue = schoolWinners.slice(0, 5)
  const dashboardTabs = (() => {
    const baseTabs = dashboardRole ? dashboardTabsByRole[dashboardRole] || [] : []
    if (!schoolDashboard) return baseTabs
    const schoolApprovalBadge = (Number(schoolDashboard.summary.teacher_pending || 0) + Number(schoolDashboard.summary.school_pending || 0)) || 0
    const schoolReviewBadge = schoolReviewQueue.length || 0
    const schoolAlertBadge = schoolUnreadNotifications.length || 0
    return baseTabs.map((tab) => {
      if (tab.key === 'approvals' && schoolApprovalBadge > 0) return { ...tab, badge: String(schoolApprovalBadge) }
      if (tab.key === 'reviews' && schoolReviewBadge > 0) return { ...tab, badge: String(schoolReviewBadge) }
      if (tab.key === 'notifications' && schoolAlertBadge > 0) return { ...tab, badge: String(schoolAlertBadge) }
      return tab
    })
  })()
  const dashboardActiveTab = dashboardTabs.find((tab) => tab.key === dashboardTab) || dashboardTabs[0] || null
  const dashboardHero = (() => {
    if (studentDashboard) {
      return {
        eyebrow: 'Student Control Center',
        title: studentDashboard.student.full_name,
        lead: 'Track your progress, keep the competition moving, and jump directly to the next step.',
        stats: [
          { label: 'Performance', value: studentDashboard.performance_score || 0 },
          { label: 'Interviews', value: studentDashboard.interview_count || 0 },
          { label: 'School Rank', value: `#${studentDashboard.rankings?.school?.position || '-'}` },
          { label: 'Teacher Rank', value: `#${studentDashboard.rankings?.teacher?.position || '-'}` },
        ],
        primary: { label: 'Continue Activity', tab: 'activity' as DashboardTabKey },
        secondary: { label: 'View Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (parentDashboard) {
      return {
        eyebrow: 'Parent Monitor',
        title: parentDashboard.parent.parent_full_name,
        lead: 'See consent, progress, and ranking movement without any extra noise.',
        stats: [
          { label: 'Student', value: parentDashboard.parent.student_full_name || '-' },
          { label: 'Consent', value: parentDashboard.student_context?.student?.parent_consent_status || 'pending' },
          { label: 'Rank', value: `#${parentDashboard.student_context?.rankings?.school?.position || '-'}` },
          { label: 'Unread', value: parentUnreadNotifications.length || 0 },
        ],
        primary: { label: 'Open Overview', tab: 'overview' as DashboardTabKey },
        secondary: { label: 'View Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (schoolDashboard) {
      return {
        eyebrow: 'Principal Workspace',
        title: schoolDashboard.school.school_name,
        lead: 'Approve teachers, keep school readiness high, and monitor performance from one view.',
        stats: [
          { label: 'Students', value: schoolDashboard.summary.students_total || 0 },
          { label: 'Teachers', value: schoolDashboard.summary.teacher_approved || 0 },
          { label: 'Eligible', value: schoolDashboard.summary.eligible_to_submit || 0 },
          { label: 'Submissions', value: schoolDashboard.summary.submitted || 0 },
        ],
        primary: { label: 'Manage Approvals', tab: 'approvals' as DashboardTabKey },
        secondary: { label: 'Open Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (teacherDashboard) {
      return {
        eyebrow: 'Teacher Command Panel',
        title: teacherDashboard.teacher.teacher_full_name,
        lead: 'Review student approvals, verify submissions, and keep your class leaderboard competitive.',
        stats: [
          { label: 'Students', value: teacherDashboard.summary.students_total || 0 },
          { label: 'Submitted', value: teacherDashboard.summary.submitted || 0 },
          { label: 'Approved', value: teacherDashboard.summary.teacher_approved || 0 },
          { label: 'Score', value: teacherScore },
        ],
        primary: { label: 'Review Approvals', tab: 'approvals' as DashboardTabKey },
        secondary: { label: 'Open Rankings', tab: 'rankings' as DashboardTabKey },
      }
    }
    if (adminDashboard) {
      return {
        eyebrow: 'Admin Console',
        title: 'Platform Control Center',
        lead: 'Monitor schools, approvals, submissions, and rankings from a single clean view.',
        stats: [
          { label: 'Schools', value: adminDashboard.summary.schools || 0 },
          { label: 'Students', value: adminDashboard.summary.students || 0 },
          { label: 'Teachers', value: adminDashboard.summary.teachers || 0 },
          { label: 'Winners', value: adminDashboard.summary.winners || 0 },
        ],
        primary: { label: 'Open Data', tab: 'data' as DashboardTabKey },
        secondary: { label: 'Review Results', tab: 'reviews' as DashboardTabKey },
      }
    }
    return null
  })()
  const dashboardThemeClass = dashboardRole ? `ns-dashboard-page--${dashboardRole}` : 'ns-dashboard-page--guest'
  const isReferencePrincipalLayout = dashboardRole === 'school'
  const dashboardStageId = 'dashboard-stage'
  const openDashboardTab = (nextTab: DashboardTabKey) => {
    setDashboardTab(nextTab)
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      const stage = document.getElementById(dashboardStageId)
      stage?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      stage instanceof HTMLElement ? stage.focus({ preventScroll: true }) : undefined
    })
  }

  return (
    <div className="ns-page">
      {!isDashboardRoute && (
        <>
      <section className="ns-hero">
        <div className="ns-hero__bg" aria-hidden="true">
          <span className="ns-hero__orb ns-hero__orb--one" />
          <span className="ns-hero__orb ns-hero__orb--two" />
          <span className="ns-hero__grid" />
        </div>
        <div className="wrap ns-hero__grid-wrap">
          <div className="ns-hero__copy reveal in">
            <p className="eyebrow">WHAT PROBLEM WILL YOU SOLVE?</p>
            <h1>
              <span>Join New York&apos;s Largest</span>
              <span>Student Problem-Solving</span>
              <span>Movement{'™'}</span>
            </h1>
            <p className="ns-lead">
              Every community has challenges. Every student has ideas. This challenge empowers students to interview local businesses, uncover real issues, develop solutions, and compete for scholarships while creating measurable community impact.
            </p>
            <div className="ns-hero__actions">
              <button className="btn btn--solid" type="button" onClick={() => openRegistrationTag('student')}>Register Student</button>
              <button className="btn" type="button" onClick={() => openRegistrationTag('parent')}>Parent Consent</button>
              <button className="btn" type="button" onClick={() => openRegistrationTag('school')}>School Registration</button>
              <button className="btn" type="button" onClick={() => openRegistrationTag('teacher')}>Teacher Registration</button>
              <Link className="btn" to={dashboardHref}>Open Dashboard</Link>
              <button className="btn" type="button" data-auth="login">Member Login</button>
            </div>
            {notice && <div className={`ns-alert ns-alert--${notice.tone}`}>{notice.text}</div>}
            {token && parentLink?.student && (
              <div className="ns-qr-banner glass">
                <div>
                  <span className="eyebrow">QR Consent Link</span>
                  <strong>{parentLink.student.full_name}</strong>
                  <p>Participant ID: {parentLink.student.participant_id}</p>
                </div>
                <div className="ns-qr-banner__preview">
                  <img src={qrImageSrc(parentLink.student.qr_url)} alt="Parent consent QR code" />
                </div>
                <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard.writeText(window.location.href)}>
                  Copy Link
                </button>
              </div>
            )}
          </div>

          <aside className="ns-hero__panel glass reveal in">
            <div className="ns-hero__panel-head">
              <span className="eyebrow">{challenge.title || 'THE MOVEMENT'}</span>
              <h2>{challenge.subtitle || 'Live Impact Counter'}</h2>
            </div>
            <div className="ns-hero__panel-foot">
              <div>
                <span>Deadline</span>
                <strong>{deadlineLabel}</strong>
              </div>
              <div>
                <span>Days Left</span>
                <strong>{deadlineDays !== null ? `${deadlineDays} days` : 'Open now'}</strong>
              </div>
            </div>
            <div className="ns-metrics">
              {movementStats.map((item) => (
                <div className="ns-metric" key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="ns-award">
              <div className="ns-award__head">
                <strong>Challenge Completion</strong>
                <span>{completionPercent}%</span>
              </div>
              <div className="ns-award__bar">
                <span style={{ width: `${completionPercent}%` }} />
              </div>
            </div>
            <div className="ns-hero__winners">
              <h3>Live Snapshot</h3>
              {latestWinner && (
                <div className="ns-winner-row">
                  <strong>Winner</strong>
                  <em>{latestWinner.student_name}</em>
                  <span>{formatMoney(latestWinner.scholarship_amount)}</span>
                </div>
              )}
              {topSchool && (
                <div className="ns-winner-row">
                  <strong>Top School</strong>
                  <em>{topSchool.label}</em>
                  <span>{topSchool.submissions || 0} subs</span>
                </div>
              )}
              {topStudent && (
                <div className="ns-winner-row">
                  <strong>Top Student</strong>
                  <em>{topStudent.label}</em>
                  <span>{topStudent.interview_count || 0} interviews</span>
                </div>
              )}
              {!latestWinner && !topSchool && !topStudent && (
                <p className="ns-muted">Live rankings will appear once schools, students, and winners are added.</p>
              )}
            </div>
            <p className="ns-muted">Counts update from registrations, interviews, submissions, and published winners.</p>
          </aside>
        </div>
      </section>

      <section className="block ns-section" id="participants">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">WHO CAN PARTICIPATE?</span>
            <h2>Students, parents, teachers, schools, and community partners.</h2>
            <p>Students ages 11-19 lead the challenge with support from the adults and partners around them.</p>
          </div>

          <div className="ns-participant-grid">
            {participantCards.map((card) => (
              <article className="glass ns-info-card reveal in" key={card.title}>
                <span className="ns-info-card__kicker">{card.kicker}</span>
                <h3>{card.title}</h3>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block ns-section" id="workflow">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">HOW IT WORKS</span>
            <h2>From registration to scholarships and school grants.</h2>
            <p>Each step moves students closer to a solution that addresses a real community problem.</p>
          </div>

          <div className="ns-workflow">
            {movementSteps.map((step) => (
              <article className="glass ns-workflow__step reveal in" key={step.title}>
                <span className="ns-workflow__num">{step.badge}</span>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block ns-section" id="registration">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">Registration Hub</span>
            <h2>Student, parent, school, and teacher forms.</h2>
            <p>Choose a user tag first. The matching registration fields appear so each account type only sees the inputs it needs.</p>
          </div>

          <div className="ns-role-switch reveal in" role="tablist" aria-label="Registration user tags">
            {registrationOptions.map((option) => (
              <button
                key={option.key}
                className={`ns-role-switch__btn ${registrationTag === option.key ? 'is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={registrationTag === option.key}
                onClick={() => setRegistrationTag(option.key)}
              >
                <strong>{option.title}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>
          <p className="ns-registration-note">
            Admin accounts stay private. Public registration is available for students, parents through student ID or QR consent, schools, and teachers. Approved schools and teachers appear in the searchable dropdowns.
          </p>

          <div className="ns-form-grid ns-form-grid--single">
            <form className="glass ns-form reveal in" id="student-registration" onSubmit={submitStudent} hidden={registrationTag !== 'student'}>
              <div className="ns-form__head">
                <span className="eyebrow">Step 1</span>
                <h3>Student Registration</h3>
                <p>Creates the participant profile and QR code for parent consent.</p>
              </div>
              <div className="ns-field-grid">
                <label className="ns-field"><span>Full Name</span><input name="full_name" required /></label>
                <label className="ns-field"><span>Student Username</span><input name="student_username" required /></label>
                <label className="ns-field"><span>Age</span><input name="age" type="number" min="11" max="19" required /></label>
                <label className="ns-field"><span>Date of Birth</span><input name="date_of_birth" type="date" required /></label>
                <label className="ns-field"><span>Email</span><input name="email" type="email" required /></label>
                <label className="ns-field"><span>Password</span><input name="password" type="password" minLength={6} required /></label>
                <label className="ns-field"><span>Confirm Password</span><input name="confirm_password" type="password" minLength={6} required /></label>
                <label className="ns-field"><span>Phone Number</span><input name="phone_number" required /></label>
                <label className="ns-field ns-field--full"><span>Home Address</span><input name="home_address" required /></label>
                <label className="ns-field ns-field--full">
                  <span>School Search</span>
                  <input
                    name="school_name"
                    list="approved-school-list"
                    value={studentSchoolSearch}
                    onChange={(event) => {
                      setStudentSchoolSearch(event.target.value)
                      setStudentTeacherId('')
                    }}
                    placeholder="Search approved schools"
                    required
                  />
                </label>
                <input type="hidden" name="school_id" value={matchedStudentSchool?.id || ''} readOnly />
                {matchedStudentSchool ? (
                  studentSchoolTeachers.length > 0 ? (
                    <label className="ns-field ns-field--full">
                      <span>Teacher</span>
                      <select name="teacher_id" value={studentTeacherId} onChange={(event) => setStudentTeacherId(event.target.value)} required>
                        <option value="">Select a teacher</option>
                        {studentSchoolTeachers.map((teacher: any) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.teacher_full_name} - {teacher.role_department}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="ns-alert ns-alert--info ns-field--full">
                      This school has no approved teachers yet. A teacher must be approved before a student can register.
                    </div>
                  )
                ) : (
                  <div className="ns-alert ns-alert--info ns-field--full">
                    Search and select an approved school to reveal its teacher list.
                  </div>
                )}
                <label className="ns-field"><span>Grade Level</span><input name="grade_level" placeholder="9th Grade" required /></label>
                <label className="ns-field"><span>Parent Name</span><input name="parent_name" required /></label>
                <label className="ns-field"><span>Parent Phone</span><input name="parent_phone" required /></label>
                <label className="ns-field ns-field--full"><span>Parent Email</span><input name="parent_email" type="email" required /></label>
                <label className="ns-check ns-field--full">
                  <input name="student_acknowledgement" type="checkbox" required />
                  <span>I confirm this student is between 11 and 19 and understands parent consent is required before submission.</span>
                </label>
              </div>
              <button
                className="btn btn--solid"
                type="submit"
                disabled={busy === 'student' || !matchedStudentSchool || studentSchoolTeachers.length === 0}
              >
                {busy === 'student' ? 'Saving...' : 'Create Student Profile'}
              </button>
            </form>

            <form className="glass ns-form reveal in" id="parent-consent" onSubmit={submitParent} hidden={registrationTag !== 'parent'}>
              <div className="ns-form__head">
                <span className="eyebrow">Step 2</span>
                <h3>Parent Consent via Student ID</h3>
                <p>Parent can use the 8-digit student ID or the QR link, then select the approved school teacher for review.</p>
              </div>
              <div className="ns-field-grid">
                <label className="ns-field ns-field--full">
                  <span>Student Unique Platform ID</span>
                  <input
                    name="participant_id"
                    value={parentParticipantId}
                    onChange={(event) => setParentParticipantId(event.target.value)}
                    placeholder="Enter the 8-digit student ID"
                    required
                  />
                </label>
                <label className="ns-field ns-field--full">
                  <span>QR Token (Optional)</span>
                  <input name="token" defaultValue={token || parentLink?.token || ''} placeholder="Use this if you opened the QR link" />
                </label>
                <label className="ns-field"><span>Parent Name</span><input name="parent_full_name" required /></label>
                <label className="ns-field"><span>Relationship</span><input name="relationship_to_student" required /></label>
                <label className="ns-field"><span>Phone Number</span><input name="phone_number" required /></label>
                <label className="ns-field"><span>Email</span><input name="email" type="email" required /></label>
                <label className="ns-field"><span>Password</span><input name="password" type="password" minLength={6} required /></label>
                <label className="ns-field"><span>Preferred Contact Method</span>
                  <select name="preferred_contact_method" defaultValue="phone">
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                    <option value="text">Text</option>
                  </select>
                </label>
                <label className="ns-field ns-field--full"><span>Home Address</span><input name="home_address" required /></label>
                <label className="ns-field ns-field--full">
                  <span>School Search</span>
                  <input
                    name="school_name"
                    list="approved-school-list"
                    value={parentSchoolSearch}
                    onChange={(event) => {
                      setParentSchoolSearch(event.target.value)
                      setParentTeacherId('')
                    }}
                    placeholder="Search approved schools"
                  />
                </label>
                <input type="hidden" name="school_id" value={matchedParentSchool?.id || ''} readOnly />
                {matchedParentSchool ? (
                  parentSchoolTeachers.length > 0 ? (
                    <label className="ns-field ns-field--full">
                      <span>Teacher</span>
                      <select name="teacher_id" value={parentTeacherId} onChange={(event) => setParentTeacherId(event.target.value)} required>
                        <option value="">Select a teacher</option>
                        {parentSchoolTeachers.map((teacher: any) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.teacher_full_name} - {teacher.role_department}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="ns-alert ns-alert--info ns-field--full">
                      This school has no approved teachers yet. Parent consent will still save, but teacher review cannot start until one is approved.
                    </div>
                  )
                ) : (
                  <div className="ns-alert ns-alert--info ns-field--full">
                    Search and select the student&apos;s approved school to reveal teacher options.
                  </div>
                )}
                <label className="ns-field ns-field--full">
                  <span>Government ID Upload Optional</span>
                  <input name="government_id_file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" />
                </label>
                <label className="ns-field ns-field--full">
                  <span>Digital Signature</span>
                  <input name="digital_signature" placeholder="Type full legal name" required />
                </label>
                <label className="ns-check ns-field--full">
                  <input name="consent_checked" type="checkbox" required />
                  <span>I confirm I am the parent or legal guardian and give permission for participation.</span>
                </label>
              </div>
              <button className="btn btn--solid" type="submit" disabled={busy === 'parent'}>{busy === 'parent' ? 'Saving...' : 'Approve Consent'}</button>
            </form>

            <form className="glass ns-form reveal in" id="school-registration" onSubmit={submitSchool} hidden={registrationTag !== 'school'}>
              <div className="ns-form__head">
                <span className="eyebrow">Step 3</span>
                <h3>School Registration</h3>
                <p>Creates the school account and approval workspace.</p>
              </div>
              <div className="ns-field-grid">
                <label className="ns-field ns-field--full"><span>School Name</span><input name="school_name" required /></label>
                <label className="ns-field ns-field--full"><span>School Address</span><input name="school_address" required /></label>
                <label className="ns-field"><span>School District</span><input name="school_district" required /></label>
                <label className="ns-field"><span>School Type</span>
                  <select name="school_type" defaultValue="public">
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                    <option value="charter">Charter</option>
                    <option value="magnet">Magnet</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="ns-field"><span>Main Phone</span><input name="main_phone" required /></label>
                <label className="ns-field"><span>Principal Name</span><input name="principal_name" required /></label>
                <label className="ns-field"><span>Administrator Name</span><input name="administrator_name" required /></label>
                <label className="ns-field"><span>Administrator Email</span><input name="administrator_email" type="email" required /></label>
                <label className="ns-field"><span>Administrator Phone</span><input name="administrator_phone" required /></label>
                <label className="ns-field ns-field--full"><span>School Website</span><input name="school_website" placeholder="https://example.edu" /></label>
                <label className="ns-field ns-field--full"><span>Password</span><input name="password" type="password" minLength={6} required /></label>
              </div>
              <button className="btn btn--solid" type="submit" disabled={busy === 'school'}>{busy === 'school' ? 'Saving...' : 'Register School'}</button>
            </form>

            <form className="glass ns-form reveal in" id="teacher-registration" onSubmit={submitTeacher} hidden={registrationTag !== 'teacher'}>
              <div className="ns-form__head">
                <span className="eyebrow">Step 4</span>
                <h3>Teacher Registration</h3>
                <p>Links a teacher to a school for tracking, approval, and leaderboard scoring.</p>
              </div>
              <div className="ns-field-grid">
                <label className="ns-field ns-field--full"><span>Teacher Full Name</span><input name="teacher_full_name" required /></label>
                <label className="ns-field ns-field--full">
                  <span>School Search</span>
                  <input
                    name="school_name"
                    list="approved-school-list"
                    value={teacherSchoolSearch}
                    onChange={(event) => setTeacherSchoolSearch(event.target.value)}
                    placeholder="Search approved schools"
                    required
                  />
                </label>
                <input type="hidden" name="school_id" value={approvedSchool(teacherSchoolSearch)?.id || ''} readOnly />
                <label className="ns-field"><span>School Email</span><input name="school_email" type="email" required /></label>
                <label className="ns-field"><span>Phone Number</span><input name="phone_number" required /></label>
                <label className="ns-field"><span>Role / Department</span><input name="role_department" required /></label>
                <label className="ns-field"><span>Grade Level Supported</span><input name="grade_level_supported" required /></label>
                <label className="ns-field"><span>Teacher Tag</span>
                  <select name="teacher_tag" defaultValue="teacher">
                    <option value="teacher">Teacher</option>
                    <option value="coach">Coach</option>
                    <option value="counselor">Counselor</option>
                    <option value="advisor">Advisor</option>
                    <option value="administrator">Administrator</option>
                  </select>
                </label>
                <label className="ns-field ns-field--full"><span>Employee ID</span><input name="employee_id" placeholder="Optional staff identifier" /></label>
                <label className="ns-field ns-field--full"><span>Password</span><input name="password" type="password" minLength={6} required /></label>
              </div>
              <button className="btn btn--solid" type="submit" disabled={busy === 'teacher' || !approvedSchool(teacherSchoolSearch)}>
                {busy === 'teacher' ? 'Saving...' : 'Register Teacher'}
              </button>
            </form>
          </div>

          <datalist id="approved-school-list">
            {schools.map((school: any) => (
              <option value={school.school_name} key={school.id} />
            ))}
          </datalist>
        </div>
      </section>
        </>
      )}

      {isDashboardRoute && (
        <>
      <section className={`block ns-section ns-dashboard-page ${dashboardThemeClass}`} id="dashboard" data-dashboard-role={dashboardRole || 'guest'}>
        <div className="wrap">
          {!isReferencePrincipalLayout && (
            <div className="ns-section__head reveal in">
              <span className="eyebrow">Live Dashboard</span>
              <h2>Role-based tracking for every account type.</h2>
              <p>Student, parent, school, teacher, and admin views are driven from the same data tables.</p>
            </div>
          )}

          <div className="ns-dashboard-shell">
            <aside className="ns-dashboard-rail">
              {isReferencePrincipalLayout && schoolDashboard && (
                <>
                  <div className="ns-principal-brand glass reveal in">
                    <span className="ns-principal-brand__logo" aria-hidden="true">FC</span>
                    <span className="ns-principal-brand__id">
                      <strong>FRANTZ COUTARD</strong>
                      <small>Principal Dashboard</small>
                    </span>
                  </div>

                  <section className="ns-principal-workspace glass reveal in" aria-label="Principal workspace">
                    <span className="eyebrow">{dashboardHero?.eyebrow || 'Principal Workspace'}</span>
                    <h3 className="ns-principal-workspace__title">{schoolDashboard.school.school_name}</h3>
                    <div className="ns-principal-workspace__stats">
                      {(dashboardHero?.stats || []).map((stat) => (
                        <div className="ns-principal-workspace__stat" key={stat.label}>
                          <span>{stat.label}</span>
                          <strong className={stat.label === 'Eligible' ? 'is-gold' : ''}>{String(stat.value)}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {dashboardHero && !isReferencePrincipalLayout && (
                <section className="ns-dashboard-hero glass reveal in" aria-label="Dashboard summary">
                  <div className="ns-dashboard-hero__copy">
                    <span className="eyebrow">{dashboardHero.eyebrow}</span>
                    <h3>{dashboardHero.title}</h3>
                    <p>{dashboardHero.lead}</p>
                    <div className="ns-dashboard-hero__actions">
                      <button className="btn btn--solid" type="button" onClick={() => openDashboardTab(dashboardHero.primary.tab)}>
                        {dashboardHero.primary.label}
                      </button>
                      <button className="btn" type="button" onClick={() => openDashboardTab(dashboardHero.secondary.tab)}>
                        {dashboardHero.secondary.label}
                      </button>
                    </div>
                  </div>
                  <div className="ns-dashboard-hero__stats" aria-label="Quick stats">
                    {dashboardHero.stats.map((stat) => (
                      <div className="ns-dashboard-hero__stat" key={stat.label}>
                        <span>{stat.label}</span>
                        <strong>{String(stat.value)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {dashboardTabs.length > 0 && (
                <div className="ns-dashboard-tabs" role="tablist" aria-label="Dashboard sections" aria-orientation="vertical">
                  {dashboardTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      id={`dashboard-tab-${tab.key}`}
                      className={`ns-dashboard-tabs__btn ${dashboardTab === tab.key ? 'is-active' : ''}`}
                      role="tab"
                      aria-selected={dashboardTab === tab.key}
                      aria-controls={dashboardStageId}
                      onClick={() => openDashboardTab(tab.key)}
                    >
                      <strong>{tab.label}</strong>
                      <span>{tab.hint}</span>
                      {tab.badge && <em className="ns-dashboard-tabs__badge">{tab.badge}</em>}
                    </button>
                  ))}
                </div>
              )}

              {isReferencePrincipalLayout && schoolDashboard && (
                <section className="ns-principal-readiness glass reveal in" aria-label="School readiness">
                  <div className="ns-principal-readiness__head">
                    <span>School readiness</span>
                    <strong>{schoolReadinessProgress}%</strong>
                  </div>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${schoolReadinessProgress}%` }} />
                  </div>
                </section>
              )}

              {dashboardActiveTab && !isReferencePrincipalLayout && (
                <section className="ns-dashboard-rail__note glass reveal in" aria-label="Current dashboard section">
                  <span className="eyebrow">Current section</span>
                  <h3>{dashboardActiveTab.label}</h3>
                  <p>{dashboardActiveTab.hint}</p>
                </section>
              )}
            </aside>

            <div className="ns-dashboard-stage" id={dashboardStageId} role="region" aria-live="polite" tabIndex={-1}>
              {isReferencePrincipalLayout && schoolDashboard && dashboardActiveTab && (
                <header className="ns-principal-topbar glass reveal in" aria-label="Active dashboard view">
                  <div className="ns-principal-topbar__view">
                    <span className="eyebrow">Active View</span>
                    <h3>{dashboardActiveTab.label}</h3>
                    <p>{dashboardActiveTab.hint}</p>
                  </div>
                  <div className="ns-principal-topbar__meta">
                    <span className="ns-principal-topbar__live"><i aria-hidden="true" />Live</span>
                    <span className="ns-principal-topbar__role">Principal</span>
                    <span className="ns-principal-topbar__avatar" aria-hidden="true">
                      {(user?.full_name || schoolDashboard.school.principal_name || schoolDashboard.school.administrator_name || 'P').trim().charAt(0).toUpperCase()}
                    </span>
                  </div>
                </header>
              )}

              {dashboardActiveTab && !isReferencePrincipalLayout && (
                <section className="ns-dashboard-stage__head glass reveal in" aria-label="Selected dashboard section">
                  <div>
                    <span className="eyebrow">Active view</span>
                    <h3>{dashboardActiveTab.label}</h3>
                    <p>{dashboardActiveTab.hint}</p>
                  </div>
                  <div className="ns-dashboard-stage__meta">
                    <span className="ns-board__badge">{dashboardHero?.eyebrow || 'Private workspace'}</span>
                    <strong>{dashboardHero?.primary.label || 'Focus mode'}</strong>
                  </div>
                </section>
              )}

              {(loading || dashboardLoading) && (
                <div className="glass ns-empty reveal in">
                  <h3>Loading private dashboard</h3>
                  <p>Fetching your role-specific data now.</p>
                </div>
              )}

              {!loading && !dashboardLoading && !user && (
                <div className="glass ns-empty reveal in">
                  <h3>Sign in to open the live dashboard</h3>
                  <p>Registered students, parents, schools, and teachers can use the normal site login or the member login button in the header.</p>
                  <div className="ns-actions">
                    <button className="btn btn--solid" type="button" data-auth="login">Open Login</button>
                    <Link className="btn" to="/dashboard">Existing Member Area</Link>
                  </div>
                </div>
              )}

              {!loading && !dashboardLoading && user && !hasApprovedChallengeAccess && (
                <div className="glass ns-empty reveal in">
                  <h3>Your account is waiting for approval</h3>
                  <p>
                    {accountApprovalStatus === 'rejected'
                      ? 'This account was rejected by admin. Contact support before trying again.'
                      : 'Private dashboard access unlocks after admin approval.'}
                  </p>
                </div>
              )}

              {!loading && !dashboardLoading && user && hasApprovedChallengeAccess && !studentDashboard && !parentDashboard && !schoolDashboard && !teacherDashboard && !adminDashboard && (
                <div className="glass ns-empty reveal in">
                  <h3>No dashboard data available</h3>
                  <p>Your account is approved, but no role-specific records were found yet.</p>
                </div>
              )}

              {studentDashboard && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Student Status</span>
                  <span className="ns-board__badge">{studentDashboard.student.submission_status}</span>
                </div>
                <h3>{studentDashboard.student.full_name}</h3>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Next milestone</strong>
                    <span>{studentDashboard.can_submit ? 'Ready to submit' : 'Build momentum'}</span>
                  </div>
                  <p>{studentDashboard.can_submit ? 'Your final submission is unlocked. Use the activity tab to send the project.' : 'Complete approvals and interviews to unlock the final project.'}</p>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${studentProgress}%` }} />
                  </div>
                  <small>{studentStatusProgress}% workflow complete | {studentDashboard.interview_count || 0}/10 interviews done</small>
                </div>
                <div className="ns-status-grid">
                  {(studentDashboard.status_tracker || []).map((step: any) => (
                    <div className={`ns-status ${step.complete ? 'is-on' : ''}`} key={step.label}>
                      <strong>{step.label}</strong>
                      <span>{step.complete ? 'Complete' : 'Pending'}</span>
                    </div>
                  ))}
                </div>
                <div className="ns-quick-stats">
                  <div><span>Participant ID</span><strong>{studentDashboard.student.participant_id}</strong></div>
                  <div><span>Interviews</span><strong>{studentDashboard.interview_count}/10</strong></div>
                  <div><span>Can Submit</span><strong>{studentDashboard.can_submit ? 'Yes' : 'Locked'}</strong></div>
                  <div><span>QR URL</span><strong>{clipText(studentDashboard.student.qr_url, 34)}</strong></div>
                </div>
                <div className="ns-qr-card">
                  <img src={qrImageSrc(studentDashboard.student.qr_url)} alt="Student QR code" />
                  <div>
                    <strong>Parent Consent QR</strong>
                    <p>Share this code so the parent can open the consent flow on a phone.</p>
                  </div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard.writeText(studentDashboard.student.qr_url)}>Copy QR</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('activity')}>Open Activity</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>View Profile</button>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                </div>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approvals</span>
                  <span className="ns-board__badge">Parent / School / Teacher</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Parent</strong><span>{studentDashboard.student.parent_consent_status}</span></div>
                  <div className="ns-approval-row"><strong>School</strong><span>{studentDashboard.student.school_approval_status}</span></div>
                  <div className="ns-approval-row"><strong>Teacher</strong><span>{studentDashboard.student.teacher_approval_status}</span></div>
                  <div className="ns-approval-row"><strong>Submission</strong><span>{studentDashboard.student.submission_status}</span></div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => navigator.clipboard.writeText(studentDashboard.student.qr_url)}>Copy QR URL</button>
                  <a className="btn btn--sm btn--solid" href="#business-interviews">Add Business</a>
                </div>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Winner Status</span>
                  <span className="ns-board__badge">{studentDashboard.winner ? studentDashboard.winner.place : 'Pending'}</span>
                </div>
                {studentDashboard.winner ? (
                  <div className="ns-award">
                    <div className="ns-award__head">
                      <strong>{studentDashboard.winner.place} place</strong>
                      <span>{formatMoney(studentDashboard.winner.scholarship_amount)}</span>
                    </div>
                    <p>{studentDashboard.winner.announced_at || studentDashboard.winner.published_at || 'Published on the site.'}</p>
                  </div>
                ) : (
                  <p className="ns-muted">No winner announcement has been published for this student yet.</p>
                )}
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">About</span>
                  <span className="ns-board__badge">{studentDashboard.student.grade_level || 'Student'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>School</strong><span>{studentDashboard.school?.school_name || studentDashboard.student.school_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Teacher</strong><span>{studentDashboard.teacher?.teacher_full_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Scholarship</strong><span>{formatMoney(studentDashboard.winner?.scholarship_amount || 0)}</span></div>
                  <div className="ns-approval-row"><strong>Performance Score</strong><span>{studentDashboard.performance_score || 0}</span></div>
                </div>
                <p className="ns-muted">This tab is your student profile overview. It shows your school link, teacher link, and scholarship progress.</p>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Rankings</span>
                  <span className="ns-board__badge">
                    School #{studentDashboard.rankings?.school?.position || '-'} / Teacher #{studentDashboard.rankings?.teacher?.position || '-'}
                  </span>
                </div>
                <div className="ns-rank-columns">
                  <div>
                    <strong className="ns-subtitle">School Ranking</strong>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Student</th>
                            <th>Score</th>
                            <th>Interviews</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentSchoolRankings.slice(0, 5).map((row: any) => (
                            <tr
                              key={`school-rank-${row.id}`}
                              className={`${Number(row.rank_position || 0) <= 3 ? 'is-top' : ''} ${String(row.participant_id || '') === currentParticipantId ? 'is-me' : ''}`.trim()}
                            >
                              <td>{row.rank_position || '-'}</td>
                              <td>{row.full_name}</td>
                              <td>{row.performance_score ?? 0}</td>
                              <td>{row.interview_count || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <strong className="ns-subtitle">Teacher Ranking</strong>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Student</th>
                            <th>Score</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentTeacherRankings.slice(0, 5).map((row: any) => (
                            <tr
                              key={`teacher-rank-${row.id}`}
                              className={`${Number(row.rank_position || 0) <= 3 ? 'is-top' : ''} ${String(row.participant_id || '') === currentParticipantId ? 'is-me' : ''}`.trim()}
                            >
                              <td>{row.rank_position || '-'}</td>
                              <td>{row.full_name}</td>
                              <td>{row.performance_score ?? 0}</td>
                              <td>{row.submission_status || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'notifications'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Notifications</span>
                  <span className="ns-board__badge">{studentUnreadNotifications.length} unread</span>
                </div>
                <div className="ns-notification-list">
                  {studentNotifications.length > 0 ? studentNotifications.slice(0, 6).map((item: any) => (
                    <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <span>{item.created_at}</span>
                      {!item.is_read && (
                        <button className="ns-notification-action" type="button" onClick={() => markNotificationRead(item.id)}>
                          Mark as read
                        </button>
                      )}
                    </div>
                  )) : <p className="ns-muted">No student notifications yet.</p>}
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'activity'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Business Interviews</span>
                  <span className="ns-board__badge">{studentDashboard.interview_count} / 10 complete</span>
                </div>
                <div className="ns-interview-grid">
                  {(studentDashboard.interviews || []).map((row: any) => (
                    <div className="ns-interview" key={row.id}>
                      <strong>Visit {row.visit_number}</strong>
                      <span>{row.business_name}</span>
                      <p>{row.business_category}</p>
                      <small>{row.date_of_visit}</small>
                    </div>
                  ))}
                </div>
              </article>

              <form className="glass ns-form ns-form--compact reveal in" id="business-interviews" onSubmit={submitBusiness} hidden={dashboardTab !== 'activity'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Business Entry</span>
                  <h3>Log a local business</h3>
                  <p>Students add 10 businesses before the final submission unlocks.</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field"><span>Visit Number</span><input name="visit_number" type="number" min="1" max="10" placeholder="Auto if blank" /></label>
                  <label className="ns-field"><span>Business Name</span><input name="business_name" required /></label>
                  <label className="ns-field"><span>Owner / Manager</span><input name="owner_name" required /></label>
                  <label className="ns-field"><span>Phone Number</span><input name="business_phone" required /></label>
                  <label className="ns-field"><span>Business Address</span><input name="business_address" required /></label>
                  <label className="ns-field"><span>Category</span><input name="business_category" required /></label>
                  <label className="ns-field"><span>Date of Visit</span><input name="date_of_visit" type="date" required /></label>
                  <label className="ns-field ns-field--full"><span>Main Challenge</span><textarea name="main_challenge" rows={3} required /></label>
                  <label className="ns-field ns-field--full"><span>Student Notes</span><textarea name="student_notes" rows={3} required /></label>
                </div>
                <div className="ns-check-grid">
                  {[
                    ['has_website', 'Website'],
                    ['has_google_profile', 'Google Business Profile'],
                    ['uses_social_media', 'Social Media'],
                    ['uses_digital_signage', 'Digital Signage'],
                    ['offers_rewards', 'Coupons / Rewards'],
                    ['has_online_ordering', 'Online Ordering'],
                    ['has_delivery_options', 'Delivery Options'],
                  ].map(([name, label]) => (
                    <label className="ns-check" key={name}>
                      <input name={name} type="checkbox" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <button className="btn btn--solid" type="submit" disabled={busy === 'business'}>{busy === 'business' ? 'Saving...' : 'Save Business Interview'}</button>
              </form>

              <form className="glass ns-form ns-form--compact reveal in" id="final-submission" onSubmit={submitSubmission} hidden={dashboardTab !== 'activity'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Problem &amp; Solution Submission</span>
                  <h3>Video and written upload</h3>
                  <p>Unlocked after approvals and the 10 required interviews are complete.</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field">
                    <span>Selected Business</span>
                    <select name="source_business_id" defaultValue={selectedBusinessId || ''}>
                      <option value="">Choose a business</option>
                      {(studentDashboard.interviews || []).map((row: any) => (
                        <option key={row.id} value={row.id}>{`Visit ${row.visit_number}: ${row.business_name}`}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ns-field"><span>Problem Identified</span><textarea name="problem_identified" rows={3} required /></label>
                  <label className="ns-field"><span>Why It Matters</span><textarea name="why_it_matters" rows={3} required /></label>
                  <label className="ns-field"><span>Proposed Solution</span><textarea name="proposed_solution" rows={3} required /></label>
                  <label className="ns-field"><span>How It Helps</span><textarea name="how_it_helps" rows={3} required /></label>
                  <label className="ns-field"><span>Expected Impact</span><textarea name="expected_impact" rows={3} required /></label>
                  <label className="ns-field ns-field--full"><span>Video Upload</span><input name="video_file" type="file" accept="video/mp4,video/webm,video/quicktime" required /></label>
                  <label className="ns-field ns-field--full"><span>Written Upload</span><input name="written_file" type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" required /></label>
                </div>
                {!canStudentSubmit && <div className="ns-alert ns-alert--info">Final submission stays locked until parent consent, school approval, teacher approval, and 10 business interviews are complete.</div>}
                <button className="btn btn--solid" type="submit" disabled={busy === 'submission' || !canStudentSubmit}>
                  {busy === 'submission' ? 'Saving...' : 'Submit Final Project'}
                </button>
                {studentDashboard.submission && (
                  <div className="ns-submission-summary">
                    <strong>Current Status: {studentDashboard.submission.status}</strong>
                    <p>{studentDashboard.submission.problem_identified}</p>
                  </div>
                )}
              </form>
            </div>
              )}

              {parentDashboard && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Parent Dashboard</span>
                  <span className="ns-board__badge">Consent approved</span>
                </div>
                <h3>{parentDashboard.parent.parent_full_name}</h3>
                <p>Linked student: {parentDashboard.parent.student_full_name}</p>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Monitoring mode</strong>
                    <span>{parentDashboard.student_context?.student?.submission_status || 'tracking'}</span>
                  </div>
                  <p>Watch approvals, rank movement, and scholarship progress without editing anything.</p>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${parentReadinessProgress}%` }} />
                  </div>
                  <small>{parentReadinessProgress}% of the student workflow is complete</small>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>View Profile</button>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('notifications')}>Open Alerts</button>
                </div>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Profile</span>
                  <span className="ns-board__badge">{parentDashboard.student_context?.student?.participant_id || '-'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Relationship</strong><span>{parentDashboard.parent.relationship_to_student}</span></div>
                  <div className="ns-approval-row"><strong>Phone</strong><span>{parentDashboard.parent.phone_number}</span></div>
                  <div className="ns-approval-row"><strong>Email</strong><span>{parentDashboard.parent.email}</span></div>
                  <div className="ns-approval-row"><strong>Student School</strong><span>{parentDashboard.parent.student_school_name}</span></div>
                </div>
                <p className="ns-muted">This tab keeps the linked student context in one place and stays out of the way while you monitor progress.</p>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Ranking Snapshot</span>
                  <span className="ns-board__badge">{parentDashboard.student_context?.performance_score || 0} pts</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>School Rank</strong><span>#{parentDashboard.student_context?.rankings?.school?.position || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Teacher Rank</strong><span>#{parentDashboard.student_context?.rankings?.teacher?.position || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Scholarship</strong><span>{formatMoney(parentDashboard.student_context?.winner?.scholarship_amount || 0)}</span></div>
                  <div className="ns-approval-row"><strong>Participant ID</strong><span>{parentDashboard.student_context?.student?.participant_id || '-'}</span></div>
                </div>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'notifications'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Notifications</span>
                  <span className="ns-board__badge">{parentUnreadNotifications.length} unread</span>
                </div>
                <div className="ns-notification-list">
                  {parentNotifications.length > 0 ? parentNotifications.slice(0, 6).map((item: any) => (
                    <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <span>{item.created_at}</span>
                      {!item.is_read && (
                        <button className="ns-notification-action" type="button" onClick={() => markNotificationRead(item.id)}>
                          Mark as read
                        </button>
                      )}
                    </div>
                  )) : <p className="ns-muted">No parent notifications yet.</p>}
                </div>
              </article>
            </div>
              )}

              {schoolDashboard && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'overview'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">School Dashboard</span>
                  <span className="ns-board__badge">{schoolDashboard.school.school_name}</span>
                </div>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Principal Control Room</strong>
                    <span>{schoolDashboard.summary.submitted || 0} submissions</span>
                  </div>
                  <p>Approve teachers, keep school readiness high, and monitor performance from one view.</p>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${schoolReadinessProgress}%` }} />
                  </div>
                  <small>{schoolReadinessProgress}% readiness across the school workflow</small>
                </div>
                <div className="ns-quick-stats">
                  <div><span>Students</span><strong>{schoolDashboard.summary.students_total || 0}</strong></div>
                  <div><span>Parent Pending</span><strong>{schoolDashboard.summary.parent_pending || 0}</strong></div>
                  <div><span>Parent Approved</span><strong>{schoolDashboard.summary.parent_approved || 0}</strong></div>
                  <div><span>School Pending</span><strong>{schoolDashboard.summary.school_pending || 0}</strong></div>
                  <div><span>School Approved</span><strong>{schoolDashboard.summary.school_approved || 0}</strong></div>
                  <div><span>Teacher Pending</span><strong>{schoolDashboard.summary.teacher_pending || 0}</strong></div>
                  <div><span>Teacher Approved</span><strong>{schoolDashboard.summary.teacher_approved || 0}</strong></div>
                  <div><span>Eligible</span><strong>{schoolDashboard.summary.eligible_to_submit || 0}</strong></div>
                  <div><span>Submissions</span><strong>{schoolDashboard.summary.submitted || 0}</strong></div>
                  <div><span>Interviews</span><strong>{schoolDashboard.summary.interviews_total || 0}</strong></div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>View Profile</button>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('approvals')}>Manage Approvals</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('rankings')}>Open Rankings</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('records')}>View Records</button>
                </div>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">School Profile</span>
                  <span className="ns-board__badge">{schoolDashboard.school.status || 'registered'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Principal</strong><span>{schoolDashboard.school.principal_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Administrator</strong><span>{schoolDashboard.school.administrator_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>District</strong><span>{schoolDashboard.school.school_district || '-'}</span></div>
                  <div className="ns-approval-row"><strong>School Email</strong><span>{currentSchoolEmail || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Main Phone</strong><span>{schoolDashboard.school.main_phone || '-'}</span></div>
                </div>
              </article>
              <div className="ns-principal-pair" hidden={dashboardTab !== 'approvals'}>
                <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitSchoolTeacherApproval}>
                  <div className="ns-form__head">
                    <span className="eyebrow">Teacher Verification</span>
                    <h3>Approve or reject teachers</h3>
                    <p>Select a teacher from this school and record the principal review.</p>
                  </div>
                  <div className="ns-field-grid">
                    <label className="ns-field ns-field--full">
                      <span>Teacher</span>
                      <select
                        name="teacher_id"
                        value={schoolTeacherApprovalId}
                        onChange={(event) => setSchoolTeacherApprovalId(event.target.value)}
                        required
                      >
                        <option value="">Select teacher</option>
                        {schoolDashboard.teachers.map((teacher: any) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.teacher_full_name} - {teacher.status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input type="hidden" name="teacher_name" value={selectedSchoolTeacher?.teacher_full_name || ''} readOnly />
                    <input type="hidden" name="teacher_email" value={selectedSchoolTeacher?.school_email || ''} readOnly />
                    <input type="hidden" name="role" value={selectedSchoolTeacher?.role_department || 'Teacher'} readOnly />
                    <label className="ns-field">
                      <span>Status</span>
                      <select name="approval_status" defaultValue="approved">
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                    <label className="ns-field ns-field--full">
                      <span>Notes</span>
                      <textarea name="notes" rows={3} placeholder="Optional teacher review notes" />
                    </label>
                    <label className="ns-field ns-field--full">
                      <span>Digital Signature</span>
                      <input name="digital_signature" defaultValue={user?.full_name || schoolDashboard.school.principal_name || ''} required />
                    </label>
                  </div>
                  <button className="btn btn--solid" type="submit" disabled={busy === 'school-teacher-approval'}>
                    {busy === 'school-teacher-approval' ? 'Saving...' : 'Save Teacher Review'}
                  </button>
                </form>

                <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitSchoolApproval}>
                  <div className="ns-form__head">
                    <span className="eyebrow">School Approval</span>
                    <h3>Verify student participation</h3>
                    <p>Choose a student from this school and save the approval record with a digital signature.</p>
                  </div>
                  <div className="ns-field-grid">
                    <label className="ns-field ns-field--full">
                      <span>Student Participant ID</span>
                      <select name="participant_id" defaultValue="" required>
                        <option value="">Select student</option>
                        {schoolDashboard.students.map((row: any) => (
                          <option key={row.id} value={row.participant_id}>
                            {row.full_name} - {row.participant_id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ns-field">
                      <span>School Staff Name</span>
                      <input name="school_staff_name" defaultValue={user?.full_name || schoolDashboard.school.administrator_name || ''} required />
                    </label>
                    <label className="ns-field">
                      <span>Role</span>
                      <input name="role" defaultValue="Administrator" required />
                    </label>
                    <label className="ns-field">
                      <span>School Email</span>
                      <input name="school_email" type="email" defaultValue={currentSchoolEmail} required />
                    </label>
                    <label className="ns-field">
                      <span>Status</span>
                      <select name="approval_status" defaultValue="approved">
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                    <label className="ns-field ns-field--full">
                      <span>Notes</span>
                      <textarea name="notes" rows={3} placeholder="Optional approval notes" />
                    </label>
                    <label className="ns-field ns-field--full">
                      <span>Digital Signature</span>
                      <input name="digital_signature" placeholder="Type full legal name" required />
                    </label>
                  </div>
                  <button className="btn btn--solid" type="submit" disabled={busy === 'school-approval'}>
                    {busy === 'school-approval' ? 'Saving...' : 'Save School Approval'}
                  </button>
                </form>
              </div>
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'records'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Records</span>
                  <span className="ns-board__badge">
                    {schoolRecordsTabs.find((tab) => tab.key === schoolRecordsTab)?.count || 0}
                  </span>
                </div>
                <div className="ns-record-tabs" role="tablist" aria-label="School records">
                  {schoolRecordsTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`ns-record-tabs__btn ${schoolRecordsTab === tab.key ? 'is-active' : ''}`}
                      role="tab"
                      aria-selected={schoolRecordsTab === tab.key}
                      onClick={() => setSchoolRecordsTab(tab.key)}
                    >
                      <strong>{tab.label}</strong>
                      <span>{tab.hint}</span>
                      <em>{tab.count}</em>
                    </button>
                  ))}
                </div>
                <div className="ns-record-panel">
                  {schoolRecordsTab === 'students' && (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Parent</th>
                            <th>School</th>
                            <th>Teacher</th>
                            <th>Interviews</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolDashboard.students.length > 0 ? schoolDashboard.students.map((row: any) => (
                            <tr key={row.id}>
                              <td>{row.participant_id}</td>
                              <td>{row.full_name}</td>
                              <td>{row.parent_consent_status}</td>
                              <td>{row.school_approval_status}</td>
                              <td>{row.teacher_approval_status}</td>
                              <td>{row.interview_count}</td>
                              <td>{row.submission_status}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={7}>No students registered yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {schoolRecordsTab === 'teachers' && (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Teacher</th>
                            <th>Status</th>
                            <th>Students</th>
                            <th>Score</th>
                            <th>Top Student</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolDashboard.teachers.length > 0 ? schoolDashboard.teachers.map((row: any) => (
                            <tr key={row.id}>
                              <td>{row.rank_position ?? '-'}</td>
                              <td>{row.teacher_full_name}</td>
                              <td>{row.status}</td>
                              <td>{row.students_total ?? 0}</td>
                              <td>{row.ranking_score ?? 0}</td>
                              <td>{row.top_student_name ? `${row.top_student_name} (${row.top_student_score ?? 0})` : '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={6}>No teachers registered yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {schoolRecordsTab === 'interviews' && (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Visit</th>
                            <th>Business</th>
                            <th>Category</th>
                            <th>Challenge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolBusinesses.length > 0 ? schoolBusinesses.slice(0, 12).map((row: any) => (
                            <tr key={row.id}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.visit_number}</td>
                              <td>{row.business_name}</td>
                              <td>{row.business_category}</td>
                              <td>{clipText(row.main_challenge, 42)}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={6}>No business interviews recorded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {schoolRecordsTab === 'approvals' && (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Reviewer</th>
                            <th>Approved At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolApprovals.length > 0 ? schoolApprovals.slice(0, 12).map((row: any) => (
                            <tr key={row.id}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.approval_type}</td>
                              <td>{row.status}</td>
                              <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                              <td>{row.approved_at || row.recorded_at || '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={6}>No approvals recorded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {schoolRecordsTab === 'projects' && (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Business</th>
                            <th>Problem</th>
                            <th>Solution</th>
                            <th>Status</th>
                            <th>Score</th>
                            <th>Rank</th>
                            <th>Reviewer</th>
                            <th>Submitted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolSubmissions.length > 0 ? schoolSubmissions.map((row: any) => (
                            <tr key={row.id}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.source_business_name || '-'}</td>
                              <td>{clipText(row.problem_identified, 36)}</td>
                              <td>{clipText(row.proposed_solution, 36)}</td>
                              <td>{row.status}</td>
                              <td>{row.score ?? '-'}</td>
                              <td>{row.rank_position ?? '-'}</td>
                              <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                              <td>{row.submission_date || '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={10}>No submissions have been recorded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Rankings</span>
                  <span className="ns-board__badge">School-wide &amp; Teacher</span>
                </div>
                <div className="ns-rank-columns">
                  <div>
                    <strong className="ns-subtitle">Global Student Ranking</strong>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Student</th>
                            <th>Teacher</th>
                            <th>Score</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolRankedStudents.slice(0, 8).map((row: any) => (
                            <tr
                              key={`school-student-${row.id}`}
                              className={Number(row.rank_position || 0) <= 3 ? 'is-top' : ''}
                            >
                              <td>{row.rank_position || '-'}</td>
                              <td>{row.full_name}</td>
                              <td>{row.teacher_full_name || '-'}</td>
                              <td>{row.performance_score ?? 0}</td>
                              <td>{row.submission_status || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <strong className="ns-subtitle">Teacher Ranking</strong>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Teacher</th>
                            <th>Students</th>
                            <th>Score</th>
                            <th>Top Student</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolRankedTeachers.slice(0, 8).map((row: any) => (
                            <tr
                              key={`school-teacher-${row.id}`}
                              className={Number(row.rank_position || 0) <= 3 ? 'is-top' : ''}
                            >
                              <td>{row.rank_position || '-'}</td>
                              <td>{row.teacher_full_name}</td>
                              <td>{row.students_total ?? 0}</td>
                              <td>{row.ranking_score ?? 0}</td>
                              <td>{row.top_student_name || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </article>

              <div className="ns-review-grid" hidden={dashboardTab !== 'reviews'}>
                <article className="glass ns-dash-card reveal in">
                  <div className="ns-dash-card__head">
                    <span className="eyebrow">Submissions Queue</span>
                    <span className="ns-board__badge">{schoolReviewQueue.length}</span>
                  </div>
                  <div className="ns-review-queue">
                    {schoolReviewQueue.length > 0 ? (
                      schoolReviewQueue.map((row: any) => (
                        <div
                          className={`ns-review-queue__item ${String(schoolSelectedSubmission?.id || '') === String(row.id) ? 'is-active' : ''}`}
                          key={row.id}
                        >
                          <div className="ns-review-queue__head">
                            <strong>#{row.id} {row.student_name}</strong>
                            <span>{row.status}</span>
                          </div>
                          <p>{clipText(row.problem_identified, 95)}</p>
                          <div className="ns-review-queue__meta">
                            <span>{row.source_business_name || '-'}</span>
                            <span>{row.score ?? '-'}</span>
                            <span>{row.rank_position ?? '-'}</span>
                          </div>
                          <button className="btn btn--sm" type="button" onClick={() => setSchoolSubmissionReviewId(String(row.id))}>
                            Load Review
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="ns-muted">No submissions waiting for review.</p>
                    )}
                  </div>
                </article>

                <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitSubmissionReview}>
                  <div className="ns-form__head">
                    <span className="eyebrow">Submission Review</span>
                    <h3>Approve or reject problem and solution submissions</h3>
                    <p>Principal can review the submission list before final publishing.</p>
                  </div>
                  {schoolSelectedSubmission && (
                    <div className="ns-submission-summary">
                      <strong>Selected Submission</strong>
                      <p>
                        #{schoolSelectedSubmission.id} - {schoolSelectedSubmission.student_name}
                      </p>
                      <p>{schoolSelectedSubmission.source_business_name || 'No business attached yet'}</p>
                    </div>
                  )}
                  <div className="ns-field-grid">
                    <label className="ns-field ns-field--full">
                      <span>Submission</span>
                      <select
                        name="submission_id"
                        value={schoolSubmissionReviewId || String(schoolSubmissions[0]?.id || '')}
                        onChange={(event) => setSchoolSubmissionReviewId(event.target.value)}
                        required
                      >
                        <option value="">Select submission</option>
                        {schoolSubmissions.map((row: any) => (
                          <option key={row.id} value={row.id}>
                            #{row.id} - {row.student_name} - {row.status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ns-field">
                      <span>Status</span>
                      <select name="status" defaultValue="approved">
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                    <label className="ns-field">
                      <span>Score</span>
                      <input name="score" type="number" min="0" step="0.01" placeholder="Optional" />
                    </label>
                    <label className="ns-field">
                      <span>Rank Position</span>
                      <input name="rank_position" type="number" min="1" max="3" placeholder="Optional" />
                    </label>
                    <label className="ns-field ns-field--full">
                      <span>Reviewer Notes</span>
                      <textarea name="reviewer_notes" rows={3} placeholder="Optional review notes" />
                    </label>
                  </div>
                  <button className="btn btn--solid" type="submit" disabled={busy === 'submission-review'}>
                    {busy === 'submission-review' ? 'Saving...' : 'Save Submission Review'}
                  </button>
                </form>
              </div>

              <div className="ns-alert-grid" hidden={dashboardTab !== 'notifications'}>
                <article className="glass ns-dash-card reveal in">
                  <div className="ns-dash-card__head">
                    <span className="eyebrow">School Winners</span>
                    <span className="ns-board__badge">{schoolWinnersQueue.length}</span>
                  </div>
                  <div className="ns-notification-list">
                    {schoolWinnersQueue.length > 0 ? (
                      schoolWinnersQueue.map((winner: any) => (
                        <div className="ns-notification-item" key={winner.id}>
                          <strong>{winner.place} place</strong>
                          <p>{winner.student_name} - {formatMoney(winner.scholarship_amount)}</p>
                          <span>{winner.published_at || winner.announced_at || 'Published'}</span>
                        </div>
                      ))
                    ) : (
                      <p className="ns-muted">No winners published for this school yet.</p>
                    )}
                  </div>
                </article>
                <article className="glass ns-dash-card reveal in">
                  <div className="ns-dash-card__head">
                    <span className="eyebrow">Notifications</span>
                    <span className="ns-board__badge">{schoolUnreadNotifications.length} unread</span>
                  </div>
                  <div className="ns-notification-list">
                    {schoolNotifications.length > 0 ? (
                      schoolNotifications.slice(0, 5).map((item: any) => (
                        <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                          <strong>{item.title}</strong>
                          <p>{item.message}</p>
                          <span>{item.created_at}</span>
                          {!item.is_read && (
                            <button className="ns-notification-action" type="button" onClick={() => markNotificationRead(item.id)}>
                              Mark as read
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="ns-muted">No school notifications yet.</p>
                    )}
                  </div>
                </article>
              </div>
            </div>
              )}

              {teacherDashboard && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card ns-dash-card--wide reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Teacher Dashboard</span>
                  <span className="ns-board__badge">{teacherDashboard.teacher.teacher_full_name}</span>
                </div>
                <p>{teacherDashboard.school?.school_name || teacherDashboard.teacher.linked_school_name || '-'}</p>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Classroom queue</strong>
                    <span>{teacherDashboard.summary.teacher_approved || 0} approved</span>
                  </div>
                  <p>Review student approvals first, then clear submissions and keep the leaderboard moving.</p>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${teacherReadinessProgress}%` }} />
                  </div>
                  <small>{teacherReadinessProgress}% classroom progress</small>
                </div>
                <div className="ns-quick-stats">
                  <div><span>Students</span><strong>{teacherDashboard.summary.students_total || 0}</strong></div>
                  <div><span>Parent Pending</span><strong>{teacherDashboard.summary.parent_pending || 0}</strong></div>
                  <div><span>School Pending</span><strong>{teacherDashboard.summary.school_pending || 0}</strong></div>
                  <div><span>Teacher Pending</span><strong>{teacherDashboard.summary.teacher_pending || 0}</strong></div>
                  <div><span>Eligible</span><strong>{teacherDashboard.summary.eligible_to_submit || 0}</strong></div>
                  <div><span>Submitted</span><strong>{teacherDashboard.summary.submitted || 0}</strong></div>
                  <div><span>Interviews</span><strong>{teacherDashboard.summary.interviews_total || 0}</strong></div>
                </div>
                <div className="ns-award">
                  <div className="ns-award__head">
                    <strong>Community Impact Score</strong>
                    <span>{teacherScore}</span>
                  </div>
                  <div className="ns-award__bar"><span style={{ width: `${teacherProgress}%` }} /></div>
                  <p>Progress toward the Community Leadership Educator Award.</p>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>View Profile</button>
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('approvals')}>Review Approvals</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('reviews')}>Open Reviews</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                </div>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Profile</span>
                  <span className="ns-board__badge">{teacherDashboard.teacher.status || 'active'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Teacher</strong><span>{teacherDashboard.teacher.teacher_full_name}</span></div>
                  <div className="ns-approval-row"><strong>School</strong><span>{teacherDashboard.school?.school_name || teacherDashboard.teacher.linked_school_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Email</strong><span>{teacherDashboard.teacher.school_email || user?.email || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Role</strong><span>{teacherDashboard.teacher.role_department || 'Teacher'}</span></div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('approvals')}>Open Approvals</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                </div>
              </article>
              <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitTeacherApproval} hidden={dashboardTab !== 'approvals'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Teacher Approval</span>
                  <h3>Approve student registration</h3>
                  <p>Choose a student, confirm participation, and store the teacher approval record.</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field ns-field--full">
                    <span>Student Participant ID</span>
                    <select name="participant_id" defaultValue="" required>
                      <option value="">Select student</option>
                      {teacherDashboard.students.map((row: any) => (
                        <option key={row.id} value={row.participant_id}>
                          {row.full_name} - {row.participant_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Teacher Name</span>
                    <input name="teacher_name" defaultValue={user?.full_name || teacherDashboard.teacher.teacher_full_name || ''} required />
                  </label>
                  <label className="ns-field">
                    <span>Teacher Email</span>
                    <input name="teacher_email" type="email" defaultValue={currentTeacherEmail} required />
                  </label>
                  <label className="ns-field">
                    <span>Role</span>
                    <input name="role" defaultValue={teacherDashboard.teacher.role_department || 'Teacher'} required />
                  </label>
                  <label className="ns-field">
                    <span>Status</span>
                    <select name="approval_status" defaultValue="approved">
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label className="ns-field ns-field--full">
                    <span>Notes</span>
                    <textarea name="notes" rows={3} placeholder="Optional monitoring notes" />
                  </label>
                  <label className="ns-field ns-field--full">
                    <span>Digital Signature</span>
                    <input name="digital_signature" placeholder="Type full legal name" required />
                  </label>
                </div>
                <button className="btn btn--solid" type="submit" disabled={busy === 'teacher-approval'}>
                  {busy === 'teacher-approval' ? 'Saving...' : 'Save Teacher Approval'}
                </button>
              </form>

              <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitSubmissionReview} hidden={dashboardTab !== 'reviews'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Submission Review</span>
                  <h3>Approve or reject problem and solution submissions</h3>
                  <p>Teachers can review student submissions before they reach admin review.</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field ns-field--full">
                    <span>Submission</span>
                    <select name="submission_id" defaultValue="" required>
                      <option value="">Select submission</option>
                      {teacherSubmissions.map((row: any) => (
                        <option key={row.id} value={row.id}>
                          #{row.id} - {row.student_name} - {row.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Status</span>
                    <select name="status" defaultValue="approved">
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Score</span>
                    <input name="score" type="number" min="0" step="0.01" placeholder="Optional" />
                  </label>
                  <label className="ns-field">
                    <span>Rank Position</span>
                    <input name="rank_position" type="number" min="1" max="3" placeholder="Optional" />
                  </label>
                  <label className="ns-field ns-field--full">
                    <span>Reviewer Notes</span>
                    <textarea name="reviewer_notes" rows={3} placeholder="Optional review notes" />
                  </label>
                </div>
                <button className="btn btn--solid" type="submit" disabled={busy === 'submission-review'}>
                  {busy === 'submission-review' ? 'Saving...' : 'Save Submission Review'}
                </button>
              </form>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'records'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Students Under Teacher</span>
                  <span className="ns-board__badge">{teacherDashboard.students.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Parent</th>
                        <th>School</th>
                        <th>Interviews</th>
                        <th>Submission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherDashboard.students.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.full_name}</td>
                          <td>{row.parent_consent_status}</td>
                          <td>{row.school_approval_status}</td>
                          <td>{row.interview_count}</td>
                          <td>{row.submission_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'records'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Business Interview Tracking</span>
                  <span className="ns-board__badge">{teacherBusinesses.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Visit</th>
                        <th>Business</th>
                        <th>Category</th>
                        <th>Website</th>
                        <th>Google</th>
                        <th>Social</th>
                        <th>Online</th>
                        <th>Challenge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherBusinesses.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.visit_number}</td>
                          <td>{row.business_name}</td>
                          <td>{row.business_category}</td>
                          <td>{row.has_website ? 'Yes' : 'No'}</td>
                          <td>{row.has_google_profile ? 'Yes' : 'No'}</td>
                          <td>{row.uses_social_media ? 'Yes' : 'No'}</td>
                          <td>{row.has_online_ordering ? 'Yes' : 'No'}</td>
                          <td>{clipText(row.main_challenge, 32)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'records'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Project Submission Tracking</span>
                  <span className="ns-board__badge">{teacherSubmissions.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Business</th>
                        <th>Problem</th>
                        <th>Solution</th>
                        <th>Video</th>
                        <th>Written</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Score</th>
                        <th>Rank</th>
                        <th>Reviewer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherSubmissions.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.source_business_name || '-'}</td>
                          <td>{clipText(row.problem_identified, 30)}</td>
                          <td>{clipText(row.proposed_solution, 30)}</td>
                          <td>{row.video_url ? 'Yes' : 'No'}</td>
                          <td>{row.written_url ? 'Yes' : 'No'}</td>
                          <td>{row.status}</td>
                          <td>{row.submission_date || '-'}</td>
                          <td>{row.score ?? '-'}</td>
                          <td>{row.rank_position ?? '-'}</td>
                          <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Teacher Rankings</span>
                  <span className="ns-board__badge">School-wide &amp; Under You</span>
                </div>
                <div className="ns-rank-columns">
                  <div>
                    <strong className="ns-subtitle">School Teacher Ranking</strong>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Teacher</th>
                            <th>Students</th>
                            <th>Score</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teacherRankedTeachers.slice(0, 8).map((row: any) => (
                            <tr
                              key={`teacher-rank-${row.id}`}
                              className={Number(row.rank_position || 0) <= 3 ? 'is-top' : ''}
                            >
                              <td>{row.rank_position || '-'}</td>
                              <td>{row.teacher_full_name}</td>
                              <td>{row.students_total ?? 0}</td>
                              <td>{row.ranking_score ?? 0}</td>
                              <td>{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <strong className="ns-subtitle">Students Under This Teacher</strong>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Student</th>
                            <th>Score</th>
                            <th>Interviews</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teacherRankedStudents.slice(0, 8).map((row: any) => (
                            <tr
                              key={`teacher-student-${row.id}`}
                              className={`${Number(row.rank_position || 0) <= 3 ? 'is-top' : ''} ${String(row.participant_id || '') === currentParticipantId ? 'is-me' : ''}`.trim()}
                            >
                              <td>{row.rank_position || '-'}</td>
                              <td>{row.full_name}</td>
                              <td>{row.performance_score ?? 0}</td>
                              <td>{row.interview_count || 0}</td>
                              <td>{row.submission_status || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'records'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approval Records</span>
                  <span className="ns-board__badge">{teacherApprovals.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Reviewer</th>
                        <th>Approved At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherApprovals.map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.approval_type}</td>
                          <td>{row.status}</td>
                          <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                          <td>{row.approved_at || row.recorded_at || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Winner Results</span>
                  <span className="ns-board__badge">{teacherWinners.length}</span>
                </div>
                <div className="ns-notification-list">
                  {teacherWinners.length > 0 ? teacherWinners.slice(0, 5).map((winner: any) => (
                    <div className="ns-notification-item" key={winner.id}>
                      <strong>{winner.place} place</strong>
                      <p>{winner.student_name} - {formatMoney(winner.scholarship_amount)}</p>
                      <span>{winner.published_at || winner.announced_at || 'Published'}</span>
                    </div>
                  )) : <p className="ns-muted">No teacher winner results yet.</p>}
                </div>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Leaderboards</span>
                  <span className="ns-board__badge">Top 3</span>
                </div>
                <div className="ns-notification-list">
                  <strong className="ns-subtitle">Schools</strong>
                  {asArray<any>(teacherDashboard.leaderboards?.schools).slice(0, 3).map((row: any) => (
                    <div className="ns-notification-item" key={`school-${row.id}`}>
                      <strong>{row.label}</strong>
                      <p>{row.submissions} submissions</p>
                      <span>{row.students} students</span>
                    </div>
                  ))}
                  <strong className="ns-subtitle">Teachers</strong>
                  {asArray<any>(teacherDashboard.leaderboards?.teachers).slice(0, 3).map((row: any) => (
                    <div className="ns-notification-item" key={`teacher-${row.id}`}>
                      <strong>{row.label}</strong>
                      <p>{row.teacher_approved || 0} approved</p>
                      <span>{row.students} students</span>
                    </div>
                  ))}
                  <strong className="ns-subtitle">Students</strong>
                  {asArray<any>(teacherDashboard.leaderboards?.students).slice(0, 3).map((row: any) => (
                    <div className="ns-notification-item" key={`student-${row.id}`}>
                      <strong>{row.label}</strong>
                      <p>{row.interview_count} interviews</p>
                      <span>{row.grade_level}</span>
                    </div>
                  ))}
                </div>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Teacher Award</span>
                  <span className="ns-board__badge">{teacherProgress}%</span>
                </div>
                <div className="ns-award">
                  <div className="ns-award__head">
                    <strong>Community Leadership Educator Award</strong>
                    <span>{teacherScore}</span>
                  </div>
                  <div className="ns-award__bar"><span style={{ width: `${teacherProgress}%` }} /></div>
                  <p>Prize package: roundtrip airfare, hotel accommodations, ground transportation, recognition experience, and the Community Leadership Educator Award.</p>
                </div>
              </article>
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'reviews'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Reports</span>
                  <span className="ns-board__badge">{teacherNotifications.length}</span>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => downloadCsvFile('teacher-students.csv', teacherDashboard.students.map((row: any) => ({
                    participant_id: row.participant_id,
                    student_name: row.full_name,
                    parent_status: row.parent_consent_status,
                    school_status: row.school_approval_status,
                    teacher_status: row.teacher_approval_status,
                    interviews: row.interview_count,
                    submission_status: row.submission_status,
                  })))}>
                    Export Student List
                  </button>
                  <button className="btn btn--sm" type="button" onClick={() => downloadCsvFile('teacher-parent-consent.csv', teacherDashboard.students.map((row: any) => ({
                    participant_id: row.participant_id,
                    student_name: row.full_name,
                    parent_status: row.parent_consent_status,
                    parent_name: row.parent_name,
                    parent_email: row.parent_email,
                  })))}>
                    Export Parent Consent
                  </button>
                  <button className="btn btn--sm" type="button" onClick={() => downloadCsvFile('teacher-businesses.csv', teacherBusinesses.map((row: any) => ({
                    participant_id: row.participant_id,
                    student_name: row.student_name,
                    visit_number: row.visit_number,
                    business_name: row.business_name,
                    category: row.business_category,
                    visit_date: row.date_of_visit,
                    website: row.has_website ? 'Yes' : 'No',
                    google_profile: row.has_google_profile ? 'Yes' : 'No',
                    social_media: row.uses_social_media ? 'Yes' : 'No',
                    digital_signage: row.uses_digital_signage ? 'Yes' : 'No',
                    online_ordering: row.has_online_ordering ? 'Yes' : 'No',
                    delivery_options: row.has_delivery_options ? 'Yes' : 'No',
                  })))}>
                    Export Businesses
                  </button>
                  <button className="btn btn--sm" type="button" onClick={() => downloadCsvFile('teacher-submissions.csv', teacherSubmissions.map((row: any) => ({
                    participant_id: row.participant_id,
                    student_name: row.student_name,
                    business_name: row.source_business_name || '',
                    status: row.status,
                    score: row.score ?? '',
                    rank_position: row.rank_position ?? '',
                    submission_date: row.submission_date || '',
                  })))}>
                    Export Projects
                  </button>
                  <button className="btn btn--sm" type="button" onClick={() => downloadCsvFile('teacher-score-report.csv', [{
                    teacher_name: teacherDashboard.teacher.teacher_full_name,
                    school_name: teacherDashboard.teacher.linked_school_name,
                    students_total: teacherDashboard.summary.students_total || 0,
                    parent_approved: teacherDashboard.summary.parent_approved || 0,
                    school_approved: teacherDashboard.summary.school_approved || 0,
                    teacher_approved: teacherDashboard.summary.teacher_approved || 0,
                    eligible_to_submit: teacherDashboard.summary.eligible_to_submit || 0,
                    submitted: teacherDashboard.summary.submitted || 0,
                    interviews_total: teacherDashboard.summary.interviews_total || 0,
                    community_score: teacherScore,
                  }])}>
                    Export Teacher Score
                  </button>
                </div>
              </article>
              <article className="glass ns-dash-card reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Notifications</span>
                  <span className="ns-board__badge">{teacherUnreadNotifications.length} unread</span>
                </div>
                <div className="ns-notification-list">
                  {teacherNotifications.length > 0 ? teacherNotifications.slice(0, 6).map((item: any) => (
                    <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <span>{item.created_at}</span>
                      {!item.is_read && (
                        <button className="ns-notification-action" type="button" onClick={() => markNotificationRead(item.id)}>
                          Mark as read
                        </button>
                      )}
                    </div>
                  )) : <p className="ns-muted">No teacher notifications yet.</p>}
                </div>
              </article>
            </div>
              )}

              {adminDashboard && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card ns-dash-card--wide reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Admin Dashboard</span>
                  <span className="ns-board__badge">Management console</span>
                </div>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>Platform oversight</strong>
                    <span>{adminDashboard.summary.winners || 0} winners published</span>
                  </div>
                  <p>Track the entire program, review results, and export data without leaving the console.</p>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${adminReadinessProgress}%` }} />
                  </div>
                  <small>{adminReadinessProgress}% platform completion</small>
                </div>
                <div className="ns-quick-stats">
                  {[
                    ['Students', adminDashboard.summary.students],
                    ['Parents', adminDashboard.summary.parents],
                    ['Schools', adminDashboard.summary.schools],
                    ['Teachers', adminDashboard.summary.teachers],
                    ['Businesses', adminDashboard.summary.businesses],
                    ['Submissions', adminDashboard.summary.submissions],
                    ['Winners', adminDashboard.summary.winners],
                  ].map(([label, val]) => (
                    <div key={label as string}><span>{label}</span><strong>{String(val ?? 0)}</strong></div>
                  ))}
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('profile')}>
                    View Profile
                  </button>
                  {['students', 'parents', 'schools', 'teachers', 'businesses', 'submissions', 'winners', 'approvals', 'notifications'].map((type) => (
                    <button key={type} className="btn btn--sm" type="button" onClick={() => exportCsv(type)} disabled={busy === `export-${type}`}>
                      {busy === `export-${type}` ? `Exporting ${type}...` : `Export ${type}`}
                    </button>
                  ))}
                </div>
              </article>

              <article className="glass ns-dash-card reveal in">
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Operational Progress</span>
                  <span className="ns-board__badge">Student status summary</span>
                </div>
                <div className="ns-quick-stats">
                  <div><span>Parent Pending</span><strong>{adminStudentSummary.parent_pending || 0}</strong></div>
                  <div><span>Parent Approved</span><strong>{adminStudentSummary.parent_approved || 0}</strong></div>
                  <div><span>School Pending</span><strong>{adminStudentSummary.school_pending || 0}</strong></div>
                  <div><span>School Approved</span><strong>{adminStudentSummary.school_approved || 0}</strong></div>
                  <div><span>Teacher Pending</span><strong>{adminStudentSummary.teacher_pending || 0}</strong></div>
                  <div><span>Teacher Approved</span><strong>{adminStudentSummary.teacher_approved || 0}</strong></div>
                  <div><span>Eligible</span><strong>{adminStudentSummary.eligible_to_submit || 0}</strong></div>
                  <div><span>Submitted</span><strong>{adminStudentSummary.submitted || 0}</strong></div>
                  <div><span>Interviews</span><strong>{adminStudentSummary.interviews_total || 0}</strong></div>
                </div>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'profile'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Profile</span>
                  <span className="ns-board__badge">{user?.role || 'admin'}</span>
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>User</strong><span>{user?.full_name || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Email</strong><span>{user?.email || '-'}</span></div>
                  <div className="ns-approval-row"><strong>Access</strong><span>Schools, teachers, students, approvals, results</span></div>
                  <div className="ns-approval-row"><strong>Mode</strong><span>Platform admin and review control</span></div>
                </div>
                <div className="ns-actions">
                  <button className="btn btn--sm btn--solid" type="button" onClick={() => openDashboardTab('data')}>Open Data</button>
                  <button className="btn btn--sm" type="button" onClick={() => openDashboardTab('rankings')}>View Rankings</button>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Global Rankings</span>
                  <span className="ns-board__badge">Top 3 by type</span>
                </div>
                <div className="ns-rank-columns">
                  <div>
                    <strong className="ns-subtitle">Schools</strong>
                    <div className="ns-notification-list">
                      {asArray<any>(adminDashboard.leaderboards?.schools).slice(0, 3).map((row: any) => (
                        <div className="ns-notification-item" key={`admin-school-${row.id}`}>
                          <strong>{row.label}</strong>
                          <p>{row.submissions} submissions</p>
                          <span>{row.students} students</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong className="ns-subtitle">Teachers</strong>
                    <div className="ns-notification-list">
                      {asArray<any>(adminDashboard.leaderboards?.teachers).slice(0, 3).map((row: any) => (
                        <div className="ns-notification-item" key={`admin-teacher-${row.id}`}>
                          <strong>{row.label}</strong>
                          <p>{row.teacher_approved || 0} approved</p>
                          <span>{row.students} students</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong className="ns-subtitle">Students</strong>
                    <div className="ns-notification-list">
                      {asArray<any>(adminDashboard.leaderboards?.students).slice(0, 3).map((row: any) => (
                        <div className="ns-notification-item" key={`admin-student-${row.id}`}>
                          <strong>{row.label}</strong>
                          <p>{row.interview_count} interviews</p>
                          <span>{row.grade_level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Submissions</span>
                  <span className="ns-board__badge">{adminDashboard.submissions?.length || 0}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Problem</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(adminDashboard.submissions || []).slice(0, 8).map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{clipText(row.problem_identified, 42)}</td>
                          <td>{row.status}</td>
                          <td>{row.score ?? '-'}</td>
                          <td>{row.rank_position ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Schools</span>
                  <span className="ns-board__badge">{adminSchools.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>School</th>
                        <th>District</th>
                        <th>Administrator</th>
                        <th>Email</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminSchools.slice(0, 10).map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.school_name}</td>
                          <td>{row.school_district || '-'}</td>
                          <td>{row.administrator_name || '-'}</td>
                          <td>{row.administrator_email || '-'}</td>
                          <td>{row.status || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Parent Consent</span>
                  <span className="ns-board__badge">{adminParents.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Parent</th>
                        <th>Relationship</th>
                        <th>Status</th>
                        <th>Approved At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminParents.slice(0, 10).map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.parent_full_name}</td>
                          <td>{row.relationship_to_student}</td>
                          <td>{row.student_parent_status || (row.consent_checked ? 'approved' : 'pending')}</td>
                          <td>{row.approved_at || row.consented_at || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approval Records</span>
                  <span className="ns-board__badge">{adminApprovals.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Reviewer</th>
                        <th>Recorded At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminApprovals.slice(0, 12).map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.approval_type}</td>
                          <td>{row.status}</td>
                          <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                          <td>{row.recorded_at || row.approved_at || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Business Interviews</span>
                  <span className="ns-board__badge">{adminBusinesses.length}</span>
                </div>
                <div className="ns-table-wrap">
                  <table className="ns-table">
                    <thead>
                      <tr>
                        <th>Participant ID</th>
                        <th>Student</th>
                        <th>Visit</th>
                        <th>Business</th>
                        <th>Category</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminBusinesses.slice(0, 12).map((row: any) => (
                        <tr key={row.id}>
                          <td>{row.participant_id}</td>
                          <td>{row.student_name}</td>
                          <td>{row.visit_number}</td>
                          <td>{row.business_name}</td>
                          <td>{row.business_category}</td>
                          <td>{row.date_of_visit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'notifications'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Notifications</span>
                  <span className="ns-board__badge">{adminUnreadNotifications.length} unread</span>
                </div>
                <div className="ns-notification-list">
                  {adminNotifications.length > 0 ? adminNotifications.slice(0, 8).map((item: any) => (
                    <div className={`ns-notification-item ${item.is_read ? '' : 'is-unread'}`} key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <span>{item.created_at}</span>
                      {!item.is_read && (
                        <button className="ns-notification-action" type="button" onClick={() => markNotificationRead(item.id)}>
                          Mark as read
                        </button>
                      )}
                    </div>
                  )) : <p className="ns-muted">No admin notifications yet.</p>}
                </div>
              </article>

              <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitAdminReview} hidden={dashboardTab !== 'reviews'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Submission Review</span>
                  <h3>Score and publish a result</h3>
                  <p>Use this form to approve, reject, or mark a submission as a winner.</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field ns-field--full">
                    <span>Submission</span>
                    <select name="submission_id" defaultValue="" required>
                      <option value="">Select submission</option>
                      {(adminDashboard.submissions || []).map((row: any) => (
                        <option key={row.id} value={row.id}>
                          #{row.id} - {row.student_name} - {row.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Status</span>
                    <select name="status" defaultValue="submitted">
                      <option value="submitted">Submitted</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="winner">Winner</option>
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Score</span>
                    <input name="score" type="number" min="0" step="0.01" placeholder="Optional" />
                  </label>
                  <label className="ns-field">
                    <span>Rank Position</span>
                    <input name="rank_position" type="number" min="1" max="3" placeholder="1, 2, or 3" />
                  </label>
                  <label className="ns-field">
                    <span>Place</span>
                    <input name="place" placeholder="First / Second / Third" />
                  </label>
                  <label className="ns-field">
                    <span>Scholarship Amount</span>
                    <input name="scholarship_amount" type="number" min="1" step="1" placeholder="2500" />
                  </label>
                  <label className="ns-field ns-field--full">
                    <span>Reviewer Notes</span>
                    <textarea name="reviewer_notes" rows={3} placeholder="Optional review notes" />
                  </label>
                </div>
                <button className="btn btn--solid" type="submit" disabled={busy === 'admin-review'}>
                  {busy === 'admin-review' ? 'Saving...' : 'Update Submission'}
                </button>
              </form>

              <form className="glass ns-form ns-form--compact reveal in" onSubmit={publishWinners} hidden={dashboardTab !== 'reviews'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Publish Winners</span>
                  <h3>Select the top 3 submissions</h3>
                  <p>Enter submission IDs, placement, and scholarship amounts. The backend will publish them to the site.</p>
                </div>
                {[1, 2, 3].map((slot) => (
                  <div className="ns-winner-form-row" key={slot}>
                    <label className="ns-field"><span>Submission ID {slot}</span><input name={`winner_${slot}_submission_id`} type="number" min="1" /></label>
                    <label className="ns-field"><span>Place</span><input name={`winner_${slot}_place`} placeholder={slot === 1 ? 'first' : slot === 2 ? 'second' : 'third'} /></label>
                    <label className="ns-field"><span>Amount</span><input name={`winner_${slot}_amount`} type="number" min="1" step="1" placeholder={slot === 1 ? '2500' : slot === 2 ? '1500' : '1000'} /></label>
                  </div>
                ))}
                <button className="btn btn--solid" type="submit" disabled={busy === 'publish'}>{busy === 'publish' ? 'Publishing...' : 'Publish Winners'}</button>
              </form>
            </div>
              )}
            </div>
          </div>
        </div>
      </section>
        </>
      )}

    </div>
  )
}
