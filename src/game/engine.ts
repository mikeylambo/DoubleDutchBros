import {
  CANVAS_WIDTH, ENEMY_TYPES, GEAR_DATA, GRAVITY, GROUND_Y, HOME_X, ITEM_DATA, MIN_IMPACT_FRAMES, MOVE_REGISTRY,
  PERKS_DATA, SIM_HZ, STAT_DEFS, nextMaxXp, waveRp, waveXp,
  type BroId, type BroKey, type EnemyTypeId, type GearSlot, type ItemId, type MoveId, type PerkId, type StatKey
} from '../data/config';
import { audio } from './audio';
import { impactWindow, perfectThreshold, resolveHit } from './combat';
import { PATTERN_CALL, buildPattern, pickPattern } from './enemyScripts';
import { loadMeta, saveMeta, type MetaSave } from './save';
import { calculateDerived, makeBro } from './stats';
import type { Body, Bro, Enemy, FloatingText, GameState, Hazard, LevelChoice, Phase, Snapshot } from './types';

const STEP = 1 / SIM_HZ;
const keyOf = (id: BroId): BroKey => (id === 'RED' ? 'red' : 'blue');
const idOf = (k: BroKey): BroId => (k === 'red' ? 'RED' : 'BLUE');
const other = (id: BroId): BroId => (id === 'RED' ? 'BLUE' : 'RED');

export type MenuAction = 'BASIC' | 'TECH' | 'ITEMS' | 'ULT' | 'TECH1' | 'TECH2' | 'TECH3' | 'BACK';

/**
 * The single source of truth for a run. React never owns game state: it sends commands in and
 * renders snapshots out, which removes the stale-closure and nested-setState bugs of the old build.
 */
export class Engine {
  // --- run state ---
  gameState: GameState = 'TITLE';
  phase: Phase = 'MENU';
  wave = 1;
  rp = 800;
  sync = 0;
  turn: BroId = 'RED';
  inventory: Record<ItemId, number> = { coffee: 3, soda: 2 };
  bros: Record<BroKey, Bro> = { red: makeBro('red'), blue: makeBro('blue') };
  enemies: Enemy[] = [];
  meta: MetaSave = loadMeta();

  // --- combat state ---
  moveType: MoveId = 'BASIC';
  targetIdx = 0;
  comboCount = 0;
  activeAttacker: BroId | null = null;
  actionSuccess = false;
  windup = 0;
  missLocked = false;
  missTimer = 0;
  launchTimer = 0;
  impactTimer = 0;
  impactTotal = 0;
  freeze = 0;
  expectedTap: BroId | null = null;
  activeItem: ItemId | null = null;
  levelQueue: BroKey[] = [];
  levelChoices: LevelChoice[] = [];

  // --- enemy turn ---
  enemyQueue: number[] = [];
  currentEnemyId: number | null = null;
  hazards: Hazard[] = [];

  // --- presentation ---
  body: Record<BroKey, Body> = {
    red: { x: HOME_X.red, y: 0, vy: 0, jumping: false, targetX: HOME_X.red },
    blue: { x: HOME_X.blue, y: 0, vy: 0, jumping: false, targetX: HOME_X.blue }
  };
  ropeAngle = 0;
  ropeSpeed = 0.07;
  camera = { zoom: 1, shake: 0 };
  floatingTexts: FloatingText[] = [];

  // --- clock ---
  private lastStepTime = 0;
  private accumulator = 0;
  private lastFrameTime: number | null = null;
  private clockWasAudio = false;
  private scheduledBeat = -1;

  // --- snapshot plumbing ---
  private listeners = new Set<() => void>();
  private dirty = true;
  private snap!: Snapshot;

  constructor(private rng: () => number = Math.random) {
    this.snap = this.buildSnapshot();
  }

  // ================= Public API: React subscribes and sends commands =================

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getSnapshot = () => this.snap;

