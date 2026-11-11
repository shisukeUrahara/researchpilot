#!/usr/bin/env bash
# Turns the newest Playwright demo video (webm) into an mp4 for posts.
set -euo pipefail
src=$(ls -t test-results/*/video.webm | head -1)
out=${1:-../content/researchpilot/media/demo.mp4}
mkdir -p "$(dirname "$out")"
ffmpeg -y -loglevel error -i "$src" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart "$out"
echo "wrote $out from $src"
