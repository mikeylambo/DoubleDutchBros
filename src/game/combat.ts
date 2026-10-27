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
}

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
  } else if (h.move === 'TECH3') {
    if (h.targetAerial) dmg *= 0.4;
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

/** |sin(ropeAngle)| above this counts as a perfect jump. Higher Rhythm widens the window. */
export const perfectThreshold = (rhythmStat: number) => Math.max(0.55, 0.85 - rhythmStat * 0.0025);
