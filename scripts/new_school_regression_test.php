<?php

declare(strict_types=1);

require_once __DIR__ . '/new_school_seed_demo.php';

$pdo = db();

$fail = static function (string $message): void {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
};

$assert = static function (bool $condition, string $message) use ($fail): void {
    if (!$condition) {
        $fail($message);
    }
};

$fetchOne = static function (PDO $pdo, string $sql, array $params = []) use ($fail): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    if (!$row) {
        $fail('Missing expected row for query: ' . $sql);
    }
    return $row;
};

$fetchUser = static function (PDO $pdo, string $email) use ($fetchOne): array {
    return $fetchOne($pdo, 'SELECT * FROM users WHERE email = ? LIMIT 1', [strtolower($email)]);
};

$countRows = static function (PDO $pdo, string $sql, array $params = []) use ($fetchOne): int {
    $row = $fetchOne($pdo, $sql, $params);
    return (int) array_values($row)[0];
};

$findLeaderboardRow = static function (array $rows, string $label) use ($fail): array {
    foreach ($rows as $row) {
        if ((string) ($row['label'] ?? '') === $label) {
            return $row;
        }
    }

    $fail('Missing leaderboard row: ' . $label);
};

$startedTransaction = false;
if (!$pdo->inTransaction()) {
    $pdo->beginTransaction();
    $startedTransaction = true;
}

