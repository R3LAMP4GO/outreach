#!/usr/bin/env bash
# impl: playwright (project-local pin)
# Screenshot any URL via headless Chromium. Works for any web framework —
# it only needs an HTTP server.
#
# Usage:
#   visual.sh <url> [WxH] [--selector <css>] [--wait-for-selector <css>]
#                   [--full-page|--viewport-only]
#                   [--wait-ms <n>] [--no-wait-animations]
#
# Defaults: full-page, viewport 1280x800, --wait-for-animations ON
# (waits for Web Animations API to settle, capped at 8s).
#
# Prints the absolute PNG path to stdout.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

URL="${1:-}"
[ -z "$URL" ] && eyes_die "usage: visual.sh <url> [WxH] [--selector css] [--wait-for-selector css] [--full-page|--viewport-only] [--wait-ms n] [--no-wait-animations]"
shift

VIEWPORT="1280x800"
FULL_PAGE=1
SELECTOR=""
WAIT_SELECTOR=""
WAIT_MS=0
WAIT_ANIM=1

if [ "$#" -gt 0 ] && [[ "$1" =~ ^[0-9]+[x,][0-9]+$ ]]; then
  VIEWPORT="${1/,/x}"
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --selector) SELECTOR="$2"; shift 2;;
    --wait-for-selector) WAIT_SELECTOR="$2"; shift 2;;
    --full-page) FULL_PAGE=1; shift;;
    --viewport-only) FULL_PAGE=0; shift;;
    --wait-ms) WAIT_MS="$2"; shift 2;;
    --no-wait-animations) WAIT_ANIM=0; shift;;
    --wait-for-animations) WAIT_ANIM=1; shift;;
    *) eyes_die "unknown arg: $1";;
  esac
done

PROJECT_ROOT="$(eyes_project_root)"
SCREENSHOT_BIN="$SCRIPT_DIR/bin/screenshot.mjs"

[ -f "$SCREENSHOT_BIN" ] || eyes_die "missing $SCREENSHOT_BIN"
[ -d "$PROJECT_ROOT/node_modules/playwright" ] \
  || eyes_die "playwright not installed in project. Run: bun add -D playwright && bunx playwright install chromium"

# Confirm Chromium binary is present on disk.
PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
if [ "$(eyes_os)" = "linux" ] && [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  PW_CACHE="$HOME/.cache/ms-playwright"
fi
if ! ls -d "$PW_CACHE"/chromium-* >/dev/null 2>&1 && ! ls -d "$PW_CACHE"/chromium_headless_shell-* >/dev/null 2>&1; then
  eyes_die "Chromium browser missing at $PW_CACHE. Run: bunx playwright install chromium"
fi

OUT="$(eyes_out_dir)/screenshot-$(eyes_timestamp).png"
ARGS=("$URL" --out "$OUT" --viewport "$VIEWPORT")
[ "$FULL_PAGE" -eq 1 ] && ARGS+=(--full-page)
[ "$WAIT_ANIM" -eq 1 ] && ARGS+=(--wait-for-animations)
[ -n "$SELECTOR" ] && ARGS+=(--selector "$SELECTOR")
[ -n "$WAIT_SELECTOR" ] && ARGS+=(--wait-for-selector "$WAIT_SELECTOR")
[ "$WAIT_MS" -gt 0 ] && ARGS+=(--wait-ms "$WAIT_MS")

(
  cd "$PROJECT_ROOT"
  eyes_timeout 60 bunx --bun node "$SCREENSHOT_BIN" "${ARGS[@]}" >&2
) || eyes_die "playwright screenshot failed (is the server running at $URL?)"

[ -s "$OUT" ] || eyes_die "screenshot empty: $OUT"
echo "$OUT"
