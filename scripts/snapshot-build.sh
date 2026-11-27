#!/usr/bin/env bash
# Build a frozen snapshot of the deck for screenshotting (immune to dev-server HMR reloads)
# and (re)start a static server for it on :5198. The server is restarted on every build
# because vite preview caches the file list at startup.
set -euo pipefail
cd "$(dirname "$0")/.."
bunx vite build --outDir .snapshot --emptyOutDir >/dev/null
pkill -f "vite preview --outDir .snapshot" 2>/dev/null || true
sleep 0.5
(nohup bunx vite preview --outDir .snapshot --port 5198 --strictPort --host 127.0.0.1 >/dev/null 2>&1 &)
for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:5198/ && break; sleep 0.25; done
echo "snapshot ready on http://127.0.0.1:5198/"
