import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { buildLocalQrDataUri } from '../lib/localQr.js'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { resolveDashboardRoute } from '../lib/dashboardRoute'
import TermsAgreement from '../components/TermsAgreement'
import { CHALLENGE_TERMS_VERSION } from '../lib/terms'
import { recordTermsAcceptance } from '../lib/recordTermsAcceptance'

const isAdminRole = (role?: string) => ['admin', 'super_admin', 'editor'].includes(role || '')

/** Whole-years age from a YYYY-MM-DD date of birth, or '' if blank/invalid. */
const ageFromDob = (dob: string): string => {
  if (!dob) return ''
  const d = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 150 ? String(age) : ''
}

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

const formatLongDateLabel = (value?: string) => {
  if (!value) return 'To be announced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
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

const TABLE_PAGE_SIZE = 10

function pagerNumbers(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i)
  const out: Array<number | 'gap'> = [0]
  const start = Math.max(1, page - 1)
  const end = Math.min(pages - 2, page + 1)
  if (start > 1) out.push('gap')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < pages - 2) out.push('gap')
  out.push(pages - 1)
  return out
}

function NsPager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  const from = page * size + 1
  const to = Math.min(total, page * size + size)
  return (
    <div className="ns-pager">
      <span className="ns-pager__info">Showing {from}&ndash;{to} of {total}</span>
      <div className="ns-pager__controls">
        <button type="button" className="ns-pager__btn" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {pagerNumbers(page, pages).map((n, i) => (
          n === 'gap'
            ? <span key={`gap-${i}`} className="ns-pager__gap" aria-hidden="true">…</span>
            : <button key={n} type="button" className={`ns-pager__num ${n === page ? 'is-active' : ''}`} aria-current={n === page} onClick={() => onPage(n)}>{n + 1}</button>
        ))}
        <button type="button" className="ns-pager__btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
    </div>
  )
}

/* Render-prop wrapper: paginates any list to 10/page and renders a pager
   below the children when the list exceeds one page. Keeps its own page
   state so each table tracks its position independently. */
function PagedRows<T>({ items, size = TABLE_PAGE_SIZE, children }: { items: T[]; size?: number; children: (rows: T[]) => ReactNode }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pages - 1)
  const slice = items.slice(current * size, current * size + size)
  return (
    <>
      {children(slice)}
      {items.length > size && (
        <NsPager page={current} pages={pages} total={items.length} size={size} onPage={setPage} />
      )}
    </>
  )
}

// Day-over-day rank movement indicator (▲ green up / ▼ red down / — flat / NEW).
function SchoolRankMovement({ movement, previousRank }: { movement: number; previousRank: number | null }) {
  if (previousRank === null) {
    return <span className="ns-rank-move ns-rank-move--new" title="New on the board">NEW</span>
  }
  if (movement > 0) {
    return <span className="ns-rank-move ns-rank-move--up" title={`Up ${movement} place${movement > 1 ? 's' : ''} since yesterday`}><i aria-hidden="true">▲</i>{movement}</span>
  }
  if (movement < 0) {
    return <span className="ns-rank-move ns-rank-move--down" title={`Down ${Math.abs(movement)} place${Math.abs(movement) > 1 ? 's' : ''} since yesterday`}><i aria-hidden="true">▼</i>{Math.abs(movement)}</span>
  }
  return <span className="ns-rank-move ns-rank-move--flat" title="No change since yesterday">—</span>
}

