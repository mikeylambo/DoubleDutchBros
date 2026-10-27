# Double Dutch Bros

A rhythm × tag-team × turn-based brawler. Charge skills by jumping on the rope's beat, then tag your partner in for combos.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # engine + combat tests
npm run build      # typecheck + production build
```

Controls: tap / click, or **J / →** = A (Hop), **F / ←** = B (Skip), **1–4** menu, **Esc** pause, **↑/↓ + Enter** menus.
Gamepad: A = Hop, B = Skip, Start = pause; in menus the D-pad moves and A/B confirm/back.

Built on [SLU Web Shell](https://github.com/mikeylambo/Web-Game-Shell-v1.02), pinned by commit in `package.json`.

## Layout

| Path | Role |
|---|---|
| `src/data/config.ts` | All tunable data: moves, enemies, gear, perks, XP curves |
| `src/game/engine.ts` | Single source of truth for a run; fixed 60 Hz timestep on the audio clock |
| `src/game/combat.ts` | Pure damage / timing math |
| `src/game/enemyScripts.ts` | Enemy attack patterns (hazards + telegraphs) |
| `src/game/renderer.ts` | Canvas drawing, read-only |
| `src/game/music.ts` | Streams the soundtrack; the song's beat is the master clock |
| `src/game/anim.ts` | Sprite clips, manifest loader, animation state selection |
| `src/game/sprites.ts` | Procedural art: rabbits, enemies, backdrop (fallback for missing sprites) |
| `src/game/audio.ts` | Web Audio clock + synthesized SFX |
| `src/game/save.ts` | Persistent meta progression (localStorage) |
| `src/platform/` | SLU Web Shell wiring: saves, settings, input (keyboard/touch/gamepad), achievements, bestiary, results, daily seeds, PWA |
| `src/ui/` | React screens; they read engine snapshots and send commands |

Art and audio asset rules: [`docs/ART_SPEC.md`](docs/ART_SPEC.md).
