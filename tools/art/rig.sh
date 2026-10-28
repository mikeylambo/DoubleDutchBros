#!/bin/bash
# usage: rig.sh <name> <source task> <height m>
cd /home/user/DoubleDutchBros; export NODE_USE_ENV_PROXY=1
M="npm exec --yes --package=meshy-cli@0.4.0 -- meshy"; N=$1; PD=$(ls -d art/$N/meshy_output/*/ | head -1)
J="--project $PD --workspace art --output-schema v1 --format json --no-update-check"
id() { python3 -c "import json,sys;print(json.load(sys.stdin)['result']['task_id'])"; }
st() { grep -o '"status": *"[A-Z_]*"\|"consumed_credits": *[0-9]*' | tr '\n' ' '; }
R=$($M remesh create --input-task-id $2 --topology triangle --target-polycount 60000 --target-formats glb --async $J --stage remesh 2>/dev/null | id) || { echo "$N remesh submit failed"; exit 1; }
echo "$N remesh $R $($M remesh wait $R --timeout 1800 $J --stage remesh 2>/dev/null | st)"
$M remesh get $R --save-json "${PD}task_$R.json" --workspace art --output-schema v1 --format json --no-update-check >/dev/null 2>&1
G=$($M rigging create --input-task-id $R --height-meters $3 --async $J --stage rigging 2>/dev/null | id) || { echo "$N rig submit failed"; exit 1; }
echo "$N rig $G $($M rigging wait $G --timeout 1800 $J --stage rigging 2>/dev/null | st)"
$M rigging get $G --save-json "${PD}task_$G.json" --workspace art --output-schema v1 --format json --no-update-check >/dev/null 2>&1
mkdir -p art/$N/rig
$M download --task-json "${PD}task_$G.json" --list --output-schema v1 --format json --no-update-check 2>/dev/null > art/$N/rig/assets.json
for a in $(python3 -c "import json;print(' '.join(x['key'] for x in json.load(open('art/$N/rig/assets.json'))['result']['assets'] if x['has_url']))"); do
  $M download --task-json "${PD}task_$G.json" --asset $a --output "art/$N/rig/$N-$(python3 -c "import json;print([x['filename'] for x in json.load(open('art/$N/rig/assets.json'))['result']['assets'] if x['key']=='$a'][0])")" $J --stage rigging >/dev/null 2>&1
done
echo "$N files: $(ls art/$N/rig | tr '\n' ' ')"
