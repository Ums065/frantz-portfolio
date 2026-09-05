<?php
/* Draft and scheduling for blog posts, checked against the real database.
   Run with MySQL up:  php scripts/blog_publishing_test.php
   Creates a draft, a scheduled post and a live post, checks who can see what,
   then removes them. */
require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/lib.php';

$fail = 0;
$ok = function (string $what, bool $cond) use (&$fail) {
    echo ($cond ? '  ok   ' : '  FAIL ') . $what . PHP_EOL;
    if (!$cond) $fail++;
};

posts_ensure_schema();
echo "Schema\n";
$ok('posts.status exists', (int) db()->query("SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'status'")->fetchColumn() === 1);
$ok('nothing was unpublished by the migration',
    (int) db()->query("SELECT COUNT(*) FROM posts WHERE status NOT IN ('draft','published')")->fetchColumn() === 0);

$mk = function (string $title, string $status, ?string $date): int {
    $s = db()->prepare('INSERT INTO posts (title, category, excerpt, body, status, published_at) VALUES (?,?,?,?,?,?)');
    $s->execute([$title, 'ZZTest', 'excerpt', 'body text here', $status, $date]);
    return (int) db()->lastInsertId();
};
$today = date('Y-m-d');
$draft = $mk('ZZ Draft', 'draft', $today);
$sched = $mk('ZZ Scheduled', 'published', date('Y-m-d', strtotime('+7 days')));
$live  = $mk('ZZ Live', 'published', $today);
$oldNull = $mk('ZZ No date', 'published', null);

echo "\nWhat post_state() calls each one\n";
$stateOf = function (int $id): string {
    $s = db()->prepare('SELECT status, published_at FROM posts WHERE id = ?');
    $s->execute([$id]);
    return post_state($s->fetch() ?: []);
};
$ok('a draft is a draft', $stateOf($draft) === 'draft');
$ok('a future date is scheduled', $stateOf($sched) === 'scheduled');
$ok('today is published', $stateOf($live) === 'published');
$ok('no date at all is published', $stateOf($oldNull) === 'published');

echo "\nWhat the public list returns\n";
$public = db()->query('SELECT id FROM posts WHERE ' . POSTS_LIVE_SQL)->fetchAll(PDO::FETCH_COLUMN);
$ok('the draft is hidden', !in_array((string) $draft, array_map('strval', $public), true));
$ok('the scheduled one is hidden', !in_array((string) $sched, array_map('strval', $public), true));
$ok('the live one is shown', in_array((string) $live, array_map('strval', $public), true));
$ok('the dateless one is shown', in_array((string) $oldNull, array_map('strval', $public), true));

echo "\nThe day it is due\n";
db()->prepare('UPDATE posts SET published_at = ? WHERE id = ?')->execute([$today, $sched]);
$ok('a scheduled post goes live on its date', $stateOf($sched) === 'published');

echo "\nRelated articles never leak a draft\n";
$rel = db()->prepare('SELECT id FROM posts WHERE id <> ? AND ' . POSTS_LIVE_SQL . ' ORDER BY published_at DESC LIMIT 50');
$rel->execute([$live]);
$ok('no draft among them', !in_array((string) $draft, array_map('strval', $rel->fetchAll(PDO::FETCH_COLUMN)), true));

db()->exec("DELETE FROM posts WHERE category = 'ZZTest'");
echo "\n" . ($fail ? "$fail check(s) FAILED\n" : "All checks passed. Test posts removed.\n");
exit($fail ? 1 : 0);
