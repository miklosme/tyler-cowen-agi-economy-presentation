#!/usr/bin/env bash
# Extract the talk's audio track for the /watch player (git-ignored, like the video).
# Needs source/talk.webm (bun run fetch-source). Writes Opus (Chrome/Firefox) + AAC (Safari).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/audio
ffmpeg -hide_banner -loglevel error -y -i source/talk.webm -map 0:a:0 -vn -ac 1 \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a libopus -b:a 56k public/audio/talk.webm
ffmpeg -hide_banner -loglevel error -y -i public/audio/talk.webm -c:a aac -b:a 80k -movflags +faststart public/audio/talk.m4a
echo "wrote public/audio/talk.webm and public/audio/talk.m4a"
