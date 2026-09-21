#!/usr/bin/env bash
set -euo pipefail

SRC="$HOME/domains/habaq.online/public_html/oros"
LIVE="$HOME/domains/habaq.online/public_html/aswat"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/aswat-code-$STAMP.tar.gz"

require_dir() {
  test -d "$1" || { echo "ERROR: missing directory: $1" >&2; exit 1; }
}

require_dir "$SRC"
require_dir "$LIVE"
require_dir "$LIVE/assets"

echo "== Backing up current live code =="
tar -czf "$BACKUP" \
  --exclude='./assets' \
  --exclude='./recordings-data' \
  -C "$LIVE" .
echo "Backup: $BACKUP"

echo "== Syncing staging code to live =="
rsync -av \
  --exclude='.git/' \
  --exclude='assets/' \
  --exclude='recordings-data/' \
  "$SRC/" "$LIVE/"

# Remove known obsolete files from older versions. Their history remains in Git.
rm -f \
  "$LIVE/choir-mix.js" \
  "$LIVE/training-copy.js" \
  "$LIVE/voice-enhance.js"

echo "== Preparing persistent recording storage =="
mkdir -p \
  "$LIVE/recordings-data/audio" \
  "$LIVE/recordings-data/meta" \
  "$LIVE/recordings-data/rate"
chmod 755 \
  "$LIVE/recordings-data" \
  "$LIVE/recordings-data/audio" \
  "$LIVE/recordings-data/meta" \
  "$LIVE/recordings-data/rate"

if [ -d "$LIVE/api" ]; then
  find "$LIVE/api" -type d -exec chmod 755 {} \;
  find "$LIVE/api" -type f -exec chmod 644 {} \;
fi

echo "== PHP syntax checks =="
php -l "$LIVE/api/recordings/_common.php"
php -l "$LIVE/api/recordings/list.php"
php -l "$LIVE/api/recordings/upload.php"

echo "== Expected production markers =="
grep -q "4 مسارات صوتية" "$LIVE/choir-player-v2.js"
grep -q "لولا الشقاء" "$LIVE/choir-training-data.js"
grep -q "السويدا باهلها" "$LIVE/choir-training-data.js"
echo "Code markers: OK"

echo "== Live HTTP checks =="
curl -fsS -o /dev/null "https://aswat.habaq.online/"
echo "Homepage: OK"

API_RESULT="$(curl -fsS 'https://aswat.habaq.online/api/recordings/list.php?limit=1&page=1')"
printf '%s' "$API_RESULT" | grep -q '"ok":true'
echo "Recordings API: OK"

echo
echo "DEPLOYMENT COMPLETE"
echo "Live: https://aswat.habaq.online/"
echo "Backup: $BACKUP"
