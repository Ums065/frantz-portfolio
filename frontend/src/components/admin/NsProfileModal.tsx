import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NsRecordBody, type ScholarshipAnswerView } from '../NsRecordDetail'

export type StudentProfile = {
  student: Record<string, any>
  interviews: any[]
  project: Record<string, any> | null
  scholarship: ScholarshipAnswerView[]
}
export type TeacherProfile = {
  teacher: Record<string, any>
  students: any[]
}
export type ProfileView =
  | { kind: 'student'; data: StudentProfile }
  | { kind: 'teacher'; data: TeacherProfile }

type Props = {
  open: boolean
  onClose: () => void
  view: ProfileView | null
  onOpenStudent?: (studentId: number) => void
}

const has = (v: any) => v !== null && v !== undefined && String(v).trim() !== ''
const Fact = ({ label, value }: { label: string; value: any }) =>
  has(value) ? (
    <div className="ns-detail__fact"><span>{label}</span><strong>{String(value)}</strong></div>
  ) : null

export default function NsProfileModal({ open, onClose, view, onOpenStudent }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !view) return null

  return createPortal(
    <div className="ns-detail__overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ns-detail glass ns-detail--profile" onClick={(e) => e.stopPropagation()}>
        {view.kind === 'student' ? (
          <StudentBody data={view.data} onClose={onClose} />
        ) : (
          <TeacherBody data={view.data} onClose={onClose} onOpenStudent={onOpenStudent} />
        )}
      </div>
    </div>,
    document.body
  )
}

function StudentBody({ data, onClose }: { data: StudentProfile; onClose: () => void }) {
  const s = data.student
  const score = s.submission_score ?? data.project?.score
  const rank = s.rank_position
  return (
    <>
      <header className="ns-detail__head">
        <div>
          <span className="eyebrow">Student profile</span>
          <h3>{s.full_name || s.user_full_name || 'Student'}</h3>
          <p className="ns-detail__sub">
            {s.participant_id ? `ID ${s.participant_id}` : ''}
            {s.school_name ? ` · ${s.school_name}` : ''}
            {s.grade_level ? ` · Grade ${s.grade_level}` : ''}
          </p>
        </div>
        <button type="button" className="ns-detail__close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="ns-detail__body">
        <section className="ns-detail__section">
          <h4>Progress &amp; grade</h4>
          <div className="ns-detail__facts">
            <Fact label="Points" value={s.final_score ?? s.student_points ?? 0} />
            <Fact label="Rank" value={rank ? `#${rank}` : '—'} />
            <Fact label="Interviews" value={`${s.interview_count ?? 0} / 10`} />
            <Fact label="Submission" value={s.submission_status} />
            <Fact label="Grade / Score" value={has(score) ? score : '—'} />
            <Fact label="Parent approval" value={s.parent_consent_status} />
            <Fact label="Teacher approval" value={s.teacher_approval_status} />
          </div>
        </section>

        <section className="ns-detail__section">
          <h4>Personal information</h4>
          <div className="ns-detail__facts">
            <Fact label="Email" value={s.email || s.user_email} />
            <Fact label="Phone" value={s.phone_number} />
            <Fact label="Grade level" value={s.grade_level} />
            <Fact label="Age" value={s.age} />
            <Fact label="Date of birth" value={s.date_of_birth} />
            <Fact label="Home address" value={s.home_address} />
            <Fact label="Parent / Guardian" value={s.parent_name} />
            <Fact label="Parent phone" value={s.parent_phone} />
            <Fact label="Parent email" value={s.parent_email} />
          </div>
        </section>

        {data.scholarship.length > 0 && (
          <section className="ns-detail__section ns-detail__section--scholar">
            <h4>Scholarship answers</h4>
            {data.scholarship.map((qa, i) => (
              <div key={qa.key || i} className="ns-detail__qa">
                <strong>{qa.question}</strong>
                <p className="ns-detail__text">{qa.answer}</p>
              </div>
            ))}
          </section>
        )}

        <section className="ns-detail__section">
          <h4>Business interviews ({data.interviews.length})</h4>
          {data.interviews.length === 0 && <p className="ns-detail__text">No interviews logged yet.</p>}
          {data.interviews.map((iv) => (
            <div key={iv.id} className="ns-profile__record">
              <strong className="ns-profile__record-title">Visit {iv.visit_number ?? '—'} · {iv.business_name || 'Business'}</strong>
              <NsRecordBody kind="interview" record={iv} />
            </div>
          ))}
        </section>

        <section className="ns-detail__section">
          <h4>Final project</h4>
          {data.project ? (
            <div className="ns-profile__record">
              <NsRecordBody kind="project" record={data.project} />
            </div>
          ) : (
            <p className="ns-detail__text">No project submitted yet.</p>
          )}
        </section>
      </div>
    </>
  )
}

function TeacherBody({ data, onClose, onOpenStudent }: { data: TeacherProfile; onClose: () => void; onOpenStudent?: (id: number) => void }) {
  const t = data.teacher
  return (
    <>
      <header className="ns-detail__head">
        <div>
          <span className="eyebrow">Teacher profile</span>
          <h3>{t.teacher_full_name || 'Teacher'}</h3>
          <p className="ns-detail__sub">
            {t.linked_school_name ? t.linked_school_name : ''}
            {t.role_department ? ` · ${t.role_department}` : ''}
            {t.status ? ` · ${t.status}` : ''}
          </p>
        </div>
        <button type="button" className="ns-detail__close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="ns-detail__body">
        <section className="ns-detail__section">
          <h4>Performance</h4>
          <div className="ns-detail__facts">
            <Fact label="Points" value={t.teacher_points ?? 0} />
            <Fact label="Rank" value={t.rank_position ? `#${t.rank_position}` : '—'} />
            <Fact label="Students" value={t.students_total ?? data.students.length} />
            <Fact label="Approved students" value={t.teacher_approved} />
            <Fact label="Submissions" value={t.submissions} />
            <Fact label="Top student" value={t.top_student_name} />
          </div>
        </section>

        <section className="ns-detail__section">
          <h4>Contact</h4>
          <div className="ns-detail__facts">
            <Fact label="Email" value={t.school_email} />
            <Fact label="Phone" value={t.phone_number} />
            <Fact label="Grades supported" value={t.grade_level_supported} />
          </div>
        </section>

        <section className="ns-detail__section">
          <h4>Class roster ({data.students.length})</h4>
          {data.students.length === 0 && <p className="ns-detail__text">No students assigned yet.</p>}
          <div className="ns-profile__roster">
            {data.students.map((st) => (
              <button
                key={st.id}
                type="button"
                className="ns-profile__rosteritem"
                onClick={() => onOpenStudent?.(Number(st.id))}
              >
                <span className="ns-profile__rosterrank">#{st.rank_position ?? '—'}</span>
                <span className="ns-profile__rostername">{st.full_name}</span>
                <span className="ns-profile__rostermeta">{st.final_score ?? st.student_points ?? 0} pts · {st.interview_count ?? 0}/10</span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
