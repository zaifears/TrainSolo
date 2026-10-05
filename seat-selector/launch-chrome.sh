#!/usr/bin/env bash
# Dedicated Chrome Launcher for Bangladesh Railway Assistant
# Ensures CDP is bound strictly to loopback (127.0.0.1:9222) and uses an isolated profile directory.

PROFILE_DIR="$(pwd)/chrome-profile"
mkdir -p "$PROFILE_DIR"

CHROME_BIN=""
if command -v google-chrome &> /dev/null; then
    CHROME_BIN="google-chrome"
elif command -v chromium-browser &> /dev/null; then
    CHROME_BIN="chromium-browser"
elif command -v chromium &> /dev/null; then
    CHROME_BIN="chromium"
elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

if [ -z "$CHROME_BIN" ]; then
    echo "Error: Chromium or Google Chrome binary not found."
    exit 1
fi

echo "=========================================================="
echo "Launching Isolated Dedicated Chrome Profile..."
echo "Profile Dir  : $PROFILE_DIR"
echo "CDP Endpoint : http://127.0.0.1:9222"
echo "=========================================================="

"$CHROME_BIN" \
    --remote-debugging-port=9222 \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    "https://eticket.railway.gov.bd" &
