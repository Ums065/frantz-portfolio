-- ============================================================
-- FrantzCoutard.com - demo data for new-school testing
-- Password for all demo accounts: DemoPass123!
-- Run after db/update.sql (or the base schema plus the migration).
-- ============================================================

USE frantz_portfolio;

START TRANSACTION;

SET @demo_now = '2026-06-16 12:00:00';
SET @demo_password_hash = '$2y$10$y88TsOcEgsGNmuJGwUjtce7.jip.8DDX7.vrFb4pwQdNpWzFfeKi6';

DELETE FROM users
WHERE email IN (
  'newschool.admin@frantzcoutard.test',
  'newschool.school@frantzcoutard.test',
  'newschool.teacher@frantzcoutard.test',
  'newschool.teacher2@frantzcoutard.test',
  'newschool.student.alpha@frantzcoutard.test',
  'newschool.student.beta@frantzcoutard.test',
  'newschool.student.gamma@frantzcoutard.test',
  'newschool.parent.alpha@frantzcoutard.test',
  'newschool.parent.beta@frantzcoutard.test',
  'newschool.parent.gamma@frantzcoutard.test'
);

INSERT INTO users (
  full_name, email, password_hash, role, email_verified_at, approval_status,
  approval_note, approval_reviewed_by_user_id, approval_reviewed_at,
  email_verification_otp_hash, email_verification_otp_expires_at,
  email_verification_otp_sent_at, email_verification_otp_attempts
) VALUES (
  'New School Admin',
  'newschool.admin@frantzcoutard.test',
  @demo_password_hash,
  'admin',
  @demo_now,
  'approved',
  NULL,
  NULL,
  @demo_now,
  NULL,
  NULL,
  NULL,
  0
);

SET @admin_user_id = LAST_INSERT_ID();

INSERT INTO users (
  full_name, email, password_hash, role, email_verified_at, approval_status,
  approval_note, approval_reviewed_by_user_id, approval_reviewed_at,
  email_verification_otp_hash, email_verification_otp_expires_at,
  email_verification_otp_sent_at, email_verification_otp_attempts
) VALUES
  (
    'Dr. Elena Morris',
    'newschool.school@frantzcoutard.test',
    @demo_password_hash,
    'school',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Coach Rivera',
    'newschool.teacher@frantzcoutard.test',
    @demo_password_hash,
    'teacher',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Ms. Taylor',
    'newschool.teacher2@frantzcoutard.test',
    @demo_password_hash,
    'teacher',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Ariana Carter',
    'newschool.student.alpha@frantzcoutard.test',
    @demo_password_hash,
    'student',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Jayden Brooks',
    'newschool.student.beta@frantzcoutard.test',
    @demo_password_hash,
    'student',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Maya Patel',
    'newschool.student.gamma@frantzcoutard.test',
    @demo_password_hash,
    'student',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Monica Carter',
    'newschool.parent.alpha@frantzcoutard.test',
    @demo_password_hash,
    'parent',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Darnell Brooks',
    'newschool.parent.beta@frantzcoutard.test',
    @demo_password_hash,
    'parent',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  ),
  (
    'Priya Patel',
    'newschool.parent.gamma@frantzcoutard.test',
    @demo_password_hash,
    'parent',
    @demo_now,
    'approved',
    NULL,
    @admin_user_id,
    @demo_now,
    NULL,
    NULL,
    NULL,
    0
  );

SELECT id INTO @school_user_id FROM users WHERE email = 'newschool.school@frantzcoutard.test' LIMIT 1;
SELECT id INTO @teacher_user_id FROM users WHERE email = 'newschool.teacher@frantzcoutard.test' LIMIT 1;
SELECT id INTO @teacher2_user_id FROM users WHERE email = 'newschool.teacher2@frantzcoutard.test' LIMIT 1;
SELECT id INTO @student1_user_id FROM users WHERE email = 'newschool.student.alpha@frantzcoutard.test' LIMIT 1;
SELECT id INTO @student2_user_id FROM users WHERE email = 'newschool.student.beta@frantzcoutard.test' LIMIT 1;
SELECT id INTO @student3_user_id FROM users WHERE email = 'newschool.student.gamma@frantzcoutard.test' LIMIT 1;
SELECT id INTO @parent1_user_id FROM users WHERE email = 'newschool.parent.alpha@frantzcoutard.test' LIMIT 1;
SELECT id INTO @parent2_user_id FROM users WHERE email = 'newschool.parent.beta@frantzcoutard.test' LIMIT 1;
SELECT id INTO @parent3_user_id FROM users WHERE email = 'newschool.parent.gamma@frantzcoutard.test' LIMIT 1;

