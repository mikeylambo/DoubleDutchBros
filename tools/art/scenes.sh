#!/bin/bash
# Render every open-air zone x time of day as three parallax layers (far / mid / near), paint them over,
# add glow, and write public/assets/scenes/<zone>-<tod>-<layer>.{jpg,webp} plus a flattened <zone>-<tod>.jpg
# (the reflection source and fallback).
cd "$(dirname "$0")/../.."; mkdir -p public/assets/scenes /tmp/claude-0/scenes
job() { z=$1; t=$2; o=/tmp/claude-0/scenes/$z-$t; d=public/assets/scenes/$z-$t
  # The Subway has its own high-fidelity set (tools/art/subway.py); its middle layer is the train, which moves.
  if [ "$z" = subway ]; then L="far train near"; R="tools/art/subway.py -- \$OUT 1 ${SAMPLES:-64}"; else L="far mid near"; R="tools/art/scene.py -- $z $t \$OUT 1"; fi
  for l in $L; do
    OUT=$o-$l.png; LAYER=$l HQ=${HQ:-0} eval ~/blender-venv/bin/python $R >/dev/null 2>&1 &&
    python3 tools/art/paint.py $o-$l.png $o-$l-p.png $([ $z = subway ] && echo subway || echo $t) $l && python3 tools/art/glow.py $o-$l-p.png $o-$l-g.png || { echo "$z-$t $l FAILED"; return; }
  done
  python3 - "$o" "$d" <<'EOF' && echo "$z-$t ok"
import sys
from PIL import Image
o, d = sys.argv[1], sys.argv[2]
import os
mid_name = 'train' if os.path.exists(f'{o}-train-g.png') else 'mid'
far, mid, near = (Image.open(f'{o}-{l}-g.png').convert('RGBA') for l in ('far', mid_name, 'near'))
far.convert('RGB').save(f'{d}-far.jpg', quality=86, optimize=True, progressive=True)
for name, im in ((mid_name, mid), ('near', near)): im.save(f'{d}-{name}.webp', quality=86, method=6)
# The flattened copy (reflections, fallback) leaves the train out: it comes and goes.
flat = far.copy()
if mid_name == 'mid': flat.alpha_composite(mid)
flat.alpha_composite(near)
flat.convert('RGB').save(f'{d}.jpg', quality=86, optimize=True, progressive=True)
EOF
}
export -f job
# Underground has no day/night: the subway renders once (subway:night).
# Pass the scenes to render as arguments ("alley:day rooftop:night"), or none for all of them.
LIST=${*:-"alley:day alley:dusk alley:night rooftop:day rooftop:dusk rooftop:night subway:night"}
printf '%s\n' $LIST | tr ':' ' ' | xargs -P 2 -L 1 bash -c 'job $0 $1'
