# Double Dutch Bros: Agent Instructions

The SLU Game Development Constitution in `node_modules/@slu/web-shell/AGENTS.md` applies here.
Project rules on top of it:

1. **The music is the clock.** Rope peaks, enemy attacks, judging and world pulses all read the
   engine's heard beat (`Engine.beat` / `heardBeat`). Never time rhythm with frame counts or `setTimeout`.
2. **The engine stays pure.** `src/game` has no storage, DOM or shell calls; it emits `GameEvent`s and
   calls `EngineInit` hooks. Platform wiring lives in `src/platform`.
3. **Seeded runs stay seeded.** Gameplay randomness uses the engine's named streams (waves, combat,
   rewards). Cosmetic randomness uses `Math.random`.
4. **Saves migrate.** Bump `SAVE_VERSION` in `src/platform/index.ts` and add a migration for any
   schema change. Never drop a field players already have.
5. **Art follows `docs/ART_SPEC.md`.** Clip names and timing rules there mirror `src/game/anim.ts`.

Checks before pushing: `npm run typecheck && npm test && npm run build`.
