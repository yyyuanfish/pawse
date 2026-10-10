#!/usr/bin/env bash
# Records the real-app demo (see README.md in this folder). Needs: Xvfb, PulseAudio, ffmpeg, the Pawse
# backend running with GEMINI_API_KEY and GRADIUM_API_KEY, and the React app built (cd web && npm run build).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
APP_URL="${APP_URL:-http://127.0.0.1:8765/app/?live=1}"
OWNER_WAV="${OWNER_WAV:-$HERE/owner-line.wav}"
NARRATION_WAV="${NARRATION_WAV-$HERE/narrator-intro.wav}"  # narrator over the opening; NARRATION_WAV= (empty) to skip
[ -f "$NARRATION_WAV" ] || NARRATION_WAV=""
MIMI_DIR="${MIMI_DIR:-/mnt/pawse-demo-out/mimi}"  # make-mimi-clip.py output; skipped when missing
OUT_DIR="${OUT_DIR:-/mnt/pawse-demo-out}"  # heavy media stays off the repo disk
mkdir -p "$OUT_DIR"

# Audio: Chromium plays into the null sink "rec" (ffmpeg records its monitor); the owner's line is
# played into the null sink "mic", exposed to Chromium as the source "owner_mic".
pulseaudio --check 2>/dev/null || pulseaudio --start --exit-idle-time=-1
pactl list short sinks | grep -q '\brec\b' || pactl load-module module-null-sink sink_name=rec sink_properties=device.description=rec >/dev/null
pactl list short sinks | grep -q '\bmic\b' || pactl load-module module-null-sink sink_name=mic sink_properties=device.description=mic >/dev/null
pactl list short sources | grep -q owner_mic || pactl load-module module-remap-source master=mic.monitor source_name=owner_mic >/dev/null
pactl set-default-sink rec
pactl set-default-source owner_mic

# The stage page and the opening clip, served together.
STAGE_DIR="$(mktemp -d)"
ln -s "$HERE/stage.html" "$STAGE_DIR/stage.html"
MIMI_ENV=()
if [ -f "$MIMI_DIR/mimi-16x9.mp4" ]; then
  ln -s "$MIMI_DIR/mimi-16x9.mp4" "$STAGE_DIR/mimi.mp4"
  MIMI_ENV=(MIMI_INTRO=1 MIMI_CAMERA="$MIMI_DIR/mimi-9x16.mp4" MIMI_STILL="$MIMI_DIR/mimi-still.jpg")
fi
python3 -m http.server 4180 --bind 127.0.0.1 --directory "$STAGE_DIR" >/dev/null 2>&1 &
STAGE_PID=$!
trap 'kill $STAGE_PID 2>/dev/null || true; rm -rf "$STAGE_DIR"' EXIT
sleep 1

RAW="$OUT_DIR/pawse-demo-real.mkv"
STAGE_URL="http://127.0.0.1:4180/stage.html?app=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$APP_URL")" \
env "${MIMI_ENV[@]}" OWNER_WAV="$OWNER_WAV" NARRATION_WAV="$NARRATION_WAV" OUT="$RAW" \
  xvfb-run -a -s "-screen 0 1920x1080x24" node "$HERE/record-real.mjs"

# Deliverable: silent waits shortened to fit 2:00, h264 + loudness-normalised AAC mp4. Capped at 4 GB RAM so a
# memory regression in the cut fails fast instead of freezing the machine.
CUT=(python3 "$HERE/make-cut.py" "$RAW" "$OUT_DIR/pawse-demo-real.mp4" "${TARGET_SECONDS:-120}")
if systemd-run --user --scope -q -p MemoryMax=4G true 2>/dev/null; then
  systemd-run --user --scope -q -p MemoryMax=4G "${CUT[@]}"
else
  "${CUT[@]}"
fi
echo "Saved $OUT_DIR/pawse-demo-real.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_DIR/pawse-demo-real.mp4")s)"
