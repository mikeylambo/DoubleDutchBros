import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVE_REGISTRY, type BroId, type MoveId } from '../data/config';
import { Engine } from './engine';
import type { BeatClock } from './music';

// A bot plays whole runs against the real engine. It catches soft-locks (a phase that never ends)
// and crashes across every enemy, boss, mutator and shop path, and reports how far skill gets you.

beforeEach(() => { vi.stubGlobal('localStorage', undefined); });

class BotClock implements BeatClock {
  readonly live = true;
  readonly bpm = 88.735;
  b = 0;
  beatAt() { return this.b; }
  timeOfBeat(beat: number) { return (beat * 60) / this.bpm; }
}

interface Result { wave: number; steps: number; stuck: string | null; killer?: string; hpLoss?: number }

const playRun = (accuracy: number, seed: number, maxWave = 60): Result => {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const clock = new BotClock();
  const e = new Engine(rand, clock);
  e.progress.unlocks.push('move_haymaker', 'move_hopscotch', 'move_tandem');
  e.startRun();
  const perFrame = clock.bpm / 3600;
  let steps = 0, waveSteps = 0, lastWave = e.wave;
  const key = (id: BroId) => (id === 'RED' ? 'red' : 'blue');
  // A real player decides once per attack and per tag, not every frame.
  const fumbled = new WeakMap<object, Set<string>>();
  const fumbles = (obj: object, who: string) => {
    let set = fumbled.get(obj);
    if (!set) { set = new Set(); fumbled.set(obj, set); if (rand() > accuracy) set.add('*'); }
    if (!set.has(who) && !set.has('ok:' + who)) set.add(rand() > accuracy ? who : 'ok:' + who);
    return set.has(who);
  };

  while (e.gameState !== 'GAMEOVER' && e.wave <= maxWave) {
    if (e.wave !== lastWave) { lastWave = e.wave; waveSteps = 0; }
    if (++waveSteps > 60 * 60 * 15) return { wave: e.wave, steps, stuck: `${e.gameState}/${e.phase}` };

    // ---- Between waves ----
    if (e.gameState === 'WIN') {
      if (e.mutatorChoices) e.chooseMutator(e.mutatorChoices[0]);
      else if (e.levelChoices.length) e.chooseLevel(e.levelChoices[0]);
      else e.enterShop();
      continue;
    }
    if (e.gameState === 'SHOP') {
      if (e.rp >= 150 && e.inventory.coffee < 3) e.buyItem('coffee');
      e.nextWave();
      continue;
    }

    // ---- Battle ----
    const sloppy = rand() > accuracy;
    if (e.phase === 'MENU') {
      const me = e.bros[key(e.turn)];
      const hurt = (['red', 'blue'] as const).find((k) => e.bros[k].hp > 0 && e.bros[k].hp < 70);
      if (hurt && e.inventory.coffee > 0) {
        e.action('ITEMS'); e.selectItem('coffee'); e.input(hurt === 'red' ? 'RED' : 'BLUE');
      } else {
        const options: MoveId[] = ['ULT', 'TECH6', 'TECH3', 'TECH4', 'TECH2', 'TECH5', 'TECH1'];
        const move = options.find((m) => {
          const d = MOVE_REGISTRY[m];
          return e.sync >= d.cost && (!d.owner || d.owner === e.turn) && e.hasMove(m) && me.hp > 0
            && (m !== 'TECH6' || (e.bros.red.hp > 0 && e.bros.blue.hp > 0));
        }) ?? 'BASIC';
        e.action(move);
        if (e.phase !== 'TARGET') e.action('BASIC');
        // Kill support enemies first, then the weakest.
        const living = e.enemies.map((en, i) => ({ en, i })).filter(({ en }) => en.hp > 0);
        const support = living.find(({ en }) => en.type === 'RAT' || en.type === 'CROW');
        const target = support ?? living.sort((a, b) => a.en.hp - b.en.hp)[0];
        if (target) { e.targetIdx = target.i; e.input(e.turn); }
      }
    } else if (e.phase === 'WINDUP' && !e.missLocked) {
      // Jump on the next rope peak (or miss it, if sloppy this time).
      const jumper = e.expectedJumper();
      const body = e.body[key(jumper)];
      const period = 1 / e.ropeRate;
      const toPeak = Math.ceil(clock.b / period) * period - clock.b;
      if (!body.jumping && toPeak < perFrame * 1.5) e.input(jumper, sloppy ? clock.timeOfBeat(clock.b + 0.4 * period) : undefined);
    } else if (e.phase === 'IMPACT' && e.expectedTap && !e.actionSuccess) {
      const progress = 1 - e.impactTimer / e.impactTotal;
      if (progress > 0.45 && !fumbles(e.body, `tag${e.comboCount}:${e.runStats.tagsLanded + e.runStats.tagsMissed}`)) e.input(e.expectedTap);
    } else if (e.phase === 'ENEMY_TURN') {
      // Dodge: jump low/wall hits about half a beat before they arrive; never jump into high lanes or shockwaves.
      for (const k of ['red', 'blue'] as const) {
        const b = e.body[k];
        if (b.jumping || e.bros[k].hp <= 0) continue;
        const center = b.x + 16;
        const danger = e.hazards.some((h) => {
          if (h.fake || h.hit.includes(k) || h.cleared.includes(k) || h.kind === 'shock') return false;
          if (h.y < 300) return false; // high lane: stay down
          const dist = h.dir === 1 ? center - (h.x + h.w / 2) : (h.x + h.w / 2) - center;
          const beats = dist / h.speed;
          return beats > 0.3 && beats < 0.5;
        });
        const h = e.hazards.find((x) => !x.fake && x.kind !== 'shock');
        if (danger && !(h && fumbles(h, k))) e.input(k === 'red' ? 'RED' : 'BLUE');
      }
    }

    clock.b += perFrame;
    e.step();
    steps++;
  }
  return { wave: e.wave, steps, stuck: null, killer: e.enemies.map((x) => x.type).join('+') };
};

export const _playRun = playRun;

describe('soak', () => {
  it('a near-perfect player never soft-locks and goes deep', () => {
    const results = [1, 2, 3].map((seed) => playRun(0.97, seed * 7919));
    for (const r of results) expect(r.stuck).toBeNull();
    console.log('near-perfect waves reached:', results.map((r) => `${r.wave} (${r.killer}, ${Math.round(r.steps / 3600)} min)`).join(', '));
    expect(Math.max(...results.map((r) => r.wave))).toBeGreaterThanOrEqual(15);
  }, 120_000);

  it('a sloppy player never soft-locks either', () => {
    const results = [11, 12, 13].map((seed) => playRun(0.7, seed * 104729));
    for (const r of results) expect(r.stuck).toBeNull();
    console.log('sloppy waves reached:', results.map((r) => `${r.wave} (${r.killer}, ${Math.round(r.steps / 3600)} min)`).join(', '));
  }, 120_000);
});
