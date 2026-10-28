#!/bin/bash
# usage: concept.sh <name> <a-pose|none> <prompt>
set -e
cd /home/user/DoubleDutchBros
export NODE_USE_ENV_PROXY=1
M="npm exec --yes --package=meshy-cli@0.4.0 -- meshy"
NAME=$1; POSE=$2; DESC=$3
STYLE="Original character for a 90s-arcade neon rhythm brawler, same style as the hero rabbits: premium designer vinyl art toy look, modern stylized 3D console game character, cute but cool, smooth semi-gloss materials, soft studio lighting, subtle rim light, clean readable silhouette, bright saturated arcade colors, NOT a flat classic cartoon. Plain light grey background, full body, front and back and side views."
PA=(); [ "$POSE" = a-pose ] && PA=(--pose-mode a-pose)
mkdir -p art/$NAME
R=$($M text-to-image create --ai-model nano-banana-pro --generate-multi-view true "${PA[@]}" --prompt "$DESC $STYLE" --async --output-schema v1 --format json --no-update-check 2>/dev/null)
T=$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin)['result']['task_id'])")
PD=$($M project init --root art/$NAME/meshy_output --name $NAME --task-id $T --task-type text-to-image --workspace art --output-schema v1 --format json --no-update-check 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['result']['project_dir'])")
C=$($M text-to-image wait $T --timeout 900 --project "$PD" --stage concept --workspace art --output-schema v1 --format json --no-update-check 2>/dev/null | grep -o '"status": *"[A-Z_]*"\|"consumed_credits": *[0-9]*' | tr '\n' ' ')
$M text-to-image get $T --save-json "$PD/task_$T.json" --workspace art --output-schema v1 --format json --no-update-check >/dev/null 2>&1 || true
$M download --task-json "$PD/task_$T.json" --kind image --output-dir art/$NAME/concept --project "$PD" --stage concept --workspace art --output-schema v1 --format json --no-update-check >/dev/null 2>&1
echo "$NAME $T $C $(ls art/$NAME/concept | tr '\n' ' ')"