try {
    $summary = new_school_demo_seed($pdo);

    $assert(count($summary['students'] ?? []) === 3, 'Demo summary should contain three students.');
    $assert((int) ($summary['approval_rows'] ?? 0) === 6, 'Demo summary should contain six approvals.');
    $assert((int) ($summary['business_count'] ?? 0) === 22, 'Demo summary should contain 22 business interviews.');
    $assert((int) ($summary['notification_count'] ?? 0) === 10, 'Demo summary should contain 10 notifications.');

    $studentUsers = [
        'student1' => $fetchUser($pdo, 'newschool.student.alpha@frantzcoutard.test'),
        'student2' => $fetchUser($pdo, 'newschool.student.beta@frantzcoutard.test'),
        'student3' => $fetchUser($pdo, 'newschool.student.gamma@frantzcoutard.test'),
    ];
    $parentUsers = [
        'student1' => $fetchUser($pdo, 'newschool.parent.alpha@frantzcoutard.test'),
        'student2' => $fetchUser($pdo, 'newschool.parent.beta@frantzcoutard.test'),
        'student3' => $fetchUser($pdo, 'newschool.parent.gamma@frantzcoutard.test'),
    ];
    $schoolUser = $fetchUser($pdo, 'newschool.school@frantzcoutard.test');
    $teacherUser = $fetchUser($pdo, 'newschool.teacher@frantzcoutard.test');
    $adminUser = $fetchUser($pdo, 'newschool.admin@frantzcoutard.test');

    $students = [
        'student1' => new_school_fetch_student_by_user_id((int) $studentUsers['student1']['id']),
        'student2' => new_school_fetch_student_by_user_id((int) $studentUsers['student2']['id']),
        'student3' => new_school_fetch_student_by_user_id((int) $studentUsers['student3']['id']),
    ];

    foreach ($students as $key => $student) {
        $assert($student !== null, 'Missing seeded student row: ' . $key);
    }

    $assert(new_school_student_interview_count((int) $students['student1']['id']) === 10, 'Student 1 should have 10 business interviews.');
    $assert(new_school_student_interview_count((int) $students['student2']['id']) === 10, 'Student 2 should have 10 business interviews.');
    $assert(new_school_student_interview_count((int) $students['student3']['id']) === 2, 'Student 3 should have 2 business interviews.');

    $assert(($students['student1']['submission_status'] ?? '') === 'complete', 'Student 1 should be marked complete.');
    $assert(($students['student1']['overall_status'] ?? '') === 'submission_complete', 'Student 1 overall status should be submission_complete.');
    $assert(($students['student2']['submission_status'] ?? '') === 'eligible', 'Student 2 should be eligible to submit.');
    $assert(($students['student2']['overall_status'] ?? '') === 'eligible_to_submit', 'Student 2 overall status should be eligible_to_submit.');
    $assert(($students['student3']['submission_status'] ?? '') === 'locked', 'Student 3 should remain locked.');
    $assert(($students['student3']['overall_status'] ?? '') === 'parent_consent_pending', 'Student 3 overall status should be parent_consent_pending.');

    $assert(new_school_submission_is_locked($students['student1'], 10) === false, 'Student 1 should not be locked from submission.');
    $assert(new_school_submission_is_locked($students['student2'], 10) === false, 'Student 2 should not be locked from submission.');
    $assert(new_school_submission_is_locked($students['student3'], 2) === true, 'Student 3 should still be locked from submission.');

    $leaderboards = new_school_public_leaderboards();
    $schoolRow = $findLeaderboardRow($leaderboards['schools'] ?? [], 'New School Academy');
    $teacherRow = $findLeaderboardRow($leaderboards['teachers'] ?? [], 'Coach Rivera');
    $studentRow1 = $findLeaderboardRow($leaderboards['students'] ?? [], 'Ariana Carter');
    $studentRow2 = $findLeaderboardRow($leaderboards['students'] ?? [], 'Jayden Brooks');
    $studentRow3 = $findLeaderboardRow($leaderboards['students'] ?? [], 'Maya Patel');

    $assert((int) ($schoolRow['students'] ?? 0) === 3, 'School leaderboard should report three demo students.');
    $assert((int) ($schoolRow['parent_approved'] ?? 0) === 2, 'School leaderboard should report two parent approvals.');
    $assert((int) ($schoolRow['school_approved'] ?? 0) === 2, 'School leaderboard should report two school approvals.');
    $assert((int) ($schoolRow['teacher_approved'] ?? 0) === 2, 'School leaderboard should report two teacher approvals.');
    $assert((int) ($schoolRow['submissions'] ?? 0) === 1, 'School leaderboard should report one submission.');

    $assert((int) ($teacherRow['students'] ?? 0) === 3, 'Teacher leaderboard should report three demo students.');
    $assert((int) ($teacherRow['parent_approved'] ?? 0) === 2, 'Teacher leaderboard should report two parent approvals.');
    $assert((int) ($teacherRow['school_approved'] ?? 0) === 2, 'Teacher leaderboard should report two school approvals.');
    $assert((int) ($teacherRow['teacher_approved'] ?? 0) === 2, 'Teacher leaderboard should report two teacher approvals.');
    $assert((int) ($teacherRow['submissions'] ?? 0) === 1, 'Teacher leaderboard should report one submission.');

    $assert((int) ($studentRow1['interview_count'] ?? 0) === 10, 'Ariana Carter should have 10 interviews on the student leaderboard.');
    $assert((int) ($studentRow1['submitted'] ?? 0) === 1, 'Ariana Carter should have one submitted project.');
    $assert((int) ($studentRow2['interview_count'] ?? 0) === 10, 'Jayden Brooks should have 10 interviews on the student leaderboard.');
    $assert((int) ($studentRow2['submitted'] ?? 0) === 0, 'Jayden Brooks should not yet have a submitted project.');
    $assert((int) ($studentRow3['interview_count'] ?? 0) === 2, 'Maya Patel should have 2 interviews on the student leaderboard.');
    $assert((int) ($studentRow3['submitted'] ?? 0) === 0, 'Maya Patel should not yet have a submitted project.');

    $studentIds = [
        (int) $students['student1']['id'],
        (int) $students['student2']['id'],
        (int) $students['student3']['id'],
    ];

    $studentIdList = implode(',', array_fill(0, count($studentIds), '?'));
    $totalNotificationCount = $countRows(
        $pdo,
        'SELECT COUNT(*) AS total
         FROM new_school_notifications
         WHERE student_id IN (' . $studentIdList . ')',
        $studentIds
    );
    $assert($totalNotificationCount === 10, 'Demo students should have exactly 10 notifications in total.');

    $notificationCounts = $pdo->prepare(
        'SELECT recipient_role, COUNT(*) AS total
         FROM new_school_notifications
         WHERE student_id IN (' . $studentIdList . ')
         GROUP BY recipient_role'
    );
    $notificationCounts->execute($studentIds);
    $notificationMap = [];
    foreach ($notificationCounts->fetchAll() as $row) {
        $notificationMap[(string) $row['recipient_role']] = (int) $row['total'];
    }

    $assert(($notificationMap['student'] ?? 0) === 4, 'Student notifications should total four records.');
    $assert(($notificationMap['parent'] ?? 0) === 3, 'Parent notifications should total three records.');
    $assert(($notificationMap['teacher'] ?? 0) === 1, 'Teacher notifications should total one record.');
    $assert(($notificationMap['school'] ?? 0) === 1, 'School notifications should total one record.');
    $assert(($notificationMap['admin'] ?? 0) === 1, 'Admin notifications should total one record.');

    $student1StudentNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "student" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $student1ParentNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "parent" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $teacherNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "teacher" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $schoolNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "school" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );
    $adminNotification = $fetchOne(
        $pdo,
        'SELECT * FROM new_school_notifications WHERE student_id = ? AND recipient_role = "admin" ORDER BY id ASC LIMIT 1',
        [(int) $students['student1']['id']]
    );

    $assert(new_school_notification_can_access($studentUsers['student1'], $student1StudentNotification) === true, 'Student should access their own student notification.');
    $assert(new_school_notification_can_access($studentUsers['student1'], $student1ParentNotification) === false, 'Student should not access parent-only notifications.');
    $assert(new_school_notification_can_access($parentUsers['student1'], $student1ParentNotification) === true, 'Parent should access their child notification.');
    $assert(new_school_notification_can_access($parentUsers['student1'], $student1StudentNotification) === false, 'Parent should not access student-only notifications.');
    $assert(new_school_notification_can_access($teacherUser, $teacherNotification) === true, 'Teacher should access teacher notifications for their students.');
    $assert(new_school_notification_can_access($schoolUser, $schoolNotification) === true, 'School user should access school notifications for their students.');
    $assert(new_school_notification_can_access($adminUser, $adminNotification) === true, 'Admin should access all notifications.');

    $publicSummary = new_school_public_summary();
    foreach (['students', 'parents', 'schools', 'teachers', 'businesses', 'submissions', 'winners'] as $key) {
        $assert(isset($publicSummary[$key]), 'Public summary is missing key: ' . $key);
        $assert((int) $publicSummary[$key] >= 0, 'Public summary contains an invalid count for: ' . $key);
    }
    $assert((int) ($publicSummary['students'] ?? 0) >= 3, 'Public summary should include at least the demo students.');
    $assert((int) ($publicSummary['parents'] ?? 0) >= 3, 'Public summary should include at least the demo parents.');
    $assert((int) ($publicSummary['schools'] ?? 0) >= 1, 'Public summary should include at least the demo school.');
    $assert((int) ($publicSummary['teachers'] ?? 0) >= 1, 'Public summary should include at least the demo teacher.');

    echo json_encode([
        'status' => 'passed',
        'demo_students' => 3,
        'demo_businesses' => 22,
        'demo_notifications' => 10,
        'leaderboards' => [
            'school' => $schoolRow['label'] ?? null,
            'teacher' => $teacherRow['label'] ?? null,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'new_school regression test failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

if ($pdo->inTransaction()) {
    $pdo->rollBack();
}

echo 'new_school regression test passed' . PHP_EOL;
