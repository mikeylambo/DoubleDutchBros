# Double Dutch Bros — Art & Audio Spec

The contract between the art pipeline (GPT, Claude, Meshy, Blender, mo-cap, ElevenLabs) and the game.
If an asset follows this sheet, it drops into the game with no code changes. Clip names, sizes, and
timing rules here mirror `src/game/anim.ts`. Change both together.

---

## 1. Pipeline at a glance

```
Concept (GPT / Claude)  →  3D model (Meshy)  →  Rig + ears (Meshy / Blender)
   →  Animation (Meshy library + mo-cap + hand-keyed ears/squash)
   →  Render side view in Blender (toon shader, outline, rim light)
   →  Sprite strips (PNG)  →  public/assets/sprites/<character>/<clip>.png  +  manifest.json
```

**Rule #1:** image generators are for **concepts only**. Never generate animation frames with them;
they cannot hold a character identical frame to frame. Consistency comes from the single 3D model.

---

## 2. Style pillars

1. **Neon alley at night.** Deep violet sky, pink moon, cyan court line, warm/cool window lights.
2. **Readable silhouettes first.** Every character must read as solid black. Ears are the
   rabbits' signature: never hide them.
3. **Toon-shaded, not realistic.** Two to three tone bands, crisp outline, colored rim light
   from the character's own hoodie color.
4. **Everything moves on the beat.** Idles, bobs, and loops are authored to whole beats (§6).
5. **Weight and snap.** Strong anticipation, fast action, held contact frame, soft settle.

### Palette

| Token | Hex | Use |
|---|---|---|
| Sky top / mid / horizon | `#05030F` `#140B2E` `#2A0F3A` | Background gradient |
| Moon / glow | `#FFE4F1` / `#F472B6` | Moon, neon sign |
| Court line | `#00D2FF` | Ground line, Sync meter |
| Hop hoodie | `#EF4444` | Hop's color, rim light, rope |
| Skip hoodie | `#3B82F6` | Skip's color, rim light, rope |
| Hop fur / shade | `#F6E7D4` / `#D9C2A5` | Warm cream |
| Skip fur / shade | `#EEF2F7` / `#C4CCD8` | Cool white-grey |
| Inner ear / nose | `#F9A8D4` / `#F472B6` | |
| Gold (perfect, crit) | `#FACC15` | UI and VFX only |
| Danger | `#EF4444` | Enemy attack lanes |

---

## 3. Characters

