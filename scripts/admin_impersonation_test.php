<?php

declare(strict_types=1);

// Verifies the admin "view as user" session-swap helpers: start preserves the
// original admin, re-targeting keeps the original impersonator, and stop restores.

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib.php';

$fail = static function (string $m): void { fwrite(STDERR, 'FAIL: ' . $m . PHP_EOL); exit(1); };
$assert = static function (bool $c, string $m) use ($fail): void { if (!$c) { $fail($m); } };

$pdo = db();
$adminId = (int) $pdo->query("SELECT id FROM users WHERE role IN ('admin','super_admin','editor') ORDER BY id LIMIT 1")->fetchColumn();
$ids = $pdo->query("SELECT id FROM users WHERE role NOT IN ('admin','super_admin','editor') ORDER BY id LIMIT 2")->fetchAll(PDO::FETCH_COLUMN);
$assert($adminId > 0 && count($ids) >= 2, 'Need one admin and two non-admin users to test.');
[$targetA, $targetB] = [(int) $ids[0], (int) $ids[1]];

$_SESSION = [];
$_SESSION['uid'] = $adminId;

$assert(!impersonation_active(), 'Should not be impersonating initially.');
$assert(impersonator_user() === null, 'No impersonator before start.');

// Start impersonating target A.
start_impersonation($adminId, $targetA);
$assert($_SESSION['uid'] === $targetA, 'Session uid must switch to target A.');
$assert(impersonation_active(), 'Impersonation must be active after start.');
$imp = impersonator_user();
$assert($imp !== null && (int) $imp['id'] === $adminId, 'Impersonator must be the original admin.');

// Re-target to B: the original admin must be preserved as the impersonator.
start_impersonation($targetA, $targetB);
$assert($_SESSION['uid'] === $targetB, 'Session uid must switch to target B.');
$assert((int) ($_SESSION['impersonator_uid']) === $adminId, 'Re-target must keep the ORIGINAL admin as impersonator.');

// Stop restores the original admin.
$assert(stop_impersonation() === true, 'stop should report true while impersonating.');
$assert($_SESSION['uid'] === $adminId, 'Stop must restore the admin session.');
$assert(!impersonation_active(), 'No longer impersonating after stop.');

// Stop again is a no-op.
$assert(stop_impersonation() === false, 'stop must report false when not impersonating.');

echo 'PASS: impersonation start/re-target/stop preserve and restore the admin session correctly.' . PHP_EOL;
