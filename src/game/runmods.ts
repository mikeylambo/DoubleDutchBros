import type { EnemyTypeId } from '../data/config';
import { isBossWave, isBouncerWave, isEliteWave } from './encounters';

// Run-level systems: Ascension mutators, the Swag meter, and Rig Alerts (docs/DESIGN.md §8–10).

export type MutatorId = 'GLASS_WIRE' | 'HEAVY_ROPE' | 'RUSH_HOUR' | 'SPOTLIGHT' | 'ECHO_CHAMBER' | 'MIXTAPE';

export const MUTATORS: Record<MutatorId, { name: string; icon: string; blessing: string; curse: string; score: number }> = {
  GLASS_WIRE: { name: 'Glass Wire', icon: '💎', blessing: '2× damage', curse: 'A trip knocks that rabbit out', score: 1.5 },
  HEAVY_ROPE: { name: 'Heavy Rope', icon: '⛓️', blessing: '+40% skill damage', curse: 'Skills need one more jump', score: 1.25 },
  RUSH_HOUR: { name: 'Rush Hour', icon: '🚦', blessing: '+50% score', curse: 'Every attack starts a beat early', score: 1.5 },
  SPOTLIGHT: { name: 'Spotlight', icon: '🔦', blessing: '2× RP', curse: 'Hits taken hurt 2×', score: 1.25 },
  ECHO_CHAMBER: { name: 'Echo Chamber', icon: '🔊', blessing: 'Tag windows 50% wider', curse: 'Every enemy echoes its attacks', score: 1.3 },
  MIXTAPE: { name: 'Mixtape', icon: '📼', blessing: 'A random perk each wave', curse: 'A random elite every wave', score: 1.25 }
};
export const MUTATOR_IDS = Object.keys(MUTATORS) as MutatorId[];

/** Mutator choice is offered after each boss from wave 10. */
export const offersMutator = (clearedWave: number) => clearedWave >= 10 && isBossWave(clearedWave);

export const mutatorScore = (active: readonly MutatorId[]) => active.reduce((m, id) => m * MUTATORS[id].score, 1);

// ---------------- Swag meter ----------------

export type SwagEvent = 'perfect' | 'tag' | 'dodge' | 'ko' | 'onbeat' | 'hit' | 'trip';
const SWAG_DELTA: Record<SwagEvent, number> = { perfect: 4, tag: 7, dodge: 3, ko: 5, onbeat: 2, hit: -15, trip: -10 };
/** Points added to the run's style score per event, before the tier multiplier. */
const SWAG_POINTS: Partial<Record<SwagEvent, number>> = { perfect: 30, tag: 60, dodge: 25, ko: 80, onbeat: 15 };

export const SWAG_TIERS = [
  { label: 'D', min: 0, mult: 1 }, { label: 'C', min: 20, mult: 1.2 }, { label: 'B', min: 40, mult: 1.4 },
  { label: 'A', min: 60, mult: 1.6 }, { label: 'S', min: 80, mult: 1.8 }, { label: 'SS', min: 95, mult: 2 }
] as const;

export const swagTier = (swag: number) => [...SWAG_TIERS].reverse().find((t) => swag >= t.min)!;

/** New meter value and style points earned for an event. */
export const applySwag = (swag: number, e: SwagEvent) => {
  const tier = swagTier(swag);
  return { swag: Math.max(0, Math.min(100, swag + SWAG_DELTA[e])), points: Math.round((SWAG_POINTS[e] ?? 0) * tier.mult) };
};

// ---------------- Rig Alert ----------------

const BOSS_TIPS: Partial<Record<EnemyTypeId, string>> = {
  BOSS: 'Giga Slime next. Heavy hits and Sync win; anti-air does nothing.',
  KING: 'Bouncer King next. Stop combos at three hits. Rhythm gear helps when the beat doubles.',
  GLITCH: 'Glitch Pigeon next. Dashed warnings turn real. It will swap Hop and Skip.',
  GIGA_GLITCH: 'Giga Glitch next. It steals Sync. Bring coffee.'
};

/** A heads-up shown in the shop before special waves, so gear choices matter. */
export const rigAlert = (nextWave: number, boss: EnemyTypeId): string | null => {
  if (isBossWave(nextWave)) return BOSS_TIPS[boss] ?? 'Boss next.';
  if (isBouncerWave(nextWave)) return 'Bouncer next. It counters a fourth hit in a row.';
  if (isEliteWave(nextWave)) return 'Elite wave next. Skills and crits break shields.';
  return null;
};
