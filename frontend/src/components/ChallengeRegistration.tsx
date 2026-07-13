import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { CHALLENGE_TERMS_VERSION } from '../lib/terms'
import TermsAgreement from './TermsAgreement'
import {
  type FieldErrors,
  value, checked, fileValue, ageFromDob, uploadIfPresent, MAX_DOC_BYTES,
  REQUIRED_MSG, vRequired, vMinChars, vEmail, vPhone, vUrl, vPassword, vUsername,
  sanitizeField, pruneErrors, focusFirstError, mapRegisterError, joinAddress, validateAddress,
  FieldError, AddressFields, PasswordField,
} from '../lib/registrationForm'

/** Optional email: valid format only if the user actually typed something. */
const optionalEmail = (v: string) => (v.trim() ? vEmail(v) : '')

export type RegistrationTag = 'community' | 'student' | 'parent' | 'school' | 'teacher' | 'business' | 'sponsor' | 'partner' | 'media' | 'volunteer'

const ECO_TAGS: RegistrationTag[] = ['business', 'sponsor', 'partner', 'media', 'volunteer']

const REGISTRATION_OPTIONS: Array<{ key: RegistrationTag; title: string; detail: string }> = [
  { key: 'community', title: 'Community', detail: 'Join as a general member and supporter.' },
  { key: 'student', title: 'Student', detail: 'Create the challenge participant profile.' },
  { key: 'parent', title: 'Parent', detail: 'Use the QR consent flow to approve participation.' },
  { key: 'school', title: 'School', detail: 'Register the school account and approval workspace.' },
  { key: 'teacher', title: 'Teacher', detail: 'Register the teacher dashboard and tracking view.' },
  { key: 'business', title: 'Business', detail: 'Receive student solutions and hiring opportunities.' },
  { key: 'sponsor', title: 'Sponsor', detail: 'Fund the challenge and track your impact.' },
  { key: 'partner', title: 'Partner', detail: 'Help grow the movement and refer others.' },
  { key: 'media', title: 'Media', detail: 'Access the press kit and request interviews.' },
  { key: 'volunteer', title: 'Volunteer', detail: 'Give your time as a mentor, coach, or speaker.' },
]

// Per-role config for the shared ecosystem registration form.
const ECO_CONFIG: Record<string, { orgLabel: string | null; extras: Array<{ key: string; label: string; type?: 'select'; options?: string[] }> }> = {
  business: { orgLabel: 'Business Name', extras: [{ key: 'category', label: 'Category (e.g. Retail, Food)' }, { key: 'borough', label: 'Borough / County' }] },
  sponsor: { orgLabel: 'Organization Name', extras: [{ key: 'tier', label: 'Sponsorship Tier', type: 'select', options: ['Founding', 'Presenting', 'Supporting', 'Community'] }, { key: 'recognitionLevel', label: 'Recognition Level (e.g. Gold)' }] },
  partner: { orgLabel: 'Organization Name', extras: [{ key: 'partnerType', label: 'Partner Type', type: 'select', options: ['School', 'College / University', 'Chamber of Commerce', 'Bank', 'Community Org', 'Nonprofit', 'Government Agency', 'Technology Company', 'Workforce Development', 'Youth Organization', 'Faith-Based', 'Educational Association'] }] },
  media: { orgLabel: 'Outlet / Publication', extras: [{ key: 'outlet', label: 'Outlet' }, { key: 'beat', label: 'Beat / Coverage Area' }] },
  volunteer: { orgLabel: null, extras: [{ key: 'volunteerType', label: 'How you’d like to help', type: 'select', options: ['Mentor', 'Interview Coach', 'Career Speaker', 'Business Advisor', 'Event Volunteer', 'Award Ceremony Volunteer'] }, { key: 'areas', label: 'Areas of Expertise' }, { key: 'availability', label: 'Availability' }] },
}

type Props = {
  tag: RegistrationTag
  onTagChange: (tag: RegistrationTag) => void
  token?: string
  showCommunity?: boolean
  onSuccess?: () => void
}

/**
 * The challenge registration UI (role switcher + Student/Parent/School/Teacher forms,
 * plus an optional Community signup). Self-contained — fetches its own school/teacher
 * lists and owns all form state — so it can be rendered on the challenge page AND inside
 * the header Register popup. `onSuccess` fires after any successful registration.
 */
