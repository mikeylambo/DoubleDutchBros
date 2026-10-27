import { GROUND_Y, type PatternId } from '../data/config';
import type { Hazard } from './types';

// Each pattern demands a different read from the player:
//  WAVE        one low sweep — jump it.
//  DOUBLE_WAVE two low sweeps with a gap — jump, land, jump again.
//  DIVE        high lane — stay grounded, don't jump into it.
//  FEINT_DIVE  dashed fake high line (harmless), then a real low sweep — don't flinch, then jump.
//  CHARGE      tall slow wall after a long telegraph — needs a full-height jump at the right time.
//  BURST       short, fast low hit with almost no warning — react.

const LOW_Y = GROUND_Y - 20;
const HIGH_Y = GROUND_Y - 135;
const START_X = -120;

const hz = (p: Partial<Hazard> & Pick<Hazard, 'y' | 'h' | 'vx' | 'delay'>): Hazard =>
  ({ x: START_X, w: 70, fake: false, hit: [], ...p });

export const buildPattern = (pattern: PatternId, wave: number): Hazard[] => {
  const pace = 1 + Math.min(wave, 30) * 0.03;
  switch (pattern) {
    case 'WAVE':
      return [hz({ y: LOW_Y, h: 18, vx: 9 * pace, delay: 40 })];
    case 'DOUBLE_WAVE':
      return [hz({ y: LOW_Y, h: 18, vx: 9 * pace, delay: 40 }), hz({ y: LOW_Y, h: 18, vx: 9 * pace, delay: 40 + 55 })];
    case 'DIVE':
      return [hz({ y: HIGH_Y, h: 22, vx: 12 * pace, delay: 35, w: 90 })];
    case 'FEINT_DIVE':
      return [hz({ y: HIGH_Y, h: 22, vx: 12 * pace, delay: 30, w: 90, fake: true }), hz({ y: LOW_Y, h: 18, vx: 11 * pace, delay: 75 })];
    case 'CHARGE':
      return [hz({ y: GROUND_Y - 60, h: 60, vx: 6.5 * pace, delay: 70, w: 50 })];
    case 'BURST':
      return [hz({ y: LOW_Y - 10, h: 28, vx: 16 * pace, delay: 14, w: 40 })];
  }
};

/** Telegraph text shown while the hazard winds up. */
export const PATTERN_CALL: Record<PatternId, string> = {
  WAVE: 'JUMP!', DOUBLE_WAVE: 'DOUBLE!', DIVE: 'STAY LOW!', FEINT_DIVE: 'FEINT?', CHARGE: 'BIG JUMP!', BURST: 'QUICK!'
};

export const pickPattern = (patterns: PatternId[], rng: () => number) => patterns[Math.floor(rng() * patterns.length)];
