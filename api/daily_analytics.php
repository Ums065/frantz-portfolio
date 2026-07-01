<?php
declare(strict_types=1);

/**
 * Daily activity digest for the admin.
 * Run from the CLI (e.g. a Windows Task Scheduler / cron job):
 *     php daily_analytics.php            # today
 *     php daily_analytics.php 2026-07-01 # a specific date (for testing)
 *
 * If anything new happened that day it emails a branded HTML summary with a
 * generated daily-analytics-<date>.pdf attached. If nothing happened it sends a
 * short "no new activity" email instead — no PDF.
 */

if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';
require __DIR__ . '/simple_pdf.php';

/** Count rows for a query, swallowing a missing-table error as 0. */
function da_count(string $sql, array $params = []): int
{
    try {
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    } catch (\Throwable $e) {
        return 0;
    }
}

/** Fetch a few detail rows, swallowing a missing-table error as []. */
function da_rows(string $sql, array $params = []): array
{
    try {
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    } catch (\Throwable $e) {
        return [];
    }
}

/**
 * Build the report sections for a date.
 * Returns ['activity' => int, 'sections' => [...], 'info' => [...]].
 * "activity" counts real events (registrations, submissions, orders, messages…)
 * and drives the PDF-vs-simple-mail decision; page views are informational only.
 */
