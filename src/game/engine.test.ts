import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVE_REGISTRY } from '../data/config';
import { judgeJump, resolveHit } from './combat';
import { Engine } from './engine';
import { HOP_CENTER, buildPattern, hazardX } from './enemyScripts';
import type { BeatClock } from './music';
import { calculateDerived, makeBro } from './stats';

// Node has no localStorage/AudioContext; the engine must cope with both missing.
beforeEach(() => { vi.stubGlobal('localStorage', undefined); });

/** Beat clock the test drives by hand: each sim step advances one 60 Hz frame of music. */
class TestClock implements BeatClock {
  readonly live = true;
  readonly bpm = 90;
  b = 0;
  beatAt() { return this.b; }
  timeOfBeat(beat: number) { return (beat * 60) / this.bpm; }
}
const clocks = new WeakMap<Engine, TestClock>();
const tick = (e: Engine) => { clocks.get(e)!.b += 90 / 3600; e.step(); };
const run = (e: Engine, steps: number) => { for (let i = 0; i < steps; i++) tick(e); };
const runUntil = (e: Engine, pred: () => boolean, max = 5000) => {
  for (let i = 0; i < max && !pred(); i++) tick(e);
  expect(pred()).toBe(true);
};
const makeEngine = () => { const c = new TestClock(); const e = new Engine(() => 0.99, c); clocks.set(e, c); return e; };
const newRun = () => { const e = makeEngine(); e.startRun(); return e; };

describe('combat math', () => {
  const stats = calculateDerived(makeBro('red'));
  it('applies the BASIC multiplier exactly once', () => {
    const r = resolveHit({ move: 'BASIC', attacker: 'RED', stats, perks: [], comboCount: 0, targetAerial: false, roll: 1 });
    expect(r.dmg).toBe(Math.round(stats.pwr * MOVE_REGISTRY.BASIC.dmg));
  });
  it('Sky Clip rewards anti-air and punishes ground use', () => {
    const air = resolveHit({ move: 'TECH2', attacker: 'BLUE', stats, perks: [], comboCount: 0, targetAerial: true, roll: 1 });
    const ground = resolveHit({ move: 'TECH2', attacker: 'BLUE', stats, perks: [], comboCount: 0, targetAerial: false, roll: 1 });
    expect(air.dmg).toBeGreaterThan(ground.dmg * 5);
    expect(air.clip).toBe(true);
  });
});

describe('jump judgment', () => {
  it('reports perfect at the peak, early before it, late after it', () => {
    const peak = Math.PI / 2;
    expect(judgeJump(peak, 0.75)).toBe('PERFECT');
    expect(judgeJump(peak - 0.9, 0.75)).toBe('EARLY');
    expect(judgeJump(peak + 0.9, 0.75)).toBe('LATE');
    expect(judgeJump(peak + Math.PI - 0.9, 0.75)).toBe('EARLY'); // negative lobe too
  });
});

