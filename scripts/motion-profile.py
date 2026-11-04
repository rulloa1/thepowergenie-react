#!/usr/bin/env python3
"""Measure how much the picture moves through each scroll-world clip.

Writes src/data/motion-profile.json, which ScrollWorld uses to pace each
scene: scroll moves the clip in proportion to on-screen motion, so the camera
keeps an even speed instead of crawling through one part of a clip and
whipping through the next.

Usage (from the repo root, needs ffmpeg + numpy):
    python3 scripts/motion-profile.py
Re-run it whenever a clip in public/assets-v2/vid/encoded changes.
"""
import json, pathlib, subprocess
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'public/assets-v2/vid/encoded'
OUT = ROOT / 'src/data/motion-profile.json'
SAMPLES = 64      # points per clip curve
W, H = 96, 54     # analysis size: enough for camera motion, blind to grain


def gray_frames(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-vf', f'scale={W}:{H}:flags=area,format=gray',
         '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


profiles = {}
for clip in sorted(SRC.glob('*.mp4')):
    f = gray_frames(clip)
    step = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))   # motion between frames
    cum = np.concatenate([[0.0], np.cumsum(step)])
    total = float(cum[-1])
    t = np.linspace(0, 1, len(cum))                      # time fraction of each frame
    ts = np.linspace(0, 1, SAMPLES + 1)
    curve = np.interp(ts, t, cum / max(total, 1e-6))
    profiles[clip.name] = {'total': round(total, 1), 'curve': [round(float(x), 4) for x in curve]}
    print(f'{clip.name}: total motion {total:.0f}')

# Per clip: total on-screen motion, and the share of it reached at each of
# SAMPLES + 1 evenly spaced moments of the clip.
OUT.write_text(json.dumps(profiles, separators=(',', ':')) + '\n')
print('wrote', OUT.relative_to(ROOT))
