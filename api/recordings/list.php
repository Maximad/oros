<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    recordings_json(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

recordings_ensure_storage();

$limit = (int)($_GET['limit'] ?? 6);
$limit = max(1, min(24, $limit));
$page = (int)($_GET['page'] ?? 1);
$page = max(1, $page);
$song = recordings_text($_GET['song'] ?? '', 80);
$voice = recordings_text($_GET['voice'] ?? '', 80);

$files = glob(recordings_meta_dir() . '/*.json') ?: [];
rsort($files, SORT_STRING);
$items = [];

foreach ($files as $path) {
    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') continue;
    $item = json_decode($raw, true);
    if (!is_array($item)) continue;
    if ($song !== '' && (string)($item['song'] ?? '') !== $song) continue;
    if ($voice !== '' && (string)($item['voice'] ?? '') !== $voice) continue;
    $items[] = recordings_public_item($item);
}

$total = count($items);
$pages = max(1, (int)ceil($total / $limit));
if ($page > $pages) $page = $pages;
$offset = ($page - 1) * $limit;
$paged = array_slice($items, $offset, $limit);

recordings_json([
    'ok' => true,
    'items' => array_values($paged),
    'page' => $page,
    'pages' => $pages,
    'total' => $total,
    'has_more' => $page < $pages,
]);
