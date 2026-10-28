#!/bin/bash
# usage: model.sh <name> <images csv> <texture prompt>
cd /home/user/DoubleDutchBros; export NODE_USE_ENV_PROXY=1
M="npm exec --yes --package=meshy-cli@0.4.0 -- meshy"; N=$1
PD=$(ls -d art/$N/meshy_output/*/ | head -1)
R=$($M multi-image-to-3d create --image-urls "$2" --should-texture true --enable-pbr true --remove-lighting true --texture-resolution 4k --texture-prompt "$3" --target-formats glb,fbx --async --project "$PD" --stage model --workspace art --output-schema v1 --format json --no-update-check 2>/dev/null)
T=$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin)['result']['task_id'])") || { echo "$N submit failed: $R"; exit 1; }
C=$($M multi-image-to-3d wait $T --timeout 1800 --project "$PD" --stage model --workspace art --output-schema v1 --format json --no-update-check 2>/dev/null | grep -o '"status": *"[A-Z_]*"\|"consumed_credits": *[0-9]*' | tr '\n' ' ')
$M multi-image-to-3d get $T --save-json "${PD}task_$T.json" --workspace art --output-schema v1 --format json --no-update-check >/dev/null 2>&1
mkdir -p art/$N/model
$M download --task-json "${PD}task_$T.json" --list --output-schema v1 --format json --no-update-check 2>/dev/null > art/$N/model/assets.json
for a in model.glb model.fbx thumbnail.primary; do
  ext=${a##*.}; [ $a = thumbnail.primary ] && ext=png
  $M download --task-json "${PD}task_$T.json" --asset $a --output art/$N/model/$N.$ext --project "$PD" --stage model --workspace art --output-schema v1 --format json --no-update-check >/dev/null 2>&1
done
echo "$N $T $C $(ls art/$N/model | tr '\n' ' ')"
