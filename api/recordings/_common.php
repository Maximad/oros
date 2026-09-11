<?php
declare(strict_types=1);

const RECORDING_MAX_BYTES = 12582912; // 12 MB
const RECORDING_RATE_LIMIT = 12;
const RECORDING_RATE_WINDOW = 3600;

function recordings_root(): string {
    return dirname(__DIR__, 2);
}

function recordings_data_dir(): string {
    return recordings_root() . '/recordings-data';
}

function recordings_audio_dir(): string {
    return recordings_data_dir() . '/audio';
}

function recordings_meta_dir(): string {
    return recordings_data_dir() . '/meta';
}

function recordings_rate_dir(): string {
    return recordings_data_dir() . '/rate';
}

function recordings_ensure_storage(): void {
    foreach ([recordings_data_dir(), recordings_audio_dir(), recordings_meta_dir(), recordings_rate_dir()] as $dir) {
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            recordings_json(['ok' => false, 'error' => 'storage_unavailable'], 500);
        }
    }
}

function recordings_json(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function recordings_text($value, int $max = 120): string {
    $text = trim((string)$value);
    $text = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text) ?? '';
    $text = preg_replace('/\s+/u', ' ', $text) ?? '';
    if (function_exists('mb_substr')) return mb_substr($text, 0, $max, 'UTF-8');
    return substr($text, 0, $max);
}

function recordings_request_host(): string {
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    return preg_replace('/:\d+$/', '', $host) ?? $host;
}

function recordings_validate_origin(): void {
    $host = recordings_request_host();
    if ($host === '') return;
    foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $key) {
        $value = trim((string)($_SERVER[$key] ?? ''));
        if ($value === '') continue;
        $requestHost = strtolower((string)(parse_url($value, PHP_URL_HOST) ?? ''));
        if ($requestHost !== '' && $requestHost !== $host) {
            recordings_json(['ok' => false, 'error' => 'origin_not_allowed'], 403);
        }
        return;
    }
}

function recordings_rate_limit(): void {
    recordings_ensure_storage();
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $key = hash('sha256', $ip);
    $path = recordings_rate_dir() . '/' . $key . '.json';
    $now = time();
    $events = [];
    if (is_file($path)) {
        $raw = @file_get_contents($path);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($decoded)) $events = $decoded;
    }
    $events = array_values(array_filter($events, function ($ts) use ($now) {
        return is_numeric($ts) && (int)$ts > $now - RECORDING_RATE_WINDOW;
    }));
    if (count($events) >= RECORDING_RATE_LIMIT) {
        recordings_json(['ok' => false, 'error' => 'rate_limited'], 429);
    }
    $events[] = $now;
    @file_put_contents($path, json_encode($events), LOCK_EX);
}

function recordings_public_item(array $item): array {
    return [
        'id' => (string)($item['id'] ?? ''),
        'created_at' => (string)($item['created_at'] ?? ''),
        'song' => (string)($item['song'] ?? ''),
        'voice' => (string)($item['voice'] ?? ''),
        'segment' => (string)($item['segment'] ?? ''),
        'display_name' => (string)($item['display_name'] ?? ''),
        'duration' => (float)($item['duration'] ?? 0),
        'audio_url' => (string)($item['audio_url'] ?? ''),
        'mime' => (string)($item['mime'] ?? ''),
    ];
}
