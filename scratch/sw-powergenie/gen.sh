#!/bin/bash
WORK="$(pwd)"
gen() { # n orient
  n=$1; o=$2
  if [ "$o" = L ]; then shape="Wide 3:2 landscape, high resolution."; out=still_$n.png
  else shape="Tall vertical 2:3 portrait orientation (portrait, taller than wide), the focal subject centered at about 45% height with generous space above and below, high resolution."; out=still_${n}m.png; fi
  codex exec -m gpt-5.6-terra -C "$WORK" -s workspace-write --skip-git-repo-check \
    'Use the image generation tool ($imagegen) to generate: '"$(cat "$WORK/still_$n.txt")"' '"$shape"' Save it as ./'"$out"'. Do not do anything else.' \
    > "$WORK/$out.codex.log" 2>&1 < /dev/null
  [ -f "$WORK/$out" ] && echo "$out ok" || echo "$out FAIL"
}
for n in 2 3 4 5 6; do gen $n L; done
for batch in "1 2 3" "4 5 6"; do for n in $batch; do gen $n P; done; done
