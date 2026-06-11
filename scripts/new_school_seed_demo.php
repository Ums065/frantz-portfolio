<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib.php';

function new_school_demo_upsert_user(PDO $pdo, string $fullName, string $email, string $password, string $role): array
{
    $email = strtolower(trim($email));
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $existing = $stmt->fetch();
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE users
             SET full_name = ?,
                 password_hash = ?,
                 role = ?,
                 email_verified_at = COALESCE(email_verified_at, NOW()),
                 email_verification_otp_hash = NULL,
                 email_verification_otp_expires_at = NULL,
                 email_verification_otp_sent_at = NULL,
                 email_verification_otp_attempts = 0
             WHERE id = ?'
        );
        $update->execute([$fullName, $passwordHash, $role, (int) $existing['id']]);

        $fresh = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $user = $fresh->fetch();
        if (!$user) {
            throw new RuntimeException('Unable to refresh user record for ' . $email);
        }
        return $user;
    }

    $insert = $pdo->prepare(
        'INSERT INTO users (
            full_name, email, password_hash, role, email_verified_at,
            email_verification_otp_hash, email_verification_otp_expires_at,
            email_verification_otp_sent_at, email_verification_otp_attempts
         ) VALUES (?, ?, ?, ?, NOW(), NULL, NULL, NULL, 0)'
    );
    $insert->execute([$fullName, $email, $passwordHash, $role]);

    $fresh = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $user = $fresh->fetch();
    if (!$user) {
        throw new RuntimeException('Unable to create user record for ' . $email);
    }
    return $user;
}

