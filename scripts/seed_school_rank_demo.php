<?php
declare(strict_types=1);
require __DIR__ . '/../api/env.php';
load_env(__DIR__ . '/../api/.env');
$dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', env('DB_HOST','127.0.0.1'), env('DB_PORT','3306'), env('DB_NAME','frantz_portfolio'), env('DB_CHARSET','utf8mb4'));
$pdo = new PDO($dsn, env('DB_USER','root'), env('DB_PASS',''), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$hash = password_hash('DemoPass123!', PASSWORD_DEFAULT);

// demo schools: name => [student_count, yesterday_rank]
$demo = [
  'Lincoln STEM Academy' => [24, 2],
  'Riverside Prep'        => [19, 1],
  'Summit High'           => [15, 3],
  'Oakwood Academy'       => [11, 6],
  'Maple Grove School'    => [7,  4],
  'Harbor Charter'        => [2,  5],
];
// New School Academy (existing): today rank 6, yesterday 7 (climbs +1)
$existingYesterday = ['New School Academy' => 7];

if ($pdo->query("SELECT id FROM new_school_schools WHERE school_name = 'Lincoln STEM Academy'")->fetch()) {
  echo "Demo schools already seeded. Aborting to avoid duplicates.\n"; exit(0);
}

$pid = 20000000;
$mkUser = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, role, approval_status, email_verified_at) VALUES (?,?,?,?,"approved",NOW())');
$mkSchool = $pdo->prepare('INSERT INTO new_school_schools (user_id, school_name, school_address, school_district, main_phone, principal_name, administrator_name, administrator_email, administrator_phone, status) VALUES (?,?,?,?,?,?,?,?,?,"approved")');
$mkStudent = $pdo->prepare('INSERT INTO new_school_students (user_id, school_id, teacher_id, participant_id, qr_token, qr_url, full_name, student_username, age, date_of_birth, email, phone_number, home_address, school_name, grade_level, parent_name, parent_phone, parent_email, parent_consent_status, school_approval_status, teacher_approval_status, submission_status, overall_status) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
$statuses = ['pending','approved','approved','pending','rejected'];
$slug = fn($s) => strtolower(preg_replace('/[^a-z0-9]+/i','-', $s));

foreach ($demo as $name => [$count, $yRank]) {
  $adminEmail = 'demo.'.$slug($name).'.admin@demo.frantzcoutard.test';
  $mkUser->execute(['Admin of '.$name, $adminEmail, $hash, 'school']);
  $uid = (int)$pdo->lastInsertId();
  $mkSchool->execute([$uid, $name, '1 Demo Street', 'Demo District', '555-0000', 'Principal '.$name, 'Admin '.$name, $adminEmail, '555-0001']);
  $sid = (int)$pdo->lastInsertId();
  for ($i=1; $i<=$count; $i++) {
    $pid++;
    $semail = 'demo.stu.'.$slug($name).'.'.$i.'@demo.frantzcoutard.test';
    $mkUser->execute(['Demo Student '.$i, $semail, $hash, 'student']);
    $suid = (int)$pdo->lastInsertId();
    $tok = bin2hex(random_bytes(10));
    $st = $statuses[($i-1) % count($statuses)];
    $mkStudent->execute([$suid, $sid, (string)$pid, $tok, '/new-school/parent/'.$tok, 'Demo Student '.$i, 'demo_'.$slug($name).'_'.$i, 12 + ($i % 7), '2010-01-01', $semail, '555-1000', 'Demo Ave', $name, '9', 'Parent '.$i, '555-2000', 'demoparent.'.$slug($name).'.'.$i.'@demo.frantzcoutard.test', $st, $st, $st, 'locked', 'student_registered']);
  }
  echo "seeded '$name' with $count students (school_id=$sid)\n";
}

// Backdate yesterday snapshots so today's movement arrows show.
$y = date('Y-m-d', strtotime('-1 day'));
$snap = $pdo->prepare('INSERT INTO new_school_school_rank_snapshots (school_id, rank_position, student_count, snapshot_date) VALUES (?,?,0,?) ON DUPLICATE KEY UPDATE rank_position=VALUES(rank_position)');
$all = array_merge($demo, $existingYesterday);
foreach ($all as $name => $info) {
  $yRank = is_array($info) ? $info[1] : $info;
  $row = $pdo->prepare('SELECT id FROM new_school_schools WHERE school_name = ?'); $row->execute([$name]);
  $sid = $row->fetchColumn();
  if ($sid) { $snap->execute([(int)$sid, (int)$yRank, $y]); echo "yesterday rank for '$name' = $yRank\n"; }
}
echo "DONE\n";