INSERT INTO new_school_schools (
  user_id, school_name, school_address, school_district, main_phone,
  principal_name, administrator_name, administrator_email, administrator_phone, status
) VALUES (
  @school_user_id,
  'New School Academy',
  '100 Innovation Way, Newark, NJ 07102',
  'Newark Public Schools',
  '555-1000',
  'Dr. Elena Morris',
  'New School Academy Admin',
  'newschool.school@frantzcoutard.test',
  '555-1001',
  'approved'
);

SET @school_id = LAST_INSERT_ID();

INSERT INTO new_school_teachers (
  user_id, school_id, teacher_full_name, school_email, phone_number,
  role_department, grade_level_supported, status
) VALUES
  (
    @teacher_user_id,
    @school_id,
    'Coach Rivera',
    'newschool.teacher@frantzcoutard.test',
    '555-2000',
    'Business & Career Readiness',
    '9-12',
    'approved'
  ),
  (
    @teacher2_user_id,
    @school_id,
    'Ms. Taylor',
    'newschool.teacher2@frantzcoutard.test',
    '555-2001',
    'STEM Innovation',
    '6-8',
    'approved'
  );

SET @teacher_id = (SELECT id FROM new_school_teachers WHERE user_id = @teacher_user_id LIMIT 1);
SET @teacher2_id = (SELECT id FROM new_school_teachers WHERE user_id = @teacher2_user_id LIMIT 1);

INSERT INTO new_school_students (
  user_id, school_id, teacher_id, participant_id, qr_token, qr_url,
  full_name, student_username, age, date_of_birth, email, phone_number,
  home_address, school_name, grade_level, parent_name, parent_phone, parent_email,
  parent_consent_status, school_approval_status, teacher_approval_status,
  submission_status, overall_status
) VALUES
  (
    @student1_user_id,
    @school_id,
    @teacher_id,
    '10000001',
    'demo-ariana-001',
    '/new-school/parent/demo-ariana-001',
    'Ariana Carter',
    'ariana_carter_demo',
    16,
    '2009-03-14',
    'newschool.student.alpha@frantzcoutard.test',
    '555-3001',
    '101 Cedar Street, Newark, NJ',
    'New School Academy',
    '10',
    'Monica Carter',
    '555-4001',
    'newschool.parent.alpha@frantzcoutard.test',
    'approved',
    'approved',
    'approved',
    'complete',
    'submission_complete'
  ),
  (
    @student2_user_id,
    @school_id,
    @teacher_id,
    '10000002',
    'demo-jayden-002',
    '/new-school/parent/demo-jayden-002',
    'Jayden Brooks',
    'jayden_brooks_demo',
    15,
    '2010-07-22',
    'newschool.student.beta@frantzcoutard.test',
    '555-3002',
    '202 Birch Avenue, Newark, NJ',
    'New School Academy',
    '9',
    'Darnell Brooks',
    '555-4002',
    'newschool.parent.beta@frantzcoutard.test',
    'approved',
    'approved',
    'approved',
    'eligible',
    'eligible_to_submit'
  ),
  (
    @student3_user_id,
    @school_id,
    @teacher_id,
    '10000003',
    'demo-maya-003',
    '/new-school/parent/demo-maya-003',
    'Maya Patel',
    'maya_patel_demo',
    14,
    '2011-11-05',
    'newschool.student.gamma@frantzcoutard.test',
    '555-3003',
    '303 Maple Lane, Newark, NJ',
    'New School Academy',
    '8',
    'Priya Patel',
    '555-4003',
    'newschool.parent.gamma@frantzcoutard.test',
    'pending',
    'pending',
    'pending',
    'locked',
    'parent_consent_pending'
  );

SET @student1_id = (SELECT id FROM new_school_students WHERE user_id = @student1_user_id LIMIT 1);
SET @student2_id = (SELECT id FROM new_school_students WHERE user_id = @student2_user_id LIMIT 1);
SET @student3_id = (SELECT id FROM new_school_students WHERE user_id = @student3_user_id LIMIT 1);

