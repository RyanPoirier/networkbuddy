#!/usr/bin/env bash
# setup-phone.sh — one-shot setup for Apollo phone reveal.
#
# What it does (all of it, so you don't juggle terminals):
#   1. (Re)starts a Cloudflare quick tunnel to localhost:3000
#   2. Reads the tunnel's fresh public URL automatically
#   3. Points the app's webhook env var at it (APOLLO_PHONE_WEBHOOK_URL)
#   4. Restarts the dev server so it loads the new env var
#
# NOTE: a Cloudflare quick tunnel exposes your local dev server to the public
# internet for as long as it runs. Stop everything when done (command printed
# at the end). Re-run this script any time (each run mints a fresh URL and
# re-syncs everything).
#
# Usage:  bash ~/dev/networkbuddy/setup-phone.sh

set -uo pipefail

PROJ="$HOME/dev/networkbuddy"
ENV_FILE="$PROJ/.env.local"
TUNNEL_LOG="/tmp/sonibel-tunnel.log"
DEV_LOG="/tmp/sonibel-dev.log"

cd "$PROJ" || { echo "✗ Cannot find project at $PROJ"; exit 1; }

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "✗ cloudflared not installed. Run: brew install cloudflared"; exit 1
fi

echo "1/4  Stopping any old tunnel…"
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
: > "$TUNNEL_LOG"

echo "2/4  Starting Cloudflare tunnel → localhost:3000 …"
nohup cloudflared tunnel --url http://localhost:3000 > "$TUNNEL_LOG" 2>&1 &
URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "   ✗ Could not detect a tunnel URL. Check $TUNNEL_LOG"; exit 1
fi
echo "   ✓ Tunnel URL: $URL"

echo "3/4  Writing APOLLO_PHONE_WEBHOOK_URL into .env.local …"
if [ -f "$ENV_FILE" ]; then
  grep -v '^APOLLO_PHONE_WEBHOOK_URL=' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
fi
echo "APOLLO_PHONE_WEBHOOK_URL=$URL/api/extension/apollo-phone" >> "$ENV_FILE"
echo "   ✓ Saved."

echo "4/4  Restarting dev server …"
lsof -ti tcp:3000 2>/dev/null | xargs kill 2>/dev/null
sleep 2
nohup npm run dev > "$DEV_LOG" 2>&1 &
for _ in $(seq 1 45); do
  grep -qi "Ready in" "$DEV_LOG" 2>/dev/null && break
  sleep 1
done

echo
echo "✅ Done — phone reveal is wired up."
echo "   Tunnel:     $URL"
echo "   App:        http://localhost:3000   (load the extension against this)"
echo "   Logs:       tail -f $DEV_LOG   |   tail -f $TUNNEL_LOG"
echo
echo "🛑 To stop everything when you're finished (and close the public tunnel):"
echo "   pkill -f 'cloudflared tunnel'; lsof -ti tcp:3000 | xargs kill"
