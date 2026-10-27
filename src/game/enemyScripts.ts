import { CANVAS_WIDTH, GROUND_Y, HOME_X, type PatternId } from '../data/config';
import type { Hazard } from './types';

// Every enemy attack is written in beats. A hazard reaches Hop on the "and" (half a beat after
// the beat) so jumping ON the beat puts Hop at the top of the jump as it passes. At the base
// speed of 200 units/beat it reaches Skip, 100 units further, exactly one beat later.
//
//  WAVE        one low sweep — jump it.
//  DOUBLE_WAVE two low sweeps a beat apart — jump, land, jump again.
//  DELAYED     low sweep landing a quarter beat late — jump on the off-beat ("e").
//  DIVE        high lane — stay grounded, don't jump into it.
//  FEINT_DIVE  dashed fake high line (harmless), then a real low sweep two beats later.
//  AIR_SLASH   high lane from the RIGHT — reaches Skip first. Stay grounded.
//  CHARGE      tall wall — needs a full jump right on the beat.
//  BURST       double-speed low hit with a short warning — react.
//  STOMP       ground shockwave on a beat: anyone in the air is hit. Stay down.
//  CROSSFIRE   (boss) low from the left and high from the right at once: they cross mid-court.
//  PANIC       (boss) three low waves on consecutive beats, then a wall.

export const HOP_CENTER = HOME_X.red + 16;
export const SKIP_CENTER = HOME_X.blue + 16;
const BASE_SPEED = 200;

type Lane = 'low' | 'high' | 'wall' | 'burst' | 'shock';
const LANES: Record<Lane, { y: number; h: number; w: number }> = {
  low: { y: GROUND_Y - 20, h: 18, w: 70 },
  high: { y: GROUND_Y - 135, h: 22, w: 90 },
  wall: { y: GROUND_Y - 60, h: 60, w: 50 },
  burst: { y: GROUND_Y - 30, h: 28, w: 40 },
  shock: { y: GROUND_Y - 140, h: 128, w: 0 }
};

interface Hit {
  lane: Lane;
  /** Whole beats after the attack's first beat. */
  beats: number;
  /** When in that beat it lands: 0.5 = the "and" (default), 0.75 = off-beat, 0 = on the beat. */
  at?: number;
  speed?: number;
  fake?: boolean;
  fromRight?: boolean;
  /** Looks fake (dashed) until one beat before it lands, then turns real. */
  flip?: boolean;
}

const PATTERNS: Record<PatternId, Hit[]> = {
  WAVE: [{ lane: 'low', beats: 4 }],
  DOUBLE_WAVE: [{ lane: 'low', beats: 4 }, { lane: 'low', beats: 5 }],
  DELAYED: [{ lane: 'low', beats: 4, at: 0.75 }],
  DIVE: [{ lane: 'high', beats: 4 }],
  FEINT_DIVE: [{ lane: 'high', beats: 3, fake: true }, { lane: 'low', beats: 5 }],
  AIR_SLASH: [{ lane: 'high', beats: 4, fromRight: true }],
  CHARGE: [{ lane: 'wall', beats: 5 }],
  BURST: [{ lane: 'burst', beats: 3, speed: 2 }],
  STOMP: [{ lane: 'shock', beats: 4, at: 0 }],
  CROSSFIRE: [{ lane: 'low', beats: 4 }, { lane: 'high', beats: 4, fromRight: true }],
  PANIC: [{ lane: 'low', beats: 3 }, { lane: 'low', beats: 4 }, { lane: 'low', beats: 5 }, { lane: 'wall', beats: 7 }],
  // Neon Moth: everything off-beat.
  FLUTTER: [{ lane: 'low', beats: 4, at: 0.75 }],
  SPIRAL: [{ lane: 'low', beats: 3, at: 0.75 }, { lane: 'high', beats: 5, at: 0.25 }],
  // Pigeon Pair: two at once from both sides.
  PECK_PAIR: [{ lane: 'low', beats: 4 }, { lane: 'low', beats: 4, fromRight: true }],
  SPLIT: [{ lane: 'low', beats: 4 }, { lane: 'high', beats: 4, fromRight: true }],
  // Rope-Biter.
  NIBBLE: [{ lane: 'burst', beats: 3, speed: 2 }, { lane: 'low', beats: 5 }],
  // Boombox Crab: DROP silences the music; the hits land inside the silence.
  DROP: [{ lane: 'low', beats: 2 }, { lane: 'low', beats: 3 }],
  BASS: [{ lane: 'wall', beats: 4 }],
  // Hype Crow.
  PECK: [{ lane: 'burst', beats: 3, speed: 2 }],
  // Bouncer.
  BOUNCE: [{ lane: 'wall', beats: 4 }, { lane: 'low', beats: 5 }],
  // Vending Mimic never attacks.
  NONE: [],
  // Bouncer King, phase 2: the beat doubles. Hits arrive every half beat at double speed.
  DOUBLE_TIME: [{ lane: 'low', beats: 3, speed: 2 }, { lane: 'low', beats: 4, at: 0, speed: 2 }, { lane: 'low', beats: 4, speed: 2 }, { lane: 'wall', beats: 6, at: 0 }],
  // Glitch bosses: warnings that look fake until the last beat.
  GLITCH_FEINT: [{ lane: 'high', beats: 4, flip: true }, { lane: 'low', beats: 4, flip: true, fromRight: true }, { lane: 'low', beats: 6 }]
};

