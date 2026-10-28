#!/bin/bash
# Render every zone x time of day at full size, add glow, write public/assets/scenes/<zone>-<tod>.jpg
cd "$(dirname "$0")/../.."; mkdir -p public/assets/scenes /tmp/claude-0/scenes
job() { z=$1; t=$2
  HQ=${HQ:-0} ~/blender-venv/bin/python tools/art/scene.py -- $z $t /tmp/claude-0/scenes/$z-$t.png 1 >/dev/null 2>&1 &&
  python3 tools/art/glow.py /tmp/claude-0/scenes/$z-$t.png /tmp/claude-0/scenes/$z-$t-g.png &&
  python3 -c "from PIL import Image; Image.open('/tmp/claude-0/scenes/$z-$t-g.png').convert('RGB').save('public/assets/scenes/$z-$t.jpg', quality=86, optimize=True, progressive=True)" &&
  echo "$z-$t ok" || echo "$z-$t FAILED"; }
export -f job
# Underground has no day/night: the subway renders once.
# Pass the scenes to render as arguments ("alley:day rooftop:night"), or none for all of them.
# The Subway has its own high-fidelity script (tools/art/subway.py).
LIST=${*:-"alley:day alley:dusk alley:night rooftop:day rooftop:dusk rooftop:night"}
printf '%s\n' $LIST | tr ':' ' ' | xargs -P 2 -L 1 bash -c 'job $0 $1'