  /** Advance the sim by real elapsed time using a fixed timestep. Called once per animation frame. */
  frame() {
    const usingAudio = audio.running;
    const now = audio.now();
    // Switching clock source (audio unlocked) would create a time jump, so resync instead.
    if (this.lastFrameTime === null || usingAudio !== this.clockWasAudio) this.lastFrameTime = now;
    this.clockWasAudio = usingAudio;
    this.accumulator += Math.min(0.25, now - this.lastFrameTime);
    this.lastFrameTime = now;
    while (this.accumulator >= STEP) {
      this.step();
      this.lastStepTime = now - (this.accumulator - STEP);
      this.accumulator -= STEP;
    }
    this.flush();
  }

  startRun() {
    audio.unlock();
    this.meta.runs += 1;
    saveMeta(this.meta);
    this.gameState = 'BATTLE';
    this.wave = 1; this.rp = 800; this.sync = 0; this.turn = 'RED';
    this.inventory = { coffee: 3, soda: 2 };
    this.bros = { red: makeBro('red'), blue: makeBro('blue') };
    this.levelQueue = []; this.levelChoices = [];
    this.initWave();
  }

  pause() { if (this.gameState === 'BATTLE') { this.gameState = 'PAUSE'; this.touch(); } }
  /** Resuming never re-initializes the wave (old build rerolled enemies on resume). */
  resume() { if (this.gameState === 'PAUSE') { this.gameState = 'BATTLE'; this.touch(); } }

  setLatency(ms: number) { this.meta.latencyMs = Math.max(-150, Math.min(150, Math.round(ms))); saveMeta(this.meta); this.touch(); }

  action(a: MenuAction) {
    if (this.gameState !== 'BATTLE') return;
    audio.unlock();
    const p = this.phase;
    if (a === 'BACK') {
      if (p === 'TECH_SELECT' || p === 'ITEMS' || p === 'TARGET' || p === 'ITEMS_TARGETING') { this.activeItem = null; this.setPhase('MENU'); }
      return;
    }
    if (p !== 'MENU' && p !== 'TECH_SELECT') return;
    if (a === 'ITEMS') return this.setPhase('ITEMS');
    if (a === 'TECH') { if (this.sync >= 20) this.setPhase('TECH_SELECT'); return; }
    const move = MOVE_REGISTRY[a];
    if (move.owner && move.owner !== this.turn) return;
    if (this.sync < move.cost) return;
    this.moveType = a;
    audio.play('ui');
    this.setPhase('TARGET');
  }

  selectItem(id: ItemId) {
    if (this.phase !== 'ITEMS' || this.inventory[id] <= 0) return;
    this.activeItem = id;
    this.setPhase('ITEMS_TARGETING');
  }

  /** Canvas tap, x in canvas units. */
  tapCanvas(cx: number) {
    if (this.gameState !== 'BATTLE' || this.phase !== 'TARGET') return;
    let best = -1, bestD = 120;
    this.enemies.forEach((e, i) => { const d = Math.abs(cx - (e.x + 20)); if (e.hp > 0 && d < bestD) { best = i; bestD = d; } });
    if (best !== -1) this.commitTarget(best);
  }