/** Patterns that cut the music: [from, to) in beats after the attack start. */
export const SILENCE: Partial<Record<PatternId, [number, number]>> = { DROP: [0, 4] };

export interface PatternMods {
  /** Flip every hit to the other side (Mirrored elites). */
  mirror?: boolean;
  /** Repeat every hit one bar (4 beats) later (Echo elites). */
  echo?: boolean;
  /** Add one more copy of the last hit, a beat later (Hype Crow buff). */
  extra?: boolean;
}

/** Build hazards for an attack starting on beat `start` (a whole beat). */
export const buildPattern = (pattern: PatternId, start: number, mods: PatternMods = {}): Hazard[] => {
  let hits = PATTERNS[pattern].map((h) => ({ ...h, fromRight: mods.mirror ? !h.fromRight : h.fromRight }));
  if (mods.extra && hits.length) hits = [...hits, { ...hits[hits.length - 1], beats: hits[hits.length - 1].beats + 1 }];
  if (mods.echo) hits = [...hits, ...hits.map((h) => ({ ...h, beats: h.beats + 4 }))];
  return hits.map((hit) => {
    const lane = LANES[hit.lane];
    return {
      x: -1000, y: lane.y, w: lane.w, h: lane.h,
      speed: BASE_SPEED * (hit.speed ?? 1),
      arrive: start + hit.beats + (hit.at ?? 0.5),
      warn: start,
      fake: !!hit.fake || !!hit.flip,
      flipAt: hit.flip ? start + hit.beats + (hit.at ?? 0.5) - 1 : undefined,
      dir: hit.fromRight ? -1 : 1,
      kind: hit.lane === 'shock' ? 'shock' : 'lane',
      hit: [],
      cleared: []
    };
  });
};

/**
 * Left edge of a hazard at a beat. Left-to-right hits are timed to Hop, right-to-left hits to
 * Skip, so the first rabbit in line is always hit on the beat's "and".
 */
export const hazardX = (h: Hazard, beat: number) =>
  h.dir === 1
    ? HOP_CENTER - h.w / 2 - h.speed * (h.arrive - beat)
    : SKIP_CENTER - h.w / 2 + h.speed * (h.arrive - beat);

/** True once a hazard has completely left the arena. */
export const hazardDone = (h: Hazard, beat: number) =>
  h.kind === 'shock' ? beat > h.arrive + 0.5 : h.dir === 1 ? h.x > CANVAS_WIDTH + 100 : h.x + h.w < -100;

/** Shockwaves hit during this half-width window around their beat. */
export const SHOCK_WINDOW = 0.12;

/** Telegraph text shown while the hazard winds up. */
export const PATTERN_CALL: Record<PatternId, string> = {
  WAVE: 'JUMP!', DOUBLE_WAVE: 'DOUBLE!', DELAYED: 'OFFBEAT!', DIVE: 'STAY LOW!', FEINT_DIVE: 'FEINT?', AIR_SLASH: 'BEHIND!',
  CHARGE: 'BIG JUMP!', BURST: 'QUICK!', STOMP: 'STAY DOWN!', CROSSFIRE: 'CROSSFIRE!', PANIC: 'RAPID!',
  FLUTTER: 'OFFBEAT!', SPIRAL: 'SPIRAL!', PECK_PAIR: 'BOTH SIDES!', SPLIT: 'SPLIT!', NIBBLE: 'QUICK!', DROP: 'DROP!',
  BASS: 'BIG JUMP!', PECK: 'QUICK!', BOUNCE: 'BOUNCE!', NONE: '...', DOUBLE_TIME: 'DOUBLE TIME!', GLITCH_FEINT: 'GLITCH?'
};

export const pickPattern = (patterns: PatternId[], rng: () => number) => patterns[Math.floor(rng() * patterns.length)];