// School leaderboard ranked by students joined — shown in every role's Rankings tab.
function SchoolRankBoard({ schools, mySchoolId, hidden }: { schools: any[]; mySchoolId?: number | null; hidden?: boolean }) {
  const max = Math.max(1, ...schools.map((s) => Number(s.student_count) || 0))
  return (
    <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card" hidden={hidden}>
      <div className="ns-dash-card__head">
        <span className="eyebrow">School Rankings</span>
        <span className="ns-board__badge">🏫 By students joined</span>
      </div>
      <p className="ns-leaderboard-tagline">
        Schools rise on the board as more students join. The arrow beside each rank shows the change since yesterday — recruit more students to climb higher.
      </p>
      {schools.length === 0 ? (
        <p className="ns-muted" style={{ marginTop: 16 }}>No schools ranked yet.</p>
      ) : (
        <div className="ns-leaderboard" role="list">
          <div className="ns-leaderboard__head ns-leaderboard__head--school" aria-hidden="true">
            <span>Rank</span>
            <span />
            <span>School</span>
            <span>Students</span>
          </div>
          {schools.map((s) => {
            const me = mySchoolId != null && Number(s.school_id) === Number(mySchoolId)
            const rank = Number(s.rank) || 0
            const pct = Math.max(6, Math.round(((Number(s.student_count) || 0) / max) * 100))
            return (
              <div
                key={s.school_id}
                role="listitem"
                className={`ns-leader-row ns-leader-row--school ${rank >= 1 && rank <= 3 ? 'is-podium' : ''} ${me ? 'is-me' : ''}`}
                data-rank={rank}
              >
                <span className="ns-leader-rank ns-leader-rank--move">
                  <b>{rank >= 1 && rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</b>
                  <SchoolRankMovement movement={Number(s.movement) || 0} previousRank={s.previous_rank ?? null} />
                </span>
                <span className="ns-leader-avatar" aria-hidden="true">{String(s.school_name || '?').trim().charAt(0).toUpperCase()}</span>
                <div className="ns-leader-id">
                  <strong>{s.school_name}{me ? ' (you)' : ''}</strong>
                  <span>{s.status}</span>
                </div>
                <div className="ns-leader-score">
                  <div className="ns-leader-bar"><span style={{ width: `${pct}%` }} /></div>
                  <strong>{s.student_count}<small>joined</small></strong>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

type RegistrationTag = 'student' | 'parent' | 'school' | 'teacher'
type DashboardTabKey = 'overview' | 'profile' | 'activity' | 'rankings' | 'records' | 'approvals' | 'reviews' | 'notifications' | 'data'
type SchoolRecordsTabKey = 'students' | 'teachers' | 'interviews' | 'approvals' | 'projects'
type DashboardTabConfig = { key: DashboardTabKey; label: string; hint: string; badge?: string }

// ---- Records CRUD config (drives the view/edit/create modal) ----
type RecordEntity = 'student' | 'teacher' | 'interview' | 'approval' | 'submission'
type RecordFieldType = 'text' | 'email' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'studentRef' | 'teacherRef'
type RecordField = {
  key: string
  label: string
  type: RecordFieldType
  options?: string[]
  required?: boolean
  createOnly?: boolean
  editOnly?: boolean
  full?: boolean
}
type RecordDef = { entity: RecordEntity; label: string; api: string; idKey: string; fields: RecordField[] }

const RECORDS_TAB_ENTITY: Record<SchoolRecordsTabKey, RecordEntity> = {
  students: 'student', teachers: 'teacher', interviews: 'interview', approvals: 'approval', projects: 'submission',
}

const RECORD_DEFS: Record<RecordEntity, RecordDef> = {
  student: {
    entity: 'student', label: 'Student', api: 'new-school/manage/student', idKey: 'id',
    fields: [
      { key: 'full_name', label: 'Full name', type: 'text', required: true, full: true },
      { key: 'email', label: 'Email', type: 'email', required: true, full: true },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
      { key: 'grade_level', label: 'Grade', type: 'text' },
      { key: 'phone_number', label: 'Phone', type: 'text' },
      { key: 'home_address', label: 'Home address', type: 'text', full: true },
      { key: 'teacher_id', label: 'Teacher', type: 'teacherRef' },
      { key: 'parent_name', label: 'Parent name', type: 'text' },
      { key: 'parent_phone', label: 'Parent phone', type: 'text' },
      { key: 'parent_email', label: 'Parent email', type: 'email', full: true },
      { key: 'password', label: 'Password (optional)', type: 'text', createOnly: true, full: true },
      { key: 'parent_consent_status', label: 'Parent consent', type: 'select', options: ['pending', 'approved', 'rejected'], editOnly: true },
      { key: 'school_approval_status', label: 'School approval', type: 'select', options: ['pending', 'approved', 'rejected'], editOnly: true },
      { key: 'teacher_approval_status', label: 'Teacher approval', type: 'select', options: ['pending', 'approved', 'rejected'], editOnly: true },
      { key: 'submission_status', label: 'Submission', type: 'select', options: ['locked', 'eligible', 'submitted', 'complete'], editOnly: true },
    ],
  },
  teacher: {
    entity: 'teacher', label: 'Teacher', api: 'new-school/manage/teacher', idKey: 'id',
    fields: [
      { key: 'teacher_full_name', label: 'Full name', type: 'text', required: true, full: true },
      { key: 'school_email', label: 'Email', type: 'email', required: true, full: true },
      { key: 'phone_number', label: 'Phone', type: 'text' },
      { key: 'role_department', label: 'Department', type: 'text' },
      { key: 'grade_level_supported', label: 'Grades supported', type: 'text' },
      { key: 'password', label: 'Password (optional)', type: 'text', createOnly: true, full: true },
      { key: 'status', label: 'Status', type: 'select', options: ['registered', 'approved', 'rejected'], editOnly: true },
    ],
  },
  interview: {
    entity: 'interview', label: 'Interview', api: 'new-school/manage/interview', idKey: 'id',
    fields: [
      { key: 'student_id', label: 'Student', type: 'studentRef', required: true, createOnly: true, full: true },
      { key: 'visit_number', label: 'Visit #', type: 'number' },
      { key: 'business_name', label: 'Business', type: 'text', required: true },
      { key: 'business_category', label: 'Category', type: 'text' },
      { key: 'owner_name', label: 'Owner', type: 'text' },
      { key: 'business_phone', label: 'Business phone', type: 'text' },
      { key: 'business_address', label: 'Business address', type: 'text', full: true },
      { key: 'date_of_visit', label: 'Date of visit', type: 'date' },
      { key: 'main_challenge', label: 'Main challenge', type: 'textarea', full: true },
      { key: 'student_notes', label: 'Notes', type: 'textarea', full: true },
      { key: 'has_website', label: 'Has website', type: 'checkbox' },
      { key: 'has_google_profile', label: 'Google profile', type: 'checkbox' },
      { key: 'uses_social_media', label: 'Social media', type: 'checkbox' },
      { key: 'has_online_ordering', label: 'Online ordering', type: 'checkbox' },
      { key: 'has_delivery_options', label: 'Delivery', type: 'checkbox' },
    ],
  },
  approval: {
    entity: 'approval', label: 'Approval', api: 'new-school/manage/approval', idKey: 'id',
    fields: [
      { key: 'student_id', label: 'Student', type: 'studentRef', required: true, createOnly: true, full: true },
      { key: 'approval_type', label: 'Type', type: 'select', options: ['school', 'teacher'], required: true, createOnly: true },
      { key: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected'], required: true },
      { key: 'reviewer_name', label: 'Reviewer', type: 'text' },
      { key: 'digital_signature', label: 'Signature', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
  },
  submission: {
    entity: 'submission', label: 'Project', api: 'new-school/manage/submission', idKey: 'id',
    fields: [
      { key: 'student_id', label: 'Student', type: 'studentRef', required: true, createOnly: true, full: true },
      { key: 'status', label: 'Status', type: 'select', options: ['draft', 'submitted', 'approved', 'rejected', 'winner'] },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'rank_position', label: 'Rank', type: 'number' },
      { key: 'problem_identified', label: 'Problem', type: 'textarea', full: true },
      { key: 'why_it_matters', label: 'Why it matters', type: 'textarea', full: true },
      { key: 'proposed_solution', label: 'Solution', type: 'textarea', full: true },
      { key: 'how_it_helps', label: 'How it helps', type: 'textarea', full: true },
      { key: 'expected_impact', label: 'Expected impact', type: 'textarea', full: true },
      { key: 'video_url', label: 'Video URL', type: 'text', full: true },
      { key: 'written_url', label: 'Written URL', type: 'text', full: true },
    ],
  },
}

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
    detail: 'Lead the interviews, identify a community problem, and build the final solution.',
  },
  {
    kicker: 'School Leaders',
    title: 'Principals & Schools',
    detail: 'Bring the challenge into the building, support participation, and compete for the school impact grant.',
  },
  {
    kicker: 'Support',
    title: 'Parents',
    detail: 'Give consent, support the student journey, and stay informed through the QR and dashboard flow.',
  },
  {
    kicker: 'Guide',
    title: 'Teachers',
    detail: 'Guide student work, review readiness, and help connect classroom learning to community impact.',
  },
  {
    kicker: 'Invest',
    title: 'Sponsors',
    detail: 'Fuel scholarships, school grants, and statewide visibility for the movement.',
  },
  {
    kicker: 'Partner',
    title: 'Community Partners',
    detail: 'Share real local business challenges and help students learn directly from the field.',
  },
]

const dashboardInfoCards = [
  {
    title: 'Student Dashboard',
    detail: 'Track interviews, approvals, rankings, final submission readiness, and scholarship progress in one place.',
  },
  {
    title: 'Parent Dashboard',
    detail: 'Monitor consent, student status, rankings, and program alerts without needing to manage the student workflow.',
  },
  {
    title: 'School Dashboard',
    detail: 'See school participation, approval progress, leaderboard position, and student readiness at the building level.',
  },
  {
    title: 'Teacher Dashboard',
    detail: 'Review assigned students, watch approval progress, and follow competition results tied to classroom participation.',
  },
]

const sponsorPillars = [
  {
    title: 'Scholarship Support',
    detail: 'Back student scholarships that reward problem-solving, leadership, and real-world impact.',
  },
  {
    title: 'School Impact',
    detail: 'Help schools compete for grant funding that strengthens student opportunity and community engagement.',
  },
  {
    title: 'Community Visibility',
    detail: 'Align your organization with an education-first movement built around schools, neighborhoods, and local businesses.',
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
    { key: 'notifications', label: 'Alerts', hint: 'Notifications' },
  ],
  teacher: [
    { key: 'overview', label: 'Overview', hint: 'Teacher summary' },
    { key: 'profile', label: 'Profile', hint: 'Teacher identity' },
    { key: 'approvals', label: 'Approvals', hint: 'Student review tools' },
    { key: 'rankings', label: 'Rankings', hint: 'Teacher competition board' },
    { key: 'records', label: 'Records', hint: 'Students and submissions' },
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

// Record fields hidden from teacher & school in the records detail modal (data isolation:
// project/interview CONTENT is admin-only). Mirrors the server-side redaction allowlists.
const NS_CONTENT_FIELD_KEYS = new Set<string>([
  'owner_name', 'business_phone', 'business_address', 'main_challenge', 'student_notes',
  'has_website', 'has_google_profile', 'uses_social_media', 'uses_digital_signage',
  'offers_rewards', 'has_online_ordering', 'has_delivery_options',
  'problem_identified', 'why_it_matters', 'proposed_solution', 'how_it_helps',
  'expected_impact', 'video_url', 'written_url', 'reviewer_notes',
])
// Student PII keys additionally hidden from the teacher (school keeps roster PII).
const NS_PII_FIELD_KEYS = new Set<string>([
  'email', 'phone_number', 'home_address', 'parent_name', 'parent_phone', 'parent_email',
  'age', 'date_of_birth',
])

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
  // Terms & Conditions agreement state (per registration form + content-upload forms).
  const [studentTermsOk, setStudentTermsOk] = useState(false)
  const [studentTermsSig, setStudentTermsSig] = useState('')
  const [studentDob, setStudentDob] = useState('')
  const [parentTermsOk, setParentTermsOk] = useState(false)
  const [schoolTermsOk, setSchoolTermsOk] = useState(false)
  const [schoolTermsSig, setSchoolTermsSig] = useState('')
  const [teacherTermsOk, setTeacherTermsOk] = useState(false)
  const [teacherTermsSig, setTeacherTermsSig] = useState('')
  const [businessTermsOk, setBusinessTermsOk] = useState(false)
  const [submissionTermsOk, setSubmissionTermsOk] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [studentSchoolSearch, setStudentSchoolSearch] = useState('')
  const [studentTeacherId, setStudentTeacherId] = useState('')
  const [teacherSchoolSearch, setTeacherSchoolSearch] = useState('')
  const [parentSchoolSearch, setParentSchoolSearch] = useState('')
  const [parentTeacherId, setParentTeacherId] = useState('')
  const [parentParticipantId, setParentParticipantId] = useState('')
  const [schoolApprovalsTab, setSchoolApprovalsTab] = useState<'students' | 'teachers'>('students')
  const [schoolApprovalSearch, setSchoolApprovalSearch] = useState('')
  const [schoolApprovalStatus, setSchoolApprovalStatus] = useState('all')
  const [approvalDetail, setApprovalDetail] = useState<{ type: 'student' | 'teacher'; id: number } | null>(null)
  const [schoolRankingTab, setSchoolRankingTab] = useState<'students' | 'teachers'>('students')
  const [studentRankTab, setStudentRankTab] = useState<'school' | 'class'>('school')
  const [schoolRankings, setSchoolRankings] = useState<any[]>([])
  const [recordModal, setRecordModal] = useState<{ entity: RecordEntity; mode: 'view' | 'edit' | 'create'; id: number | null } | null>(null)
  const [recordForm, setRecordForm] = useState<Record<string, any>>({})
  const [recordBusy, setRecordBusy] = useState(false)
  const [schoolRecordsTab, setSchoolRecordsTab] = useState<SchoolRecordsTabKey>('students')
  const [schoolSubmissionReviewId, setSchoolSubmissionReviewId] = useState('')
  const [reviewForm, setReviewForm] = useState<{ status: string; score: string; rank_position: string; reviewer_notes: string }>({ status: 'approved', score: '', rank_position: '', reviewer_notes: '' })

  useSeo({
    title: isDashboardRoute ? 'New School Dashboard' : 'What Problem Will You Solve?',
    description: isDashboardRoute
      ? 'Private role dashboard for approved students, parents, schools, teachers, and admins.'
      : 'Join New York\'s Largest Student Problem-Solving Movement. Students interview 10 local businesses, build solutions, and compete for scholarships, school grants, and statewide recognition.',
    noindex: isDashboardRoute,
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
        api.get<any>('new-school/school-rankings')
          .then((data) => setSchoolRankings(Array.isArray(data?.schools) ? data.schools : []))
          .catch(() => setSchoolRankings([]))
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
        terms_signature: studentTermsSig,
        terms_version: CHALLENGE_TERMS_VERSION,
      }
      const res = await api.post<any>('new-school/student/register', payload)
      showNotice('success', res.message || 'Student registered.')
      event.currentTarget.reset()
      setStudentSchoolSearch('')
      setStudentTeacherId('')
      setStudentDob('')
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
        terms_signature: schoolTermsSig,
        terms_version: CHALLENGE_TERMS_VERSION,
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
        terms_signature: teacherTermsSig,
        terms_version: CHALLENGE_TERMS_VERSION,
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
      recordTermsAcceptance({ kind: 'website', signature: user?.full_name || value(fd, 'business_name'), email: user?.email || '', documentLabel: 'Business Interview Upload' })
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
      recordTermsAcceptance({ kind: 'website', signature: user?.full_name || 'Student', email: user?.email || '', documentLabel: 'Final Project Upload' })
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Final submission failed.')
    } finally {
      setBusy('')
    }
  }

  const approveStudentInline = async (student: any, status: 'approved' | 'pending' | 'rejected') => {
    setBusy(`student-${student.id}-${status}`)
    try {
      // The principal records a "school" approval; a teacher records a "teacher" approval.
      const approvalType = schoolDashboard ? 'school' : 'teacher'
      const res = await api.post<any>('new-school/manage/approval', {
        student_id: Number(student.id) || undefined,
        approval_type: approvalType,
        status,
        reviewer_name: user?.full_name || '',
        digital_signature: user?.full_name || '',
      })
      showNotice('success', res.message || `${student.full_name} marked ${status}.`)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Approval failed.')
    } finally {
      setBusy('')
    }
  }


  const approveTeacherInline = async (teacher: any, status: 'approved' | 'pending' | 'rejected') => {
    setBusy(`teacher-${teacher.id}-${status}`)
    try {
      const res = await api.post<any>('new-school/school/teacher/approve', {
        teacher_id: Number(teacher.id),
        teacher_name: teacher.teacher_full_name,
        teacher_email: teacher.school_email,
        role: teacher.role_department || 'Teacher',
        approval_status: status,
        digital_signature: user?.full_name || schoolDashboard?.school?.principal_name || 'School Administrator',
      })
      showNotice('success', res.message || `${teacher.teacher_full_name} marked ${status}.`)
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
      event.currentTarget?.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not update the submission review.')
    } finally {
      setBusy('')
    }
  }

  const loadSubmissionReview = (row: any) => {
    if (!row) return
    setSchoolSubmissionReviewId(String(row.id))
    setReviewForm({
      status: String(row.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'approved',
      score: row.score !== null && row.score !== undefined ? String(row.score) : '',
      rank_position: row.rank_position !== null && row.rank_position !== undefined ? String(row.rank_position) : '',
      reviewer_notes: row.reviewer_notes || '',
    })
    showNotice('info', `Loaded submission #${row.id} — ${row.student_name || 'student'}.`)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => document.getElementById('ns-review-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
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
      const status = value(fd, 'status') || 'submitted'
      const payload = {
        status,
        score: value(fd, 'score'),
        rank_position: Number(value(fd, 'rank_position') || 0) || undefined,
        place: value(fd, 'place'),
        scholarship_amount: Number(value(fd, 'scholarship_amount') || 0) || undefined,
        reviewer_notes: value(fd, 'reviewer_notes'),
      }
      const res = await api.put<any>(`admin/new-school/submission/${submissionId}`, payload)
      // On approval, award the bonus points (student up to 15, teacher up to 8, default 3).
      if (status === 'approved' || status === 'winner') {
        const teacherRaw = value(fd, 'teacher_award_points')
        await api.post('admin/new-school/points', {
          source_type: 'project',
          source_id: submissionId,
          student_points: Number(value(fd, 'student_award_points') || 0),
          teacher_points: teacherRaw === '' ? 3 : Number(teacherRaw || 0),
        })
      }
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

  const submitInterviewPoints = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('interview-points')
    try {
      const fd = new FormData(event.currentTarget)
      const interviewId = Number(value(fd, 'interview_id') || 0)
      if (!interviewId) {
        throw new Error('Select an interview to award points.')
      }
      const teacherRaw = value(fd, 'teacher_award_points')
      await api.post('admin/new-school/points', {
        source_type: 'interview',
        source_id: interviewId,
        student_points: Number(value(fd, 'student_award_points') || 0),
        teacher_points: teacherRaw === '' ? 3 : Number(teacherRaw || 0),
      })
      showNotice('success', 'Interview points awarded.')
      event.currentTarget.reset()
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not award interview points.')
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
  const registrationOpenLabel = formatLongDateLabel(challenge.registration_open || '2026-06-25')
  const winnersAnnouncedLabel = formatLongDateLabel(challenge.winners_announced || '2026-12-22')
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
  const heroFacts = [
    `${formatMoney(Number(challenge.school_grant_amount ?? 25000))} School Impact Grant`,
    `Up to ${formatMoney(Number(challenge.student_scholarship_max_amount ?? 10000))} Student Scholarships`,
    String(challenge.educator_award_label || 'Educator Recognition Award'),
    `Ages ${String(challenge.age_range || '11-19')}`,
    `Grades ${String(challenge.grade_range || '6-12')}`,
    `Registration Opens: ${registrationOpenLabel}`,
    `Winners Announced: ${winnersAnnouncedLabel}`,
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
  const studentLeaderSource = studentRankTab === 'school' ? studentSchoolRankings : studentTeacherRankings
  const studentLeaderRows = studentLeaderSource
    .map((r: any) => ({
      id: Number(r.id),
      rank: Number(r.rank_position) || 0,
      name: r.full_name,
      sub: `${r.interview_count || 0}/10 interviews`,
      score: Number(r.student_points) || 0,
      tag: r.submission_status || '—',
      isMe: String(r.participant_id || '') === String(studentDashboard?.student?.participant_id || ''),
    }))
    .slice()
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
  const studentLeaderMax = Math.max(1, ...studentLeaderRows.map((r) => r.score))
  const studentPodium = studentLeaderRows.length >= 3
    ? [2, 1, 3].map((rank) => studentLeaderRows.find((r) => r.rank === rank)).filter(Boolean) as typeof studentLeaderRows
    : studentLeaderRows.slice(0, 3)
  const schoolRankedStudents = asArray<any>(schoolDashboard?.rankings?.students)
  const schoolRankedTeachers = asArray<any>(schoolDashboard?.rankings?.teachers)
  const teacherRankedStudents = asArray<any>(teacherDashboard?.rankings?.students)
  const teacherRankedTeachers = asArray<any>(teacherDashboard?.rankings?.teachers)
  // ---- Active-role data: school principal AND teacher render the same components,
  // just fed their own scoped collections (active* === school data for the principal). ----
  const isManagerLayout = !!schoolDashboard || !!teacherDashboard
  const activeManagesTeachers = !!schoolDashboard // only the principal manages teacher records
  const isTeacherLayout = !!teacherDashboard // teacher: read-only, no content/PII, counts only
  const isSchoolLayout = !!schoolDashboard // principal: roster + approvals, no content/scoring
  const activeStudents = schoolDashboard ? asArray<any>(schoolDashboard.students) : asArray<any>(teacherDashboard?.students)
  const activeTeachers = asArray<any>(schoolDashboard?.teachers)
  const activeBusinesses = schoolDashboard ? schoolBusinesses : teacherBusinesses
  const activeApprovals = schoolDashboard ? schoolApprovals : teacherApprovals
  const activeSubmissions = schoolDashboard ? schoolSubmissions : teacherSubmissions
  const activeRankedStudents = schoolDashboard ? schoolRankedStudents : teacherRankedStudents
  const activeRankedTeachers = schoolDashboard ? schoolRankedTeachers : teacherRankedTeachers
  const activeWinners = schoolDashboard ? schoolWinners : teacherWinners
  const activeNotifications = schoolDashboard ? schoolNotifications : teacherNotifications
  const activeUnreadNotifications = activeNotifications.filter((item: any) => !item.is_read)
  const activeSummary = (schoolDashboard?.summary || teacherDashboard?.summary || {}) as Record<string, any>
  const myDashboardSchoolId = schoolDashboard?.school?.id
    ?? teacherDashboard?.teacher?.school_id ?? teacherDashboard?.school?.id
    ?? studentDashboard?.student?.school_id
    ?? parentDashboard?.student_context?.student?.school_id
    ?? null
  const schoolLeaderRows = (schoolRankingTab === 'students'
    ? activeRankedStudents.map((r: any) => ({
        id: Number(r.id), type: 'student' as const, rank: Number(r.rank_position) || 0,
        name: r.full_name, sub: r.teacher_full_name ? `Mentor · ${r.teacher_full_name}` : r.school_name || '—',
        score: Number(r.student_points) || 0, tag: r.submission_status || '—', tagType: 'status' as const,
      }))
    : activeRankedTeachers.map((r: any) => ({
        id: Number(r.id), type: 'teacher' as const, rank: Number(r.rank_position) || 0,
        name: r.teacher_full_name, sub: r.role_department || 'Faculty',
        score: Number(r.teacher_points) || 0, tag: `${r.students_total ?? 0} students`, tagType: 'count' as const,
      }))
  ).slice().sort((a, b) => (a.rank || 999) - (b.rank || 999))
  const schoolLeaderMax = Math.max(1, ...schoolLeaderRows.map((r) => r.score))
  const schoolPodium = schoolLeaderRows.length >= 3
    ? [2, 1, 3].map((rank) => schoolLeaderRows.find((r) => r.rank === rank)).filter(Boolean) as typeof schoolLeaderRows
    : schoolLeaderRows.slice(0, 3)

  useEffect(() => {
    if (!isDashboardRoute) return
    setDashboardTab((current) => {
      const nextTab = dashboardTabs.find((tab) => tab.key === current) ? current : dashboardTabs[0]?.key || 'overview'
      return nextTab
    })
  }, [dashboardRole, isDashboardRoute])

  useEffect(() => {
    if (!approvalDetail) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setApprovalDetail(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approvalDetail])

  useEffect(() => {
    if (!recordModal) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && recordModal.mode === 'view') setRecordModal(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recordModal])

  const approvedSchool = (query: string) =>
    schools.find((school: any) => String(school.school_name || '').toLowerCase() === query.trim().toLowerCase()) || null
  const teachersForSchool = (schoolId?: number | string) =>
    teachers.filter((teacher: any) => Number(teacher.school_id || 0) === Number(schoolId || 0))
  const matchedStudentSchool = approvedSchool(studentSchoolSearch)
  const matchedTeacherSchool = approvedSchool(teacherSchoolSearch)
  const matchedParentSchool = approvedSchool(parentSchoolSearch)
  const studentSchoolTeachers = matchedStudentSchool ? teachersForSchool(matchedStudentSchool.id) : []
  const parentSchoolTeachers = matchedParentSchool ? teachersForSchool(matchedParentSchool.id) : []
  const currentParticipantId = studentDashboard?.student?.participant_id || parentDashboard?.student_context?.student?.participant_id || ''
  const studentUnreadNotifications = studentNotifications.filter((item: any) => !item.is_read)
  const parentUnreadNotifications = parentNotifications.filter((item: any) => !item.is_read)
  const schoolUnreadNotifications = schoolNotifications.filter((item: any) => !item.is_read)
  const teacherUnreadNotifications = teacherNotifications.filter((item: any) => !item.is_read)
  const adminUnreadNotifications = adminNotifications.filter((item: any) => !item.is_read)
  const schoolRecordsTabs: Array<{ key: SchoolRecordsTabKey; label: string; hint: string; count: number }> = [
    { key: 'students', label: 'Students', hint: 'Roster', count: activeStudents.length },
    ...(activeManagesTeachers ? [{ key: 'teachers' as SchoolRecordsTabKey, label: 'Teachers', hint: 'Faculty list', count: activeTeachers.length }] : []),
    { key: 'interviews', label: 'Interviews', hint: 'Business visits', count: activeBusinesses.length },
    { key: 'approvals', label: 'Approvals', hint: 'Verified records', count: activeApprovals.length },
    { key: 'projects', label: 'Projects', hint: 'Final submissions', count: activeSubmissions.length },
  ]
  const approvalStatusOptions = [
    { key: 'all', label: 'All' },
    { key: 'approved', label: 'Approved' },
    { key: 'pending', label: 'Pending' },
    { key: 'rejected', label: 'Rejected' },
  ]
  const approvalSearchTerm = schoolApprovalSearch.trim().toLowerCase()
  const filteredApprovalStudents = activeStudents.filter((row: any) => {
    const matchesSearch = !approvalSearchTerm
      || `${row.full_name || ''} ${row.participant_id || ''}`.toLowerCase().includes(approvalSearchTerm)
    const matchesStatus = schoolApprovalStatus === 'all'
      || String(row.school_approval_status || '').toLowerCase() === schoolApprovalStatus
    return matchesSearch && matchesStatus
  })
  const filteredApprovalTeachers = activeTeachers.filter((row: any) => {
    const matchesSearch = !approvalSearchTerm
      || `${row.teacher_full_name || ''} ${row.role_department || ''}`.toLowerCase().includes(approvalSearchTerm)
    const matchesStatus = schoolApprovalStatus === 'all'
      || String(row.status || '').toLowerCase() === schoolApprovalStatus
    return matchesSearch && matchesStatus
  })
  const approvalDetailRecord = approvalDetail
    ? (approvalDetail.type === 'student'
        ? activeStudents.find((row: any) => Number(row.id) === approvalDetail.id)
        : activeTeachers.find((row: any) => Number(row.id) === approvalDetail.id)) || null
    : null
  const recordArrayFor = (entity: RecordEntity): any[] => {
    if (entity === 'student') return activeStudents
    if (entity === 'teacher') return activeTeachers
    if (entity === 'interview') return activeBusinesses
    if (entity === 'approval') return activeApprovals
    return activeSubmissions
  }
  const recordCurrent = recordModal && recordModal.id != null
    ? recordArrayFor(recordModal.entity).find((row: any) => Number(row.id) === recordModal.id) || null
    : null
  const recordTitle = (entity: RecordEntity, rec: any): string => {
    if (!rec) return RECORD_DEFS[entity].label
    if (entity === 'student') return rec.full_name || `Student #${rec.id}`
    if (entity === 'teacher') return rec.teacher_full_name || `Teacher #${rec.id}`
    if (entity === 'interview') return rec.business_name || `Visit #${rec.id}`
    if (entity === 'approval') return `${rec.student_name || 'Student'} · ${rec.approval_type || ''}`
    return rec.student_name || `Submission #${rec.id}`
  }
  const formFromRecord = (entity: RecordEntity, rec: any): Record<string, any> => {
    const out: Record<string, any> = {}
    RECORD_DEFS[entity].fields.forEach((f) => {
      if (f.createOnly) return
      out[f.key] = f.type === 'checkbox'
        ? (rec[f.key] === 1 || rec[f.key] === true || rec[f.key] === '1')
        : (rec[f.key] ?? '')
    })
    return out
  }
  const defaultFormFor = (entity: RecordEntity): Record<string, any> => {
    const out: Record<string, any> = {}
    RECORD_DEFS[entity].fields.forEach((f) => {
      if (f.editOnly) return
      out[f.key] = f.type === 'checkbox' ? false : (f.type === 'select' && f.options ? f.options[0] : '')
    })
    return out
  }
  // Detail-modal field visibility + write permission by role (manager layout = school/teacher only).
  const visibleRecordFields = (entity: RecordEntity) =>
    RECORD_DEFS[entity].fields.filter((f) => {
      if (f.key === 'password') return false
      if (NS_CONTENT_FIELD_KEYS.has(f.key)) return false // content hidden from teacher & school
      if (isTeacherLayout && NS_PII_FIELD_KEYS.has(f.key)) return false // PII hidden from teacher
      return true
    })
  const canWriteRecordEntity = (entity: RecordEntity) => isSchoolLayout && ['student', 'teacher', 'approval'].includes(entity)
  const openRecordView = (entity: RecordEntity, id: number) => setRecordModal({ entity, mode: 'view', id })
  const openRecordCreate = (entity: RecordEntity) => {
    if (!canWriteRecordEntity(entity)) return
    setRecordForm(defaultFormFor(entity)); setRecordModal({ entity, mode: 'create', id: null })
  }
  const startRecordEdit = () => {
    if (!recordModal || !recordCurrent) return
    if (!canWriteRecordEntity(recordModal.entity)) return
    setRecordForm(formFromRecord(recordModal.entity, recordCurrent))
    setRecordModal({ ...recordModal, mode: 'edit' })
  }
  const setRecordField = (key: string, value: any) => setRecordForm((prev) => ({ ...prev, [key]: value }))
  const saveRecord = async () => {
    if (!recordModal) return
    if (!canWriteRecordEntity(recordModal.entity)) { showNotice('error', 'Your role cannot modify this record.'); return }
    const def = RECORD_DEFS[recordModal.entity]
    setRecordBusy(true)
    try {
      if (recordModal.mode === 'create') {
        await api.post(def.api, recordForm)
        showNotice('success', `${def.label} created.`)
      } else if (recordModal.id != null) {
        await api.put(`${def.api}/${recordModal.id}`, recordForm)
        showNotice('success', `${def.label} updated.`)
      }
      setRecordModal(null)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not save the record.')
    } finally {
      setRecordBusy(false)
    }
  }
  const deleteRecord = async () => {
    if (!recordModal || recordModal.id == null) return
    if (!canWriteRecordEntity(recordModal.entity)) return
    const def = RECORD_DEFS[recordModal.entity]
    if (typeof window !== 'undefined' && !window.confirm(`Delete this ${def.label.toLowerCase()}? This cannot be undone.`)) return
    setRecordBusy(true)
    try {
      await api.del(`${def.api}/${recordModal.id}`)
      showNotice('success', `${def.label} deleted.`)
      setRecordModal(null)
      await reloadDashboard()
      await reloadOverview()
    } catch (err) {
      handleError(err, 'Could not delete the record.')
    } finally {
      setRecordBusy(false)
    }
  }
  const schoolSelectedSubmission = activeSubmissions.find((row: any) => String(row.id) === String(schoolSubmissionReviewId)) || activeSubmissions[0] || null
  const schoolReviewQueue = activeSubmissions.slice(0, 5)
  const schoolWinnersQueue = activeWinners.slice(0, 5)
  const dashboardTabs = (() => {
    const baseTabs = dashboardRole ? dashboardTabsByRole[dashboardRole] || [] : []
    if (!isManagerLayout) return baseTabs
    const approvalBadge = (Number(activeSummary.teacher_pending || 0) + Number(activeSummary.school_pending || 0) + Number(activeSummary.parent_pending || 0)) || 0
    const alertBadge = activeUnreadNotifications.length || 0
    return baseTabs.map((tab) => {
      if (tab.key === 'approvals' && approvalBadge > 0) return { ...tab, badge: String(approvalBadge) }
      if (tab.key === 'notifications' && alertBadge > 0) return { ...tab, badge: String(alertBadge) }
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
          { label: 'Points', value: studentDashboard.student_points || 0 },
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
          { label: 'Points', value: teacherDashboard.teacher_points || 0 },
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
  // The principal-style "reference" layout (brand rail + workspace card + readiness
  // bar + topbar) is now shared by every signed-in role, not just the school.
  const isReferenceLayout = dashboardRole !== ''
  const dashboardRoleLabel = ({ student: 'Student', parent: 'Parent', school: 'Principal', teacher: 'Teacher', admin: 'Admin' } as Record<string, string>)[dashboardRole] || 'Member'
  const dashboardReadiness = studentDashboard
    ? { value: studentStatusProgress, label: 'Challenge progress' }
    : parentDashboard
      ? { value: parentReadinessProgress, label: 'Student readiness' }
      : schoolDashboard
        ? { value: schoolReadinessProgress, label: 'School readiness' }
        : teacherDashboard
          ? { value: teacherReadinessProgress, label: 'Class readiness' }
          : adminDashboard
            ? { value: adminReadinessProgress, label: 'Platform readiness' }
            : null
  const dashboardAvatarChar = String(user?.full_name || dashboardHero?.title || dashboardRoleLabel || '?').trim().charAt(0).toUpperCase()
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
            <p className="eyebrow">{challenge.title || 'WHAT PROBLEM WILL YOU SOLVE?'}</p>
            <h1 className="ns-hero__headline">{challenge.subtitle || 'Join New York\'s Largest Student Problem-Solving Movement'}</h1>
            <div className="ns-hero__legacy" aria-hidden="true">
              <span>Join New York&apos;s Largest</span>
              <span>Student Problem-Solving</span>
              <span>Movement{'™'}</span>
            </div>
            <p className="ns-lead">
              {challenge.lead || 'Students interview 10 local businesses, identify a community problem, develop a solution, and compete for scholarships, school grants, and statewide recognition.'}
            </p>
            <div className="ns-hero__facts" aria-label="Challenge highlights">
              {heroFacts.map((fact) => (
                <div className="glass ns-hero__fact" key={fact}>
                  <span>{fact}</span>
                </div>
              ))}
            </div>
            <div className="ns-hero__actions ns-hero__actions--primary">
              <button className="btn btn--solid" type="button" onClick={() => openRegistrationTag('school')}>School Registration</button>
              <button className="btn" type="button" onClick={() => openRegistrationTag('student')}>Student Registration</button>
              <button className="btn" type="button" onClick={() => openRegistrationTag('teacher')}>Teacher Registration</button>
              <button className="btn" type="button" onClick={() => openRegistrationTag('parent')}>Parent Consent Registration</button>
              <Link className="btn" to="/new-school/become-a-founding-sponsor">Founding Sponsor Registration</Link>
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

          <aside className="ns-hero__summary glass reveal in">
            <div className="ns-hero__summary-head">
              <span className="eyebrow">Challenge Overview</span>
              <h2>Built for schools, students, educators, families, and community partners.</h2>
            </div>
            <div className="ns-hero__summary-list">
              <div className="ns-board__row">
                <div>
                  <strong>What is it?</strong>
                  <span>A statewide student problem-solving challenge grounded in real local business interviews.</span>
                </div>
              </div>
              <div className="ns-board__row">
                <div>
                  <strong>Who can join?</strong>
                  <span>Students ages 11-19 in grades 6-12, supported by parents, teachers, school leaders, sponsors, and partners.</span>
                </div>
              </div>
              <div className="ns-board__row">
                <div>
                  <strong>How do you start?</strong>
                  <span>Choose the registration path above, complete the right form, and move into the challenge workflow immediately.</span>
                </div>
              </div>
            </div>
            <p className="ns-muted">The goal is full clarity in the first 10-15 seconds: what it is, who it is for, what can be won, and how to begin.</p>
          </aside>
        </div>
      </section>

      <section className="block ns-section" id="live-stats">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">Live Challenge Statistics</span>
            <h2>Program activity, timing, and recognition in one place.</h2>
            <p>Visitors should be able to see challenge momentum, key dates, and the latest competitive snapshot without scrolling into the forms first.</p>
          </div>

          <div className="ns-stats-layout">
            <article className="glass ns-stats-panel reveal in">
              <div className="ns-stats-panel__head">
                <span className="eyebrow">Movement Data</span>
                <h3>Live impact tracker</h3>
              </div>
              <div className="ns-metrics">
                {movementStats.map((item) => (
                  <div className="ns-metric" key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="glass ns-stats-panel reveal in">
              <div className="ns-stats-panel__head">
                <span className="eyebrow">Challenge Timeline</span>
                <h3>Key dates and live snapshot</h3>
              </div>
              <div className="ns-hero__panel-foot ns-hero__panel-foot--stats">
                <div>
                  <span>Registration Opens</span>
                  <strong>{registrationOpenLabel}</strong>
                </div>
                <div>
                  <span>Winners Announced</span>
                  <strong>{winnersAnnouncedLabel}</strong>
                </div>
                <div>
                  <span>Submission Deadline</span>
                  <strong>{deadlineLabel}</strong>
                </div>
                <div>
                  <span>Days Left</span>
                  <strong>{deadlineDays !== null ? `${deadlineDays} days` : 'Open now'}</strong>
                </div>
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
            </article>
          </div>
        </div>
      </section>

      <section className="block ns-section" id="workflow">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">How It Works</span>
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

      <section className="block ns-section" id="participants">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">Who Can Participate</span>
            <h2>Students lead it, and schools, families, educators, sponsors, and partners make it possible.</h2>
            <p>The landing page should immediately make clear that this is school-friendly, community-focused, and designed for broad support around each student.</p>
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

      <section className="block ns-section" id="registration">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">Registration Hub</span>
            <h2>Student, parent, school, and teacher forms.</h2>
            <p>Choose a user tag first. The matching registration fields appear so each account type only sees the inputs it needs. Sponsors use the founding sponsor page linked above.</p>
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
                <label className="ns-field"><span>Date of Birth</span><input name="date_of_birth" type="date" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} required /></label>
                <label className="ns-field"><span>Age</span><input name="age" type="number" min="11" max="19" value={ageFromDob(studentDob)} readOnly required title="Auto-calculated from date of birth" /></label>
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
              <TermsAgreement kind="student" idPrefix="ns-student" signatureName={studentTermsSig} onSignatureChange={setStudentTermsSig} onAcceptedChange={setStudentTermsOk} />
              <button
                className="btn btn--solid"
                type="submit"
                disabled={busy === 'student' || !matchedStudentSchool || studentSchoolTeachers.length === 0 || !studentTermsOk}
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
              <TermsAgreement kind="parent" idPrefix="ns-parent" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setParentTermsOk} />
              <button className="btn btn--solid" type="submit" disabled={busy === 'parent' || !parentTermsOk}>{busy === 'parent' ? 'Saving...' : 'Approve Consent'}</button>
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
              <TermsAgreement kind="school" idPrefix="ns-school" signatureName={schoolTermsSig} onSignatureChange={setSchoolTermsSig} onAcceptedChange={setSchoolTermsOk} />
              <button className="btn btn--solid" type="submit" disabled={busy === 'school' || !schoolTermsOk}>{busy === 'school' ? 'Saving...' : 'Register School'}</button>
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
              <TermsAgreement kind="teacher" idPrefix="ns-teacher" signatureName={teacherTermsSig} onSignatureChange={setTeacherTermsSig} onAcceptedChange={setTeacherTermsOk} />
              <button className="btn btn--solid" type="submit" disabled={busy === 'teacher' || !approvedSchool(teacherSchoolSearch) || !teacherTermsOk}>
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

      <section className="block ns-section" id="dashboard-info">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">Dashboard Information</span>
            <h2>Every role gets a focused workspace after registration and approval.</h2>
            <p>Students, parents, school leaders, and teachers each land in a role-based dashboard built from the same challenge data.</p>
          </div>

          <div className="ns-dashboard-info-grid">
            {dashboardInfoCards.map((card) => (
              <article className="glass ns-info-card reveal in" key={card.title}>
                <span className="ns-info-card__kicker">Dashboard</span>
                <h3>{card.title}</h3>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>

          <div className="glass ns-dashboard-entry reveal in">
            <div>
              <span className="eyebrow">Member Access</span>
              <h3>Already registered?</h3>
              <p>Approved accounts can move from public information into live tracking, approvals, rankings, and private records from the dashboard.</p>
            </div>
            <div className="ns-hero__actions">
              <Link className="btn btn--solid" to={dashboardHref}>Open Dashboard</Link>
              <button className="btn" type="button" data-auth="login">Member Login</button>
            </div>
          </div>
        </div>
      </section>

      <section className="block ns-section" id="founding-sponsors">
        <div className="wrap">
          <div className="ns-section__head reveal in">
            <span className="eyebrow">Founding Sponsors</span>
            <h2>Support a scholarship-driven challenge that schools can rally behind.</h2>
            <p>Founding sponsors help power school grants, student scholarships, educator recognition, and the community visibility needed to grow the movement across New York.</p>
          </div>

          <div className="ns-dashboard-info-grid">
            {sponsorPillars.map((pillar) => (
              <article className="glass ns-info-card reveal in" key={pillar.title}>
                <span className="ns-info-card__kicker">Why Sponsor</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.detail}</p>
              </article>
            ))}
          </div>

          <div className="glass ns-sponsor-callout reveal in">
            <div>
              <span className="eyebrow">Founding Sponsor Registration</span>
              <h3>Open the sponsor page and submit your organization details.</h3>
              <p>Use the dedicated sponsor page to review the mission, sponsorship levels, payment instructions, and interest form before the How It Works section.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn btn--solid" to="/new-school/become-a-founding-sponsor">Founding Sponsor Registration</Link>
              <Link className="btn" to="/new-school/founding-sponsors">View Founding Sponsors</Link>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {isDashboardRoute && (
        <>
      <section className={`block ns-section ns-dashboard-page ${dashboardThemeClass}`} id="dashboard" data-dashboard-role={dashboardRole || 'guest'}>
        <div className="wrap">
          {!isReferenceLayout && (
            <div className="ns-section__head reveal in">
              <span className="eyebrow">Live Dashboard</span>
              <h2>Role-based tracking for every account type.</h2>
              <p>Student, parent, school, teacher, and admin views are driven from the same data tables.</p>
            </div>
          )}

          <div className="ns-dashboard-shell">
            <aside className="ns-dashboard-rail">
              {isReferenceLayout && dashboardHero && (
                <>
                  <div className="ns-principal-brand glass reveal in">
                    <span className="ns-principal-brand__logo" aria-hidden="true">FC</span>
                    <span className="ns-principal-brand__id">
                      <strong>FRANTZ COUTARD</strong>
                      <small>{dashboardRoleLabel} Dashboard</small>
                    </span>
                  </div>

                  <section className="ns-principal-workspace glass reveal in" aria-label={`${dashboardRoleLabel} workspace`}>
                    <span className="eyebrow">{dashboardHero.eyebrow}</span>
                    <h3 className="ns-principal-workspace__title">{dashboardHero.title}</h3>
                    <div className="ns-principal-workspace__stats">
                      {dashboardHero.stats.map((stat, index) => (
                        <div className="ns-principal-workspace__stat" key={stat.label}>
                          <span>{stat.label}</span>
                          <strong className={index === 3 ? 'is-gold' : ''}>{String(stat.value)}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {dashboardHero && !isReferenceLayout && (
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

              {isReferenceLayout && dashboardReadiness && (
                <section className="ns-principal-readiness glass reveal in" aria-label={dashboardReadiness.label}>
                  <div className="ns-principal-readiness__head">
                    <span>{dashboardReadiness.label}</span>
                    <strong>{dashboardReadiness.value}%</strong>
                  </div>
                  <div className="ns-progress-track" aria-hidden="true">
                    <span style={{ width: `${dashboardReadiness.value}%` }} />
                  </div>
                </section>
              )}

              {dashboardActiveTab && !isReferenceLayout && (
                <section className="ns-dashboard-rail__note glass reveal in" aria-label="Current dashboard section">
                  <span className="eyebrow">Current section</span>
                  <h3>{dashboardActiveTab.label}</h3>
                  <p>{dashboardActiveTab.hint}</p>
                </section>
              )}
            </aside>

            <div className="ns-dashboard-stage" id={dashboardStageId} role="region" aria-live="polite" tabIndex={-1}>
              {isReferenceLayout && dashboardActiveTab && (
                <header className="ns-principal-topbar glass reveal in" aria-label="Active dashboard view">
                  <div className="ns-principal-topbar__view">
                    <span className="eyebrow">Active View</span>
                    <h3>{dashboardActiveTab.label}</h3>
                    <p>{dashboardActiveTab.hint}</p>
                  </div>
                  <div className="ns-principal-topbar__meta">
                    <span className="ns-principal-topbar__live"><i aria-hidden="true" />Live</span>
                    <span className="ns-principal-topbar__role">{dashboardRoleLabel}</span>
                    <span className="ns-principal-topbar__avatar" aria-hidden="true">{dashboardAvatarChar}</span>
                  </div>
                </header>
              )}

              {dashboardActiveTab && !isReferenceLayout && (
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
              <article className="glass ns-dash-card reveal in" hidden={dashboardTab !== 'overview'}>
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
                  <div><span>Can Submit</span><strong>{studentDashboard.can_submit ? 'Yes' : 'Locked'}</strong></div>
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

              <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Competition Leaderboard</span>
                  <span className="ns-board__badge">🏆 School #{studentDashboard.rankings?.school?.position || '-'} · Class #{studentDashboard.rankings?.teacher?.position || '-'}</span>
                </div>
                <p className="ns-leaderboard-tagline">
                  Every interview, approval and submission earns points. See where you stand and keep climbing toward the podium.
                </p>

                <div className="ns-record-tabs" role="tablist" aria-label="Leaderboard view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studentRankTab === 'school'}
                    className={`ns-record-tabs__btn ${studentRankTab === 'school' ? 'is-active' : ''}`}
                    onClick={() => setStudentRankTab('school')}
                  >
                    <strong>School Board</strong>
                    <span>Everyone school-wide</span>
                    <em>{studentSchoolRankings.length}</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={studentRankTab === 'class'}
                    className={`ns-record-tabs__btn ${studentRankTab === 'class' ? 'is-active' : ''}`}
                    onClick={() => setStudentRankTab('class')}
                  >
                    <strong>Class Board</strong>
                    <span>Your teacher&apos;s class</span>
                    <em>{studentTeacherRankings.length}</em>
                  </button>
                </div>

                {studentLeaderRows.length === 0 ? (
                  <p className="ns-muted" style={{ marginTop: 16 }}>No ranked students yet — standings appear once scores are recorded.</p>
                ) : (
                  <>
                    {studentPodium.length > 0 && (
                      <div className="ns-podium" aria-label="Top performers">
                        {studentPodium.map((pdm) => (
                          <div key={`spodium-${pdm.id}`} className={`ns-podium__place ${pdm.isMe ? 'is-me' : ''}`} data-rank={pdm.rank}>
                            <span className="ns-podium__medal" aria-hidden="true">{['🥇', '🥈', '🥉'][pdm.rank - 1] || `#${pdm.rank}`}</span>
                            <span className="ns-podium__avatar">{String(pdm.name || '?').trim().charAt(0).toUpperCase()}</span>
                            <strong className="ns-podium__name">{pdm.name}{pdm.isMe ? ' (you)' : ''}</strong>
                            <span className="ns-podium__sub">{pdm.sub}</span>
                            <span className="ns-podium__score">{pdm.score}<small>pts</small></span>
                            <span className="ns-podium__pedestal">{pdm.rank}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="ns-leaderboard" role="list">
                      <div className="ns-leaderboard__head" aria-hidden="true">
                        <span>Rank</span>
                        <span />
                        <span>Student</span>
                        <span>Points</span>
                        <span>Status</span>
                      </div>
                      {studentLeaderRows.map((r) => (
                        <div
                          role="listitem"
                          key={`sleader-${r.id}`}
                          className={`ns-leader-row ${r.rank >= 1 && r.rank <= 3 ? 'is-podium' : ''} ${r.isMe ? 'is-me' : ''}`}
                          data-rank={r.rank}
                        >
                          <span className="ns-leader-rank">{r.rank >= 1 && r.rank <= 3 ? (['🥇', '🥈', '🥉'][r.rank - 1]) : (r.rank || '—')}</span>
                          <span className="ns-leader-avatar" aria-hidden="true">{String(r.name || '?').trim().charAt(0).toUpperCase()}</span>
                          <div className="ns-leader-id">
                            <strong>{r.name}{r.isMe ? ' (you)' : ''}</strong>
                            <span>{r.sub}</span>
                          </div>
                          <div className="ns-leader-score">
                            <div className="ns-leader-bar"><span style={{ width: `${Math.max(6, Math.round((r.score / studentLeaderMax) * 100))}%` }} /></div>
                            <strong>{r.score}<small>pts</small></strong>
                          </div>
                          <span className="ns-status-pill" data-status={String(r.tag).toLowerCase()}>{r.tag}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <SchoolRankBoard schools={schoolRankings} mySchoolId={myDashboardSchoolId} hidden={dashboardTab !== 'rankings' && dashboardTab !== 'overview'} />

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
                <TermsAgreement kind="website" idPrefix="ns-business" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setBusinessTermsOk} />
                <button className="btn btn--solid" type="submit" disabled={busy === 'business' || !businessTermsOk}>{busy === 'business' ? 'Saving...' : 'Save Business Interview'}</button>
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
                <TermsAgreement kind="website" idPrefix="ns-submission" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setSubmissionTermsOk} />
                <button className="btn btn--solid" type="submit" disabled={busy === 'submission' || !canStudentSubmit || !submissionTermsOk}>
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
                </div>
                <div className="ns-approval-stack">
                  <div className="ns-approval-row"><strong>Parent consent</strong><span>{parentDashboard.student_context?.student?.parent_consent_status || 'pending'}</span></div>
                  <div className="ns-approval-row"><strong>School approval</strong><span>{parentDashboard.student_context?.student?.school_approval_status || 'pending'}</span></div>
                  <div className="ns-approval-row"><strong>Teacher approval</strong><span>{parentDashboard.student_context?.student?.teacher_approval_status || 'pending'}</span></div>
                  <div className="ns-approval-row"><strong>Submission</strong><span>{parentDashboard.student_context?.student?.submission_status || 'locked'}</span></div>
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
              <SchoolRankBoard schools={schoolRankings} mySchoolId={myDashboardSchoolId} hidden={dashboardTab !== 'rankings' && dashboardTab !== 'overview'} />
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

              {isManagerLayout && (
            <div className="ns-dash-grid">
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'overview'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">{schoolDashboard ? 'School Dashboard' : 'Teacher Dashboard'}</span>
                  <span className="ns-board__badge">{schoolDashboard ? schoolDashboard.school.school_name : (teacherDashboard?.teacher?.teacher_full_name || 'Class')}</span>
                </div>
                <div className="ns-dashboard-callout">
                  <div className="ns-dashboard-callout__head">
                    <strong>{schoolDashboard ? 'Principal Control Room' : 'Classroom Command'}</strong>
                    <span>{activeSummary.submitted || 0} submissions</span>
                  </div>
                  <p>{schoolDashboard
                    ? 'Approve teachers, keep school readiness high, and monitor performance from one view.'
                    : 'Approve your students, clear submissions, and keep your class leaderboard moving.'}</p>
                </div>
                <span className="ns-overview-label">Approval pipeline</span>
                <div className="ns-quick-stats">
                  <div><span>Parent Pending</span><strong>{activeSummary.parent_pending || 0}</strong></div>
                  <div><span>Parent Approved</span><strong>{activeSummary.parent_approved || 0}</strong></div>
                  <div><span>School Pending</span><strong>{activeSummary.school_pending || 0}</strong></div>
                  <div><span>School Approved</span><strong>{activeSummary.school_approved || 0}</strong></div>
                  <div><span>Teacher Pending</span><strong>{activeSummary.teacher_pending || 0}</strong></div>
                  <div><span>Teacher Approved</span><strong>{activeSummary.teacher_approved || 0}</strong></div>
                  <div><span>Interviews Logged</span><strong>{activeSummary.interviews_total || 0}</strong></div>
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
                  <span className="eyebrow">{schoolDashboard ? 'School Profile' : 'Teacher Profile'}</span>
                  <span className="ns-board__badge">{schoolDashboard ? (schoolDashboard.school.status || 'registered') : (teacherDashboard?.teacher?.status || 'active')}</span>
                </div>
                {schoolDashboard ? (
                  <div className="ns-approval-stack">
                    <div className="ns-approval-row"><strong>Principal</strong><span>{schoolDashboard.school.principal_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Administrator</strong><span>{schoolDashboard.school.administrator_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>District</strong><span>{schoolDashboard.school.school_district || '-'}</span></div>
                    <div className="ns-approval-row"><strong>School Email</strong><span>{currentSchoolEmail || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Main Phone</strong><span>{schoolDashboard.school.main_phone || '-'}</span></div>
                  </div>
                ) : (
                  <div className="ns-approval-stack">
                    <div className="ns-approval-row"><strong>Teacher</strong><span>{teacherDashboard?.teacher?.teacher_full_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>School</strong><span>{teacherDashboard?.school?.school_name || teacherDashboard?.teacher?.linked_school_name || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Email</strong><span>{teacherDashboard?.teacher?.school_email || user?.email || '-'}</span></div>
                    <div className="ns-approval-row"><strong>Department</strong><span>{teacherDashboard?.teacher?.role_department || 'Teacher'}</span></div>
                    <div className="ns-approval-row"><strong>Grades</strong><span>{teacherDashboard?.teacher?.grade_level_supported || '-'}</span></div>
                  </div>
                )}
              </article>
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'approvals'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approvals</span>
                  <span className="ns-board__badge">
                    {schoolApprovalsTab === 'students'
                      ? `${filteredApprovalStudents.length} students`
                      : `${filteredApprovalTeachers.length} teachers`}
                  </span>
                </div>

                <div className="ns-record-tabs" role="tablist" aria-label="Approval sections">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={schoolApprovalsTab === 'students'}
                    className={`ns-record-tabs__btn ${schoolApprovalsTab === 'students' ? 'is-active' : ''}`}
                    onClick={() => setSchoolApprovalsTab('students')}
                  >
                    <strong>Students</strong>
                    <span>{schoolDashboard ? 'School approval' : 'Teacher approval'}</span>
                    <em>{activeStudents.length}</em>
                  </button>
                  {activeManagesTeachers && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={schoolApprovalsTab === 'teachers'}
                      className={`ns-record-tabs__btn ${schoolApprovalsTab === 'teachers' ? 'is-active' : ''}`}
                      onClick={() => setSchoolApprovalsTab('teachers')}
                    >
                      <strong>Teachers</strong>
                      <span>Verification</span>
                      <em>{activeTeachers.length}</em>
                    </button>
                  )}
                </div>

                <div className="ns-approvals-toolbar">
                  <label className="ns-approvals-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      value={schoolApprovalSearch}
                      onChange={(event) => setSchoolApprovalSearch(event.target.value)}
                      placeholder={schoolApprovalsTab === 'students' ? 'Search student or participant ID' : 'Search teacher or department'}
                      aria-label="Search approvals"
                    />
                  </label>
                  <div className="ns-approvals-filter" role="group" aria-label="Filter by status">
                    {approvalStatusOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`ns-approvals-filter__btn ${schoolApprovalStatus === option.key ? 'is-active' : ''}`}
                        onClick={() => setSchoolApprovalStatus(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {schoolApprovalsTab === 'students' && (
                  <PagedRows items={filteredApprovalStudents}>{(rows) => (
                  <div className="ns-table-wrap">
                    <table className="ns-table ns-table--approvals">
                      <thead>
                        <tr>
                          <th>Participant</th>
                          <th>Student</th>
                          <th>Parent</th>
                          <th>School</th>
                          <th>Teacher</th>
                          <th className="ns-col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApprovalStudents.length > 0 ? rows.map((row: any) => {
                          const parentReady = String(row.parent_consent_status || '').toLowerCase() === 'approved'
                          const schoolReady = String(row.school_approval_status || '').toLowerCase() === 'approved'
                          // Principal records a school approval (needs parent consent); a teacher
                          // records a teacher approval (needs parent consent + school approval first).
                          const canApprove = schoolDashboard ? parentReady : (parentReady && schoolReady)
                          const blockedReason = schoolDashboard
                            ? 'Parent consent must be approved first'
                            : 'Parent consent and school approval are required first'
                          const rowBusy = busy.startsWith(`student-${row.id}-`)
                          return (
                            <tr
                              key={row.id}
                              className="ns-row-clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => setApprovalDetail({ type: 'student', id: Number(row.id) })}
                              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setApprovalDetail({ type: 'student', id: Number(row.id) }) } }}
                            >
                              <td>{row.participant_id}</td>
                              <td>{row.full_name}</td>
                              <td><span className="ns-status-pill" data-status={String(row.parent_consent_status || '').toLowerCase()}>{row.parent_consent_status || '—'}</span></td>
                              <td><span className="ns-status-pill" data-status={String(row.school_approval_status || '').toLowerCase()}>{row.school_approval_status || '—'}</span></td>
                              <td><span className="ns-status-pill" data-status={String(row.teacher_approval_status || '').toLowerCase()}>{row.teacher_approval_status || '—'}</span></td>
                              <td className="ns-col-actions">
                                <div className="ns-row-actions">
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--approve"
                                    disabled={rowBusy || !canApprove}
                                    title={canApprove ? 'Approve' : blockedReason}
                                    onClick={(event) => { event.stopPropagation(); approveStudentInline(row, 'approved') }}
                                  >
                                    {busy === `student-${row.id}-approved` ? '…' : 'Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--reject"
                                    disabled={rowBusy}
                                    onClick={(event) => { event.stopPropagation(); approveStudentInline(row, 'rejected') }}
                                  >
                                    {busy === `student-${row.id}-rejected` ? '…' : 'Reject'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={6}>No students match this search or filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  )}</PagedRows>
                )}

                {schoolApprovalsTab === 'teachers' && (
                  <PagedRows items={filteredApprovalTeachers}>{(rows) => (
                  <div className="ns-table-wrap">
                    <table className="ns-table ns-table--approvals">
                      <thead>
                        <tr>
                          <th>Teacher</th>
                          <th>Department</th>
                          <th>Students</th>
                          <th>Status</th>
                          <th className="ns-col-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApprovalTeachers.length > 0 ? rows.map((row: any) => {
                          const rowBusy = busy.startsWith(`teacher-${row.id}-`)
                          return (
                            <tr
                              key={row.id}
                              className="ns-row-clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => setApprovalDetail({ type: 'teacher', id: Number(row.id) })}
                              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setApprovalDetail({ type: 'teacher', id: Number(row.id) }) } }}
                            >
                              <td>{row.teacher_full_name}</td>
                              <td>{row.role_department || '—'}</td>
                              <td>{row.students_total ?? 0}</td>
                              <td><span className="ns-status-pill" data-status={String(row.status || '').toLowerCase()}>{row.status || '—'}</span></td>
                              <td className="ns-col-actions">
                                <div className="ns-row-actions">
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--approve"
                                    disabled={rowBusy}
                                    onClick={(event) => { event.stopPropagation(); approveTeacherInline(row, 'approved') }}
                                  >
                                    {busy === `teacher-${row.id}-approved` ? '…' : 'Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    className="ns-row-btn ns-row-btn--reject"
                                    disabled={rowBusy}
                                    onClick={(event) => { event.stopPropagation(); approveTeacherInline(row, 'rejected') }}
                                  >
                                    {busy === `teacher-${row.id}-rejected` ? '…' : 'Reject'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={5}>No teachers match this search or filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  )}</PagedRows>
                )}

                <p className="ns-approvals-note">
                  Actions are signed as <strong>{user?.full_name || 'Reviewer'}</strong>. A student needs approved parent consent before school approval.
                </p>
              </article>
              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'records'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Records</span>
                  <div className="ns-record-head__actions">
                    <span className="ns-board__badge">
                      {schoolRecordsTabs.find((tab) => tab.key === schoolRecordsTab)?.count || 0}
                    </span>
                    {isSchoolLayout && ['students', 'teachers', 'approvals'].includes(schoolRecordsTab) && (
                      <button type="button" className="ns-row-btn ns-row-btn--approve" onClick={() => openRecordCreate(RECORDS_TAB_ENTITY[schoolRecordsTab])}>
                        + Add {RECORD_DEFS[RECORDS_TAB_ENTITY[schoolRecordsTab]].label}
                      </button>
                    )}
                  </div>
                </div>
                <p className="ns-record-hint">{isTeacherLayout ? 'Tap any row to view its detail card.' : 'Tap any row to open its detail card — edit or delete from there.'}</p>
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
                    <PagedRows items={activeStudents}>{(rows) => (
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
                            <th>Submitted</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeStudents.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('student', Number(row.id))}>
                              <td>{row.participant_id}</td>
                              <td>{row.full_name}</td>
                              <td>{row.parent_consent_status}</td>
                              <td>{row.school_approval_status}</td>
                              <td>{row.teacher_approval_status}</td>
                              <td>
                                <div className="ns-count-cell">
                                  <span>{Number(row.interview_count) || 0}/10</span>
                                  <div className="ns-leader-bar"><span style={{ width: `${Math.min(100, Math.round(((Number(row.interview_count) || 0) / 10) * 100))}%` }} /></div>
                                </div>
                              </td>
                              <td>{Number(row.has_submission) > 0 ? 'Yes' : 'No'}</td>
                              <td>{row.submission_status}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={8}>No students registered yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    )}</PagedRows>
                  )}

                  {schoolRecordsTab === 'teachers' && (
                    <PagedRows items={activeTeachers}>{(rows) => (
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
                          {activeTeachers.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('teacher', Number(row.id))}>
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
                    )}</PagedRows>
                  )}

                  {schoolRecordsTab === 'interviews' && (
                    <PagedRows items={activeBusinesses}>{(rows) => (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Visit</th>
                            <th>Business</th>
                            <th>Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeBusinesses.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('interview', Number(row.id))}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.visit_number}</td>
                              <td>{row.business_name}</td>
                              <td>{row.business_category}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={5}>No business interviews recorded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    )}</PagedRows>
                  )}

                  {schoolRecordsTab === 'approvals' && (
                    <PagedRows items={activeApprovals}>{(rows) => (
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
                          {activeApprovals.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('approval', Number(row.id))}>
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
                    )}</PagedRows>
                  )}

                  {schoolRecordsTab === 'projects' && (
                    <PagedRows items={activeSubmissions}>{(rows) => (
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Participant ID</th>
                            <th>Student</th>
                            <th>Business</th>
                            <th>Status</th>
                            <th>Score</th>
                            <th>Rank</th>
                            <th>Reviewer</th>
                            <th>Submitted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSubmissions.length > 0 ? rows.map((row: any) => (
                            <tr key={row.id} className="ns-row-clickable" onClick={() => openRecordView('submission', Number(row.id))}>
                              <td>{row.participant_id}</td>
                              <td>{row.student_name}</td>
                              <td>{row.source_business_name || '-'}</td>
                              <td>{row.status}</td>
                              <td>{row.score ?? '-'}</td>
                              <td>{row.rank_position ?? '-'}</td>
                              <td>{row.reviewer_name || row.reviewer_user_name || '-'}</td>
                              <td>{row.submission_date || '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={8}>No submissions have been recorded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    )}</PagedRows>
                  )}
                </div>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in ns-leaderboard-card" hidden={dashboardTab !== 'rankings'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Competition Leaderboard</span>
                  <span className="ns-board__badge">🏆 Live Standings</span>
                </div>
                <p className="ns-leaderboard-tagline">
                  Every interview, approval and submission earns points. {schoolRankingTab === 'students' ? 'Students' : 'Teachers'} climb the board in real time — keep pushing to reach the podium.
                </p>

                <div className="ns-record-tabs" role="tablist" aria-label="Leaderboard view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={schoolRankingTab === 'students'}
                    className={`ns-record-tabs__btn ${schoolRankingTab === 'students' ? 'is-active' : ''}`}
                    onClick={() => setSchoolRankingTab('students')}
                  >
                    <strong>Students</strong>
                    <span>Champions board</span>
                    <em>{schoolRankedStudents.length}</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={schoolRankingTab === 'teachers'}
                    className={`ns-record-tabs__btn ${schoolRankingTab === 'teachers' ? 'is-active' : ''}`}
                    onClick={() => setSchoolRankingTab('teachers')}
                  >
                    <strong>Teachers</strong>
                    <span>Mentor board</span>
                    <em>{schoolRankedTeachers.length}</em>
                  </button>
                </div>

                {schoolLeaderRows.length === 0 ? (
                  <p className="ns-muted" style={{ marginTop: 16 }}>No ranked {schoolRankingTab} yet — standings appear once scores are recorded.</p>
                ) : (
                  <>
                    {schoolPodium.length > 0 && (
                      <div className="ns-podium" aria-label="Top performers">
                        {schoolPodium.map((p) => (
                          <button
                            type="button"
                            key={`podium-${p.type}-${p.id}`}
                            className="ns-podium__place"
                            data-rank={p.rank}
                            onClick={() => setApprovalDetail({ type: p.type, id: p.id })}
                          >
                            <span className="ns-podium__medal" aria-hidden="true">{['🥇', '🥈', '🥉'][p.rank - 1] || `#${p.rank}`}</span>
                            <span className="ns-podium__avatar">{String(p.name || '?').trim().charAt(0).toUpperCase()}</span>
                            <strong className="ns-podium__name">{p.name}</strong>
                            <span className="ns-podium__sub">{p.sub}</span>
                            <span className="ns-podium__score">{p.score}<small>pts</small></span>
                            <span className="ns-podium__pedestal">{p.rank}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="ns-leaderboard" role="list">
                      <div className="ns-leaderboard__head" aria-hidden="true">
                        <span>Rank</span>
                        <span />
                        <span>{schoolRankingTab === 'students' ? 'Student' : 'Teacher'}</span>
                        <span>Points</span>
                        <span>{schoolRankingTab === 'students' ? 'Status' : 'Class'}</span>
                      </div>
                      {schoolLeaderRows.map((r) => (
                        <button
                          type="button"
                          role="listitem"
                          key={`leader-${r.type}-${r.id}`}
                          className={`ns-leader-row ${r.rank >= 1 && r.rank <= 3 ? 'is-podium' : ''}`}
                          data-rank={r.rank}
                          onClick={() => setApprovalDetail({ type: r.type, id: r.id })}
                        >
                          <span className="ns-leader-rank">{r.rank >= 1 && r.rank <= 3 ? (['🥇', '🥈', '🥉'][r.rank - 1]) : (r.rank || '—')}</span>
                          <span className="ns-leader-avatar" aria-hidden="true">{String(r.name || '?').trim().charAt(0).toUpperCase()}</span>
                          <div className="ns-leader-id">
                            <strong>{r.name}</strong>
                            <span>{r.sub}</span>
                          </div>
                          <div className="ns-leader-score">
                            <div className="ns-leader-bar"><span style={{ width: `${Math.max(6, Math.round((r.score / schoolLeaderMax) * 100))}%` }} /></div>
                            <strong>{r.score}<small>pts</small></strong>
                          </div>
                          {r.tagType === 'status'
                            ? <span className="ns-status-pill" data-status={String(r.tag).toLowerCase()}>{r.tag}</span>
                            : <span className="ns-leader-tag">{r.tag}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <SchoolRankBoard schools={schoolRankings} mySchoolId={myDashboardSchoolId} hidden={dashboardTab !== 'rankings' && dashboardTab !== 'overview'} />

              {/* Submission review/scoring is admin-only (data isolation): teacher & school
                  cannot see project content or score submissions, so the Reviews tool is removed. */}

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
                    <span className="ns-board__badge">{activeUnreadNotifications.length} unread</span>
                  </div>
                  <div className="ns-notification-list">
                    {activeNotifications.length > 0 ? (
                      activeNotifications.slice(0, 5).map((item: any) => (
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

              {approvalDetail && approvalDetailRecord && createPortal((
                <div
                  className="ns-detail-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label={approvalDetail.type === 'student' ? 'Student details' : 'Teacher details'}
                  onClick={() => setApprovalDetail(null)}
                >
                  <div className="ns-detail-card glass" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="ns-detail-close" aria-label="Close details" onClick={() => setApprovalDetail(null)}>✕</button>

                    {approvalDetail.type === 'student' ? (() => {
                      const s = approvalDetailRecord
                      const parentReady = String(s.parent_consent_status || '').toLowerCase() === 'approved'
                      const detailBusy = busy.startsWith(`student-${s.id}-`)
                      return (
                        <>
                          <div className="ns-detail-head">
                            <span className="ns-detail-avatar" aria-hidden="true">{String(s.full_name || 'S').trim().charAt(0).toUpperCase()}</span>
                            <div className="ns-detail-head__id">
                              <span className="eyebrow">Student · {s.participant_id}</span>
                              <h3>{s.full_name}</h3>
                              <span className="ns-status-pill" data-status={String(s.submission_status || '').toLowerCase()}>{s.submission_status || '—'}</span>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Approval status</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Parent consent</span><span className="ns-status-pill" data-status={String(s.parent_consent_status || '').toLowerCase()}>{s.parent_consent_status || '—'}</span></div>
                              <div className="ns-detail-row"><span>School approval</span><span className="ns-status-pill" data-status={String(s.school_approval_status || '').toLowerCase()}>{s.school_approval_status || '—'}</span></div>
                              <div className="ns-detail-row"><span>Teacher approval</span><span className="ns-status-pill" data-status={String(s.teacher_approval_status || '').toLowerCase()}>{s.teacher_approval_status || '—'}</span></div>
                              <div className="ns-detail-row"><span>Submission</span><span className="ns-status-pill" data-status={String(s.submission_status || '').toLowerCase()}>{s.submission_status || '—'}</span></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Profile</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Grade</span><strong>{s.grade_level || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Age</span><strong>{s.age ?? '—'}</strong></div>
                              <div className="ns-detail-row"><span>Date of birth</span><strong>{formatDateLabel(s.date_of_birth) || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Username</span><strong>{s.student_username || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Email</span><strong>{s.email || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Phone</span><strong>{s.phone_number || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Home address</span><strong>{s.home_address || '—'}</strong></div>
                              <div className="ns-detail-row"><span>School</span><strong>{s.school_name || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Teacher</span><strong>{s.teacher_full_name || '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Parent / guardian</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Name</span><strong>{s.parent_name || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Phone</span><strong>{s.parent_phone || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Email</span><strong>{s.parent_email || '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Performance</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Interviews</span><strong>{s.interview_count ?? 0}/10</strong></div>
                              <div className="ns-detail-row"><span>Score</span><strong>{s.performance_score ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>School rank</span><strong>#{s.rank_position ?? '—'}</strong></div>
                              <div className="ns-detail-row"><span>Submission score</span><strong>{s.submission_score ?? '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-actions">
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--approve"
                              disabled={detailBusy || !parentReady}
                              title={parentReady ? 'Approve school participation' : 'Parent consent must be approved first'}
                              onClick={() => approveStudentInline(s, 'approved')}
                            >
                              {busy === `student-${s.id}-approved` ? 'Saving…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--reject"
                              disabled={detailBusy}
                              onClick={() => approveStudentInline(s, 'rejected')}
                            >
                              {busy === `student-${s.id}-rejected` ? 'Saving…' : 'Reject'}
                            </button>
                          </div>
                        </>
                      )
                    })() : (() => {
                      const t = approvalDetailRecord
                      const detailBusy = busy.startsWith(`teacher-${t.id}-`)
                      return (
                        <>
                          <div className="ns-detail-head">
                            <span className="ns-detail-avatar" aria-hidden="true">{String(t.teacher_full_name || 'T').trim().charAt(0).toUpperCase()}</span>
                            <div className="ns-detail-head__id">
                              <span className="eyebrow">Teacher</span>
                              <h3>{t.teacher_full_name}</h3>
                              <span className="ns-status-pill" data-status={String(t.status || '').toLowerCase()}>{t.status || '—'}</span>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Profile</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Department</span><strong>{t.role_department || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Grades supported</span><strong>{t.grade_level_supported || '—'}</strong></div>
                              <div className="ns-detail-row ns-detail-row--full"><span>Email</span><strong>{t.school_email || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Phone</span><strong>{t.phone_number || '—'}</strong></div>
                              <div className="ns-detail-row"><span>School</span><strong>{t.linked_school_name || '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Class performance</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Students</span><strong>{t.students_total ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Students approved</span><strong>{t.teacher_approved ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Submissions</span><strong>{t.submissions ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Ranking score</span><strong>{t.ranking_score ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Avg student score</span><strong>{t.average_student_score ?? 0}</strong></div>
                              <div className="ns-detail-row"><span>Rank</span><strong>#{t.rank_position ?? '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-section">
                            <span className="ns-detail-section__title">Top student</span>
                            <div className="ns-detail-grid">
                              <div className="ns-detail-row"><span>Name</span><strong>{t.top_student_name || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Participant</span><strong>{t.top_student_participant_id || '—'}</strong></div>
                              <div className="ns-detail-row"><span>Score</span><strong>{t.top_student_score ?? '—'}</strong></div>
                            </div>
                          </div>

                          <div className="ns-detail-actions">
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--approve"
                              disabled={detailBusy}
                              onClick={() => approveTeacherInline(t, 'approved')}
                            >
                              {busy === `teacher-${t.id}-approved` ? 'Saving…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="ns-row-btn ns-row-btn--reject"
                              disabled={detailBusy}
                              onClick={() => approveTeacherInline(t, 'rejected')}
                            >
                              {busy === `teacher-${t.id}-rejected` ? 'Saving…' : 'Reject'}
                            </button>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              ), document.body)}

              {recordModal && createPortal((
                <div
                  className="ns-detail-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${RECORD_DEFS[recordModal.entity].label} ${recordModal.mode}`}
                  onClick={() => { if (recordModal.mode === 'view') setRecordModal(null) }}
                >
                  <div className="ns-detail-card glass" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="ns-detail-close" aria-label="Close" onClick={() => setRecordModal(null)}>✕</button>
                    <div className="ns-detail-head">
                      <span className="ns-detail-avatar" aria-hidden="true">
                        {recordModal.mode === 'create' ? '+' : String(recordTitle(recordModal.entity, recordCurrent) || '?').trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="ns-detail-head__id">
                        <span className="eyebrow">
                          {RECORD_DEFS[recordModal.entity].label}{recordModal.mode === 'create' ? ' · New' : recordModal.mode === 'edit' ? ' · Edit' : ''}
                        </span>
                        <h3>{recordModal.mode === 'create' ? `New ${RECORD_DEFS[recordModal.entity].label}` : recordTitle(recordModal.entity, recordCurrent)}</h3>
                      </div>
                    </div>

                    {recordModal.mode === 'view' && recordCurrent && (
                      <>
                        <div className="ns-detail-section">
                          <span className="ns-detail-section__title">Details</span>
                          <div className="ns-detail-grid">
                            {visibleRecordFields(recordModal.entity).map((f) => {
                              let val: any
                              if (f.type === 'checkbox') val = (recordCurrent[f.key] === 1 || recordCurrent[f.key] === true || recordCurrent[f.key] === '1') ? 'Yes' : 'No'
                              else if (f.type === 'teacherRef') val = recordCurrent.teacher_full_name || '—'
                              else if (f.type === 'studentRef') val = recordCurrent.student_name || recordCurrent.full_name || '—'
                              else { const raw = recordCurrent[f.key]; val = (raw === null || raw === undefined || raw === '') ? '—' : String(raw) }
                              const isStatus = f.type === 'select' && /status|approval|consent/i.test(f.key)
                              return (
                                <div className={`ns-detail-row ${f.full || f.type === 'textarea' ? 'ns-detail-row--full' : ''}`} key={f.key}>
                                  <span>{f.label}</span>
                                  {isStatus
                                    ? <span className="ns-status-pill" data-status={String(val).toLowerCase()}>{val}</span>
                                    : <strong>{val}</strong>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {canWriteRecordEntity(recordModal.entity) && (
                          <div className="ns-detail-actions">
                            <button type="button" className="ns-row-btn ns-row-btn--approve" onClick={startRecordEdit}>Edit</button>
                            <button type="button" className="ns-row-btn ns-row-btn--reject" disabled={recordBusy} onClick={deleteRecord}>{recordBusy ? 'Working…' : 'Delete'}</button>
                          </div>
                        )}
                      </>
                    )}

                    {(recordModal.mode === 'edit' || recordModal.mode === 'create') && (
                      <form className="ns-record-form" onSubmit={(event) => { event.preventDefault(); saveRecord() }}>
                        <div className="ns-field-grid">
                          {visibleRecordFields(recordModal.entity)
                            .filter((f) => (recordModal.mode === 'create' ? !f.editOnly : !f.createOnly))
                            .map((f) => (
                              <label className={`ns-field ${f.full || f.type === 'textarea' ? 'ns-field--full' : ''} ${f.type === 'checkbox' ? 'ns-field--check' : ''}`} key={f.key}>
                                <span>{f.label}</span>
                                {f.type === 'textarea' ? (
                                  <textarea rows={3} value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)} />
                                ) : f.type === 'select' ? (
                                  <select value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)} required={f.required}>
                                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : f.type === 'checkbox' ? (
                                  <input type="checkbox" checked={!!recordForm[f.key]} onChange={(e) => setRecordField(f.key, e.target.checked)} />
                                ) : f.type === 'studentRef' ? (
                                  <select value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)} required={f.required}>
                                    <option value="">Select student</option>
                                    {asArray<any>(schoolDashboard?.students).map((s: any) => <option key={s.id} value={s.id}>{s.full_name} — {s.participant_id}</option>)}
                                  </select>
                                ) : f.type === 'teacherRef' ? (
                                  <select value={recordForm[f.key] ?? ''} onChange={(e) => setRecordField(f.key, e.target.value)}>
                                    <option value="">No teacher</option>
                                    {asArray<any>(schoolDashboard?.teachers).map((t: any) => <option key={t.id} value={t.id}>{t.teacher_full_name}</option>)}
                                  </select>
                                ) : (
                                  <input
                                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                                    value={recordForm[f.key] ?? ''}
                                    onChange={(e) => setRecordField(f.key, e.target.value)}
                                    required={f.required}
                                  />
                                )}
                              </label>
                            ))}
                        </div>
                        <div className="ns-detail-actions">
                          <button type="submit" className="ns-row-btn ns-row-btn--approve" disabled={recordBusy}>
                            {recordBusy ? 'Saving…' : (recordModal.mode === 'create' ? `Create ${RECORD_DEFS[recordModal.entity].label}` : 'Save changes')}
                          </button>
                          <button type="button" className="ns-row-btn ns-row-btn--reject" onClick={() => (recordModal.id != null ? setRecordModal({ ...recordModal, mode: 'view' }) : setRecordModal(null))}>Cancel</button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              ), document.body)}
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
                </div>
                <span className="ns-overview-label">Program totals</span>
                <div className="ns-quick-stats">
                  {[
                    ['Parents', adminDashboard.summary.parents],
                    ['Businesses', adminDashboard.summary.businesses],
                    ['Submissions', adminDashboard.summary.submissions],
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
                <PagedRows items={adminDashboard.submissions || []}>{(rows) => (
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
                      {rows.map((row: any) => (
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
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Schools</span>
                  <span className="ns-board__badge">{adminSchools.length}</span>
                </div>
                <PagedRows items={adminSchools}>{(rows) => (
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
                      {rows.map((row: any) => (
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
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Parent Consent</span>
                  <span className="ns-board__badge">{adminParents.length}</span>
                </div>
                <PagedRows items={adminParents}>{(rows) => (
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
                      {rows.map((row: any) => (
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
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Approval Records</span>
                  <span className="ns-board__badge">{adminApprovals.length}</span>
                </div>
                <PagedRows items={adminApprovals}>{(rows) => (
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
                      {rows.map((row: any) => (
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
                )}</PagedRows>
              </article>

              <article className="glass ns-dash-card ns-dash-card--wide reveal in" hidden={dashboardTab !== 'data'}>
                <div className="ns-dash-card__head">
                  <span className="eyebrow">Business Interviews</span>
                  <span className="ns-board__badge">{adminBusinesses.length}</span>
                </div>
                <PagedRows items={adminBusinesses}>{(rows) => (
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
                      {rows.map((row: any) => (
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
                )}</PagedRows>
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
                  <label className="ns-field">
                    <span>Student Bonus Points (max 15)</span>
                    <input name="student_award_points" type="number" min="0" max="15" placeholder="0–15" />
                  </label>
                  <label className="ns-field">
                    <span>Teacher Bonus Points (max 8)</span>
                    <input name="teacher_award_points" type="number" min="0" max="8" defaultValue="3" />
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

              <form className="glass ns-form ns-form--compact reveal in" onSubmit={submitInterviewPoints} hidden={dashboardTab !== 'reviews'}>
                <div className="ns-form__head">
                  <span className="eyebrow">Interview Points</span>
                  <h3>Award bonus points for an interview</h3>
                  <p>Approve a student's business interview and grant bonus points (student up to 15, teacher up to 8, default 3).</p>
                </div>
                <div className="ns-field-grid">
                  <label className="ns-field ns-field--full">
                    <span>Interview</span>
                    <select name="interview_id" defaultValue="" required>
                      <option value="">Select interview</option>
                      {adminBusinesses.map((row: any) => (
                        <option key={row.id} value={row.id}>
                          #{row.id} - {row.student_name} - Visit {row.visit_number} - {row.business_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ns-field">
                    <span>Student Bonus Points (max 15)</span>
                    <input name="student_award_points" type="number" min="0" max="15" placeholder="0–15" />
                  </label>
                  <label className="ns-field">
                    <span>Teacher Bonus Points (max 8)</span>
                    <input name="teacher_award_points" type="number" min="0" max="8" defaultValue="3" />
                  </label>
                </div>
                <button className="btn btn--solid" type="submit" disabled={busy === 'interview-points'}>
                  {busy === 'interview-points' ? 'Saving...' : 'Award Interview Points'}
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
