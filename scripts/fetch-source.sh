#!/usr/bin/env bash
# Download the source talk + English captions with yt-dlp, then build the local transcript.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p source
yt-dlp -f "bv*[height<=720]+ba/b[height<=720]" --write-subs --sub-langs en --sub-format vtt \
  -o "source/talk.%(ext)s" "https://www.youtube.com/watch?v=aJlg6o0A_Js"
python3 -I scripts/vtt-to-transcript.py source/talk.en.vtt > source/transcript.md
echo "wrote source/transcript.md"
bash scripts/extract-audio.sh