INSERT INTO new_school_parents (
  user_id, student_id, parent_full_name, relationship_to_student, phone_number, email,
  home_address, government_id_url, consent_checked, digital_signature, approved_at, consented_at
) VALUES
  (
    @parent1_user_id,
    @student1_id,
    'Monica Carter',
    'Mother',
    '555-4001',
    'newschool.parent.alpha@frantzcoutard.test',
    '101 Cedar Street, Newark, NJ',
    NULL,
    1,
    'Monica Carter',
    @demo_now,
    @demo_now
  ),
  (
    @parent2_user_id,
    @student2_id,
    'Darnell Brooks',
    'Father',
    '555-4002',
    'newschool.parent.beta@frantzcoutard.test',
    '202 Birch Avenue, Newark, NJ',
    NULL,
    1,
    'Darnell Brooks',
    @demo_now,
    @demo_now
  ),
  (
    @parent3_user_id,
    @student3_id,
    'Priya Patel',
    'Guardian',
    '555-4003',
    'newschool.parent.gamma@frantzcoutard.test',
    '303 Maple Lane, Newark, NJ',
    NULL,
    0,
    'Priya Patel',
    NULL,
    @demo_now
  );

INSERT INTO new_school_approvals (
  student_id, approval_type, reviewer_user_id, reviewer_name, reviewer_email,
  reviewer_role, status, notes, digital_signature, approved_at, recorded_at
) VALUES
  (
    @student1_id,
    'school',
    @school_user_id,
    'Dr. Elena Morris',
    'newschool.school@frantzcoutard.test',
    'school',
    'approved',
    'School approval recorded for the demo dataset.',
    'Dr. Elena Morris',
    @demo_now,
    @demo_now
  ),
  (
    @student1_id,
    'teacher',
    @teacher_user_id,
    'Coach Rivera',
    'newschool.teacher@frantzcoutard.test',
    'teacher',
    'approved',
    'Teacher approval recorded for the demo dataset.',
    'Coach Rivera',
    @demo_now,
    @demo_now
  ),
  (
    @student2_id,
    'school',
    @school_user_id,
    'Dr. Elena Morris',
    'newschool.school@frantzcoutard.test',
    'school',
    'approved',
    'School approval recorded for the demo dataset.',
    'Dr. Elena Morris',
    @demo_now,
    @demo_now
  ),
  (
    @student2_id,
    'teacher',
    @teacher_user_id,
    'Coach Rivera',
    'newschool.teacher@frantzcoutard.test',
    'teacher',
    'approved',
    'Teacher approval recorded for the demo dataset.',
    'Coach Rivera',
    @demo_now,
    @demo_now
  ),
  (
    @student3_id,
    'school',
    @school_user_id,
    'Dr. Elena Morris',
    'newschool.school@frantzcoutard.test',
    'school',
    'pending',
    'Waiting on parent consent before the school action can complete.',
    'Dr. Elena Morris',
    NULL,
    @demo_now
  ),
  (
    @student3_id,
    'teacher',
    @teacher_user_id,
    'Coach Rivera',
    'newschool.teacher@frantzcoutard.test',
    'teacher',
    'pending',
    'Waiting on parent consent before the teacher action can complete.',
    'Coach Rivera',
    NULL,
    @demo_now
  );

