#!/bin/bash
# usage: anim.sh <name> <rig task> <clip> <action id>
cd /home/user/DoubleDutchBros; export NODE_USE_ENV_PROXY=1
M="npm exec --yes --package=meshy-cli@0.4.0 -- meshy"; PD=$(ls -d art/$1/meshy_output/*/ | head -1)
J="--project $PD --workspace art --output-schema v1 --format json --no-update-check"
A=$($M animate create --rig-task-id $2 --action-id $4 --async $J --stage anim-$3 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['result']['task_id'])") || { echo "$1 $3 submit failed"; exit 1; }
C=$($M animate wait $A --timeout 1500 $J --stage anim-$3 2>/dev/null | grep -o '"status": *"[A-Z_]*"\|"consumed_credits": *[0-9]*' | tr '\n' ' ')
$M animate get $A --save-json "${PD}task_$A.json" --workspace art --output-schema v1 --format json --no-update-check >/dev/null 2>&1
mkdir -p art/$1/anim
$M download --task-json "${PD}task_$A.json" --asset result.animation_glb_url --output art/$1/anim/$3.glb $J --stage anim-$3 >/dev/null 2>&1
echo "$1 $3 $A $C $(ls art/$1/anim/$3.glb 2>/dev/null)"