export default function ChallengeRegistration({ tag, onTagChange, token, showCommunity = false, onSuccess }: Props) {
  const { refresh, register } = useAuth()

  const [schools, setSchools] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [busy, setBusy] = useState('')
  // Referral: a friend's code from the ?ref= link prefills + attributes the signup.
  const [referralCode] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('ref')?.trim() || '' } catch { return '' }
  })

  const [studentDob, setStudentDob] = useState('')
  const [studentSchoolSearch, setStudentSchoolSearch] = useState('')
  const [studentTeacherId, setStudentTeacherId] = useState('')
  const [studentEduMode, setStudentEduMode] = useState(false)
  const [teacherEduMode, setTeacherEduMode] = useState(false)
  const [teacherSchoolSearch, setTeacherSchoolSearch] = useState('')
  const [parentSchoolSearch, setParentSchoolSearch] = useState('')
  const [parentTeacherId, setParentTeacherId] = useState('')
  const [parentParticipantId, setParentParticipantId] = useState('')
  const [parentVerify, setParentVerify] = useState<{ status: 'idle' | 'checking' | 'ok' | 'fail'; name: string }>({ status: 'idle', name: '' })
  const [parentLink, setParentLink] = useState<any>(null)

  const [studentTermsOk, setStudentTermsOk] = useState(false)
  const [studentTermsSig, setStudentTermsSig] = useState('')
  const [parentTermsOk, setParentTermsOk] = useState(false)
  const [schoolTermsOk, setSchoolTermsOk] = useState(false)
  const [schoolTermsSig, setSchoolTermsSig] = useState('')
  const [teacherTermsOk, setTeacherTermsOk] = useState(false)
  const [teacherTermsSig, setTeacherTermsSig] = useState('')
  const [communityTermsOk, setCommunityTermsOk] = useState(false)

  const [studentErr, setStudentErr] = useState<FieldErrors>({})
  const [parentErr, setParentErr] = useState<FieldErrors>({})
  const [schoolErr, setSchoolErr] = useState<FieldErrors>({})
  const [teacherErr, setTeacherErr] = useState<FieldErrors>({})
  const [communityErr, setCommunityErr] = useState<FieldErrors>({})
  const [ecoTermsOk, setEcoTermsOk] = useState(false)
  const [ecoErr, setEcoErr] = useState<FieldErrors>({})

  const loadOverview = async () => {
    try {
      const data = await api.get<any>('new-school/overview')
      setSchools(Array.isArray(data?.schools) ? data.schools : [])
      setTeachers(Array.isArray(data?.teachers) ? data.teachers : [])
    } catch {
      setSchools([]); setTeachers([])
    }
  }
  useEffect(() => { void loadOverview() }, [])

  // QR consent deep-link: when a token is supplied, preload the linked student.
  const reloadParentLink = async (qrToken: string) => {
    const data = await api.get<any>(`new-school/parent/${qrToken}`)
    setParentLink(data)
    setParentParticipantId(data?.student?.participant_id || '')
    setParentSchoolSearch(data?.school?.school_name || '')
    setParentTeacherId(data?.teacher?.id ? String(data.teacher.id) : '')
    if (data?.student?.full_name) setParentVerify({ status: 'ok', name: data.student.full_name })
  }
  useEffect(() => {
    if (token) reloadParentLink(token).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const approvedSchool = (query: string) =>
    schools.find((school: any) => String(school.school_name || '').toLowerCase() === query.trim().toLowerCase()) || null
  const teachersForSchool = (schoolId?: number | string) =>
    teachers.filter((teacher: any) => Number(teacher.school_id || 0) === Number(schoolId || 0))
  const matchedStudentSchool = approvedSchool(studentSchoolSearch)
  const matchedParentSchool = approvedSchool(parentSchoolSearch)
  const studentSchoolTeachers = matchedStudentSchool ? teachersForSchool(matchedStudentSchool.id) : []
  const parentSchoolTeachers = matchedParentSchool ? teachersForSchool(matchedParentSchool.id) : []

  const fail = (err: unknown, fallback: string) => window.fcToast?.(err instanceof Error ? err.message : fallback)

  // Live input sanitizing + clear-on-edit (same as the challenge page).
  const clearFieldErr = (setter: Dispatch<SetStateAction<FieldErrors>>) =>
    (event: FormEvent<HTMLFormElement>) => {
      const el = event.target as HTMLInputElement
      const name = el?.name
      if (!name) return
      if (
        el.tagName === 'INPUT' &&
        !el.readOnly &&
        name !== 'participant_id' &&
        !['checkbox', 'file', 'date', 'radio'].includes(el.type)
      ) {
        const cleaned = sanitizeField(name, el.value)
        if (cleaned !== el.value) el.value = cleaned
      }
      setter((prev) => {
        if (!prev[name]) return prev
        const next = { ...prev }
        delete next[name]
        return next
      })
    }

  const verifyParentStudent = async (idArg?: string) => {
    const id = (idArg ?? parentParticipantId).trim()
    if (!id) { setParentVerify({ status: 'fail', name: '' }); return }
    setParentVerify({ status: 'checking', name: '' })
    try {
      const data = await api.get<any>(`new-school/student/${encodeURIComponent(id)}`)
      const name = String(data?.student?.full_name || '').trim()
      setParentVerify(name ? { status: 'ok', name } : { status: 'fail', name: '' })
    } catch {
      setParentVerify({ status: 'fail', name: '' })
    }
  }

  const submitCommunity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const errs: FieldErrors = {
      full_name: vMinChars(value(fd, 'full_name'), 3, 'Full name'),
      email: vEmail(value(fd, 'email')),
      password: vPassword(value(fd, 'password')),
      phone_number: vPhone(value(fd, 'phone_number'), false),
    }
    const clean = pruneErrors(errs)
    if (Object.keys(clean).length) { setCommunityErr(clean); focusFirstError(form, clean); return }
    if (!communityTermsOk) { window.fcToast?.('Please accept the terms to continue.'); return }
    setCommunityErr({})
    setBusy('community')
    try {
      const res = await register({
        role: 'community',
        fullName: value(fd, 'full_name'),
        email: value(fd, 'email'),
        password: value(fd, 'password'),
        phoneNumber: value(fd, 'phone_number'),
      })
      window.fcToast?.(res.message || 'Welcome! Your account is ready.')
      form.reset()
      setCommunityErr({})
      setCommunityTermsOk(false)
      await refresh()
      onSuccess?.()
    } catch (err) {
      const mapped = mapRegisterError(err, 'email')
      if (mapped) { setCommunityErr(mapped); focusFirstError(form, mapped) }
      fail(err, 'Registration failed.')
    } finally {
      setBusy('')
    }
  }

  const submitStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const password = value(fd, 'password')
    const confirmPassword = value(fd, 'confirm_password')
    const dob = value(fd, 'date_of_birth')
    const age = Number(ageFromDob(dob))
    const errs: FieldErrors = {
      first_name: vMinChars(value(fd, 'first_name'), 2, 'First name'),
      last_name: vMinChars(value(fd, 'last_name'), 2, 'Last name'),
      student_username: vUsername(value(fd, 'student_username')),
      date_of_birth: !dob ? REQUIRED_MSG : !age ? 'Enter a valid date of birth.' : age < 11 || age > 19 ? 'Student must be between 11 and 19 years old.' : '',
      email: vEmail(value(fd, 'email')),
      password: vPassword(password),
      confirm_password: !confirmPassword ? REQUIRED_MSG : password !== confirmPassword ? 'Passwords do not match.' : '',
      phone_number: vPhone(value(fd, 'phone_number'), false),
      ...validateAddress(fd),
      grade_level: vRequired(value(fd, 'grade_level')),
      parent_name: vMinChars(value(fd, 'parent_name'), 3, 'Parent name'),
      parent_phone: vPhone(value(fd, 'parent_phone')),
      parent_email: optionalEmail(value(fd, 'parent_email')),
      student_acknowledgement: checked(fd, 'student_acknowledgement') ? '' : 'Please confirm the participation acknowledgement.',
    }
    if (studentEduMode) {
      errs.school_name = vMinChars(value(fd, 'school_name'), 2, 'School name')
      errs.edu_school_email = optionalEmail(value(fd, 'edu_school_email'))
      errs.school_website = vUrl(value(fd, 'school_website'), false)
    } else {
      errs.school_name = vRequired(value(fd, 'school_name'), 'Please select your school.')
      if (matchedStudentSchool && studentSchoolTeachers.length > 0) {
        errs.teacher_id = vRequired(value(fd, 'teacher_id'), 'Please select a teacher.')
      }
    }
    const clean = pruneErrors(errs)
    if (Object.keys(clean).length) { setStudentErr(clean); focusFirstError(form, clean); return }
    setStudentErr({})
    setBusy('student')
    try {
      const payload = {
        full_name: `${value(fd, 'first_name')} ${value(fd, 'last_name')}`.trim(),
        first_name: value(fd, 'first_name'),
        last_name: value(fd, 'last_name'),
        student_username: value(fd, 'student_username'),
        referral_code: referralCode || undefined,
        age,
        date_of_birth: dob,
        email: value(fd, 'email'),
        password,
        phone_number: value(fd, 'phone_number'),
        home_address: joinAddress(fd),
        zip_code: value(fd, 'addr_zip'),
        school_id: Number(value(fd, 'school_id') || 0) || undefined,
        school_name: value(fd, 'school_name'),
        teacher_id: Number(value(fd, 'teacher_id') || 0) || undefined,
        register_mode: studentEduMode ? 'trendcatch_edu' : undefined,
        edu_school_email: value(fd, 'edu_school_email'),
        school_website: value(fd, 'school_website'),
        grade_level: value(fd, 'grade_level'),
        parent_name: value(fd, 'parent_name'),
        parent_phone: value(fd, 'parent_phone'),
        parent_email: value(fd, 'parent_email'),
        student_acknowledgement: true,
        terms_signature: studentTermsSig,
        terms_version: CHALLENGE_TERMS_VERSION,
      }
      const res = await api.post<any>('new-school/student/register', payload)
      window.fcToast?.(res.message || 'Student registered.')
      form.reset()
      setStudentSchoolSearch(''); setStudentTeacherId(''); setStudentDob(''); setStudentEduMode(false); setStudentErr({})
      await refresh()
      await loadOverview()
      onSuccess?.()
    } catch (err) {
      const mapped = mapRegisterError(err, 'email')
      if (mapped) { setStudentErr(mapped); focusFirstError(form, mapped) }
      fail(err, 'Student registration failed.')
    } finally {
      setBusy('')
    }
  }

  const submitParent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const governmentId = fileValue(fd, 'government_id_file')
    const errs: FieldErrors = {
      participant_id: !value(fd, 'participant_id').trim()
        ? REQUIRED_MSG
        : parentVerify.status !== 'ok'
          ? 'Verify the student ID above before submitting.'
          : '',
      parent_full_name: vMinChars(value(fd, 'parent_full_name'), 3, 'Parent name'),
      relationship_to_student: vRequired(value(fd, 'relationship_to_student')),
      phone_number: vPhone(value(fd, 'phone_number')),
      email: vEmail(value(fd, 'email')),
      password: vPassword(value(fd, 'password')),
      ...validateAddress(fd),
      digital_signature: vMinChars(value(fd, 'digital_signature'), 3, 'Signature'),
      consent_checked: checked(fd, 'consent_checked') ? '' : 'You must give consent to continue.',
      government_id_file: governmentId && governmentId.size > MAX_DOC_BYTES ? 'Government ID must be 5 MB or smaller.' : '',
    }
    const clean = pruneErrors(errs)
    if (Object.keys(clean).length) { setParentErr(clean); focusFirstError(form, clean); return }
    setParentErr({})
    setBusy('parent')
    try {
      const governmentIdUrl = await uploadIfPresent(governmentId)
      const payload = {
        token: value(fd, 'token') || token || parentLink?.token || '',
        participant_id: value(fd, 'participant_id'),
        parent_full_name: value(fd, 'parent_full_name'),
        relationship_to_student: value(fd, 'relationship_to_student'),
        phone_number: value(fd, 'phone_number'),
        email: value(fd, 'email'),
        home_address: joinAddress(fd),
        zip_code: value(fd, 'addr_zip'),
        password: value(fd, 'password'),
        government_id_url: governmentIdUrl,
        consent_checked: checked(fd, 'consent_checked'),
        digital_signature: value(fd, 'digital_signature'),
        preferred_contact_method: value(fd, 'preferred_contact_method'),
        school_id: Number(value(fd, 'school_id') || 0) || undefined,
        teacher_id: Number(value(fd, 'teacher_id') || 0) || undefined,
      }
      const res = await api.post<any>('new-school/parent/consent', payload)
      window.fcToast?.(res.message || 'Parent consent saved.')
      form.reset()
      setParentParticipantId(''); setParentVerify({ status: 'idle', name: '' }); setParentSchoolSearch(''); setParentTeacherId(''); setParentErr({})
      await refresh()
      await loadOverview()
      onSuccess?.()
    } catch (err) {
      const mapped = mapRegisterError(err, 'email')
      if (mapped) { setParentErr(mapped); focusFirstError(form, mapped) }
      fail(err, 'Parent consent failed.')
    } finally {
      setBusy('')
    }
  }

  const submitSchool = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const errs: FieldErrors = {
      school_name: vMinChars(value(fd, 'school_name'), 3, 'School name'),
      ...validateAddress(fd),
      school_district: vRequired(value(fd, 'school_district')),
      main_phone: vPhone(value(fd, 'main_phone')),
      principal_name: vMinChars(value(fd, 'principal_name'), 3, 'Principal name'),
      administrator_name: vMinChars(value(fd, 'administrator_name'), 3, 'Administrator name'),
      administrator_email: vEmail(value(fd, 'administrator_email')),
      administrator_phone: vPhone(value(fd, 'administrator_phone')),
      school_website: vUrl(value(fd, 'school_website'), false),
      password: vPassword(value(fd, 'password')),
    }
    const clean = pruneErrors(errs)
    if (Object.keys(clean).length) { setSchoolErr(clean); focusFirstError(form, clean); return }
    setSchoolErr({})
    setBusy('school')
    try {
      const payload = {
        school_name: value(fd, 'school_name'),
        school_address: joinAddress(fd),
        zip_code: value(fd, 'addr_zip'),
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
      window.fcToast?.(res.message || 'School registered.')
      form.reset()
      setSchoolErr({})
      await refresh()
      await loadOverview()
      onSuccess?.()
    } catch (err) {
      const mapped = mapRegisterError(err, 'administrator_email')
      if (mapped) { setSchoolErr(mapped); focusFirstError(form, mapped) }
      fail(err, 'School registration failed.')
    } finally {
      setBusy('')
    }
  }

  const submitTeacher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const schoolId = Number(value(fd, 'school_id'))
    const errs: FieldErrors = {
      teacher_full_name: vMinChars(value(fd, 'teacher_full_name'), 3, 'Teacher name'),
      school_email: vEmail(value(fd, 'school_email')),
      phone_number: vPhone(value(fd, 'phone_number')),
      role_department: vRequired(value(fd, 'role_department')),
      grade_level_supported: vRequired(value(fd, 'grade_level_supported')),
      password: vPassword(value(fd, 'password')),
    }
    if (teacherEduMode) {
      errs.school_name = vMinChars(value(fd, 'school_name'), 2, 'School name')
      errs.edu_school_email = vEmail(value(fd, 'edu_school_email'))
      errs.school_website = vUrl(value(fd, 'school_website'), false)
    } else {
      errs.school_name = vRequired(value(fd, 'school_name'), 'Please select your school.')
    }
    const clean = pruneErrors(errs)
    if (Object.keys(clean).length) { setTeacherErr(clean); focusFirstError(form, clean); return }
    setTeacherErr({})
    setBusy('teacher')
    try {
      const payload = {
        teacher_full_name: value(fd, 'teacher_full_name'),
        school_id: schoolId > 0 ? schoolId : undefined,
        school_name: value(fd, 'school_name'),
        register_mode: teacherEduMode ? 'trendcatch_edu' : undefined,
        edu_school_email: value(fd, 'edu_school_email'),
        school_website: value(fd, 'school_website'),
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
      window.fcToast?.(res.message || 'Teacher registered.')
      form.reset()
      setTeacherSchoolSearch(''); setTeacherEduMode(false); setTeacherErr({})
      await refresh()
      await loadOverview()
      onSuccess?.()
    } catch (err) {
      const mapped = mapRegisterError(err, 'school_email')
      if (mapped) { setTeacherErr(mapped); focusFirstError(form, mapped) }
      fail(err, 'Teacher registration failed.')
    } finally {
      setBusy('')
    }
  }

  const submitEcosystem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    const cfg = ECO_CONFIG[tag]
    const errs: FieldErrors = {
      full_name: vMinChars(value(fd, 'full_name'), 3, 'Your name'),
      email: vEmail(value(fd, 'email')),
      password: vPassword(value(fd, 'password')),
      phone_number: vPhone(value(fd, 'phone_number'), false),
      website: value(fd, 'website') ? vUrl(value(fd, 'website')) : '',
    }
    if (cfg?.orgLabel) errs.org_name = vMinChars(value(fd, 'org_name'), 2, cfg.orgLabel)
    const clean = pruneErrors(errs)
    if (Object.keys(clean).length) { setEcoErr(clean); focusFirstError(form, clean); return }
    if (!ecoTermsOk) { window.fcToast?.('Please accept the terms to continue.'); return }
    setEcoErr({})
    setBusy(tag)
    try {
      const res = await register({
        role: tag as RegistrationTag,
        fullName: value(fd, 'full_name'),
        email: value(fd, 'email'),
        password: value(fd, 'password'),
        phoneNumber: value(fd, 'phone_number'),
        orgName: value(fd, 'org_name'),
        website: value(fd, 'website'),
        about: value(fd, 'about'),
        category: value(fd, 'category'),
        borough: value(fd, 'borough'),
        tier: value(fd, 'tier'),
        recognitionLevel: value(fd, 'recognitionLevel'),
        partnerType: value(fd, 'partnerType'),
        outlet: value(fd, 'outlet'),
        beat: value(fd, 'beat'),
        volunteerType: value(fd, 'volunteerType'),
        areas: value(fd, 'areas'),
        availability: value(fd, 'availability'),
      })
      window.fcToast?.(res.message || 'Account submitted for admin approval.')
      form.reset(); setEcoErr({}); setEcoTermsOk(false)
      await refresh()
      onSuccess?.()
    } catch (err) {
      const mapped = mapRegisterError(err, 'email')
      if (mapped) { setEcoErr(mapped); focusFirstError(form, mapped) }
      fail(err, 'Registration failed.')
    } finally {
      setBusy('')
    }
  }

  const options = showCommunity ? REGISTRATION_OPTIONS : REGISTRATION_OPTIONS.filter((o) => o.key !== 'community')
  const ecoCfg = ECO_CONFIG[tag]

  return (
    <>
      <div className="ns-role-switch reveal in" role="tablist" aria-label="Registration user tags">
        {options.map((option) => (
          <button
            key={option.key}
            className={`ns-role-switch__btn ${tag === option.key ? 'is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tag === option.key}
            onClick={() => onTagChange(option.key)}
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
        {showCommunity && (
          <form className="glass ns-form reveal in" id="community-registration" onSubmit={submitCommunity} onChange={clearFieldErr(setCommunityErr)} hidden={tag !== 'community'} noValidate>
            <div className="ns-form__head">
              <span className="eyebrow">Membership</span>
              <h3>Community Member</h3>
              <p>Join as a general member to follow the movement and get updates.</p>
            </div>
            <div className="ns-field-grid">
              <label className="ns-field ns-field--full"><span>Full Name</span><input name="full_name" /><FieldError msg={communityErr.full_name} /></label>
              <label className="ns-field"><span>Email</span><input name="email" type="email" /><FieldError msg={communityErr.email} /></label>
              <label className="ns-field"><span>Phone Number <span className="ns-field-hint">(optional)</span></span><input type="tel" name="phone_number" /><FieldError msg={communityErr.phone_number} /></label>
              <label className="ns-field ns-field--full"><span>Create a Password</span><PasswordField name="password" /><FieldError msg={communityErr.password} /></label>
              <label className="ns-check ns-field--full">
                <input type="checkbox" checked={communityTermsOk} onChange={(e) => setCommunityTermsOk(e.target.checked)} />
                <span>I agree to the Terms &amp; Conditions and Privacy Policy.</span>
              </label>
            </div>
            <button className="btn btn--solid" type="submit" disabled={busy === 'community' || !communityTermsOk}>{busy === 'community' ? 'Saving...' : 'Create Account'}</button>
          </form>
        )}

        <form className="glass ns-form reveal in" id="student-registration" onSubmit={submitStudent} onChange={clearFieldErr(setStudentErr)} hidden={tag !== 'student'} noValidate>
          <div className="ns-form__head">
            <span className="eyebrow">Step 1</span>
            <h3>Student Registration</h3>
            <p>Creates the participant profile and QR code for parent consent.</p>
          </div>
          <div className="ns-field-grid">
            {referralCode && <div className="ns-alert ns-alert--info ns-field--full">You&apos;re joining with a friend&apos;s invite — once your teacher approves you, your friend earns points. 🎉</div>}
            <label className="ns-field"><span>First Name</span><input name="first_name" /><FieldError msg={studentErr.first_name} /></label>
            <label className="ns-field"><span>Last Name</span><input name="last_name" /><FieldError msg={studentErr.last_name} /></label>
            <label className="ns-field"><span>Create a Username <span className="ns-field-hint">(must be unique)</span></span><input name="student_username" autoComplete="off" /><FieldError msg={studentErr.student_username} /></label>
            <label className="ns-field"><span>Date of Birth <span className="ns-field-hint">(MM-DD-YYYY)</span></span><input name="date_of_birth" type="date" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} /><FieldError msg={studentErr.date_of_birth} /></label>
            <label className="ns-field"><span>Age</span><input name="age" type="number" min="11" max="19" value={ageFromDob(studentDob)} readOnly title="Auto-calculated from date of birth" /></label>
            <label className="ns-field"><span>Email</span><input name="email" type="email" /><FieldError msg={studentErr.email} /></label>
            <label className="ns-field"><span>Create a Password</span><PasswordField name="password" /><FieldError msg={studentErr.password} /></label>
            <label className="ns-field"><span>Confirm Password</span><PasswordField name="confirm_password" /><FieldError msg={studentErr.confirm_password} /></label>
            <label className="ns-field"><span>Phone Number <span className="ns-field-hint">(optional)</span></span><input type="tel" name="phone_number" /><FieldError msg={studentErr.phone_number} /></label>
            <AddressFields errs={studentErr} />
            {!studentEduMode ? (
              <>
                <div className="ns-field--full ns-edu-switch ns-edu-switch--top">
                  School not listed?{' '}
                  <button type="button" className="ns-linkbtn" onClick={() => { setStudentEduMode(true); setStudentSchoolSearch(''); setStudentTeacherId('') }}>
                    Register under TrendCatch EDU
                  </button>
                </div>
                <label className="ns-field ns-field--full ns-field--pick">
                  <span>Select School</span>
                  <select
                    name="school_name"
                    value={studentSchoolSearch}
                    onChange={(event) => {
                      if (event.target.value === '__edu__') {
                        setStudentEduMode(true); setStudentSchoolSearch(''); setStudentTeacherId('')
                        return
                      }
                      setStudentSchoolSearch(event.target.value)
                      setStudentTeacherId('')
                    }}
                  >
                    <option value="__edu__" className="ns-edu-option" style={{ color: '#ffdf94', fontWeight: 700, background: '#2a2410' }}>★ School not listed? Register under TrendCatch EDU</option>
                    <option value="">{schools.length ? 'Select your school' : 'No approved schools yet'}</option>
                    {schools.map((school: any) => (
                      <option key={school.id} value={school.school_name}>
                        {school.school_name}{school.school_district ? ` — ${school.school_district}` : ''}
                      </option>
                    ))}
                  </select>
                  <FieldError msg={studentErr.school_name} />
                </label>
                <input type="hidden" name="school_id" value={matchedStudentSchool?.id || ''} readOnly />
                {matchedStudentSchool ? (
                  studentSchoolTeachers.length > 0 ? (
                    <label className="ns-field ns-field--full">
                      <span>Teacher</span>
                      <select name="teacher_id" value={studentTeacherId} onChange={(event) => setStudentTeacherId(event.target.value)}>
                        <option value="">Select a teacher</option>
                        {studentSchoolTeachers.map((teacher: any) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.teacher_full_name} - {teacher.role_department}
                          </option>
                        ))}
                      </select>
                      <FieldError msg={studentErr.teacher_id} />
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
              </>
            ) : (
              <>
                <div className="ns-alert ns-alert--info ns-field--full">
                  <strong>Registering under TrendCatch EDU.</strong> Enter your school's details below — our team reviews it and sets your school up. A teacher is assigned after review.{' '}
                  <button type="button" className="ns-linkbtn" onClick={() => setStudentEduMode(false)}>Pick from the list instead</button>
                </div>
                <label className="ns-field ns-field--full ns-field--edu"><span>School Name</span><input name="school_name" /><FieldError msg={studentErr.school_name} /></label>
                <label className="ns-field ns-field--edu"><span>School / Principal Email <span className="ns-field-hint">(optional)</span></span><input name="edu_school_email" type="email" /><FieldError msg={studentErr.edu_school_email} /></label>
                <label className="ns-field ns-field--edu"><span>School Website</span><input name="school_website" type="url" placeholder="https://" /><FieldError msg={studentErr.school_website} /></label>
              </>
            )}
            <label className="ns-field"><span>Grade Level</span><input name="grade_level" placeholder="9th Grade" /><FieldError msg={studentErr.grade_level} /></label>
            <label className="ns-field"><span>Parent Name</span><input name="parent_name" /><FieldError msg={studentErr.parent_name} /></label>
            <label className="ns-field"><span>Parent Phone</span><input type="tel" name="parent_phone" /><FieldError msg={studentErr.parent_phone} /></label>
            <label className="ns-field ns-field--full"><span>Parent Email <span className="ns-field-hint">(optional)</span></span><input name="parent_email" type="email" /><FieldError msg={studentErr.parent_email} /></label>
            <label className="ns-check ns-field--full">
              <input name="student_acknowledgement" type="checkbox" />
              <span>I confirm this student is between 11 and 19 and understands parent consent is required before submission.</span>
            </label>
            <FieldError msg={studentErr.student_acknowledgement} full />
          </div>
          <TermsAgreement kind="student" idPrefix="ns-student" signatureName={studentTermsSig} onSignatureChange={setStudentTermsSig} onAcceptedChange={setStudentTermsOk} />
          <button
            className="btn btn--solid"
            type="submit"
            disabled={busy === 'student' || !studentTermsOk || (!studentEduMode && (!matchedStudentSchool || studentSchoolTeachers.length === 0))}
          >
            {busy === 'student' ? 'Saving...' : 'Create Student Profile'}
          </button>
        </form>

        <form className="glass ns-form reveal in" id="parent-consent" onSubmit={submitParent} onChange={clearFieldErr(setParentErr)} hidden={tag !== 'parent'} noValidate>
          <div className="ns-form__head">
            <span className="eyebrow">Step 2</span>
            <h3>Parent Consent via Student ID</h3>
            <p>Parent can use the 8-digit student ID or the QR link, then select the approved school teacher for review.</p>
          </div>
          <div className="ns-field-grid">
            <label className="ns-field ns-field--full">
              <span>Student Unique Platform ID</span>
              <div className="ns-verify-row">
                <input
                  name="participant_id"
                  inputMode="numeric"
                  maxLength={8}
                  value={parentParticipantId}
                  onChange={(event) => {
                    const next = event.target.value.replace(/\D/g, '').slice(0, 8)
                    setParentParticipantId(next)
                    if (/^\d{8}$/.test(next)) void verifyParentStudent(next)
                    else setParentVerify({ status: 'idle', name: '' })
                  }}
                  placeholder="Enter the 8-digit student ID"
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => void verifyParentStudent()}
                  disabled={parentVerify.status === 'checking' || !parentParticipantId.trim()}
                >
                  {parentVerify.status === 'checking' ? 'Checking…' : parentVerify.status === 'ok' ? 'Verified ✓' : 'Verify'}
                </button>
              </div>
              {parentVerify.status === 'ok' && <span className="ns-verify-msg ns-verify-msg--ok">✓ Student confirmed: <strong>{parentVerify.name}</strong></span>}
              {parentVerify.status === 'fail' && <span className="ns-verify-msg ns-verify-msg--fail">No student found with that ID. Check the number and try again.</span>}
              {(parentVerify.status === 'idle' || parentVerify.status === 'checking') && <span className="ns-verify-msg">Type the 8-digit ID — it verifies automatically, or tap <strong>Verify</strong>.</span>}
              <FieldError msg={parentErr.participant_id} />
            </label>
            <label className="ns-field ns-field--full">
              <span>QR Token (Optional)</span>
              <input name="token" defaultValue={token || parentLink?.token || ''} placeholder="Use this if you opened the QR link" />
            </label>
            <label className="ns-field"><span>Parent Name</span><input name="parent_full_name" /><FieldError msg={parentErr.parent_full_name} /></label>
            <label className="ns-field"><span>Relationship</span><input name="relationship_to_student" placeholder="Mother, Father, Guardian…" /><FieldError msg={parentErr.relationship_to_student} /></label>
            <label className="ns-field"><span>Phone Number</span><input type="tel" name="phone_number" /><FieldError msg={parentErr.phone_number} /></label>
            <label className="ns-field"><span>Email</span><input name="email" type="email" /><FieldError msg={parentErr.email} /></label>
            <label className="ns-field"><span>Create a Password</span><PasswordField name="password" /><FieldError msg={parentErr.password} /></label>
            <label className="ns-field"><span>Preferred Contact Method</span>
              <select name="preferred_contact_method" defaultValue="phone">
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="text">Text</option>
              </select>
            </label>
            <AddressFields errs={parentErr} />
            <label className="ns-field ns-field--full">
              <span>Select School</span>
              <select
                name="school_name"
                value={parentSchoolSearch}
                onChange={(event) => { setParentSchoolSearch(event.target.value); setParentTeacherId('') }}
              >
                <option value="">{schools.length ? "Select the student's school" : 'No approved schools yet'}</option>
                {schools.map((school: any) => (
                  <option key={school.id} value={school.school_name}>
                    {school.school_name}{school.school_district ? ` — ${school.school_district}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="school_id" value={matchedParentSchool?.id || ''} readOnly />
            {matchedParentSchool ? (
              parentSchoolTeachers.length > 0 ? (
                <label className="ns-field ns-field--full">
                  <span>Teacher</span>
                  <select name="teacher_id" value={parentTeacherId} onChange={(event) => setParentTeacherId(event.target.value)}>
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
              <span>Government ID Upload <span className="ns-field-hint">(optional, max 5 MB)</span></span>
              <input name="government_id_file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" />
              <FieldError msg={parentErr.government_id_file} />
            </label>
            <label className="ns-field ns-field--full">
              <span>Type your full name</span>
              <input name="digital_signature" placeholder="Your full name" />
              <FieldError msg={parentErr.digital_signature} />
            </label>
            <label className="ns-check ns-field--full">
              <input name="consent_checked" type="checkbox" />
              <span>I confirm I am the parent or legal guardian and give permission for participation.</span>
            </label>
            <FieldError msg={parentErr.consent_checked} full />
          </div>
          <TermsAgreement kind="parent" idPrefix="ns-parent" hideSignature signatureName="" onSignatureChange={() => {}} onAcceptedChange={setParentTermsOk} />
          {parentVerify.status !== 'ok' && <p className="ns-check-hint">Verify the student’s unique ID above before you can submit consent.</p>}
          <button className="btn btn--solid" type="submit" disabled={busy === 'parent' || !parentTermsOk || parentVerify.status !== 'ok'}>{busy === 'parent' ? 'Saving...' : 'Approve Consent'}</button>
        </form>

        <form className="glass ns-form reveal in" id="school-registration" onSubmit={submitSchool} onChange={clearFieldErr(setSchoolErr)} hidden={tag !== 'school'} noValidate>
          <div className="ns-form__head">
            <span className="eyebrow">Step 3</span>
            <h3>School Registration</h3>
            <p>Creates the school account and approval workspace.</p>
          </div>
          <div className="ns-field-grid">
            <label className="ns-field ns-field--full"><span>School Name</span><input name="school_name" /><FieldError msg={schoolErr.school_name} /></label>
            <AddressFields errs={schoolErr} title="School Address" />
            <label className="ns-field"><span>School District</span><input name="school_district" /><FieldError msg={schoolErr.school_district} /></label>
            <label className="ns-field"><span>School Type</span>
              <select name="school_type" defaultValue="public">
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="charter">Charter</option>
                <option value="magnet">Magnet</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="ns-field"><span>Main Phone</span><input type="tel" name="main_phone" /><FieldError msg={schoolErr.main_phone} /></label>
            <label className="ns-field"><span>Principal Name</span><input name="principal_name" /><FieldError msg={schoolErr.principal_name} /></label>
            <label className="ns-field"><span>Administrator Name</span><input name="administrator_name" /><FieldError msg={schoolErr.administrator_name} /></label>
            <label className="ns-field"><span>Administrator Email</span><input name="administrator_email" type="email" /><FieldError msg={schoolErr.administrator_email} /></label>
            <label className="ns-field"><span>Administrator Phone</span><input type="tel" name="administrator_phone" /><FieldError msg={schoolErr.administrator_phone} /></label>
            <label className="ns-field ns-field--full"><span>School Website <span className="ns-field-hint">(optional)</span></span><input name="school_website" type="url" placeholder="https://example.edu" /><FieldError msg={schoolErr.school_website} /></label>
            <label className="ns-field ns-field--full"><span>Create a Password</span><PasswordField name="password" /><FieldError msg={schoolErr.password} /></label>
          </div>
          <TermsAgreement kind="school" idPrefix="ns-school" signatureName={schoolTermsSig} onSignatureChange={setSchoolTermsSig} onAcceptedChange={setSchoolTermsOk} />
          <button className="btn btn--solid" type="submit" disabled={busy === 'school' || !schoolTermsOk}>{busy === 'school' ? 'Saving...' : 'Register School'}</button>
        </form>

        <form className="glass ns-form reveal in" id="teacher-registration" onSubmit={submitTeacher} onChange={clearFieldErr(setTeacherErr)} hidden={tag !== 'teacher'} noValidate>
          <div className="ns-form__head">
            <span className="eyebrow">Step 4</span>
            <h3>Teacher Registration</h3>
            <p>Links a teacher to a school for tracking, approval, and leaderboard scoring.</p>
          </div>
          <div className="ns-field-grid">
            <label className="ns-field ns-field--full"><span>Teacher Full Name</span><input name="teacher_full_name" /><FieldError msg={teacherErr.teacher_full_name} /></label>
            {!teacherEduMode ? (
              <>
                <div className="ns-field--full ns-edu-switch ns-edu-switch--top">
                  School not listed?{' '}
                  <button type="button" className="ns-linkbtn" onClick={() => { setTeacherEduMode(true); setTeacherSchoolSearch('') }}>
                    Register under TrendCatch EDU
                  </button>
                </div>
                <label className="ns-field ns-field--full ns-field--pick">
                  <span>Select School</span>
                  <select
                    name="school_name"
                    value={teacherSchoolSearch}
                    onChange={(event) => {
                      if (event.target.value === '__edu__') { setTeacherEduMode(true); setTeacherSchoolSearch(''); return }
                      setTeacherSchoolSearch(event.target.value)
                    }}
                  >
                    <option value="__edu__" className="ns-edu-option" style={{ color: '#ffdf94', fontWeight: 700, background: '#2a2410' }}>★ School not listed? Register under TrendCatch EDU</option>
                    <option value="">{schools.length ? 'Select your school' : 'No approved schools yet'}</option>
                    {schools.map((school: any) => (
                      <option key={school.id} value={school.school_name}>
                        {school.school_name}{school.school_district ? ` — ${school.school_district}` : ''}
                      </option>
                    ))}
                  </select>
                  <FieldError msg={teacherErr.school_name} />
                </label>
                <input type="hidden" name="school_id" value={approvedSchool(teacherSchoolSearch)?.id || ''} readOnly />
              </>
            ) : (
              <>
                <div className="ns-alert ns-alert--info ns-field--full">
                  <strong>Registering under TrendCatch EDU.</strong> Enter your school's details — our team reviews it and sets your school up.{' '}
                  <button type="button" className="ns-linkbtn" onClick={() => setTeacherEduMode(false)}>Pick from the list instead</button>
                </div>
                <label className="ns-field ns-field--full ns-field--edu"><span>School Name</span><input name="school_name" /><FieldError msg={teacherErr.school_name} /></label>
                <label className="ns-field ns-field--edu"><span>School / Principal Email</span><input name="edu_school_email" type="email" /><FieldError msg={teacherErr.edu_school_email} /></label>
                <label className="ns-field ns-field--full ns-field--edu"><span>School Website</span><input name="school_website" type="url" placeholder="https://" /><FieldError msg={teacherErr.school_website} /></label>
              </>
            )}
            <label className="ns-field"><span>School Email</span><input name="school_email" type="email" /><FieldError msg={teacherErr.school_email} /></label>
            <label className="ns-field"><span>Phone Number</span><input type="tel" name="phone_number" /><FieldError msg={teacherErr.phone_number} /></label>
            <label className="ns-field"><span>Role / Department</span><input name="role_department" /><FieldError msg={teacherErr.role_department} /></label>
            <label className="ns-field"><span>Grade Level Supported</span><input name="grade_level_supported" /><FieldError msg={teacherErr.grade_level_supported} /></label>
            <label className="ns-field"><span>Teacher Tag</span>
              <select name="teacher_tag" defaultValue="teacher">
                <option value="teacher">Teacher</option>
                <option value="coach">Coach</option>
                <option value="counselor">Counselor</option>
                <option value="advisor">Advisor</option>
                <option value="administrator">Administrator</option>
              </select>
            </label>
            <label className="ns-field ns-field--full"><span>Employee ID <span className="ns-field-hint">(optional)</span></span><input name="employee_id" placeholder="Optional staff identifier" /></label>
            <label className="ns-field ns-field--full"><span>Create a Password</span><PasswordField name="password" /><FieldError msg={teacherErr.password} /></label>
          </div>
          <TermsAgreement kind="teacher" idPrefix="ns-teacher" signatureName={teacherTermsSig} onSignatureChange={setTeacherTermsSig} onAcceptedChange={setTeacherTermsOk} />
          <button className="btn btn--solid" type="submit" disabled={busy === 'teacher' || !teacherTermsOk || (!teacherEduMode && !approvedSchool(teacherSchoolSearch))}>
            {busy === 'teacher' ? 'Saving...' : 'Register Teacher'}
          </button>
        </form>

        <form className="glass ns-form reveal in" id="ecosystem-registration" onSubmit={submitEcosystem} onChange={clearFieldErr(setEcoErr)} hidden={!ECO_TAGS.includes(tag)} noValidate>
          <div className="ns-form__head">
            <span className="eyebrow">{REGISTRATION_OPTIONS.find((o) => o.key === tag)?.title} account</span>
            <h3>{REGISTRATION_OPTIONS.find((o) => o.key === tag)?.title} Registration</h3>
            <p>{REGISTRATION_OPTIONS.find((o) => o.key === tag)?.detail}</p>
          </div>
          <div className="ns-field-grid">
            {ecoCfg?.orgLabel && (
              <label className="ns-field ns-field--full"><span>{ecoCfg.orgLabel}</span><input name="org_name" /><FieldError msg={ecoErr.org_name} /></label>
            )}
            {(ecoCfg?.extras ?? []).map((x) => (
              <label className="ns-field" key={x.key}><span>{x.label}</span>
                {x.type === 'select'
                  ? <select name={x.key} defaultValue=""><option value="">Select…</option>{(x.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  : <input name={x.key} />}
              </label>
            ))}
            <label className="ns-field ns-field--full"><span>Your Name (Contact)</span><input name="full_name" /><FieldError msg={ecoErr.full_name} /></label>
            <label className="ns-field"><span>Email</span><input name="email" type="email" /><FieldError msg={ecoErr.email} /></label>
            <label className="ns-field"><span>Phone <span className="ns-field-hint">(optional)</span></span><input name="phone_number" type="tel" /><FieldError msg={ecoErr.phone_number} /></label>
            <label className="ns-field"><span>Website <span className="ns-field-hint">(optional)</span></span><input name="website" placeholder="https://…" /><FieldError msg={ecoErr.website} /></label>
            <label className="ns-field"><span>Create a Password</span><PasswordField name="password" /><FieldError msg={ecoErr.password} /></label>
            <label className="ns-field ns-field--full"><span>About <span className="ns-field-hint">(optional)</span></span><textarea name="about" rows={2} /></label>
            <label className="ns-check ns-field--full">
              <input type="checkbox" checked={ecoTermsOk} onChange={(e) => setEcoTermsOk(e.target.checked)} />
              <span>I agree to the Terms &amp; Conditions and Privacy Policy, and confirm I represent this organization.</span>
            </label>
          </div>
          <button className="btn btn--solid" type="submit" disabled={busy === tag || !ecoTermsOk}>{busy === tag ? 'Submitting…' : 'Create Account'}</button>
          <p className="ns-registration-note">New accounts are reviewed by an admin before your dashboard unlocks.</p>
        </form>
      </div>
    </>
  )
}