### Hop (Red, button A)
- **Role:** power. Heavy commitment, big burst, longer skill setups.
- **Personality (proposed):** loud, restless, all-in. Bounces in place even when idle.
- **Look:** warm cream fur, red hoodie, **blue** headband (partner's color), **left ear flops
  over at the tip**. Slightly stockier.
- **Signature moves:** Power Slam, kick strikes.

### Skip (Blue, button B)
- **Role:** precision and utility. Anti-air, Sync generation, tighter timing.
- **Personality (proposed):** cool, focused, a little smug. Minimal, efficient idle.
- **Look:** cool white-grey fur, blue hoodie, **red** headband, **both ears tall and upright**
  (6 units taller than Hop's). Slightly leaner.
- **Signature moves:** Sky Clip, spin strikes.

### Shared rules
- Proportions, in head heights (head ≈ 30 world units across): body ≈ 1.3 heads, feet oversized
  (rabbit feet ≈ 0.75 head long), ears ≈ 1.2 heads (Skip) / 1.1 (Hop, plus fold).
- Standing height to **top of head**: **68 world units** (the gameplay hitbox). Ears extend
  ~45 units above that.
- Both **face left** (the enemies come from the left).
- Hoodie drawstrings and a front pocket are the readable costume details. Keep them.
- The headband in the partner's color is the duo's emblem. Keep it in every outfit.

The current procedural rabbits in-game (`src/game/sprites.ts`) are the living style reference.

---

## 4. Camera & render (Blender)

- **Orthographic**, pure side view, character facing **screen-left**.
- Camera framed so **1 world unit = 2 px** (art is authored at 2x).
- Toon shader: 3 bands (light / mid / shadow), shadow color = fur shade from the palette.
- Outline: 2 px at 2x (Freestyle or inverted hull), color `#1E1B4B`.
- Rim light: from behind-right, tinted with the character's hoodie color.
- Render **24 fps**, transparent background, no motion blur (the game adds its own effects).
- No ground shadow in the render (the game draws contact shadows).

---

## 5. Sprite format

| Property | Value |
|---|---|
| File | `public/assets/sprites/<character>/<clip>.png` |
| Layout | One **horizontal strip** per clip, frames left to right, no padding |
| Cell size | **256 × 256 px** default (128 × 128 world units) |
| Pivot | **(128, 248)**: the point on the ground directly under the character's center |
| Color | 8-bit RGBA PNG, straight (not premultiplied) alpha |
| Naming | lowercase: `hop`, `skip`, `slime`, `bat`, `shell`, `boss` |

Clips that don't fit (a long leap, the Ult) can use a bigger cell and a different pivot. Declare
it in the manifest.

### manifest.json

`public/assets/sprites/manifest.json` lists what exists. Anything not listed keeps its
procedural fallback, so clips can ship one at a time.

```json
{
  "hop": {
    "idle":   { "frames": 32 },
    "jump":   { "frames": 16 },
    "attack": { "frames": 14, "fps": 30 },
    "launch": { "frames": 12, "cell": [384, 256], "pivot": [256, 248] }
  },
  "slime": {
    "idle": { "frames": 16 }
  }
}
```

Fields: `frames` (required), `fps` (default 24, for time-driven clips), `cell` (default
`[256,256]`), `pivot` (default `[128,248]`), `scale` (px per world unit, default 2).

---

## 6. Timing: three ways a clip is played

| Drive | Meaning | Author it as |
|---|---|---|
| **beats** | One loop lasts N beats of the music. The game stretches it to any tempo. | A seamless loop of the listed frame count. Downbeat = frame 0. |
| **airtime** | The frame follows the jump arc: frame 0 at takeoff, last frame at touchdown. | Takeoff → apex (middle frame) → touchdown, evenly spaced in time. |
| **time** | Plays at `fps`. One-shots hold the last frame. | Normal animation. Mark the contact frame. |

The current track runs at **88.7 BPM → 1 beat ≈ 0.68 s ≈ 16 frames at 24 fps.**

---

## 7. Clip list

### Rabbits (Hop and Skip each)

| Clip | Frames | Loop | Drive | Notes |
|---|---:|:-:|---|---|
| `idle` | 32 | ✓ | beats ×2 | Personality idle. Hop bouncy, Skip cool. Body dips on each beat. |
| `windup` | 16 | ✓ | beats ×1 | Ready stance between rope jumps while charging a skill. |
| `jump` | 16 | | airtime | Rope jump. Tuck legs at apex. Ears trail on the way up, lift on the way down. |
| `land` | 6 | | time | Squash and settle. |
| `trip` | 18 | | time | Rope catches feet: stumble, flail, recover. Make it funny. |
| `launch` | 12 | | airtime | Leaving the rope toward the enemy. Strong anticipation on frames 0–2. |
| `attack` | 14 | | time | **Contact on frame 4** (the game freezes there for hit-stop). Hop kicks, Skip spins. |
| `tag` | 12 | | time | Partner flying in for a tag strike. **Contact on frame 4.** |
| `hurt` | 10 | | time | Knocked back by an enemy hit. |
| `ko` | 20 | | time | Fall and stay down (holds last frame). |
| `victory` | 24 | ✓ | beats ×2 | Fist-bump celebration. |

**Signature clips (next wave, mo-cap candidates):** `ult_duo` (Crossfire Dutch, 3–4 s, both
rabbits in one strip, bigger cell), `rope_swap`, `getup`, `title_loop`, `shop_tryon`, `levelup`.

### Enemies (each)

| Clip | Frames | Loop | Drive | Notes |
|---|---:|:-:|---|---|
| `idle` | 16 | ✓ | beats ×1 | Bob or squish on the beat. |
| `telegraph` | 12 | ✓ | beats ×1 | Wind-up before attacking. **Must read instantly.** |
| `attack` | 10 | | time | Releases the attack. |
| `hurt` | 6 | | time | Flinch. |
| `defeat` | 16 | | time | K.O. (holds last frame). |

Enemy cell: 256 × 256, pivot (128, 248), drawn at the enemy's `scale` (Shell 1.3, Giga Slime 3.2).

### Budget
About 11 clips × 2 rabbits + 5 clips × 4 enemies ≈ **42 clips / ~800 frames** for the launch set.

---

## 8. Animation guidance

- **Mo-cap** the body's timing and weight (real double dutch is perfect reference), then
  **hand-key** ears, squash/stretch, and exaggeration on top. Rabbit proportions (huge feet,
  big head, short legs) need cleanup after retargeting human motion.
- **Ears are half the acting.** Rig them with 2–3 bones each, with follow-through.
- Anticipation 2–3 frames, action 1–2 frames, **hold contact**, settle 4–6 frames.
- Loops authored to beats must loop seamlessly at exactly that frame count.

### Meshy steps
1. Generate the front/side/back **concept turnaround** first (GPT or Claude), T-pose or A-pose,
   flat lighting, plain background.
2. Meshy **image-to-3D** from the turnaround → clean up topology if needed.
3. **Auto-rig**, then add ear bones in Blender if the rig lacks them.
4. Use Meshy's animation library for base motions (idle, hurt, KO); mo-cap the signature moves.
5. Export FBX/GLB → Blender → render per §4.

### Concept prompt template (GPT / Claude)
> Character turnaround sheet, front, side, and back view, full body, A-pose, flat even lighting,
> plain dark violet background. An anthropomorphic rabbit street athlete named {Hop|Skip}:
> {warm cream|cool white-grey} fur, oversized {red|blue} hoodie with drawstrings and front pocket,
> {blue|red} headband, {left ear folded at the tip|both ears tall and upright}, big rabbit feet,
> stylized proportions (head ≈ 1/2.3 of standing height), toon-shaded game art, crisp outline,
> neon rim light in {red|blue}. Consistent design across all three views.

---

## 9. Music

| Track | File | BPM | Beat 0 |
|---|---|---:|---:|
| Conundrum: Neon Striker OST | `public/audio/neon-striker.mp3` | 88.735 | 0.0495 s |

Adding a track: drop the file in `public/audio/` and add `{ url, bpm, offset }` to `TRACKS` in
`src/game/music.ts`. BPM and offset must be exact. Measure them from the master, don't guess.
The game streams the file, so length doesn't matter for memory.

**Wishlist from the composer:**
- Constant tempo per track (no tempo ramps), with the BPM noted.
- **Stems** (drums / bass / melody / pads) so the game can thin the mix on menus and add
  layers as combos grow.
- A menu/shop variation and a boss variation at the same BPM, so switching never breaks the beat.

---

## 10. Sound effects (ElevenLabs)

Synth placeholders live in `src/game/audio.ts`. Replace one by one. Keep each **short, dry, and
tight at the start** (no lead-in silence: timing matters).

| Id | Moment | Direction |
|---|---|---|
| `tick` | Rope peak while charging | Crisp rope slap on pavement |
| `perfect` | Perfect jump | Bright chime + sneaker squeak |
| `trip` | Missed jump | Rope tangle whip + comic stumble |
| `hit` | Normal hit | Punchy cartoon impact |
| `crit` | Critical hit | Bigger impact with a sparkle tail |
| `sync` | Successful tag-in | Two-note neon "ching" |
| `hurt` | Rabbit takes a hit | Soft thud + squeak |
| `ko` | Enemy defeated | Splat/pop with a falling tone |
| `ui` | Menu taps | Tiny click |
| *(new)* `land`, `whoosh`, `levelup`, `buy`, `wave_clear` | | |

Export 48 kHz WAV (the build converts), mono unless it's a big moment.

---

## 11. Enemies

Current roster (procedural placeholders in-game):

| Enemy | Silhouette | Tests the player on |
|---|---|---|
| Slime | Wobbling blob with eyes and a shine | Basic jump timing (single/double wave) |
| Turbo Bat | Flapping wings, fangs, floats high | Staying grounded; reading a feint |
| Stone Shell | Armored dome, head peeking out | Patience: slow half-time rope, tall wall |
| Giga Slime (boss) | Huge slime with a crown | Mixed patterns |

The roster is **not final**. More enemies are still to be designed.

---

## 12. Logo & store art

- Logo: generate the look with GPT/Claude, then rebuild as **vector (SVG)**. AI lettering is
  unreliable. Title stays **Double Dutch Bros**.
- Steam capsule sizes: header 920×430, small 462×174, main 1232×706, vertical 748×896,
  library capsule 600×900, library hero 3840×1240, library logo 1280×720 (transparent PNG).
- Steam requires disclosing AI-generated content on the store page.

---

## 13. Acceptance checklist (per clip)

- [ ] Correct folder and lowercase name, listed in `manifest.json`
- [ ] Faces left; pivot on the ground under the character's center
- [ ] Frame count matches the table (or the manifest says otherwise)
- [ ] Beat loops are seamless; airtime clips have the apex at the middle frame
- [ ] Contact frame on frame 4 for `attack` / `tag`
- [ ] Reads clearly as a black silhouette at 50% size
