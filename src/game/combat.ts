import { MOVE_REGISTRY, type BroId, type MoveId, type PerkId } from '../data/config';
import type { Derived } from './stats';

export interface HitInput {
  move: MoveId;
  attacker: BroId;
  stats: Derived;
  perks: PerkId[];
  comboCount: number;
  targetAerial: boolean;
  /** Injected for deterministic tests. */
  roll: number;
  /** Hop's Heat stacks (0..HOP_HEAT_MAX). */
  heat?: number;
  /** Tandem Master: clean rope trades landed. */
  trades?: number;
}

// Hop & Skip play by different rules (docs/DESIGN.md §4).
/** Hop: each Heat stack adds 10% damage. Built by perfect jumps, lost on a trip or a hit. */
export const HOP_HEAT_MAX = 5;
export const HOP_HEAT_DAMAGE = 0.1;
/** Hop trips hurt more. */
export const HOP_TRIP_MULT = 1.5;
/** Hop's tag-in strikes hit harder. */
export const HOP_TAG_MULT = 1.25;
/** Skip: wider perfect window and Sync from every perfect jump. */
export const SKIP_WINDOW_BONUS = 0.06;
export const SKIP_PERFECT_SYNC = 3;
/** Skip: wider tag-in window (fraction of the impact either side of center). */
export const TAG_WINDOW = { RED: [0.3, 0.7], BLUE: [0.2, 0.8] } as const;

export interface HitResult { dmg: number; syncGain: number; crit: boolean; clip: boolean; windowBonus: number; healOnCrit: number }

/** Pure damage resolver. Every multiplier is applied exactly once, here and nowhere else. */
export const resolveHit = (h: HitInput): HitResult => {
  const move = MOVE_REGISTRY[h.move];
  let dmg = h.stats.pwr * move.dmg;
  let syncGain = move.syncGain;
  let windowBonus = 0;
  let clip = false;

  if (h.move === 'TECH1') {
    // Red: heavy burst. Blue: lower damage but big Sync and a wider partner window.
    if (h.attacker === 'RED') dmg *= 1.8;
    else { dmg *= 0.75; syncGain = 25; windowBonus = 15; }
  } else if (h.move === 'TECH2') {
    if (h.targetAerial) { dmg *= move.antiAir ?? 1; clip = true; } else dmg *= 0.5;
  } else if (h.move === 'TECH6') {
    // Tandem Master: every clean trade of the rope multiplies the finisher.
    dmg *= 1 + 0.25 * (h.trades ?? 0);
  } else if (h.move === 'TECH3' || h.move === 'TECH4') {
    if (h.targetAerial) dmg *= 0.4;
  }

  if (h.attacker === 'RED') {
    dmg *= 1 + HOP_HEAT_DAMAGE * Math.min(HOP_HEAT_MAX, h.heat ?? 0);
    if (h.comboCount > 0) dmg *= HOP_TAG_MULT;
  }

  const crit = h.roll < h.stats.crit;
  if (crit) dmg *= 1.5;
  if (h.move === 'BASIC' && h.perks.includes('sync_plus')) syncGain += 5;

  dmg = Math.max(1, Math.round(dmg + h.comboCount * 1.5 * h.stats.teamwork));
  return { dmg, syncGain, crit, clip, windowBonus, healOnCrit: crit && h.perks.includes('crit_heal') ? 8 : 0 };
};

/** Frames the partner has to tap SYNC during an impact. Shrinks as the combo grows. */
export const impactWindow = (stats: Derived, comboCount: number, windowBonus: number, minFrames: number) =>
  Math.max(minFrames, 35 + stats.rhythm / 5 + windowBonus - comboCount * 4.5);

export type JumpJudgment = 'PERFECT' | 'EARLY' | 'LATE';

/** Judge a jump at a rope angle. Off-beat jumps report whether |sin| was still rising (early) or falling (late). */
export const judgeJump = (angle: number, threshold: number): JumpJudgment => {
  const s = Math.sin(angle);
  if (Math.abs(s) > threshold) return 'PERFECT';
  return Math.sign(s) * Math.cos(angle) > 0 ? 'EARLY' : 'LATE';
};

/** |sin(ropeAngle)| above this counts as a perfect jump. Higher Rhythm widens the window. */
export const perfectThreshold = (rhythmStat: number) => Math.max(0.55, 0.85 - rhythmStat * 0.0025);

/** Elite defenses. Shields block everything except skills, the Ult and crits (which break them). */
export const applyDefenses = (dmg: number, move: MoveId, crit: boolean, affix: string | undefined, shieldUp: boolean) => {
  if (affix === 'SHIELDED' && shieldUp) {
    const breaks = move !== 'BASIC' || crit;
    return breaks ? { dmg, shieldBroken: true, blocked: false } : { dmg: 0, shieldBroken: false, blocked: true };
  }
  if (affix === 'ARMORED' && move === 'BASIC') return { dmg: Math.max(1, Math.round(dmg * 0.5)), shieldBroken: false, blocked: false };
  return { dmg, shieldBroken: false, blocked: false };
};