  /** A/B button press. `atTime` is the audio-clock time of the press for sub-frame judging. */
  input(btn: BroId, atTime = audio.now()) {
    if (this.gameState !== 'BATTLE') return;
    audio.unlock();
    const key = keyOf(btn);
    const bro = this.bros[key];

    switch (this.phase) {
      case 'ITEMS_TARGETING': return this.useItemOn(key);
      case 'TARGET': {
        // Pressing the acting bro's button quick-targets the selected enemy.
        if (btn === this.turn) {
          const idx = this.enemies[this.targetIdx]?.hp > 0 ? this.targetIdx : this.enemies.findIndex((e) => e.hp > 0);
          if (idx !== -1) this.commitTarget(idx);
        }
        return;
      }
      case 'WINDUP': {
        if (btn !== this.turn || bro.hp <= 0 || this.missLocked) return;
        const body = this.body[key];
        if (body.jumping) return;
        const stats = calculateDerived(bro);
        body.vy = stats.jump; body.jumping = true;
        if (this.isPerfect(atTime, stats.rhythm)) {
          this.windup++;
          this.ropeSpeed += 0.008;
          audio.play('perfect');
          this.text(body.x, GROUND_Y - 80, 'PERFECT!', '#facc15', 1.2);
          const move = MOVE_REGISTRY[this.moveType];
          if (this.windup >= (move.limit?.(this.turn) ?? 3)) this.launch(this.turn, -14, 20);
        } else {
          this.missLocked = true;
          this.camera.shake = 15;
          audio.play('trip');
          this.text(body.x, GROUND_Y - 80, 'TRIP!', '#f87171', 1);
          this.damageBro(key, bro.perks.includes('trip_shield') ? 15 : 30);
          this.missTimer = 48; // ~0.8s, ticks with the sim so pausing can't desync it
        }
        return;
      }
      case 'IMPACT': {
        const needed = other(this.activeAttacker!);
        if (btn !== needed || bro.hp <= 0 || this.actionSuccess) return;
        const progress = 1 - this.impactTimer / this.impactTotal;
        if (progress > 0.3 && progress < 0.7) {
          this.actionSuccess = true;
          this.camera.shake = 12;
          audio.play('sync');
          this.text(this.body[key].x, GROUND_Y - 120, 'SYNC!', '#00d2ff', 1.5);
        }
        return;
      }
      case 'ENEMY_TURN': {
        const body = this.body[key];
        if (!body.jumping && bro.hp > 0) { body.vy = calculateDerived(bro).jump; body.jumping = true; }
        return;
      }
    }
  }

  chooseLevel(choice: LevelChoice) {
    const key = this.levelQueue[0];
    if (!key) return;
    const b = this.bros[key];
    if (choice.kind === 'perk') { if (!b.perks.includes(choice.key)) b.perks.push(choice.key); }
    else b.bonus[choice.key] += 1;
    b.lvl += 1;
    b.xp -= b.maxXp;
    b.maxXp = nextMaxXp(b.maxXp);
    b.hp = calculateDerived(b).maxHp;
    // Overflow XP can earn another level for the same bro; otherwise move on.
    if (b.xp < b.maxXp) this.levelQueue.shift();
    this.levelChoices = [];
    this.rollLevelChoices();
    this.touch();
  }

  enterShop() { if (this.gameState === 'WIN' && this.levelQueue.length === 0) { this.gameState = 'SHOP'; this.touch(); } }

  nextWave() {
    if (this.gameState !== 'SHOP') return;
    this.wave += 1;
    this.gameState = 'BATTLE';
    this.initWave();
  }

  buyItem(id: ItemId) {
    const item = ITEM_DATA[id];
    if (this.rp < item.cost) return;
    this.rp -= item.cost;
    this.inventory[id] += 1;
    audio.play('ui');
    this.touch();
  }

  buyOrEquip(key: BroKey, slot: GearSlot, id: string) {
    const b = this.bros[key];
    const item = GEAR_DATA[slot].find((g) => g.id === id);
    if (!item) return;
    if (!b.owned[slot].includes(id)) {
      if (this.rp < item.cost) return;
      this.rp -= item.cost;
      b.owned[slot].push(id);
    }
    b.gear[slot] = b.gear[slot] === id ? null : id;
    b.hp = Math.min(b.hp, calculateDerived(b).maxHp);
    audio.play('ui');
    this.touch();
  }

  // ================= Internals =================

