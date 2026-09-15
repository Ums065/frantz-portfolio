<?php
/* The tags a share card and a search result actually read, checked against
   spa.php itself — over HTTP, so it is the served page being tested and not a
   copy of the logic.

   Run with the site up:  php scripts/share_meta_test.php
   Point it elsewhere:    BASE=https://frantzcoutard.com php scripts/share_meta_test.php

   The case that started this: a title reading "Starting at $29 a Month" came
   out as "Starting at  a Month" on every share. The text was being handed to
   preg_replace as its REPLACEMENT, where $29 means capture group 29 — absent,
   so PHP put nothing there. "$100" kept only its last zero.
*/
require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/lib.php';

$base = rtrim((string) (getenv('BASE') ?: 'http://localhost/frantz-portfolio'), '/');
$fail = 0;
$ok = function (string $what, bool $cond, string $detail = '') use (&$fail) {
    echo ($cond ? '  ok   ' : '  FAIL ') . $what . ($cond || $detail === '' ? '' : "\n         $detail") . PHP_EOL;
    if (!$cond) $fail++;
};

$title = 'ZZ Meta Test. Starting at $29 a Month.';
$excerpt = 'Win a $100 credit, save $5, and keep \1 intact.';

posts_ensure_schema();
$s = db()->prepare('INSERT INTO posts (title, category, excerpt, body, status, published_at) VALUES (?,?,?,?,?,?)');
$s->execute([$title, 'ZZTest', $excerpt, 'Body.', 'published', site_today()]);
$id = (int) db()->lastInsertId();
register_shutdown_function(static function () use ($id): void {
    try { db()->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]); } catch (Throwable $e) { /* nothing to do */ }
});

$html = @file_get_contents("$base/blog/$id");
if ($html === false) {
    echo "  skip  could not reach $base — is the web server running?\n";
    exit(0);
}

$grab = static function (string $pattern) use ($html): string {
    return preg_match($pattern, $html, $m) ? html_entity_decode($m[1], ENT_QUOTES) : '';
};
$tagTitle = $grab('#<title>([^<]*)</title>#i');
$ogTitle = $grab('#<meta\s+property="og:title"\s+content="([^"]*)"#i');
$ogDesc = $grab('#<meta\s+property="og:description"\s+content="([^"]*)"#i');
$metaDesc = $grab('#<meta\s+name="description"\s+content="([^"]*)"#i');

echo "Prices survive the meta tags\n";
$ok('<title> keeps $29', strpos($tagTitle, '$29 a Month') !== false, "got: $tagTitle");
$ok('og:title keeps $29', strpos($ogTitle, '$29 a Month') !== false, "got: $ogTitle");
$ok('og:description keeps $100 and $5', strpos($ogDesc, '$100') !== false && strpos($ogDesc, '$5') !== false, "got: $ogDesc");
$ok('description keeps a backslash escape', strpos($metaDesc, '\1') !== false, "got: $metaDesc");

echo "\nThe route was recognised at all\n";
$ok('the page is not a 404 shell', strpos($tagTitle, 'ZZ Meta Test') !== false,
    'spa.php did not match the route — check the subfolder base');
$ok('canonical points at this article', strpos($html, "/blog/$id\"") !== false);

echo "\n" . ($fail ? "$fail check(s) FAILED\n" : "All checks passed. Test post removed.\n");
exit($fail ? 1 : 0);
