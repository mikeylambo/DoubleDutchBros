# Double Dutch Bros

A rhythm × tag-team × turn-based brawler. Charge skills by jumping on the rope's beat, then tag your partner in for combos.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # engine + combat tests
npm run build      # typecheck + production build
```

Controls: tap / click, or **F / ←** = B (Blue), **J / →** = A (Red), **1–4** menu, **Esc** pause.

## Layout

| Path | Role |
|---|---|
| `src/data/config.ts` | All tunable data: moves, enemies, gear, perks, XP curves |
| `src/game/engine.ts` | Single source of truth for a run; fixed 60 Hz timestep on the audio clock |
| `src/game/combat.ts` | Pure damage / timing math |
| `src/game/enemyScripts.ts` | Enemy attack patterns (hazards + telegraphs) |
| `src/game/renderer.ts` | Canvas drawing, read-only |
| `src/game/audio.ts` | Web Audio clock + synthesized SFX |
| `src/game/save.ts` | Persistent meta progression (localStorage) |
| `src/ui/` | React screens; they read engine snapshots and send commands |