function daily_analytics_report(string $date): array
{
    $d = [$date];
    $sections = [];

    // New accounts by role
    $accountRows = da_rows(
        'SELECT role, full_name, email FROM users WHERE DATE(created_at) = ? ORDER BY role, created_at',
        $d
    );
    if ($accountRows) {
        $byRole = [];
        foreach ($accountRows as $r) {
            $byRole[(string) $r['role']] = ($byRole[(string) $r['role']] ?? 0) + 1;
        }
        $lines = [];
        foreach ($byRole as $role => $n) {
            $lines[] = ucfirst($role) . ': ' . $n;
        }
        foreach (array_slice($accountRows, 0, 15) as $r) {
            $lines[] = '  - ' . ucfirst((string) $r['role']) . ' — ' . (string) $r['full_name'] . ' (' . (string) $r['email'] . ')';
        }
        $sections[] = ['label' => 'New Accounts', 'count' => count($accountRows), 'lines' => $lines];
    }

    $simple = [
        ['New Requests', 'SELECT request_type, full_name, email FROM requests WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['request_type'] . ' — ' . (string) $r['full_name'] . ' (' . (string) $r['email'] . ')'],
        ['Contact Messages', 'SELECT full_name, email FROM contact_messages WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['full_name'] . ' (' . (string) $r['email'] . ')'],
        ['Orders', 'SELECT order_no, customer_name, total FROM orders WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['order_no'] . ' — ' . (string) $r['customer_name'] . ' — $' . number_format((float) $r['total'], 2)],
        ['Event RSVPs', 'SELECT full_name, status FROM event_rsvps WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['full_name'] . ' — ' . (string) $r['status']],
        ['Sponsor Applications', 'SELECT organization_name, sponsorship_level_name FROM sponsor_applications WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['organization_name'] . ' — ' . (string) $r['sponsorship_level_name']],
        ['Gallery Uploads', 'SELECT submitter_name FROM gallery_submissions WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['submitter_name']],
        ['Community Threads', 'SELECT title FROM community_threads WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['title']],
        ['New Subscribers', 'SELECT email FROM subscribers WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['email']],
        ['New School — Students', 'SELECT full_name, school_name FROM new_school_students WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['full_name'] . ' — ' . (string) $r['school_name']],
        ['New School — Teachers', 'SELECT teacher_full_name FROM new_school_teachers WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['teacher_full_name']],
        ['New School — Schools', 'SELECT school_name FROM new_school_schools WHERE DATE(created_at) = ? ORDER BY created_at',
            static fn($r) => (string) $r['school_name']],
    ];

    foreach ($simple as [$label, $sql, $fmt]) {
        $rows = da_rows($sql, $d);
        if (!$rows) {
            continue;
        }
        $lines = [];
        foreach (array_slice($rows, 0, 15) as $r) {
            $lines[] = '  - ' . $fmt($r);
        }
        if (count($rows) > 15) {
            $lines[] = '  … and ' . (count($rows) - 15) . ' more';
        }
        $sections[] = ['label' => $label, 'count' => count($rows), 'lines' => $lines];
    }

    // Community comments — count only
    $comments = da_count('SELECT COUNT(*) FROM community_comments WHERE DATE(created_at) = ?', $d);
    if ($comments > 0) {
        $sections[] = ['label' => 'Community Comments', 'count' => $comments, 'lines' => []];
    }

    $activity = 0;
    foreach ($sections as $s) {
        $activity += (int) $s['count'];
    }

    // Informational: site traffic (does not count toward "did anything happen").
    $info = [
        'Page views' => da_count('SELECT COUNT(*) FROM site_visits WHERE DATE(created_at) = ?', $d),
        'Unique visitors' => da_count('SELECT COUNT(DISTINCT visitor_token) FROM site_visits WHERE DATE(created_at) = ?', $d),
    ];

    return ['activity' => $activity, 'sections' => $sections, 'info' => $info];
}

/** Render the report to a PDF byte string. */
function daily_analytics_pdf(string $date, array $report): string
{
    $pdf = new SimplePdf();
    $pdf->title('Daily Activity Report');
    $pdf->line($date, true);
    $pdf->line('Total new items: ' . (int) $report['activity']);
    $pdf->spacer(6);

    foreach ($report['sections'] as $s) {
        $pdf->heading($s['label'] . ' (' . (int) $s['count'] . ')');
        foreach ($s['lines'] as $line) {
            $pdf->line($line);
        }
    }

    $pdf->spacer(10);
    $pdf->heading('Website Traffic');
    foreach ($report['info'] as $label => $value) {
        $pdf->line($label . ': ' . (int) $value);
    }

    return $pdf->output();
}

/* ---------------- Orchestration ---------------- */

$date = isset($argv[1]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $argv[1]) ? (string) $argv[1] : date('Y-m-d');

if (!filter_var(env('MAIL_ENABLED', 'false'), FILTER_VALIDATE_BOOLEAN)) {
    fwrite(STDERR, "MAIL_ENABLED is false — nothing sent.\n");
    exit(0);
}
$to = trim((string) env('NOTIFY_EMAIL', '')) !== '' ? trim((string) env('NOTIFY_EMAIL', '')) : mail_from_address();
if ($to === '') {
    fwrite(STDERR, "No NOTIFY_EMAIL configured — nothing sent.\n");
    exit(0);
}

$report = daily_analytics_report($date);

if ($report['activity'] === 0) {
    // Nothing new — short email, no PDF.
    $html = email_paragraph('Hi,')
        . email_paragraph('There was no new activity on ' . $date . '. No report is attached.')
        . email_details($report['info']);
    $text = "Hi,\n\nThere was no new activity on {$date}. No report is attached.\n\n"
        . 'Page views: ' . (int) $report['info']['Page views'] . "\n"
        . 'Unique visitors: ' . (int) $report['info']['Unique visitors'] . "\n";
    $built = [
        'subject' => 'Daily Activity — no new activity (' . $date . ')',
        'html' => email_layout('Daily Activity — ' . $date, $html, 'No new activity today'),
        'text' => $text,
    ];
    queue_themed_mail('daily_analytics', $to, $built);
    // Running from the CLI there is no web request to inline-drain the queue, so
    // flush it here (also clears any other mail left queued by web requests).
    $stats = mail_queue_drain(30, 90);
    echo json_encode(['date' => $date, 'activity' => 0, 'pdf' => false, 'drain' => $stats]) . "\n";
    exit(0);
}

// Something happened — build a PDF summary and attach it.
$pdfBytes = daily_analytics_pdf($date, $report);

$summaryRows = [];
foreach ($report['sections'] as $s) {
    $summaryRows[$s['label']] = (string) (int) $s['count'];
}
$html = email_paragraph('Hi,')
    . email_paragraph('Here is a summary of new activity on ' . $date . '. The full report is attached as a PDF.')
    . email_details($summaryRows)
    . email_note('Page views: ' . (int) $report['info']['Page views'] . '  ·  Unique visitors: ' . (int) $report['info']['Unique visitors']);
$textLines = ['Hi,', '', 'New activity on ' . $date . ' (full report attached as PDF):', ''];
foreach ($report['sections'] as $s) {
    $textLines[] = '- ' . $s['label'] . ': ' . (int) $s['count'];
}
$built = [
    'subject' => 'Daily Activity Report — ' . $date,
    'html' => email_layout('Daily Activity — ' . $date, $html, (int) $report['activity'] . ' new items today'),
    'text' => email_text($textLines),
];
$attachments = [[
    'filename' => 'daily-analytics-' . $date . '.pdf',
    'mime' => 'application/pdf',
    'data' => $pdfBytes,
]];
queue_themed_mail('daily_analytics', $to, $built, $attachments);
// CLI has no web request to inline-drain the queue — flush it here.
$stats = mail_queue_drain(30, 90);
echo json_encode(['date' => $date, 'activity' => $report['activity'], 'pdf' => true, 'drain' => $stats]) . "\n";
