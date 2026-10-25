#!/bin/bash
# The connectors start on each scene's establishing frame (the dive's FIRST frame),
# not on the dive's close-up last frame, so dive -> connector cut back to the wide shot.
# Until the connectors are re-rendered from the dives' actual last frames, each scene
# plays its dive forward and then eases back out (the same frames reversed), so the
# section ends on the exact frame its connector starts from.
#
# Usage: bash scripts/build-seam-loops.sh   (run from the repo root; needs ffmpeg)
set -euo pipefail

VID=public/assets/vid
SCENES="01-sun 02-roof 03-battery 04-home 05-community"   # 06-cta has no outgoing connector

for s in $SCENES; do
  src="$VID/encoded/$s-dive.mp4"
  echo "== $s"
  # Desktop: native size, same GOP as the other encodes.
  ffmpeg -v error -y -i "$src" \
    -filter_complex "[0:v]split[f][r];[r]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[b];[f][b]concat=n=2:v=1:a=0" \
    -an -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
    -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart "$VID/encoded/$s-loop.mp4"
  # Mobile: lighter decode, tighter GOP for cheap seeks on phones.
  ffmpeg -v error -y -i "$VID/encoded/$s-loop.mp4" -vf "scale=720:-2" \
    -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
    -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "$VID/mobile/$s-loop.mp4"
done

# Phones get lighter encodes of the remaining clips too (they were byte-identical copies).
for f in 06-cta-dive c01-sun-roof c02-roof-battery c03-battery-home c04-home-community c05-community-cta; do
  ffmpeg -v error -y -i "$VID/encoded/$f.mp4" -vf "scale=720:-2" \
    -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
    -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart "$VID/mobile/$f.mp4"
done