function new_school_demo_upsert_school(PDO $pdo, int $userId, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_schools WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $existing = $stmt->fetch();

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_schools
             SET school_name = ?,
                 school_address = ?,
                 school_district = ?,
                 main_phone = ?,
                 principal_name = ?,
                 administrator_name = ?,
                 administrator_email = ?,
                 administrator_phone = ?,
                 status = ?,
                 updated_at = NOW()
             WHERE id = ?'
        );
        $update->execute([
            $data['school_name'],
            $data['school_address'],
            $data['school_district'],
            $data['main_phone'],
            $data['principal_name'],
            $data['administrator_name'],
            $data['administrator_email'],
            $data['administrator_phone'],
            $data['status'],
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_schools WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $school = $fresh->fetch();
        if (!$school) {
            throw new RuntimeException('Unable to refresh school record.');
        }
        return $school;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_schools (
            user_id, school_name, school_address, school_district, main_phone,
            principal_name, administrator_name, administrator_email, administrator_phone, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        $userId,
        $data['school_name'],
        $data['school_address'],
        $data['school_district'],
        $data['main_phone'],
        $data['principal_name'],
        $data['administrator_name'],
        $data['administrator_email'],
        $data['administrator_phone'],
        $data['status'],
    ]);

    $fresh = $pdo->prepare('SELECT * FROM new_school_schools WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $school = $fresh->fetch();
    if (!$school) {
        throw new RuntimeException('Unable to create school record.');
    }
    return $school;
}

function new_school_demo_upsert_teacher(PDO $pdo, int $userId, int $schoolId, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_teachers WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $existing = $stmt->fetch();

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_teachers
             SET school_id = ?,
                 teacher_full_name = ?,
                 school_email = ?,
                 phone_number = ?,
                 role_department = ?,
                 grade_level_supported = ?,
                 status = ?,
                 updated_at = NOW()
             WHERE id = ?'
        );
        $update->execute([
            $schoolId,
            $data['teacher_full_name'],
            $data['school_email'],
            $data['phone_number'],
            $data['role_department'],
            $data['grade_level_supported'],
            $data['status'],
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_teachers WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $teacher = $fresh->fetch();
        if (!$teacher) {
            throw new RuntimeException('Unable to refresh teacher record.');
        }
        return $teacher;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_teachers (
            user_id, school_id, teacher_full_name, school_email, phone_number,
            role_department, grade_level_supported, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        $userId,
        $schoolId,
        $data['teacher_full_name'],
        $data['school_email'],
        $data['phone_number'],
        $data['role_department'],
        $data['grade_level_supported'],
        $data['status'],
    ]);

    $fresh = $pdo->prepare('SELECT * FROM new_school_teachers WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $teacher = $fresh->fetch();
    if (!$teacher) {
        throw new RuntimeException('Unable to create teacher record.');
    }
    return $teacher;
}

function new_school_demo_upsert_student(PDO $pdo, int $userId, ?int $schoolId, ?int $teacherId, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_students WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $existing = $stmt->fetch();

    $participantId = $existing ? (string) $existing['participant_id'] : new_school_generate_participant_id();
    $qrToken = $existing ? (string) $existing['qr_token'] : new_school_generate_qr_token();
    $qrUrl = $existing ? (string) $existing['qr_url'] : new_school_qr_url($qrToken);

    $columns = [
        'user_id' => $userId,
        'school_id' => $schoolId,
        'teacher_id' => $teacherId,
        'participant_id' => $participantId,
        'qr_token' => $qrToken,
        'qr_url' => $qrUrl,
        'full_name' => $data['full_name'],
        'student_username' => $data['student_username'],
        'age' => $data['age'],
        'date_of_birth' => $data['date_of_birth'],
        'email' => $data['email'],
        'phone_number' => $data['phone_number'],
        'home_address' => $data['home_address'],
        'school_name' => $data['school_name'],
        'grade_level' => $data['grade_level'],
        'parent_name' => $data['parent_name'],
        'parent_phone' => $data['parent_phone'],
        'parent_email' => $data['parent_email'],
        'parent_consent_status' => $data['parent_consent_status'],
        'school_approval_status' => $data['school_approval_status'],
        'teacher_approval_status' => $data['teacher_approval_status'],
        'submission_status' => $data['submission_status'],
        'overall_status' => $data['overall_status'],
    ];

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_students
             SET school_id = ?,
                 teacher_id = ?,
                 participant_id = ?,
                 qr_token = ?,
                 qr_url = ?,
                 full_name = ?,
                 student_username = ?,
                 age = ?,
                 date_of_birth = ?,
                 email = ?,
                 phone_number = ?,
                 home_address = ?,
                 school_name = ?,
                 grade_level = ?,
                 parent_name = ?,
                 parent_phone = ?,
                 parent_email = ?,
                 parent_consent_status = ?,
                 school_approval_status = ?,
                 teacher_approval_status = ?,
                 submission_status = ?,
                 overall_status = ?,
                 updated_at = NOW()
             WHERE id = ?'
        );
        $update->execute([
            $columns['school_id'],
            $columns['teacher_id'],
            $columns['participant_id'],
            $columns['qr_token'],
            $columns['qr_url'],
            $columns['full_name'],
            $columns['student_username'],
            $columns['age'],
            $columns['date_of_birth'],
            $columns['email'],
            $columns['phone_number'],
            $columns['home_address'],
            $columns['school_name'],
            $columns['grade_level'],
            $columns['parent_name'],
            $columns['parent_phone'],
            $columns['parent_email'],
            $columns['parent_consent_status'],
            $columns['school_approval_status'],
            $columns['teacher_approval_status'],
            $columns['submission_status'],
            $columns['overall_status'],
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_students WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $student = $fresh->fetch();
        if (!$student) {
            throw new RuntimeException('Unable to refresh student record.');
        }
        return $student;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_students (
            user_id, school_id, teacher_id, participant_id, qr_token, qr_url,
            full_name, student_username, age, date_of_birth, email, phone_number,
            home_address, school_name, grade_level, parent_name, parent_phone, parent_email,
            parent_consent_status, school_approval_status, teacher_approval_status, submission_status, overall_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute(array_values($columns));

    $fresh = $pdo->prepare('SELECT * FROM new_school_students WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $student = $fresh->fetch();
    if (!$student) {
        throw new RuntimeException('Unable to create student record.');
    }
    return $student;
}

function new_school_demo_upsert_parent(PDO $pdo, int $userId, int $studentId, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_parents WHERE student_id = ? LIMIT 1');
    $stmt->execute([$studentId]);
    $existing = $stmt->fetch();

    $approvedAt = !empty($data['consent_checked']) ? date('Y-m-d H:i:s') : null;
    $consentedAt = $data['consented_at'] ?? date('Y-m-d H:i:s');

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_parents
             SET user_id = ?,
                 parent_full_name = ?,
                 relationship_to_student = ?,
                 phone_number = ?,
                 email = ?,
                 home_address = ?,
                 government_id_url = ?,
                 consent_checked = ?,
                 digital_signature = ?,
                 approved_at = ?,
                 consented_at = ?,
                 updated_at = NOW()
             WHERE id = ?'
        );
        $update->execute([
            $userId,
            $data['parent_full_name'],
            $data['relationship_to_student'],
            $data['phone_number'],
            $data['email'],
            $data['home_address'],
            $data['government_id_url'],
            !empty($data['consent_checked']) ? 1 : 0,
            $data['digital_signature'],
            $approvedAt,
            $consentedAt,
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_parents WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $parent = $fresh->fetch();
        if (!$parent) {
            throw new RuntimeException('Unable to refresh parent record.');
        }
        return $parent;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_parents (
            user_id, student_id, parent_full_name, relationship_to_student, phone_number, email,
            home_address, government_id_url, consent_checked, digital_signature, approved_at, consented_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        $userId,
        $studentId,
        $data['parent_full_name'],
        $data['relationship_to_student'],
        $data['phone_number'],
        $data['email'],
        $data['home_address'],
        $data['government_id_url'],
        !empty($data['consent_checked']) ? 1 : 0,
        $data['digital_signature'],
        $approvedAt,
        $consentedAt,
    ]);

    $fresh = $pdo->prepare('SELECT * FROM new_school_parents WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $parent = $fresh->fetch();
    if (!$parent) {
        throw new RuntimeException('Unable to create parent record.');
    }
    return $parent;
}

function new_school_demo_upsert_approval(PDO $pdo, int $studentId, string $approvalType, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_approvals WHERE student_id = ? AND approval_type = ? LIMIT 1');
    $stmt->execute([$studentId, $approvalType]);
    $existing = $stmt->fetch();

    $approvedAt = $data['status'] === 'approved' ? ($data['approved_at'] ?? date('Y-m-d H:i:s')) : null;
    $recordedAt = $data['recorded_at'] ?? date('Y-m-d H:i:s');

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_approvals
             SET reviewer_user_id = ?,
                 reviewer_name = ?,
                 reviewer_email = ?,
                 reviewer_role = ?,
                 status = ?,
                 notes = ?,
                 digital_signature = ?,
                 approved_at = ?,
                 recorded_at = ?,
                 updated_at = NOW()
             WHERE id = ?'
        );
        $update->execute([
            $data['reviewer_user_id'],
            $data['reviewer_name'],
            $data['reviewer_email'],
            $data['reviewer_role'],
            $data['status'],
            $data['notes'],
            $data['digital_signature'],
            $approvedAt,
            $recordedAt,
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_approvals WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $approval = $fresh->fetch();
        if (!$approval) {
            throw new RuntimeException('Unable to refresh approval record.');
        }
        return $approval;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_approvals (
            student_id, approval_type, reviewer_user_id, reviewer_name, reviewer_email, reviewer_role,
            status, notes, digital_signature, approved_at, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        $studentId,
        $approvalType,
        $data['reviewer_user_id'],
        $data['reviewer_name'],
        $data['reviewer_email'],
        $data['reviewer_role'],
        $data['status'],
        $data['notes'],
        $data['digital_signature'],
        $approvedAt,
        $recordedAt,
    ]);

    $fresh = $pdo->prepare('SELECT * FROM new_school_approvals WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $approval = $fresh->fetch();
    if (!$approval) {
        throw new RuntimeException('Unable to create approval record.');
    }
    return $approval;
}

function new_school_demo_upsert_business(PDO $pdo, int $studentId, int $visitNumber, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_business_interviews WHERE student_id = ? AND visit_number = ? LIMIT 1');
    $stmt->execute([$studentId, $visitNumber]);
    $existing = $stmt->fetch();

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_business_interviews
             SET business_name = ?,
                 owner_name = ?,
                 business_phone = ?,
                 business_address = ?,
                 business_category = ?,
                 date_of_visit = ?,
                 has_website = ?,
                 has_google_profile = ?,
                 uses_social_media = ?,
                 uses_digital_signage = ?,
                 offers_rewards = ?,
                 has_online_ordering = ?,
                 has_delivery_options = ?,
                 main_challenge = ?,
                 student_notes = ?,
                 updated_at = NOW()
             WHERE id = ?'
        );
        $update->execute([
            $data['business_name'],
            $data['owner_name'],
            $data['business_phone'],
            $data['business_address'],
            $data['business_category'],
            $data['date_of_visit'],
            !empty($data['has_website']) ? 1 : 0,
            !empty($data['has_google_profile']) ? 1 : 0,
            !empty($data['uses_social_media']) ? 1 : 0,
            !empty($data['uses_digital_signage']) ? 1 : 0,
            !empty($data['offers_rewards']) ? 1 : 0,
            !empty($data['has_online_ordering']) ? 1 : 0,
            !empty($data['has_delivery_options']) ? 1 : 0,
            $data['main_challenge'],
            $data['student_notes'],
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_business_interviews WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $business = $fresh->fetch();
        if (!$business) {
            throw new RuntimeException('Unable to refresh business interview.');
        }
        return $business;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_business_interviews (
            student_id, visit_number, business_name, owner_name, business_phone, business_address, business_category,
            date_of_visit, has_website, has_google_profile, uses_social_media, uses_digital_signage, offers_rewards,
            has_online_ordering, has_delivery_options, main_challenge, student_notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        $studentId,
        $visitNumber,
        $data['business_name'],
        $data['owner_name'],
        $data['business_phone'],
        $data['business_address'],
        $data['business_category'],
        $data['date_of_visit'],
        !empty($data['has_website']) ? 1 : 0,
        !empty($data['has_google_profile']) ? 1 : 0,
        !empty($data['uses_social_media']) ? 1 : 0,
        !empty($data['uses_digital_signage']) ? 1 : 0,
        !empty($data['offers_rewards']) ? 1 : 0,
        !empty($data['has_online_ordering']) ? 1 : 0,
        !empty($data['has_delivery_options']) ? 1 : 0,
        $data['main_challenge'],
        $data['student_notes'],
    ]);

    $fresh = $pdo->prepare('SELECT * FROM new_school_business_interviews WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $business = $fresh->fetch();
    if (!$business) {
        throw new RuntimeException('Unable to create business interview.');
    }
    return $business;
}

function new_school_demo_upsert_submission(PDO $pdo, int $studentId, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_submissions WHERE student_id = ? LIMIT 1');
    $stmt->execute([$studentId]);
    $existing = $stmt->fetch();

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_submissions
             SET source_business_id = ?,
                 problem_identified = ?,
                 why_it_matters = ?,
                 proposed_solution = ?,
                 how_it_helps = ?,
                 expected_impact = ?,
                 video_url = ?,
                 written_url = ?,
                 submission_date = ?,
                 status = ?,
                 reviewer_notes = ?,
                 reviewed_by_user_id = ?,
                 reviewed_at = ?,
                 score = ?,
                 rank_position = ?,
                 updated_at = NOW()
             WHERE id = ?'
        );
        $update->execute([
            $data['source_business_id'],
            $data['problem_identified'],
            $data['why_it_matters'],
            $data['proposed_solution'],
            $data['how_it_helps'],
            $data['expected_impact'],
            $data['video_url'],
            $data['written_url'],
            $data['submission_date'],
            $data['status'],
            $data['reviewer_notes'],
            $data['reviewed_by_user_id'],
            $data['reviewed_at'],
            $data['score'],
            $data['rank_position'],
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_submissions WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $submission = $fresh->fetch();
        if (!$submission) {
            throw new RuntimeException('Unable to refresh submission.');
        }
        return $submission;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_submissions (
            student_id, source_business_id, problem_identified, why_it_matters, proposed_solution, how_it_helps,
            expected_impact, video_url, written_url, submission_date, status, reviewer_notes, reviewed_by_user_id,
            reviewed_at, score, rank_position
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        $studentId,
        $data['source_business_id'],
        $data['problem_identified'],
        $data['why_it_matters'],
        $data['proposed_solution'],
        $data['how_it_helps'],
        $data['expected_impact'],
        $data['video_url'],
        $data['written_url'],
        $data['submission_date'],
        $data['status'],
        $data['reviewer_notes'],
        $data['reviewed_by_user_id'],
        $data['reviewed_at'],
        $data['score'],
        $data['rank_position'],
    ]);

    $fresh = $pdo->prepare('SELECT * FROM new_school_submissions WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $submission = $fresh->fetch();
    if (!$submission) {
        throw new RuntimeException('Unable to create submission.');
    }
    return $submission;
}

function new_school_demo_upsert_winner(PDO $pdo, int $studentId, int $submissionId, array $data): array
{
    $stmt = $pdo->prepare('SELECT * FROM new_school_winners WHERE submission_id = ? LIMIT 1');
    $stmt->execute([$submissionId]);
    $existing = $stmt->fetch();

    if ($existing) {
        $update = $pdo->prepare(
            'UPDATE new_school_winners
             SET student_id = ?,
                 place = ?,
                 scholarship_amount = ?,
                 announced_at = ?,
                 published_at = ?
             WHERE id = ?'
        );
        $update->execute([
            $studentId,
            $data['place'],
            $data['scholarship_amount'],
            $data['announced_at'],
            $data['published_at'],
            (int) $existing['id'],
        ]);
        $fresh = $pdo->prepare('SELECT * FROM new_school_winners WHERE id = ? LIMIT 1');
        $fresh->execute([(int) $existing['id']]);
        $winner = $fresh->fetch();
        if (!$winner) {
            throw new RuntimeException('Unable to refresh winner record.');
        }
        return $winner;
    }

    $insert = $pdo->prepare(
        'INSERT INTO new_school_winners (
            student_id, submission_id, place, scholarship_amount, announced_at, published_at
         ) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $insert->execute([
        $studentId,
        $submissionId,
        $data['place'],
        $data['scholarship_amount'],
        $data['announced_at'],
        $data['published_at'],
    ]);

    $fresh = $pdo->prepare('SELECT * FROM new_school_winners WHERE id = ? LIMIT 1');
    $fresh->execute([(int) $pdo->lastInsertId()]);
    $winner = $fresh->fetch();
    if (!$winner) {
        throw new RuntimeException('Unable to create winner record.');
    }
    return $winner;
}

function new_school_demo_business_templates(): array
{
    return [
        ['name' => 'Harbor Cafe', 'owner' => 'Lena Harris', 'phone' => '555-0101', 'address' => '12 Harbor Ave, Newark, NJ', 'category' => 'Cafe', 'website' => 1, 'google' => 1, 'social' => 1, 'signage' => 1, 'rewards' => 1, 'ordering' => 1, 'delivery' => 1, 'challenge' => 'Needs stronger breakfast traffic before 10 AM.'],
        ['name' => 'Oak Street Bakery', 'owner' => 'Marcus Reed', 'phone' => '555-0102', 'address' => '88 Oak Street, Newark, NJ', 'category' => 'Bakery', 'website' => 1, 'google' => 1, 'social' => 0, 'signage' => 0, 'rewards' => 1, 'ordering' => 1, 'delivery' => 0, 'challenge' => 'Weekend sales are strong, weekday sales need visibility.'],
        ['name' => 'North End Barber', 'owner' => 'Tyrone Bell', 'phone' => '555-0103', 'address' => '104 North End Blvd, Newark, NJ', 'category' => 'Barber Shop', 'website' => 0, 'google' => 1, 'social' => 1, 'signage' => 1, 'rewards' => 0, 'ordering' => 0, 'delivery' => 0, 'challenge' => 'Walk-in customers are inconsistent during school hours.'],
        ['name' => 'Greenline Pharmacy', 'owner' => 'Amina Khan', 'phone' => '555-0104', 'address' => '41 Greenline Rd, Newark, NJ', 'category' => 'Pharmacy', 'website' => 1, 'google' => 1, 'social' => 0, 'signage' => 1, 'rewards' => 1, 'ordering' => 0, 'delivery' => 1, 'challenge' => 'Customers do not know about delivery or refill reminders.'],
        ['name' => 'Maple Grocery', 'owner' => 'Jose Martinez', 'phone' => '555-0105', 'address' => '9 Maple Ave, Newark, NJ', 'category' => 'Grocery', 'website' => 0, 'google' => 1, 'social' => 1, 'signage' => 0, 'rewards' => 1, 'ordering' => 0, 'delivery' => 1, 'challenge' => 'Needs better neighborhood awareness and loyalty engagement.'],
        ['name' => 'Downtown Deli', 'owner' => 'Sarah Wilson', 'phone' => '555-0106', 'address' => '220 Market Street, Newark, NJ', 'category' => 'Restaurant', 'website' => 1, 'google' => 1, 'social' => 1, 'signage' => 1, 'rewards' => 1, 'ordering' => 1, 'delivery' => 1, 'challenge' => 'Lunch rush is busy but many customers do not reorder.'],
        ['name' => 'Riverside Salon', 'owner' => 'Keisha Brown', 'phone' => '555-0107', 'address' => '77 Riverside Dr, Newark, NJ', 'category' => 'Salon', 'website' => 1, 'google' => 1, 'social' => 1, 'signage' => 1, 'rewards' => 0, 'ordering' => 0, 'delivery' => 0, 'challenge' => 'Styling packages are not clearly promoted online.'],
        ['name' => 'Pine Auto Care', 'owner' => 'David Nguyen', 'phone' => '555-0108', 'address' => '19 Pine Road, Newark, NJ', 'category' => 'Automotive', 'website' => 0, 'google' => 1, 'social' => 0, 'signage' => 1, 'rewards' => 1, 'ordering' => 0, 'delivery' => 0, 'challenge' => 'Customers need easier booking and service updates.'],
        ['name' => 'Summit Fitness', 'owner' => 'Nia Thompson', 'phone' => '555-0109', 'address' => '301 Summit Blvd, Newark, NJ', 'category' => 'Fitness', 'website' => 1, 'google' => 1, 'social' => 1, 'signage' => 1, 'rewards' => 1, 'ordering' => 0, 'delivery' => 0, 'challenge' => 'Membership trials are not converting to paid signups.'],
        ['name' => 'Corner Market', 'owner' => 'Antonio Davis', 'phone' => '555-0110', 'address' => '5 Corner Plaza, Newark, NJ', 'category' => 'Convenience Store', 'website' => 0, 'google' => 1, 'social' => 1, 'signage' => 0, 'rewards' => 1, 'ordering' => 1, 'delivery' => 1, 'challenge' => 'Store hours and delivery options are not well advertised.'],
    ];
}

function new_school_demo_clear_businesses(PDO $pdo, array $studentIds): void
{
    $studentIds = array_values(array_filter(array_map('intval', $studentIds), static fn (int $id): bool => $id > 0));
    if ($studentIds === []) {
        return;
    }

    $stmt = $pdo->prepare(
        'DELETE FROM new_school_business_interviews
         WHERE student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')'
    );
    $stmt->execute($studentIds);
}

function new_school_demo_seed(PDO $pdo): array
{
    $now = date('Y-m-d H:i:s');

    $users = [
        'admin' => new_school_demo_upsert_user($pdo, 'New School Admin', 'newschool.admin@frantzcoutard.test', 'DemoPass123!', 'admin'),
        'school' => new_school_demo_upsert_user($pdo, 'New School Academy Admin', 'newschool.school@frantzcoutard.test', 'DemoPass123!', 'school'),
        'teacher' => new_school_demo_upsert_user($pdo, 'Coach Rivera', 'newschool.teacher@frantzcoutard.test', 'DemoPass123!', 'teacher'),
        'student1' => new_school_demo_upsert_user($pdo, 'Ariana Carter', 'newschool.student.alpha@frantzcoutard.test', 'DemoPass123!', 'student'),
        'student2' => new_school_demo_upsert_user($pdo, 'Jayden Brooks', 'newschool.student.beta@frantzcoutard.test', 'DemoPass123!', 'student'),
        'student3' => new_school_demo_upsert_user($pdo, 'Maya Patel', 'newschool.student.gamma@frantzcoutard.test', 'DemoPass123!', 'student'),
        'parent1' => new_school_demo_upsert_user($pdo, 'Monica Carter', 'newschool.parent.alpha@frantzcoutard.test', 'DemoPass123!', 'parent'),
        'parent2' => new_school_demo_upsert_user($pdo, 'Darnell Brooks', 'newschool.parent.beta@frantzcoutard.test', 'DemoPass123!', 'parent'),
        'parent3' => new_school_demo_upsert_user($pdo, 'Priya Patel', 'newschool.parent.gamma@frantzcoutard.test', 'DemoPass123!', 'parent'),
    ];

    $school = new_school_demo_upsert_school($pdo, (int) $users['school']['id'], [
        'school_name' => 'New School Academy',
        'school_address' => '100 Innovation Way, Newark, NJ 07102',
        'school_district' => 'Newark Public Schools',
        'main_phone' => '555-1000',
        'principal_name' => 'Dr. Elena Morris',
        'administrator_name' => 'New School Academy Admin',
        'administrator_email' => 'newschool.school@frantzcoutard.test',
        'administrator_phone' => '555-1001',
        'status' => 'approved',
    ]);

    $teacher = new_school_demo_upsert_teacher($pdo, (int) $users['teacher']['id'], (int) $school['id'], [
        'teacher_full_name' => 'Coach Rivera',
        'school_email' => 'newschool.teacher@frantzcoutard.test',
        'phone_number' => '555-2000',
        'role_department' => 'Business & Career Readiness',
        'grade_level_supported' => '9-12',
        'status' => 'approved',
    ]);

    $studentProfiles = [
        'student1' => [
            'full_name' => 'Ariana Carter',
            'student_username' => 'ariana_carter_demo',
            'age' => 16,
            'date_of_birth' => '2009-03-14',
            'email' => 'newschool.student.alpha@frantzcoutard.test',
            'phone_number' => '555-3001',
            'home_address' => '101 Cedar Street, Newark, NJ',
            'school_name' => 'New School Academy',
            'grade_level' => '10',
            'parent_name' => 'Monica Carter',
            'parent_phone' => '555-4001',
            'parent_email' => 'newschool.parent.alpha@frantzcoutard.test',
            'parent_consent_status' => 'approved',
            'school_approval_status' => 'approved',
            'teacher_approval_status' => 'approved',
            'submission_status' => 'winner',
            'overall_status' => 'submission_complete',
        ],
        'student2' => [
            'full_name' => 'Jayden Brooks',
            'student_username' => 'jayden_brooks_demo',
            'age' => 15,
            'date_of_birth' => '2010-07-22',
            'email' => 'newschool.student.beta@frantzcoutard.test',
            'phone_number' => '555-3002',
            'home_address' => '202 Birch Avenue, Newark, NJ',
            'school_name' => 'New School Academy',
            'grade_level' => '9',
            'parent_name' => 'Darnell Brooks',
            'parent_phone' => '555-4002',
            'parent_email' => 'newschool.parent.beta@frantzcoutard.test',
            'parent_consent_status' => 'approved',
            'school_approval_status' => 'approved',
            'teacher_approval_status' => 'approved',
            'submission_status' => 'eligible',
            'overall_status' => 'eligible_to_submit',
        ],
        'student3' => [
            'full_name' => 'Maya Patel',
            'student_username' => 'maya_patel_demo',
            'age' => 14,
            'date_of_birth' => '2011-11-05',
            'email' => 'newschool.student.gamma@frantzcoutard.test',
            'phone_number' => '555-3003',
            'home_address' => '303 Maple Lane, Newark, NJ',
            'school_name' => 'New School Academy',
            'grade_level' => '8',
            'parent_name' => 'Priya Patel',
            'parent_phone' => '555-4003',
            'parent_email' => 'newschool.parent.gamma@frantzcoutard.test',
            'parent_consent_status' => 'pending',
            'school_approval_status' => 'pending',
            'teacher_approval_status' => 'pending',
            'submission_status' => 'locked',
            'overall_status' => 'parent_consent_pending',
        ],
    ];

    $students = [];
    foreach ($studentProfiles as $key => $profile) {
        $studentUser = $users[$key];
        $students[$key] = new_school_demo_upsert_student(
            $pdo,
            (int) $studentUser['id'],
            (int) $school['id'],
            (int) $teacher['id'],
            $profile
        );
    }

    new_school_demo_clear_businesses($pdo, array_map(static fn (array $row): int => (int) $row['id'], $students));

    $parentRows = [
        'student1' => new_school_demo_upsert_parent($pdo, (int) $users['parent1']['id'], (int) $students['student1']['id'], [
            'parent_full_name' => 'Monica Carter',
            'relationship_to_student' => 'Mother',
            'phone_number' => '555-4001',
            'email' => 'newschool.parent.alpha@frantzcoutard.test',
            'home_address' => '101 Cedar Street, Newark, NJ',
            'government_id_url' => null,
            'consent_checked' => 1,
            'digital_signature' => 'Monica Carter',
            'consented_at' => $now,
        ]),
        'student2' => new_school_demo_upsert_parent($pdo, (int) $users['parent2']['id'], (int) $students['student2']['id'], [
            'parent_full_name' => 'Darnell Brooks',
            'relationship_to_student' => 'Father',
            'phone_number' => '555-4002',
            'email' => 'newschool.parent.beta@frantzcoutard.test',
            'home_address' => '202 Birch Avenue, Newark, NJ',
            'government_id_url' => null,
            'consent_checked' => 1,
            'digital_signature' => 'Darnell Brooks',
            'consented_at' => $now,
        ]),
        'student3' => new_school_demo_upsert_parent($pdo, (int) $users['parent3']['id'], (int) $students['student3']['id'], [
            'parent_full_name' => 'Priya Patel',
            'relationship_to_student' => 'Guardian',
            'phone_number' => '555-4003',
            'email' => 'newschool.parent.gamma@frantzcoutard.test',
            'home_address' => '303 Maple Lane, Newark, NJ',
            'government_id_url' => null,
            'consent_checked' => 0,
            'digital_signature' => 'Priya Patel',
            'consented_at' => $now,
        ]),
    ];

    $approvalRows = [
        ['student' => 'student1', 'type' => 'school', 'status' => 'approved', 'reviewer' => 'school'],
        ['student' => 'student1', 'type' => 'teacher', 'status' => 'approved', 'reviewer' => 'teacher'],
        ['student' => 'student2', 'type' => 'school', 'status' => 'approved', 'reviewer' => 'school'],
        ['student' => 'student2', 'type' => 'teacher', 'status' => 'approved', 'reviewer' => 'teacher'],
        ['student' => 'student3', 'type' => 'school', 'status' => 'pending', 'reviewer' => 'school'],
        ['student' => 'student3', 'type' => 'teacher', 'status' => 'pending', 'reviewer' => 'teacher'],
    ];

    foreach ($approvalRows as $row) {
        $reviewerUser = $users[$row['reviewer']];
        $student = $students[$row['student']];
        new_school_demo_upsert_approval($pdo, (int) $student['id'], $row['type'], [
            'reviewer_user_id' => (int) $reviewerUser['id'],
            'reviewer_name' => (string) $reviewerUser['full_name'],
            'reviewer_email' => (string) $reviewerUser['email'],
            'reviewer_role' => (string) $reviewerUser['role'],
            'status' => $row['status'],
            'notes' => $row['status'] === 'approved' ? 'Demo approval recorded.' : 'Awaiting review in demo data.',
            'digital_signature' => (string) $reviewerUser['full_name'],
            'approved_at' => $row['status'] === 'approved' ? $now : null,
            'recorded_at' => $now,
        ]);
    }

    $businessTemplates = new_school_demo_business_templates();
    foreach (['student1' => 10, 'student2' => 10, 'student3' => 2] as $studentKey => $count) {
        $student = $students[$studentKey];
        for ($visit = 1; $visit <= $count; $visit++) {
            $template = $businessTemplates[$visit - 1];
            $dateOfVisit = date('Y-m-d', strtotime('-' . (14 - $visit) . ' days'));
            new_school_demo_upsert_business($pdo, (int) $student['id'], $visit, [
                'business_name' => $template['name'],
                'owner_name' => $template['owner'],
                'business_phone' => $template['phone'],
                'business_address' => $template['address'],
                'business_category' => $template['category'],
                'date_of_visit' => $dateOfVisit,
                'has_website' => (bool) $template['website'],
                'has_google_profile' => (bool) $template['google'],
                'uses_social_media' => (bool) $template['social'],
                'uses_digital_signage' => (bool) $template['signage'],
                'offers_rewards' => (bool) $template['rewards'],
                'has_online_ordering' => (bool) $template['ordering'],
                'has_delivery_options' => (bool) $template['delivery'],
                'main_challenge' => $template['challenge'],
                'student_notes' => 'Demo note for visit ' . $visit . ' from ' . $student['full_name'] . '.',
            ]);
        }
    }

    $student1LatestBusiness = $pdo->prepare(
        'SELECT id FROM new_school_business_interviews WHERE student_id = ? AND visit_number = 10 LIMIT 1'
    );
    $student1LatestBusiness->execute([(int) $students['student1']['id']]);
    $sourceBusinessId = (int) $student1LatestBusiness->fetchColumn();
    if ($sourceBusinessId <= 0) {
        throw new RuntimeException('Unable to locate student 1 source business.');
    }

    $submission = new_school_demo_upsert_submission($pdo, (int) $students['student1']['id'], [
        'source_business_id' => $sourceBusinessId,
        'problem_identified' => 'Local businesses are not using digital tools consistently.',
        'why_it_matters' => 'Visibility and customer convenience directly affect sales and repeat visits.',
        'proposed_solution' => 'Create a simple digital action plan that improves website use, Google profiles, social media, and ordering options.',
        'how_it_helps' => 'The plan helps the owner capture more local traffic and communicate with customers faster.',
        'expected_impact' => 'Higher visibility, better engagement, and more repeat customers for the business.',
        'video_url' => '/api/uploads/new_school/demo-student-one-video.mp4',
        'written_url' => '/api/uploads/new_school/demo-student-one-summary.pdf',
        'submission_date' => $now,
        'status' => 'winner',
        'reviewer_notes' => 'Demo winner submission.',
        'reviewed_by_user_id' => (int) $users['admin']['id'],
        'reviewed_at' => $now,
        'score' => 98,
        'rank_position' => 1,
    ]);

    $winner = new_school_demo_upsert_winner($pdo, (int) $students['student1']['id'], (int) $submission['id'], [
        'place' => 'first',
        'scholarship_amount' => 2500,
        'announced_at' => $now,
        'published_at' => $now,
    ]);

    foreach ($students as $key => $student) {
        $refreshedStudent = new_school_refresh_student_status((int) $student['id']);
        if ($refreshedStudent) {
            $students[$key] = $refreshedStudent;
        }
    }

    $studentIds = array_values(array_map(static fn(array $row): int => (int) $row['id'], $students));
    if ($studentIds !== []) {
        $pdo->prepare('DELETE FROM new_school_notifications WHERE student_id IN (' . new_school_placeholder_list(count($studentIds)) . ')')
            ->execute($studentIds);
    }

    new_school_add_notification(
        (int) $students['student1']['id'],
        'student',
        'demo_seed',
        'Demo student ready',
        'Ariana Carter has a complete demo challenge profile.',
        ['demo' => true, 'participant_id' => (string) $students['student1']['participant_id']]
    );
    new_school_add_notification(
        (int) $students['student1']['id'],
        'student',
        'demo_seed',
        'Demo winner published',
        'The demo winner is published and visible in the dashboards.',
        ['demo' => true, 'participant_id' => (string) $students['student1']['participant_id']]
    );
    new_school_add_notification(
        (int) $students['student2']['id'],
        'student',
        'demo_seed',
        'Eligible to submit',
        'Jayden Brooks is approved and ready to submit the final project.',
        ['demo' => true, 'participant_id' => (string) $students['student2']['participant_id']]
    );
    new_school_add_notification(
        (int) $students['student3']['id'],
        'student',
        'demo_seed',
        'Awaiting parent consent',
        'Maya Patel still needs parent consent before the challenge can continue.',
        ['demo' => true, 'participant_id' => (string) $students['student3']['participant_id']]
    );
    new_school_add_notification(
        (int) $students['student1']['id'],
        'parent',
        'demo_seed',
        'Parent consent approved',
        'Monica Carter approved Ariana Carter for the challenge and the demo workflow is ready.',
        ['demo' => true, 'student' => 'Ariana Carter']
    );
    new_school_add_notification(
        (int) $students['student2']['id'],
        'parent',
        'demo_seed',
        'Parent consent approved',
        'Darnell Brooks approved Jayden Brooks for the challenge and the demo workflow is ready.',
        ['demo' => true, 'student' => 'Jayden Brooks']
    );
    new_school_add_notification(
        (int) $students['student3']['id'],
        'parent',
        'demo_seed',
        'Parent consent pending',
        'Priya Patel still needs to complete consent for Maya Patel.',
        ['demo' => true, 'student' => 'Maya Patel']
    );
    new_school_add_notification(
        (int) $students['student1']['id'],
        'teacher',
        'demo_seed',
        'Demo class updated',
        'Coach Rivera has one published winner and one eligible student in the demo set.',
        ['demo' => true, 'teacher' => 'Coach Rivera']
    );
    new_school_add_notification(
        (int) $students['student1']['id'],
        'school',
        'demo_seed',
        'Demo school updated',
        'New School Academy demo data is ready for dashboards and reporting.',
        ['demo' => true, 'school' => 'New School Academy']
    );
    new_school_add_notification(
        (int) $students['student1']['id'],
        'admin',
        'demo_seed',
        'Demo dataset refreshed',
        'The new_school demo data set has been refreshed successfully.',
        ['demo' => true]
    );

    return [
        'admin_user_id' => (int) $users['admin']['id'],
        'school_id' => (int) $school['id'],
        'teacher_id' => (int) $teacher['id'],
        'students' => array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'participant_id' => (string) $row['participant_id'],
            'full_name' => (string) $row['full_name'],
            'submission_status' => (string) $row['submission_status'],
            'overall_status' => (string) $row['overall_status'],
        ], $students),
        'parent_rows' => array_map(static fn(array $row): int => (int) $row['id'], $parentRows),
        'approval_rows' => count($approvalRows),
        'business_count' => array_sum(['student1' => 10, 'student2' => 10, 'student3' => 2]),
        'notification_count' => 10,
        'submission_id' => (int) $submission['id'],
        'winner_id' => (int) $winner['id'],
        'updated_at' => $now,
    ];
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        $summary = new_school_demo_seed(db());
        echo 'new_school demo seed complete' . PHP_EOL;
        echo json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
    } catch (Throwable $e) {
        fwrite(STDERR, 'new_school demo seed failed: ' . $e->getMessage() . PHP_EOL);
        fwrite(STDERR, $e->getTraceAsString() . PHP_EOL);
        exit(1);
    }
}