describe('engine', () => {
  it('pause/resume never rerolls the wave', () => {
    const e = newRun();
    e.enemies[0].hp = 5;
    const id = e.enemies[0].id;
    e.pause();
    run(e, 30);
    e.resume();
    expect(e.enemies[0].id).toBe(id);
    expect(e.enemies[0].hp).toBe(5);
  });

  it('basic attack lands, combo resets on enemy turn, turn passes to the living partner', () => {
    const e = newRun();
    e.enemies[0].hp = 9999; e.enemies[0].maxHp = 9999;
    e.action('BASIC');
    expect(e.phase).toBe('TARGET');
    e.input('RED');
    runUntil(e, () => e.phase === 'IMPACT');
    expect(e.enemies[0].hp).toBeLessThan(9999);
    e.comboCount = 3;
    runUntil(e, () => e.phase === 'ENEMY_TURN');
    expect(e.comboCount).toBe(0);
    runUntil(e, () => e.phase === 'MENU');
    expect(e.turn).toBe('BLUE');
  });

  it('a downed bro never receives the turn', () => {
    const e = newRun();
    e.bros.blue.hp = 0;
    e.enemies[0].hp = 9999;
    e.action('BASIC'); e.input('RED');
    runUntil(e, () => e.phase === 'MENU' && e.gameState === 'BATTLE');
    expect(e.turn).toBe('RED');
  });

  it('sync is spent exactly once per committed move', () => {
    const e = newRun();
    e.sync = 100;
    e.enemies[0].hp = 99999;
    e.action('ULT'); e.input('RED');
    expect(e.sync).toBe(0);
    runUntil(e, () => e.phase === 'IMPACT');
    const afterHit = e.sync;
    runUntil(e, () => e.phase === 'MENU');
    expect(e.sync).toBe(afterHit);
  });

  it('owner-locked techs cannot be used by the other bro', () => {
    const e = newRun();
    e.sync = 100;
    e.action('TECH2'); // Blue only; Red's turn
    expect(e.phase).toBe('MENU');
    e.action('TECH3');
    expect(e.phase).toBe('TARGET');
  });

  it('wave clear grants rewards once and queues each bro at most once', () => {
    const e = newRun();
    e.bros.red.xp = 10000;
    e.enemies.forEach((en) => (en.hp = 1));
    const rp = e.rp;
    e.action('BASIC'); e.input('RED');
    runUntil(e, () => e.gameState === 'WIN');
    expect(e.rp).toBeGreaterThan(rp);
    expect(e.levelQueue).toEqual(['red']);
    run(e, 50);
    expect(e.levelQueue).toEqual(['red']);
    // Overflow XP keeps offering levels to the same bro, then clears.
    let guard = 0;
    while (e.levelQueue.length && guard++ < 50) e.chooseLevel(e.levelChoices[0]);
    expect(e.levelQueue).toEqual([]);
    expect(e.bros.red.lvl).toBeGreaterThan(2);
  });

  it('fake hazards never deal damage', () => {
    const e = newRun();
    const hp = e.bros.red.hp;
    e.hazards = [{ x: 0, y: 300, w: 400, h: 200, speed: 1, arrive: 1, warn: 0, fake: true, hit: [] }];
    e.phase = 'ENEMY_TURN';
    run(e, 5);
    expect(e.bros.red.hp).toBe(hp);
  });

  it('attacks are on the beat: jump on the beat to clear, stand still to get hit', () => {
    const e = newRun();
    const clock = clocks.get(e)!;
    const hp = { red: e.bros.red.hp, blue: e.bros.blue.hp };
    e.phase = 'ENEMY_TURN';
    e.hazards = buildPattern('WAVE', Math.ceil(clock.b) + 1);
    const h = e.hazards[0];
    // Hop's beat: the wave crosses Hop's center on the "and".
    expect(hazardX(h, h.arrive) + h.w / 2).toBeCloseTo(HOP_CENTER);
    runUntil(e, () => clock.b >= h.arrive - 0.5);
    e.input('RED');      // Hop jumps on the beat...
    run(e, 120);         // ...Skip stays put
    expect(e.bros.red.hp).toBe(hp.red);
    expect(e.bros.blue.hp).toBeLessThan(hp.blue);
  });

  it('rope peaks land on beats; off-beat jumps trip', () => {
    const e = newRun();
    const clock = clocks.get(e)!;
    e.sync = 100;
    e.action('TECH3'); e.input('RED');
    expect(e.phase).toBe('WINDUP');
    clock.b = Math.round(clock.b / 2) * 2 + 1; // Shell → rope every 2 beats; odd beats are off
    e.input('RED');
    expect(e.windup).toBe(0);
    expect(e.missLocked).toBe(true);
  });

  it('retry starts a clean run without reloading', () => {
    const e = newRun();
    e.wave = 7; e.bros.red.hp = 0; e.bros.blue.hp = 0;
    e.startRun();
    expect(e.wave).toBe(1);
    expect(e.bros.red.hp).toBeGreaterThan(0);
    expect(e.gameState).toBe('BATTLE');
  });
});

describe('tutorial', () => {
  it('walks attack → tag → dodge → skill → finish without real damage', () => {
    const e = makeEngine();
    const clock = clocks.get(e)!;
    e.startTutorial();
    expect(e.tutorial).toBe('ATTACK');
    const hp = { red: e.bros.red.hp, blue: e.bros.blue.hp };

    e.sync = 50;
    e.action('TECH'); // gated: only ATTACK allowed in step 1
    expect(e.phase).toBe('MENU');
    e.action('BASIC'); e.input('RED');
    expect(e.tutorial).toBe('TAG');

    runUntil(e, () => e.phase === 'ENEMY_TURN');
    expect(e.tutorial).toBe('DODGE');
    runUntil(e, () => e.phase === 'MENU');
    expect(e.tutorial).toBe('SKILL');
    expect(e.bros.red.hp).toBe(hp.red);
    expect(e.bros.blue.hp).toBe(hp.blue);
    expect(e.sync).toBeGreaterThanOrEqual(20);

    e.action('BASIC'); // gated
    expect(e.phase).toBe('MENU');
    e.action('TECH'); e.action('TECH1');
    e.input(e.turn);
    expect(e.phase).toBe('WINDUP');

    // A trip costs nothing and doesn't end the turn. Tutorial rope peaks every other beat.
    clock.b = Math.round(clock.b / 2) * 2 + 1;
    e.input(e.turn);
    runUntil(e, () => !e.missLocked && !e.body[e.turn === 'RED' ? 'red' : 'blue'].jumping);
    expect(e.phase).toBe('WINDUP');

    for (let i = 0; i < 3; i++) {
      clock.b = Math.ceil(clock.b / 2) * 2; // next rope peak
      e.input(e.turn);
      if (e.phase === 'WINDUP') runUntil(e, () => !e.body[e.turn === 'RED' ? 'red' : 'blue'].jumping);
    }
    expect(e.tutorial).toBe('FINISH');

    // Finish the slime however it takes.
    for (let guard = 0; guard < 20 && e.gameState === 'BATTLE'; guard++) {
      runUntil(e, () => e.phase === 'MENU' || e.gameState !== 'BATTLE');
      if (e.gameState !== 'BATTLE') break;
      e.action('BASIC'); e.input(e.turn);
    }
    expect(e.gameState).toBe('TUTORIAL_DONE');
    expect(e.meta.tutorialDone).toBe(true);

    e.startRun();
    expect(e.tutorial).toBeNull();
    expect(e.enemies.length).toBeGreaterThan(0);
  });
});
