import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVE_REGISTRY } from '../data/config';
import { judgeJump, resolveHit } from './combat';
import { Engine } from './engine';
import { calculateDerived, makeBro } from './stats';

// Node has no localStorage/AudioContext; the engine must cope with both missing.
beforeEach(() => { vi.stubGlobal('localStorage', undefined); });

const run = (e: Engine, steps: number) => { for (let i = 0; i < steps; i++) e.step(); };
const runUntil = (e: Engine, pred: () => boolean, max = 5000) => {
  for (let i = 0; i < max && !pred(); i++) e.step();
  expect(pred()).toBe(true);
};
const newRun = () => { const e = new Engine(() => 0.99); e.startRun(); return e; };

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
    e.hazards = [{ x: 500, y: 300, w: 400, h: 200, vx: 0.01, delay: 0, fake: true, hit: [] }];
    e.phase = 'ENEMY_TURN';
    run(e, 5);
    expect(e.bros.red.hp).toBe(hp);
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
