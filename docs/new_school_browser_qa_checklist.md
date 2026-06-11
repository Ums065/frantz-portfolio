# New School Browser QA Checklist

Use this checklist after seeding demo data with:

```bash
cd frontend
npm run seed:new-school
```

## 1. Public Challenge Pages

- Open `/new-school`.
- Confirm the hero section shows:
  - `New School Functionality`
  - scholarship pool
  - register buttons
- Confirm the overview blocks render:
  - workflow
  - rules
  - prizes
  - leaderboards
- Confirm the page loads without console errors on desktop and mobile widths.

## 2. Student Registration

- Register a new student with age 14 to 19.
- Confirm the participant ID is generated.
- Confirm the QR consent preview renders locally.
- Confirm the student status tracker shows the expected steps.
- Confirm the dashboard blocks appear after registration.

## 3. Parent Consent Flow

- Open the QR parent link from the student card.
- Confirm the parent consent page opens correctly.
- Submit the parent consent form.
- Confirm the student status updates to parent consent approved.
- Confirm the parent dashboard shows the child profile and notification feed.

## 4. School Flow

- Register a school account.
- Confirm the school dashboard shows:
  - registered students
  - pending approvals
  - approved students
  - submissions
  - winners from the school
- Approve a student from the school dashboard.
- Confirm the school approval timestamp and notes save correctly.

## 5. Teacher Flow

- Register a teacher under the school.
- Confirm the teacher dashboard shows:
  - student tracking
  - business interview tracking
  - project submission tracking
  - community impact score
  - leaderboards
  - award section
  - reports
  - notifications
- Approve the student from the teacher dashboard.

## 6. Business Interviews

- Add business interviews for the same student.
- Confirm the dashboard counts increase.
- Confirm final submission stays locked until all 10 interviews are entered.
- Confirm the interview table shows business name, owner, category, and visit date.

## 7. Final Submission

- Enter the final problem, solution, and impact fields.
- Upload a video and written summary if available.
- Confirm submission unlocks only after:
  - parent consent
  - school approval
  - teacher approval
  - 10 business interviews
- Confirm the final submission appears in the dashboards and admin review list.

## 8. Admin Review

- Open the admin dashboard.
- Confirm the summary counters render.
- Confirm the approval tables and business interview tables render.
- Confirm notification cards render.
- Approve or reject a submission.
- Publish winners and confirm the winners section updates.

## 9. Notifications

- Confirm unread badges show up where expected.
- Mark at least one notification as read.
- Refresh the page and confirm the unread state clears.

## 10. Responsive QA

- Check the layout at:
  - desktop width
  - tablet width
  - mobile width
- Confirm tables, cards, QR previews, and forms remain usable.

## Pass Criteria

- No console errors.
- No broken links in the main challenge flow.
- No blocked submission unless the required approvals and 10 interviews are complete.
- Demo dashboards show data for student, parent, school, teacher, and admin views.
