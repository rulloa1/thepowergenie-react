#!/bin/bash
source <(sed -n '/^WORK=/,/^}/p' gen.sh)
rm -f still_4.png still_4m.png
gen 4 L; gen 4 P