  private flushQueued = false;
  /** Mark state changed. Commands outside the frame loop (title, shop) still publish promptly. */
  private touch() {
    this.dirty = true;
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => { this.flushQueued = false; this.flush(); });
  }
  private setPhase(p: Phase) { this.phase = p; this.touch(); }
  private text(x: number, y: number, text: string, color: string, scale = 1) {
    this.floatingTexts.push({ x, y, text, color, life: 1, vy: -2, scale });
  }

  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.snap = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  private buildSnapshot(): Snapshot {
    return {
      gameState: this.gameState, phase: this.phase, wave: this.wave, rp: this.rp,
      legacy: this.meta.legacy, bestWave: this.meta.bestWave, sync: this.sync, turn: this.turn,
      combo: this.comboCount, expectedTap: this.expectedTap, activeItem: this.activeItem,
      inventory: { ...this.inventory }, bros: structuredClone(this.bros), moveType: this.moveType,
      enemies: this.enemies.map((e) => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp })),
      levelUp: this.levelQueue.length && this.levelChoices.length ? { bro: this.levelQueue[0], choices: this.levelChoices } : null
    };
  }

  /**
   * Rope timing judged at the exact press time (extrapolated between sim steps), shifted by the
   * player's calibrated latency. The Rhythm stat widens the perfect window.
   */
  private isPerfect(atTime: number, rhythmStat: number) {
    const offset = this.meta.latencyMs / 1000 - audio.outputLatency;
    const dt = atTime - offset - this.lastStepTime;
    const angle = this.ropeAngle + this.ropeSpeed * SIM_HZ * dt;
    return Math.abs(Math.sin(angle)) > perfectThreshold(rhythmStat);
  }

  private initWave() {
    const tier = Math.floor(this.wave / 5);
    const hpMult = 1 + tier * 0.4;
    const isBoss = this.wave % 5 === 0;
    const count = isBoss ? 1 : Math.min(3, Math.floor(this.wave / 3) + 1);
    const pool: EnemyTypeId[] = ['SLIME', 'BAT', 'SHELL'];
    this.enemies = Array.from({ length: count }, (_, i) => {
      const type: EnemyTypeId = isBoss ? 'BOSS' : pool[Math.floor(this.rng() * pool.length)];
      const d = ENEMY_TYPES[type];
      const x = isBoss ? 200 : 100 + i * 150;
      const hp = Math.round(d.hp * hpMult);
      return {
        id: Date.now() + i, type, name: d.name, hp, maxHp: hp, dmg: d.dmg, color: d.color, speed: d.speed,
        patterns: d.patterns, scale: d.scale, float: d.float, isBoss: !!d.isBoss,
        x, y: d.float, vy: 0, jumping: false, targetX: x
      };
    });
    // Downed bros get back up between waves at 30% so a run isn't silently lost.
    (['red', 'blue'] as BroKey[]).forEach((k) => {
      const b = this.bros[k];
      if (b.hp <= 0) b.hp = Math.round(calculateDerived(b).maxHp * 0.3);
    });
    this.targetIdx = 0;
    this.resetTempo();
    this.comboCount = 0;
    this.turn = this.livingTurn(this.turn);
    this.setPhase('MENU');
  }

  private resetTempo() {
    this.ropeSpeed = 0.07; this.windup = 0; this.actionSuccess = false; this.missLocked = false; this.missTimer = 0;
    this.moveType = 'BASIC'; this.activeAttacker = null; this.hazards = []; this.expectedTap = null; this.activeItem = null;
    this.touch();
  }

  private livingTurn(preferred: BroId): BroId {
    if (this.bros[keyOf(preferred)].hp > 0) return preferred;
    return other(preferred);
  }

  private commitTarget(idx: number) {
    this.targetIdx = idx;
    const enemy = this.enemies[idx];
    const move = MOVE_REGISTRY[this.moveType];
    if (move.rhythm) {
      this.ropeSpeed = enemy.speed;
      this.windup = 0;
      this.setPhase('WINDUP');
    } else {
      this.launch(this.turn, enemy.float < 0 ? -22 : -18, 0);
    }
  }

  /** The only place Sync is spent. A move pays exactly once, at the moment it commits. */
  private launch(attacker: BroId, vy: number, xOffset: number) {
    const move = MOVE_REGISTRY[this.moveType];
    this.sync = Math.max(0, this.sync - move.cost);
    this.activeAttacker = attacker;
    const body = this.body[keyOf(attacker)];
    body.vy = vy;
    body.jumping = true;
    body.targetX = (this.enemies[this.targetIdx]?.x ?? 200) + xOffset;
    this.launchTimer = 0;
    this.setPhase('LAUNCH');
  }

  private damageBro(key: BroKey, amount: number) {
    const b = this.bros[key];
    b.hp = Math.max(0, b.hp - amount);
    if (b.hp === 0) this.text(this.body[key].x, GROUND_Y - 110, 'DOWN!', '#f87171', 1.4);
    this.touch();
  }

  private useItemOn(key: BroKey) {
    const id = this.activeItem;
    if (!id || this.inventory[id] <= 0) return;
    const b = this.bros[key];
    const x = this.body[key].x;
    if (id === 'coffee') {
      if (b.hp <= 0) { this.text(x, GROUND_Y - 80, 'DOWNED', '#94a3b8'); return; }
      b.hp = Math.min(calculateDerived(b).maxHp, b.hp + 80);
      this.text(x, GROUND_Y - 80, '+80 HP', '#4ade80');
    } else {
      this.sync = Math.min(100, this.sync + 35);
      this.text(x, GROUND_Y - 80, '+35% SYNC', '#3b82f6');
    }
    this.inventory[id] -= 1;
    this.activeItem = null;
    audio.play('ui');
    this.startEnemyTurn();
  }

  private startEnemyTurn() {
    // Combo always resets here — the single entry point into the enemy phase.
    this.comboCount = 0;
    this.expectedTap = null;
    this.missLocked = false;
    const living = this.enemies.filter((e) => e.hp > 0).map((e) => e.id);
    if (living.length === 0) return this.setPhase('MENU');
    const limit = this.wave <= 5 ? 1 : this.wave <= 10 ? 2 : living.length;
    this.enemyQueue = living.slice(0, limit);
    this.setPhase('ENEMY_TURN');
    this.nextEnemyAttack();
  }

  private nextEnemyAttack() {
    const id = this.enemyQueue.shift();
    if (id === undefined) return this.endEnemyTurn();
    this.currentEnemyId = id;
    const enemy = this.enemies.find((e) => e.id === id)!;
    const pattern = pickPattern(enemy.patterns, this.rng);
    this.hazards = buildPattern(pattern, this.wave);
    this.text(enemy.x + 20, GROUND_Y + enemy.y - 110, PATTERN_CALL[pattern], enemy.color, 1.1);
  }

  private endEnemyTurn() {
    this.hazards = [];
    this.currentEnemyId = null;
    if (this.bros.red.hp <= 0 && this.bros.blue.hp <= 0) return this.gameOver();
    this.turn = this.livingTurn(other(this.turn));
    this.resetTempo();
    this.setPhase('MENU');
  }

  private gameOver() {
    this.meta.legacy += this.wave * 5;
    this.meta.bestWave = Math.max(this.meta.bestWave, this.wave);
    saveMeta(this.meta);
    this.gameState = 'GAMEOVER';
    this.touch();
  }

  /** All wave-clear rewards resolve here, once, outside any state updater. */
  private waveClear() {
    const hasRpBoost = this.bros.red.perks.includes('rp_boost') || this.bros.blue.perks.includes('rp_boost');
    this.rp += Math.round(waveRp(this.wave) * (hasRpBoost ? 1.25 : 1));
    this.meta.legacy += this.wave * 10;
    this.meta.bestWave = Math.max(this.meta.bestWave, this.wave);
    saveMeta(this.meta);
    const queue = new Set<BroKey>();
    (['red', 'blue'] as BroKey[]).forEach((k) => {
      const b = this.bros[k];
      if (b.hp <= 0) return;
      b.xp += waveXp(this.wave);
      if (b.xp >= b.maxXp) queue.add(k);
    });
    this.levelQueue = [...queue];
    this.levelChoices = [];
    this.rollLevelChoices();
    this.gameState = 'WIN';
    this.touch();
  }

  private rollLevelChoices() {
    const key = this.levelQueue[0];
    if (!key || this.levelChoices.length) return;
    const b = this.bros[key];
    const shuffle = <T,>(arr: T[]) => arr.map((v) => [this.rng(), v] as const).sort((a, z) => a[0] - z[0]).map(([, v]) => v);
    if ((b.lvl + 1) % 5 === 0) {
      const available = PERKS_DATA.filter((p) => !b.perks.includes(p.id as PerkId));
      if (available.length) {
        this.levelChoices = shuffle(available).slice(0, 3).map((p) => ({ kind: 'perk', key: p.id, name: p.name, icon: p.icon, desc: p.desc }));
        return;
      }
    }
    this.levelChoices = shuffle(STAT_DEFS).slice(0, 3).map((s) => ({ kind: 'stat', key: s.key as StatKey, name: s.name, icon: s.icon, color: s.color, desc: s.desc }));
  }

  // ================= Fixed-timestep simulation =================

  step() {
    if (this.gameState !== 'BATTLE') return;
    this.camera.zoom += (1 - this.camera.zoom) * 0.15;
    if (this.camera.shake > 0) this.camera.shake *= 0.85;
    if (this.freeze > 0) { this.freeze--; return; }

    this.ropeAngle += this.ropeSpeed;
    this.scheduleBeat();

    const bodies: Body[] = [this.body.red, this.body.blue, ...this.enemies];
    for (const o of bodies) {
      o.y += o.vy;
      const floor = o.float ?? 0;
      if (o.y < floor) o.vy += GRAVITY;
      else { o.y = floor; o.vy = 0; o.jumping = false; }
      o.x += (o.targetX - o.x) * 0.2;
    }
    this.floatingTexts = this.floatingTexts.filter((t) => (t.y += t.vy, (t.life -= 0.02) > 0));

    if (this.missTimer > 0 && --this.missTimer === 0) this.startEnemyTurn();

    switch (this.phase) {
      case 'LAUNCH': return this.stepLaunch();
      case 'IMPACT': return this.stepImpact();
      case 'RETURN': return this.stepReturn();
      case 'ENEMY_TURN': return this.stepEnemyTurn();
    }
  }

  /** Schedule the rope's beat click on the audio timeline at the exact moment of the swing peak. */
  private scheduleBeat() {
    if (this.phase !== 'WINDUP' || !audio.running) return;
    const beat = Math.floor(this.ropeAngle / Math.PI + 0.5);
    if (beat === this.scheduledBeat) return;
    const peakAngle = (beat + 0.5) * Math.PI;
    const secondsAway = (peakAngle - this.ropeAngle) / (this.ropeSpeed * SIM_HZ);
    if (secondsAway > 0 && secondsAway < STEP * 2) {
      audio.play('tick', audio.now() + secondsAway);
      this.scheduledBeat = beat;
    }
  }

  private stepLaunch() {
    if (!this.activeAttacker) return;
    const target = this.enemies[this.targetIdx];
    const attacker = this.body[keyOf(this.activeAttacker)];
    if (!target || target.hp <= 0 || ++this.launchTimer > 150) return this.setPhase('RETURN');
    const aerial = target.float < 0;
    const hitX = aerial ? 140 : 100;
    const hitY = aerial ? 160 : 60;
    if (attacker.vy <= 0 || Math.abs(attacker.y - target.y) >= hitY || Math.abs(attacker.x - target.x) >= hitX) return;

    const bro = this.bros[keyOf(this.activeAttacker)];
    const stats = calculateDerived(bro);
    // Follow-up hits in a tag chain are basic strikes boosted by combo; the chosen move lands once.
    const move: MoveId = this.comboCount === 0 ? this.moveType : 'BASIC';
    const hit = resolveHit({ move, attacker: this.activeAttacker, stats, perks: bro.perks, comboCount: this.comboCount, targetAerial: aerial, roll: this.rng() });

    target.hp = Math.max(0, target.hp - hit.dmg);
    this.sync = Math.min(100, this.sync + hit.syncGain);
    if (hit.healOnCrit) bro.hp = Math.min(stats.maxHp, bro.hp + hit.healOnCrit);
    const ty = GROUND_Y + target.y;
    if (hit.clip) this.text(target.x, ty - 80, 'CLIP!', '#3b82f6', 1.8);
    if (hit.crit) this.text(target.x - 20, ty - 100, 'CRIT!', '#facc15', 1.4);
    this.text(target.x + 20, ty - 40, `-${hit.dmg}`, hit.crit ? '#facc15' : '#fff', 1.6);
    if (target.hp === 0) { audio.play('ko'); this.text(target.x + 20, ty - 130, 'K.O.', target.color, 1.6); }
    audio.play(hit.crit ? 'crit' : 'hit');

    this.impactTotal = impactWindow(stats, this.comboCount, hit.windowBonus, MIN_IMPACT_FRAMES);
    this.impactTimer = this.impactTotal;
    this.freeze = 8;
    if (move === 'ULT') this.camera.shake = 40;
    this.camera.zoom = Math.max(this.camera.zoom, move === 'ULT' ? 1.12 : 1.05);
    const partner = other(this.activeAttacker);
    this.expectedTap = this.bros[keyOf(partner)].hp > 0 && target.hp > 0 ? partner : null;
    this.actionSuccess = false;
    this.setPhase('IMPACT');
  }

  private stepImpact() {
    this.impactTimer--;
    const target = this.enemies[this.targetIdx];
    if (this.impactTimer > 0 && target?.hp > 0) return;
    this.expectedTap = null;
    if (this.actionSuccess && target?.hp > 0) {
      this.comboCount++;
      const prev = this.body[keyOf(this.activeAttacker!)];
      prev.vy = -12;
      prev.targetX = HOME_X[keyOf(this.activeAttacker!)];
      const next = other(this.activeAttacker!);
      const body = this.body[keyOf(next)];
      body.vy = -16; body.jumping = true; body.targetX = target.x + 25;
      this.activeAttacker = next;
      this.launchTimer = 0;
      this.actionSuccess = false;
      this.setPhase('LAUNCH');
    } else {
      this.setPhase('RETURN');
    }
  }

  private stepReturn() {
    this.body.red.targetX = HOME_X.red;
    this.body.blue.targetX = HOME_X.blue;
    const home = Math.abs(this.body.red.x - HOME_X.red) < 5 && Math.abs(this.body.blue.x - HOME_X.blue) < 5;
    if (!home) return;
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.targetIdx = 0;
    this.activeAttacker = null;
    if (this.enemies.length === 0) this.waveClear();
    else this.startEnemyTurn();
  }

  private stepEnemyTurn() {
    const enemy = this.enemies.find((e) => e.id === this.currentEnemyId);
    let live = false;
    for (const h of this.hazards) {
      if (h.delay > 0) { h.delay--; live = true; continue; }
      h.x += h.vx;
      if (h.x < CANVAS_WIDTH + 100) live = true;
      if (h.fake) continue;
      (['red', 'blue'] as BroKey[]).forEach((k) => {
        if (this.bros[k].hp <= 0 || h.hit.includes(k)) return;
        const b = this.body[k];
        const top = GROUND_Y + b.y - 68, bottom = GROUND_Y + b.y;
        const overlapX = b.x + 32 > h.x && b.x < h.x + h.w;
        const overlapY = bottom > h.y && top < h.y + h.h;
        if (overlapX && overlapY) {
          h.hit.push(k);
          this.damageBro(k, enemy?.dmg ?? 15);
          this.camera.shake = 25;
          audio.play('hurt');
          this.text(b.x, GROUND_Y - 80, 'OUCH!', '#f87171', 1.2);
        }
      });
    }
    if (!live) this.nextEnemyAttack();
  }
}

export const isAlive = (b: Bro) => b.hp > 0;
export { idOf, keyOf };
