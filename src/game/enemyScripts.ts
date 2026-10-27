import { GROUND_Y, HOME_X, type PatternId } from '../data/config';
import type { Hazard } from './types';

// Every enemy attack is written in beats. A hazard reaches Hop on the "and" (half a beat after
// the beat) so jumping ON the beat puts Hop at the top of the jump as it passes. At the base
// speed of 200 units/beat it reaches Skip, 100 units further, exactly one beat later.
//
//  WAVE        one low sweep — jump it.
//  DOUBLE_WAVE two low sweeps a beat apart — jump, land, jump again.
//  DIVE        high lane — stay grounded, don't jump into it.
//  FEINT_DIVE  dashed fake high line (harmless), then a real low sweep two beats later.
//  CHARGE      tall wall — needs a full jump right on the beat.
//  BURST       double-speed low hit with a short warning — react.

export const HOP_CENTER = HOME_X.red + 16;
const BASE_SPEED = 200;

type Lane = 'low' | 'high' | 'wall' | 'burst';
const LANES: Record<Lane, { y: number; h: number; w: number }> = {
  low: { y: GROUND_Y - 20, h: 18, w: 70 },
  high: { y: GROUND_Y - 135, h: 22, w: 90 },
  wall: { y: GROUND_Y - 60, h: 60, w: 50 },
  burst: { y: GROUND_Y - 30, h: 28, w: 40 }
};

interface Hit { lane: Lane; beats: number; speed?: number; fake?: boolean }

/** `beats` = whole beats after the attack's first beat; the hit lands on the "and" after it. */
const PATTERNS: Record<PatternId, Hit[]> = {
  WAVE: [{ lane: 'low', beats: 4 }],
  DOUBLE_WAVE: [{ lane: 'low', beats: 4 }, { lane: 'low', beats: 5 }],
  DIVE: [{ lane: 'high', beats: 4 }],
  FEINT_DIVE: [{ lane: 'high', beats: 3, fake: true }, { lane: 'low', beats: 5 }],
  CHARGE: [{ lane: 'wall', beats: 5 }],
  BURST: [{ lane: 'burst', beats: 3, speed: 2 }]
};

/** Build hazards for an attack starting on beat `start` (a whole beat). */
export const buildPattern = (pattern: PatternId, start: number): Hazard[] =>
  PATTERNS[pattern].map((hit) => {
    const lane = LANES[hit.lane];
    return {
      x: -1000, y: lane.y, w: lane.w, h: lane.h,
      speed: BASE_SPEED * (hit.speed ?? 1),
      arrive: start + hit.beats + 0.5,
      warn: start,
      fake: !!hit.fake,
      hit: []
    };
  });

/** Left edge of a hazard at a beat. */
export const hazardX = (h: Hazard, beat: number) => HOP_CENTER - h.w / 2 - h.speed * (h.arrive - beat);

/** Telegraph text shown while the hazard winds up. */
export const PATTERN_CALL: Record<PatternId, string> = {
  WAVE: 'JUMP!', DOUBLE_WAVE: 'DOUBLE!', DIVE: 'STAY LOW!', FEINT_DIVE: 'FEINT?', CHARGE: 'BIG JUMP!', BURST: 'QUICK!'
};

export const pickPattern = (patterns: PatternId[], rng: () => number) => patterns[Math.floor(rng() * patterns.length)];
