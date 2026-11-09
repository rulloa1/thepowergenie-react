#!/bin/bash
source <(sed -n '/^WORK=/,/^}/p' gen.sh)
gen 1 L
