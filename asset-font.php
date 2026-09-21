<?php
declare(strict_types=1);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    exit;
}

$file = basename(rawurldecode((string)($_GET['file'] ?? '')));
if ($file === '' || !preg_match('/\.(otf|ttf|woff|woff2|eot)$/i', $file)) {
    http_response_code(400);
    exit;
}

$base = realpath(dirname(__DIR__) . '/aswat/assets/fonts');
if ($base === false) {
    http_response_code(404);
    exit;
}

$path = realpath($base . DIRECTORY_SEPARATOR . $file);
if ($path === false || strpos($path, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($path)) {
    http_response_code(404);
    exit;
}

$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$types = [
    'otf' => 'font/otf',
    'ttf' => 'font/ttf',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'eot' => 'application/vnd.ms-fontobject',
];

header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . (string)filesize($path));
header('Cache-Control: public, max-age=604800, immutable');
header('X-Content-Type-Options: nosniff');
readfile($path);
