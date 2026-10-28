# Art pipeline

Meshy (concepts, models, rigs, mo-cap) → headless Blender (render) → sprite strips in
`public/assets/sprites/`. Contract: `docs/ART_SPEC.md` §5–7. Model files live in Drive
(*Double Dutch Bros — Art › Models*), not git; Meshy task records are under `art/<character>/`.

## Setup (once per container)
```bash
python3 -m venv ~/blender-venv && ~/blender-venv/bin/pip install bpy==5.2.3   # headless Blender
apt-get install -y libegl1 libgl1-mesa-dri libgles2                           # software EEVEE
export NODE_USE_ENV_PROXY=1   # Meshy CLI behind the agent proxy
```

## Scripts
| Script | Does |
|---|---|
| `concept.sh <name> <a-pose\|none> <prompt>` | Concept turnaround (text-to-image, multi-view) |
| `model.sh <name> <images csv> <texture prompt>` | Textured 3D model from the concept views |
| `rig.sh <name> <model task> <height m>` | Remesh to 60k tris, then auto-rig (humanoids only) |
| `anim.sh <name> <rig task> <clip> <action id>` | Library mo-cap action for a rig |
| `clips.py <name> '<cfg json>' <frames dir> [workers]` | Renders every clip in the plan to frames |
| `sprite.py` | Renders one clip: 3/4 view facing left, pivot (128, 248), key/fill/rim lights |
| `stitch.py <name> <frames dir>` | Outlines frames, writes strips + `manifest.json` |
| `track.py`, `reach.py`, `yaw.py`, `peek.py` | Find hops, contact frames, head facing, action ranges |

## Rules learned the hard way
- **Contact frames**: `attack`/`tag` put the moment of full extension on frame 4 (`reach.py`).
- **Root motion**: lock `1` cancels horizontal travel; `z` also cancels vertical (airtime clips —
  the engine supplies the jump arc); `y` keeps the head facing the camera (mo-cap idles turn).
- **Idle**: library idles look around; use the steady stretch (`yaw.py`), wrapping the loop seam.
- Hop config: `{"az":45,"rim":"EF4444","ortho":1.08,"refz":0.33}`.
- Never name a script after a stdlib module (`inspect.py` crashes bpy).
