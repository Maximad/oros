<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    recordings_json(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

recordings_validate_origin();
recordings_rate_limit();
recordings_ensure_storage();

if (!isset($_FILES['recording']) || !is_array($_FILES['recording'])) {
    recordings_json(['ok' => false, 'error' => 'missing_recording'], 400);
}

$file = $_FILES['recording'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    recordings_json(['ok' => false, 'error' => 'upload_error'], 400);
}

$size = (int)($file['size'] ?? 0);
if ($size <= 0 || $size > RECORDING_MAX_BYTES) {
    recordings_json(['ok' => false, 'error' => 'file_too_large'], 413);
}

$tmp = (string)($file['tmp_name'] ?? '');
if ($tmp === '' || !is_uploaded_file($tmp)) {
    recordings_json(['ok' => false, 'error' => 'invalid_upload'], 400);
}

if (($_POST['consent'] ?? '') !== 'yes') {
    recordings_json(['ok' => false, 'error' => 'consent_required'], 400);
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = strtolower((string)$finfo->file($tmp));
$allowed = [
    'audio/webm' => 'webm',
    'video/webm' => 'webm',
    'audio/mp4' => 'm4a',
    'video/mp4' => 'm4a',
    'audio/x-m4a' => 'm4a',
    'audio/ogg' => 'ogg',
    'application/ogg' => 'ogg',
    'audio/mpeg' => 'mp3',
];
if (!isset($allowed[$mime])) {
    recordings_json(['ok' => false, 'error' => 'unsupported_audio_type', 'mime' => $mime], 415);
}

$song = recordings_text($_POST['song'] ?? '', 80);
$voice = recordings_text($_POST['voice'] ?? '', 80);
$segment = recordings_text($_POST['segment'] ?? '', 100);
$lyrics = recordings_text($_POST['lyrics'] ?? '', 500);
$displayName = recordings_text($_POST['display_name'] ?? '', 60);
$duration = (float)($_POST['duration'] ?? 0);
$duration = max(0, min(180, $duration));

$allowedSongs = ['وصلة تراثية', 'ديرتي'];
$allowedVoices = ['سوبرانو', 'ألتو', 'كاونتر تينور', 'تينور', 'باس', 'دوبل باس'];
if (!in_array($song, $allowedSongs, true) || !in_array($voice, $allowedVoices, true)) {
    recordings_json(['ok' => false, 'error' => 'invalid_context'], 400);
}

try {
    $random = bin2hex(random_bytes(6));
} catch (Throwable $e) {
    $random = substr(hash('sha256', uniqid('', true)), 0, 12);
}
$id = gmdate('YmdHis') . '-' . $random;
$ext = $allowed[$mime];
$audioName = $id . '.' . $ext;
$audioPath = recordings_audio_dir() . '/' . $audioName;

if (!move_uploaded_file($tmp, $audioPath)) {
    recordings_json(['ok' => false, 'error' => 'storage_write_failed'], 500);
}
@chmod($audioPath, 0644);

$item = [
    'id' => $id,
    'created_at' => gmdate('c'),
    'song' => $song,
    'voice' => $voice,
    'segment' => $segment,
    'lyrics' => $lyrics,
    'display_name' => $displayName,
    'duration' => round($duration, 3),
    'mime' => $mime,
    'audio_url' => 'recordings-data/audio/' . $audioName,
    'size' => $size,
];

$metaPath = recordings_meta_dir() . '/' . $id . '.json';
$encoded = json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if (!is_string($encoded) || file_put_contents($metaPath, $encoded, LOCK_EX) === false) {
    @unlink($audioPath);
    recordings_json(['ok' => false, 'error' => 'metadata_write_failed'], 500);
}
@chmod($metaPath, 0644);

recordings_json(['ok' => true, 'item' => recordings_public_item($item)], 201);
