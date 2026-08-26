#!/bin/bash
# Launch the Tauri dev app, capture evidence, then shut it down on its own.
# Never leaves a window for a human to close.
SP="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${TMPDIR:-/tmp}/devoirs-dev.log"
cleanup() {
  pkill -f 'target/debug/homework' 2>/dev/null
  # `tauri dev` spawns vite as beforeDevCommand; killing only the app leaves it
  # squatting port 1420 and the next probe fails to start. Kill only the vite
  # holding OUR port, never every vite on the machine — another session may be
  # running one.
  local squatter
  squatter=$(lsof -nP -tiTCP:1420 -sTCP:LISTEN 2>/dev/null)
  if [ -n "$squatter" ]; then
    kill $squatter 2>/dev/null
  fi
  [ -n "$DEVPID" ] && kill "$DEVPID" 2>/dev/null
}
trap cleanup EXIT

cd "$SP" || exit 9
if lsof -nP -iTCP:1420 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "PORT_1420_ALREADY_IN_USE — a stray vite is squatting the Tauri dev port"; exit 2
fi

pnpm tauri dev > "$LOG" 2>&1 &
DEVPID=$!
for i in $(seq 1 240); do
  pgrep -f 'target/debug/homework' >/dev/null && break
  # fail fast instead of waiting out the timeout on a startup error
  if grep -qE 'beforeDevCommand.*non-zero|Port 1420 is already in use|error\[|^error:' "$LOG" 2>/dev/null; then
    echo "STARTUP_FAILED — see $LOG"; tr '\r' '\n' < "$LOG" | grep -iE 'error' | tail -5; exit 3
  fi
  sleep 1
done
pgrep -f 'target/debug/homework' >/dev/null || { echo "APP_NEVER_STARTED"; exit 1; }

sleep 4
echo "--- window titles ---"
osascript -e 'tell application "System Events" to get title of every window of (every process whose background only is false)' 2>&1
echo "--- app process ---"
pgrep -fl 'target/debug/homework'
echo "--- screenshot ---"
screencapture -x "${TMPDIR:-/tmp}/devoirs.png" 2>&1 && echo "saved ${TMPDIR:-/tmp}/devoirs.png" || echo "screencapture unavailable"