INSERT INTO new_school_business_interviews (
  student_id, visit_number, business_name, owner_name, business_phone,
  business_address, business_category, date_of_visit, has_website,
  has_google_profile, uses_social_media, uses_digital_signage, offers_rewards,
  has_online_ordering, has_delivery_options, main_challenge, student_notes
) VALUES
  (
    @student1_id, 1, 'Harbor Cafe', 'Lena Harris', '555-0101',
    '12 Harbor Ave, Newark, NJ', 'Cafe', '2026-06-01', 1, 1, 1, 1, 1, 1, 1,
    'Needs stronger breakfast traffic before 10 AM.',
    'Demo note for visit 1 from Ariana Carter.'
  ),
  (
    @student1_id, 2, 'Oak Street Bakery', 'Marcus Reed', '555-0102',
    '88 Oak Street, Newark, NJ', 'Bakery', '2026-06-02', 1, 1, 0, 0, 1, 1, 0,
    'Weekend sales are strong, weekday sales need visibility.',
    'Demo note for visit 2 from Ariana Carter.'
  ),
  (
    @student1_id, 3, 'North End Barber', 'Tyrone Bell', '555-0103',
    '104 North End Blvd, Newark, NJ', 'Barber Shop', '2026-06-03', 0, 1, 1, 1, 0, 0, 0,
    'Walk-in customers are inconsistent during school hours.',
    'Demo note for visit 3 from Ariana Carter.'
  ),
  (
    @student1_id, 4, 'Greenline Pharmacy', 'Amina Khan', '555-0104',
    '41 Greenline Rd, Newark, NJ', 'Pharmacy', '2026-06-04', 1, 1, 0, 1, 1, 0, 1,
    'Customers do not know about delivery or refill reminders.',
    'Demo note for visit 4 from Ariana Carter.'
  ),
  (
    @student2_id, 1, 'Maple Grocery', 'Jose Martinez', '555-0105',
    '9 Maple Ave, Newark, NJ', 'Grocery', '2026-06-05', 0, 1, 1, 0, 1, 0, 1,
    'Needs better neighborhood awareness and loyalty engagement.',
    'Demo note for visit 1 from Jayden Brooks.'
  ),
  (
    @student2_id, 2, 'Downtown Deli', 'Sarah Wilson', '555-0106',
    '220 Market Street, Newark, NJ', 'Restaurant', '2026-06-06', 1, 1, 1, 1, 1, 1, 1,
    'Lunch rush is busy but many customers do not reorder.',
    'Demo note for visit 2 from Jayden Brooks.'
  ),
  (
    @student2_id, 3, 'Riverside Salon', 'Keisha Brown', '555-0107',
    '77 Riverside Dr, Newark, NJ', 'Salon', '2026-06-07', 1, 1, 1, 1, 0, 0, 0,
    'Styling packages are not clearly promoted online.',
    'Demo note for visit 3 from Jayden Brooks.'
  ),
  (
    @student3_id, 1, 'Pine Auto Care', 'David Nguyen', '555-0108',
    '19 Pine Road, Newark, NJ', 'Automotive', '2026-06-08', 0, 1, 0, 1, 1, 0, 0,
    'Customers need easier booking and service updates.',
    'Demo note for visit 1 from Maya Patel.'
  );

SET @student1_source_business_id = (
  SELECT id
  FROM new_school_business_interviews
  WHERE student_id = @student1_id AND visit_number = 4
  LIMIT 1
);

INSERT INTO new_school_submissions (
  student_id, source_business_id, problem_identified, why_it_matters,
  proposed_solution, how_it_helps, expected_impact, video_url, written_url,
  submission_date, status, reviewer_notes, reviewed_by_user_id, reviewed_at,
  score, rank_position
) VALUES (
  @student1_id,
  @student1_source_business_id,
  'Local businesses are not using digital tools consistently.',
  'Visibility and customer convenience directly affect sales and repeat visits.',
  'Create a simple digital action plan that improves website use, Google profiles, social media, and ordering options.',
  'The plan helps the owner capture more local traffic and communicate with customers faster.',
  'Higher visibility, better engagement, and more repeat customers for the business.',
  '/api/uploads/new_school/demo-student-one-video.mp4',
  '/api/uploads/new_school/demo-student-one-summary.pdf',
  @demo_now,
  'winner',
  'Demo winner submission.',
  @admin_user_id,
  @demo_now,
  98.00,
  1
);

SET @submission_id = LAST_INSERT_ID();

INSERT INTO new_school_winners (
  student_id, submission_id, place, scholarship_amount, announced_at, published_at
) VALUES (
  @student1_id,
  @submission_id,
  'first',
  2500.00,
  @demo_now,
  @demo_now
);

INSERT INTO new_school_notifications (
  student_id, recipient_role, notification_type, title, message
) VALUES
  (
    @student1_id,
    'student',
    'demo_seed',
    'Demo student ready',
    'Ariana Carter has a complete demo challenge profile.'
  ),
  (
    @student1_id,
    'student',
    'demo_seed',
    'Demo winner published',
    'The demo winner is published and visible in the dashboards.'
  ),
  (
    @student2_id,
    'student',
    'demo_seed',
    'Eligible to submit',
    'Jayden Brooks is approved and ready to submit the final project.'
  ),
  (
    @student3_id,
    'student',
    'demo_seed',
    'Awaiting parent consent',
    'Maya Patel still needs parent consent before the challenge can continue.'
  ),
  (
    @student1_id,
    'teacher',
    'demo_seed',
    'Demo class updated',
    'Coach Rivera has one published winner and one eligible student in the demo set.'
  ),
  (
    @student1_id,
    'school',
    'demo_seed',
    'Demo school updated',
    'New School Academy demo data is ready for dashboards and reporting.'
  ),
  (
    @student1_id,
    'admin',
    'demo_seed',
    'Demo dataset refreshed',
    'The new_school demo data set has been refreshed successfully.'
  );

COMMIT;
