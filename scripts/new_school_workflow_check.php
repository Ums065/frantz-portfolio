<?php

declare(strict_types=1);

/**
 * End-to-end workflow check for the New School points + approval flow.
 * Proves: student submits interview/project -> it appears in the ADMIN dashboard
 * -> auto points award -> admin approves & assigns bonus -> ranking reflects points.
 * Runs inside a transaction that is rolled back (no data is persisted).
 */

require_once __DIR__ . '/new_school_seed_demo.php';

$pdo = db();
$pass = 0;
$fail = 0;
$ok = static function (bool $cond, string $label) use (&$pass, &$fail): void {
    if ($cond) {
        $pass++;
        echo "    [PASS] $label\n";
    } else {
        $fail++;
        echo "    [FAIL] $label\n";
    }
};

// CREATE TABLE implicitly commits, so ensure the ledger exists BEFORE the transaction.
new_school_points_ensure_schema();

$pdo->beginTransaction();
try {
    new_school_demo_seed($pdo);

    $st = $pdo->prepare(
        'SELECT s.* FROM new_school_students s
         INNER JOIN users u ON u.id = s.user_id
         WHERE u.email = ? LIMIT 1'
    );
    $st->execute(['newschool.student.gamma@frantzcoutard.test']);
    $student = $st->fetch();
    if (!$student) {
        throw new RuntimeException('Demo student not found.');
    }
    $sid = (int) $student['id'];
    $tid = (int) ($student['teacher_id'] ?? 0);

    // Clean slate for this student so the inserts below never hit UNIQUE constraints.
    $pdo->prepare('DELETE FROM new_school_submissions WHERE student_id = ?')->execute([$sid]);
    $nextVisit = (int) $pdo->query('SELECT COALESCE(MAX(visit_number),0)+1 FROM new_school_business_interviews WHERE student_id = ' . $sid)->fetchColumn();

    echo "\nStudent under test: {$student['full_name']} (id $sid, teacher_id $tid)\n";
    $s0 = new_school_points_total('student', $sid);
    $t0 = $tid > 0 ? new_school_points_total('teacher', $tid) : 0;
    echo "Starting points -> student=$s0, teacher=$t0\n\n";

    // [1] Student submits a business interview (mirrors POST new-school/business + auto award)
    echo "[1] Student submits a business interview\n";
    $ins = $pdo->prepare(
        'INSERT INTO new_school_business_interviews
         (student_id, visit_number, business_name, owner_name, business_phone, business_address, business_category, date_of_visit,
          has_website, has_google_profile, uses_social_media, uses_digital_signage, offers_rewards, has_online_ordering, has_delivery_options,
          main_challenge, student_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0,0,0,0,0,0,0, ?, ?)'
    );
    $ins->execute([$sid, $nextVisit, 'Workflow Cafe', 'Sam Owner', '555-0100', '1 Test Rd', 'Food', date('Y-m-d'), 'Slow checkout line', 'Field notes']);
    $interviewId = (int) $pdo->lastInsertId();
    new_school_points_award_auto($sid, 'interview', $interviewId);
    $ok($interviewId > 0, "interview created (#$interviewId)");
    $ok(new_school_points_total('student', $sid) === $s0 + 5, 'student earns +5 automatically');
    if ($tid > 0) {
        $ok(new_school_points_total('teacher', $tid) === $t0 + 2, 'teacher earns +2 automatically');
    }

    // [2] Student submits the final project (mirrors POST new-school/submission + auto award)
    echo "[2] Student submits the final project\n";
    $ins2 = $pdo->prepare(
        'INSERT INTO new_school_submissions
         (student_id, source_business_id, problem_identified, why_it_matters, proposed_solution, how_it_helps, expected_impact, submission_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), "submitted")'
    );
    $ins2->execute([$sid, $interviewId, 'Problem text', 'Why it matters', 'Proposed solution', 'How it helps', 'Expected impact']);
    $submissionId = (int) $pdo->lastInsertId();
    new_school_points_award_auto($sid, 'project', $submissionId);
    $ok($submissionId > 0, "project created (#$submissionId)");
    $ok(new_school_points_total('student', $sid) === $s0 + 10, 'student earns another +5 automatically');

    // [3] Do they appear in the ADMIN dashboard? (mirrors GET admin/new-school/summary queries)
    echo "[3] Admin dashboard visibility (approval queue)\n";
    $adminBusinesses = $pdo->query(
        'SELECT bi.id FROM new_school_business_interviews bi
         INNER JOIN new_school_students s ON s.id = bi.student_id
         INNER JOIN users u ON u.id = s.user_id ORDER BY bi.created_at DESC'
    )->fetchAll(PDO::FETCH_COLUMN);
    $adminSubs = $pdo->query(
        'SELECT sub.id FROM new_school_submissions sub
         INNER JOIN new_school_students s ON s.id = sub.student_id
         INNER JOIN users u ON u.id = s.user_id ORDER BY sub.updated_at DESC'
    )->fetchAll(PDO::FETCH_COLUMN);
    $ok(in_array((string) $interviewId, array_map('strval', $adminBusinesses), true), "interview #$interviewId appears in admin Business Interviews");
    $ok(in_array((string) $submissionId, array_map('strval', $adminSubs), true), "project #$submissionId appears in admin Submissions (review queue)");

    // [4] Admin approves the project + awards bonus (mirrors PUT submission + POST admin/new-school/points)
    echo "[4] Admin approves project and awards bonus (asks 100/100 -> clamps to 15/8)\n";
    new_school_points_award_bonus($sid, 'project', $submissionId, 100, 100, 1);
    $ok(new_school_points_total('student', $sid) === $s0 + 10 + 15, 'student project bonus clamps to 15');
    if ($tid > 0) {
        $ok(new_school_points_total('teacher', $tid) === $t0 + 4 + 8, 'teacher project bonus clamps to 8');
    }

    // [5] Admin re-approves with new values (replace, not stack)
    echo "[5] Admin edits the project bonus to 6 (re-approve)\n";
    new_school_points_award_bonus($sid, 'project', $submissionId, 6, 3, 1);
    $ok(new_school_points_total('student', $sid) === $s0 + 10 + 6, 'project bonus REPLACED, not stacked');

    // [6] Admin awards interview bonus (mirrors the Interview Points form)
    echo "[6] Admin awards interview bonus (student 4, teacher 1)\n";
    new_school_points_award_bonus($sid, 'interview', $interviewId, 4, 1, 1);
    $ok(new_school_points_total('student', $sid) === $s0 + 10 + 6 + 4, 'interview bonus stacks on top of project bonus');

    // [7] Ranking is driven by points
    echo "[7] Ranking reflects points\n";
    $ranked = new_school_rank_students([
        ['id' => $sid, 'full_name' => $student['full_name'], 'interview_count' => 0],
        ['id' => -1, 'full_name' => 'Zero Points', 'interview_count' => 0],
    ]);
    $ok((int) $ranked[0]['id'] === $sid, 'student with points ranks #1 over a zero-points student');

    echo "\nFinal totals -> student=" . new_school_points_total('student', $sid)
        . ', teacher=' . ($tid > 0 ? new_school_points_total('teacher', $tid) : 0) . "\n";

    $pdo->rollBack();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'workflow check error: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

echo "\n" . ($fail === 0
    ? "WORKFLOW OK — $pass checks passed, nothing persisted (rolled back)."
    : "WORKFLOW HAS ISSUES — $fail failed, $pass passed.") . "\n";
exit($fail === 0 ? 0 : 1);
