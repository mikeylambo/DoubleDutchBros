import {
  ENEMY_TYPES, GEAR_DATA, GRAVITY, GROUND_Y, HOME_X, ITEM_DATA, MIN_IMPACT_FRAMES, MOVE_REGISTRY,
  PERKS_DATA, SIM_HZ, STAT_DEFS, nextMaxXp, waveRp, waveXp,
  type BroId, type BroKey, type EnemyTypeId, type GearSlot, type ItemId, type MoveId, type PatternId, type PerkId, type StatKey
} from '../data/config';
import { audio } from './audio';
import {
  HOP_HEAT_MAX, HOP_TRIP_MULT, applyDefenses, SKIP_PERFECT_SYNC, SKIP_WINDOW_BONUS, TAG_WINDOW, impactWindow, judgeJump, perfectThreshold, resolveHit,
  type JumpJudgment
} from './combat';
import { PATTERN_CALL, SHOCK_WINDOW, SILENCE, buildPattern, hazardDone, hazardX, pickPattern } from './enemyScripts';
import { AFFIXES, attackersPerTurn, composeWave, type AffixId } from './encounters';
import { MUTATOR_IDS, applySwag, mutatorScore, offersMutator, rigAlert, swagTier, type MutatorId, type SwagEvent } from './runmods';
import { music, type BeatClock } from './music';
import { LEGACY_TREE, ROPE_STYLES } from '../data/legacy';
import { defaultSettings, freshProgress, type GameSettings, type Progress } from './save';
import { calculateDerived, makeBro } from './stats';
import {
  TUTORIAL_IMPACT_SCALE, TUTORIAL_ROPE_RATE, TUTORIAL_SLIME_HP, tutorialAllows, tutorialHint, type TutorialStep
} from './tutorial';
import type { Body, Bro, Enemy, FloatingText, GameState, Hazard, LevelChoice, Particle, Phase, RunMode, RunStats, RunSummary, Snapshot } from './types';

/** Semantic things that happened in the game. Platform code turns these into stats, achievements, telemetry. */
export type GameEvent =
  | { type: 'run.start'; mode: RunMode; seedKey: string | null }
  | { type: 'run.end'; summary: RunSummary }
  | { type: 'enemy.seen'; enemy: EnemyTypeId }
  | { type: 'enemy.ko'; enemy: EnemyTypeId; boss: boolean }
  | { type: 'jump.perfect'; streak: number }
  | { type: 'jump.trip' }
  | { type: 'tag.sync'; combo: number }
  | { type: 'hit'; move: MoveId; crit: boolean; damage: number }
  | { type: 'bro.hurt' }
  | { type: 'wave.clear'; wave: number; flawless: boolean }
  | { type: 'tutorial.done' }
  | { type: 'legacy.unlock'; id: string };

export interface EngineInit {
  progress?: Progress;
  settings?: GameSettings;
  saveProgress?: (p: Progress) => void;
  saveSettings?: (s: GameSettings) => void;
  onEvent?: (e: GameEvent) => void;
}

/** Separate random streams, so in a seeded run a crit roll never changes which enemies show up. */
export interface RngStreams { waves: () => number; combat: () => number; rewards: () => number }

const freshRunStats = (): RunStats => ({
  perfects: 0, trips: 0, tagsLanded: 0, tagsMissed: 0, dodges: 0, hitsTaken: 0, enemiesDefeated: 0,
  bossesDefeated: 0, damageDealt: 0, maxCombo: 0, wavesCleared: 0, ultsLanded: 0, stylePoints: 0
});

/** Score for leaderboards: progress first, then how well it was played. */
export const scoreRun = (s: RunStats) =>
  s.wavesCleared * 1000 + s.damageDealt + s.maxCombo * 100 + s.perfects * 25 + s.dodges * 20 + s.bossesDefeated * 2500 + s.stylePoints;

/** 0..100 execution quality (timing, tags, dodges); feeds the letter rank. */
export const performanceOf = (s: RunStats) => {
  // Untried skills score as average, not perfect, so skipping them can't inflate the rank.
  const rate = (good: number, bad: number) => (good + bad === 0 ? 0.6 : good / (good + bad));
  const quality = Math.round(100 * (0.4 * rate(s.perfects, s.trips) + 0.3 * rate(s.tagsLanded, s.tagsMissed) + 0.3 * rate(s.dodges, s.hitsTaken)));
  // A run that never cleared a wave can't rank above C.
  return s.wavesCleared === 0 ? Math.min(quality, 50) : quality;
};

const STEP = 1 / SIM_HZ;
const keyOf = (id: BroId): BroKey => (id === 'RED' ? 'red' : 'blue');
const idOf = (k: BroKey): BroId => (k === 'red' ? 'RED' : 'BLUE');
const other = (id: BroId): BroId => (id === 'RED' ? 'BLUE' : 'RED');

export type MenuAction = 'BASIC' | 'TECH' | 'ITEMS' | 'ULT' | 'TECH1' | 'TECH2' | 'TECH3' | 'TECH4' | 'TECH5' | 'TECH6' | 'BACK';

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
  progress: Progress;
  settings: GameSettings;
  private hooks: EngineInit;
  mode: RunMode = 'endless';
  seedKey: string | null = null;
  runStats: RunStats = freshRunStats();
  /** Summary of the last finished run, shown on the results screen. */
  lastRun: RunSummary | null = null;
  private perfectStreak = 0;
  private waveHurt = false;
  /** Dodges at the start of the wave, to tell a flawless wave from one with no attacks. */
  private waveDodgeMark = 0;
  private enemyTurnCount = 0;
  private silence: [number, number] | null = null;
  private silent = false;
  private rng: RngStreams;
  private readonly defaultRng: RngStreams;
  /** Non-null while the guided first fight is running. */
  tutorial: TutorialStep | null = null;
  private tripRecover = 0;

  // --- combat state ---
  moveType: MoveId = 'BASIC';
  /** Hop's Heat stacks: perfect jumps build it, a trip or a hit clears it. */
  heat = 0;
  /** Live style meter 0..100; its tier multiplies style points. */
  swag = 0;
  /** Ascension mutators active this run. */
  mutators: MutatorId[] = [];
  /** Offered after a boss from wave 10; null when no choice is pending. */
  mutatorChoices: MutatorId[] | null = null;
  /** Set when a move was chosen on the beat: its first hit deals +10%. */
  private onBeatBonus = false;
  private startWave = 1;
  private actionTime = 0;
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
  /** Where each rabbit stands. Glitch bosses can swap them. */
  homes: Record<BroKey, number> = { ...HOME_X };
  ropeAngle = Math.PI / 2;
  /** Rope peaks per beat (1 = every beat, 0.5 = every other beat). */
  ropeRate = 1;
  /** Extra strictness of the perfect window for the current target. */
  tightness = 0;
  /** The beat the player is hearing right now (fractional). Everything rhythmic reads this. */
  beat = 0;
  camera = { zoom: 1, shake: 0 };
  floatingTexts: FloatingText[] = [];
  particles: Particle[] = [];
  /** Screen flash intensity 0..1, decays each step. */
  flash = 0;
  flashColor = '#ffffff';

  // --- clock ---
  private accumulator = 0;
  private lastFrameTime: number | null = null;
  private clockWasAudio = false;
  private scheduledBeat = -1;

  // --- snapshot plumbing ---
  private listeners = new Set<() => void>();
  private dirty = true;
  private snap!: Snapshot;

  constructor(rng: () => number = Math.random, readonly clock: BeatClock = music, init: EngineInit = {}) {
    this.defaultRng = { waves: rng, combat: rng, rewards: rng };
    this.rng = this.defaultRng;
    this.progress = init.progress ?? freshProgress();
    this.settings = { ...defaultSettings(), ...init.settings };
    this.hooks = init;
    this.snap = this.buildSnapshot();
    this.applyVolumes();
  }

  private emit(e: GameEvent) { this.hooks.onEvent?.(e); }
  private persistProgress() { this.hooks.saveProgress?.(this.progress); }

  /** Change preferences (volume, calibration, accessibility) and persist them. */
  updateSettings(patch: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.settings.latencyMs = Math.max(-150, Math.min(150, Math.round(this.settings.latencyMs)));
    this.applyVolumes();
    this.hooks.saveSettings?.(this.settings);
    this.touch();
  }

  /**
   * Beat being heard at an audio-clock time: what was scheduled `outputLatency` ago, shifted by
   * the player's calibration. Used for visuals, judging and attacks alike so they always agree.
   */
  heardBeat(t: number) {
    return this.clock.beatAt(t - audio.outputLatency - this.settings.latencyMs / 1000);
  }

  // ================= Public API: React subscribes and sends commands =================

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getSnapshot = () => this.snap;

  /** Advance the sim by real elapsed time using a fixed timestep. Called once per animation frame. */
  frame() {
    if (this.clock === music) music.sync();
    const usingAudio = audio.running;
    const now = audio.now();
    // Switching clock source (audio unlocked) would create a time jump, so resync instead.
    if (this.lastFrameTime === null || usingAudio !== this.clockWasAudio) this.lastFrameTime = now;
    this.clockWasAudio = usingAudio;
    this.accumulator += Math.min(0.25, now - this.lastFrameTime);
    this.lastFrameTime = now;
    while (this.accumulator >= STEP) {
      this.step();
      this.accumulator -= STEP;
    }
    this.flush();
  }

  /** Start a run. Seeded runs (daily) take their own random streams so every player meets the same waves. */
  startRun(opts: { mode?: RunMode; seedKey?: string | null; rng?: RngStreams; startWave?: number } = {}) {
    audio.unlock();
    this.tutorial = null;
    this.mode = opts.mode ?? 'endless';
    this.seedKey = opts.seedKey ?? null;
    this.rng = opts.rng ?? this.defaultRng;
    this.runStats = freshRunStats();
    this.lastRun = null;
    this.perfectStreak = 0;
    this.swag = 0;
    this.mutators = [];
    this.mutatorChoices = null;
    this.startWave = opts.startWave ?? 1;
    this.emit({ type: 'run.start', mode: this.mode, seedKey: this.seedKey });
    this.startMusic();
    this.progress.runs += 1;
    this.persistProgress();
    this.resetRun();
  }

  /** The guided first fight: one slime, no real damage, slowed rope. */
  startTutorial() {
    audio.unlock();
    this.tutorial = 'ATTACK';
    this.mode = 'endless';
    this.seedKey = null;
    this.runStats = freshRunStats();
    this.startMusic();
    this.resetRun();
    const slime = this.enemies[0];
    this.enemies = [{ ...slime, type: 'SLIME', name: 'SLIME', hp: TUTORIAL_SLIME_HP, maxHp: TUTORIAL_SLIME_HP, color: ENEMY_TYPES.SLIME.color, patterns: ['WAVE'], scale: 1, float: 0, y: 0, x: 250, targetX: 250, isBoss: false }];
    this.touch();
  }

  private startMusic() {
    if (this.clock !== music) return;
    music.play();
    music.duck(false);
  }

  private applyVolumes() {
    audio.hapticsEnabled = this.settings.vibration;
    music.setVolume(this.settings.musicVolume);
    audio.setVolume(this.settings.sfxVolume);
  }

  private resetRun() {
    this.gameState = 'BATTLE';
    const has = (id: string) => this.progress.unlocks.includes(id);
    const start = this.tutorial ? 1 : this.startWave;
    this.wave = start; this.sync = 0; this.turn = 'RED'; this.heat = 0;
    this.rp = 800 + (has('nudge_rp') && !this.tutorial ? 200 : 0) + (start - 1) * 300;
    this.inventory = { coffee: 3 + (has('nudge_coffee') && !this.tutorial ? 1 : 0), soda: 2 };
    this.bros = { red: makeBro('red'), blue: makeBro('blue') };
    // Late starts come with the levels a run would have earned by then.
    const stats: StatKey[] = ['power', 'vitality', 'rhythm', 'technique', 'teamwork'];
    for (const k of ['red', 'blue'] as BroKey[]) {
      const b = this.bros[k];
      for (let i = 0; i < Math.floor((start - 1) / 2); i++) { b.lvl++; b.bonus[stats[i % stats.length]]++; b.maxXp = nextMaxXp(b.maxXp); }
      b.hp = calculateDerived(b).maxHp;
    }
    this.levelQueue = []; this.levelChoices = [];
    this.initWave();
  }

  /** Spend Legacy Points on a tree node. Returns false if unaffordable or locked. */
  buyLegacy(id: string): boolean {
    const node = LEGACY_TREE.find((n) => n.id === id);
    if (!node || this.progress.unlocks.includes(id) || this.progress.legacy < node.cost) return false;
    if (node.requires?.some((r) => !this.progress.unlocks.includes(r))) return false;
    this.progress.legacy -= node.cost;
    this.progress.unlocks.push(id);
    if (ROPE_STYLES.includes(id as typeof ROPE_STYLES[number])) this.progress.ropeStyle = id;
    this.persistProgress();
    this.emit({ type: 'legacy.unlock', id });
    audio.play('perfect');
    this.touch();
    return true;
  }

  setRopeStyle(id: string | null) {
    if (id && !this.progress.unlocks.includes(id)) return;
    this.progress.ropeStyle = id;
    this.persistProgress();
    this.touch();
  }

  /** Back to the title screen (music keeps playing). */
  toTitle() { this.tutorial = null; this.gameState = 'TITLE'; music.duck(false); this.touch(); }

  pause() { if (this.gameState === 'BATTLE') { this.gameState = 'PAUSE'; music.duck(true); this.touch(); } }
  /** Resuming never re-initializes the wave (old build rerolled enemies on resume). */
  resume() { if (this.gameState === 'PAUSE') { this.gameState = 'BATTLE'; music.duck(false); this.touch(); } }


  action(a: MenuAction, atTime = audio.now()) {
    if (this.gameState !== 'BATTLE') return;
    audio.unlock();
    this.actionTime = atTime;
    const p = this.phase;
    if (a === 'BACK') {
      if (p === 'TECH_SELECT' || p === 'ITEMS' || p === 'TARGET' || p === 'ITEMS_TARGETING') { this.activeItem = null; this.setPhase('MENU'); }
      return;
    }
    if (p !== 'MENU' && p !== 'TECH_SELECT') return;
    if (this.tutorial && !tutorialAllows(this.tutorial, a)) return;
    if (a === 'ITEMS') return this.setPhase('ITEMS');
    if (a === 'TECH') { if (this.sync >= 20) this.setPhase('TECH_SELECT'); return; }
    const move = MOVE_REGISTRY[a];
    if (move.owner && move.owner !== this.turn) return;
    if (!this.hasMove(a)) return;
    // Tandem needs both rabbits standing.
    if (a === 'TECH6' && (this.bros.red.hp <= 0 || this.bros.blue.hp <= 0)) return;
    if (this.sync < move.cost) return;
    this.moveType = a;
    audio.play('ui');
    // Choosing a move right on the beat earns a small damage bonus.
    const b = this.heardBeat(this.actionTime);
    if (!this.tutorial && Math.abs(b - Math.round(b)) < 0.15) {
      this.onBeatBonus = true;
      this.addSwag('onbeat');
      this.text(this.body[keyOf(this.turn)].x + 16, GROUND_Y - 160, 'ON BEAT', '#67e8f9', 0.7);
    }
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
        if (btn !== this.expectedJumper() || bro.hp <= 0 || this.missLocked) return;
        const body = this.body[key];
        if (body.jumping) return;
        const stats = calculateDerived(bro);
        // Fit the jump to the rope: always land before the next peak, whatever the tempo.
        const framesPerPeak = (SIM_HZ * 60) / (this.clock.bpm * this.ropeRate);
        const airtime = Math.min(framesPerPeak * 0.8, (2 * -stats.jump) / GRAVITY);
        this.jump(body, (-GRAVITY * airtime) / 2);
        body.squash = -0.6;
        const judgment = this.judge(atTime, btn, stats.rhythm);
        if (judgment === 'PERFECT') {
          this.windup++;
          this.runStats.perfects++;
          this.addSwag('perfect');
          this.emit({ type: 'jump.perfect', streak: ++this.perfectStreak });
          if (btn === 'RED') {
            if (this.heat < HOP_HEAT_MAX) this.text(body.x + 16, GROUND_Y - 150, `HEAT ${this.heat + 1}`, '#fb923c', 0.7);
            this.heat = Math.min(HOP_HEAT_MAX, this.heat + 1);
          } else {
            this.sync = Math.min(100, this.sync + SKIP_PERFECT_SYNC);
          }
          this.touch();
          audio.play('perfect');
          audio.buzz(12);
          this.burst(body.x + 16, GROUND_Y, '#facc15', 10, 4);
          this.text(body.x + 16, GROUND_Y - 80, 'PERFECT!', '#facc15', 1.2);
          if (this.windup >= this.windupLimit()) this.launch(this.turn, -14, 20);
        } else {
          this.missLocked = true;
          this.runStats.trips++;
          this.addSwag('trip');
          this.perfectStreak = 0;
          if (btn === 'RED') this.heat = 0;
          this.emit({ type: 'jump.trip' });
          this.camera.shake = 15;
          audio.play('trip');
          audio.buzz(60);
          this.text(body.x + 16, GROUND_Y - 80, 'TRIP!', '#f87171', 1);
          this.text(body.x + 16, GROUND_Y - 50, judgment, '#fca5a5', 0.6);
          if (this.tutorial) {
            // Practice: no damage and the turn isn't lost. Let them try again right away.
            this.tripRecover = 30;
            this.text(body.x + 16, GROUND_Y - 140, 'TRY AGAIN!', '#67e8f9', 0.8);
          } else {
            const trip = (bro.perks.includes('trip_shield') ? 15 : 30) * (btn === 'RED' ? HOP_TRIP_MULT : 1);
            this.damageBro(key, this.mutators.includes('GLASS_WIRE') ? bro.hp : Math.round(trip));
            this.missTimer = 48; // ~0.8s, ticks with the sim so pausing can't desync it
          }
        }
        return;
      }
      case 'IMPACT': {
        const needed = other(this.activeAttacker!);
        if (btn !== needed || bro.hp <= 0 || this.actionSuccess) return;
        const progress = 1 - this.impactTimer / this.impactTotal;
        const widen = this.mutators.includes('ECHO_CHAMBER') ? 0.1 : 0;
        const [from, to] = [TAG_WINDOW[needed][0] - widen, TAG_WINDOW[needed][1] + widen];
        if (progress > from && progress < to) {
          this.actionSuccess = true;
          this.runStats.tagsLanded++;
          this.addSwag('tag');
          this.emit({ type: 'tag.sync', combo: this.comboCount + 1 });
          this.camera.shake = 12;
          this.flash = 0.25; this.flashColor = '#00d2ff';
          audio.play('sync');
          audio.buzz(15);
          this.text(this.body[key].x, GROUND_Y - 120, 'SYNC!', '#00d2ff', 1.5);
        }
        return;
      }
      case 'ENEMY_TURN': {
        const body = this.body[key];
        if (!body.jumping && bro.hp > 0) this.jump(body, calculateDerived(bro).jump);
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

  enterShop() { if (this.gameState === 'WIN' && this.levelQueue.length === 0 && !this.mutatorChoices) { this.gameState = 'SHOP'; this.touch(); } }

  chooseMutator(id: MutatorId) {
    if (!this.mutatorChoices?.includes(id)) return;
    this.mutators.push(id);
    this.mutatorChoices = null;
    audio.play('perfect');
    this.touch();
  }

  private addSwag(e: SwagEvent) {
    const r = applySwag(this.swag, e);
    const before = swagTier(this.swag).label;
    this.swag = r.swag;
    this.runStats.stylePoints += r.points;
    if (swagTier(this.swag).label !== before) this.touch();
  }

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
  private setPhase(p: Phase) { this.phase = p; this.advanceTutorial(); this.touch(); }

  /** Tutorial steps advance on gameplay events, never on a timer. */
  private advanceTutorial() {
    const t = this.tutorial, p = this.phase;
    if (t === 'ATTACK' && p === 'LAUNCH') this.tutorial = 'TAG';
    else if (t === 'TAG' && p === 'ENEMY_TURN') this.tutorial = 'DODGE';
    else if (t === 'DODGE' && p === 'MENU') { this.tutorial = 'SKILL'; this.sync = Math.max(this.sync, 20); }
    else if (t === 'SKILL' && p === 'LAUNCH') this.tutorial = 'FINISH';
  }

  private finishTutorial() {
    this.tutorial = null;
    this.progress.tutorialDone = true;
    this.persistProgress();
    this.emit({ type: 'tutorial.done' });
    this.gameState = 'TUTORIAL_DONE';
    this.touch();
  }
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
      legacy: this.progress.legacy, bestWave: this.progress.bestWave, sync: this.sync, turn: this.turn,
      heat: this.heat, combo: this.comboCount, expectedTap: this.expectedTap, activeItem: this.activeItem,
      inventory: { ...this.inventory }, bros: structuredClone(this.bros), moveType: this.moveType,
      enemies: this.enemies.map((e) => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp })),
      tutorialDone: this.progress.tutorialDone,
      tutorialHint: this.tutorial
        ? tutorialHint(this.tutorial, this.phase, this.turn, (id) => this.bros[keyOf(id)].name,
            this.windupLimit() - this.windup)
        : null,
      unlocks: [...this.progress.unlocks], ropeStyle: this.progress.ropeStyle,
      swag: this.swag, swagTier: swagTier(this.swag).label, mutators: [...this.mutators],
      mutatorChoices: this.mutatorChoices ? [...this.mutatorChoices] : null,
      rigAlert: this.gameState === 'SHOP' ? rigAlert(this.wave + 1, this.bossFor(this.wave + 1)) : null,
      levelUp: this.levelQueue.length && this.levelChoices.length ? { bro: this.levelQueue[0], choices: this.levelChoices } : null
    };
  }

  /**
   * Rope timing judged at the exact press time (extrapolated between sim steps), shifted by the
   * player's calibrated latency. The Rhythm stat widens the perfect window.
   */
  private judge(atTime: number, who: BroId, rhythmStat: number): JumpJudgment {
    return judgeJump(this.ropeAngleAt(this.heardBeat(atTime)), this.perfectThresholdFor(who, rhythmStat));
  }

  /** |sin| the rope must exceed for a perfect. Skip's window is wider; fast enemies tighten it. */
  perfectThresholdFor(who: BroId, rhythmStat = calculateDerived(this.bros[keyOf(who)]).rhythm) {
    const skip = who === 'BLUE' ? SKIP_WINDOW_BONUS : 0;
    return Math.max(0.45, Math.min(0.95, perfectThreshold(rhythmStat) + this.tightness - skip));
  }

  /** Rope peaks (|sin| = 1) land exactly on beats, every 1/ropeRate beats. */
  private ropeAngleAt(beat: number) { return Math.PI * beat * this.ropeRate + Math.PI / 2; }

  private jump(body: Body, vy: number) {
    body.vy = vy;
    body.launchVy = vy;
    body.jumping = true;
  }

  private burst(x: number, y: number, color: string, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      // Cosmetic randomness stays off the gameplay streams.
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.5, life: 1, color, size: 2 + Math.random() * 3 });
    }
  }

  /** Who must jump the next rope peak. Tandem Master alternates between the rabbits. */
  expectedJumper(): BroId {
    return this.moveType === 'TECH6' && this.windup % 2 === 1 ? other(this.turn) : this.turn;
  }

  /** Whether a move is available (Legacy-locked moves need their unlock). */
  hasMove(id: MoveId) {
    const lock = MOVE_REGISTRY[id].unlock;
    return !lock || this.progress.unlocks.includes(lock);
  }

  /** Perfect jumps needed to launch the current skill. A living Rope-Biter adds one. */
  windupLimit() {
    const gearLimit = Object.entries(this.bros[keyOf(this.turn)].gear)
      .map(([slot, id]) => GEAR_DATA[slot as GearSlot].find((g) => g.id === id)?.moveLimit?.[this.moveType])
      .find((v) => v !== undefined);
    const base = gearLimit ?? MOVE_REGISTRY[this.moveType].limit?.(this.turn) ?? 3;
    const rat = this.enemies.some((e) => e.type === 'RAT' && e.hp > 0) ? 1 : 0;
    const heavy = this.mutators.includes('HEAVY_ROPE') && this.moveType !== 'BASIC' && this.moveType !== 'ULT' ? 1 : 0;
    return base + rat + heavy;
  }

  /** The boss for a boss wave. */
  /** Boss ladder (docs/DESIGN.md §7): 5 Giga Slime, 10 Bouncer King, 15 Glitch Pigeon, 20 Giga Remix, 50 Giga Glitch, then rotation. */
  bossFor(wave: number): EnemyTypeId {
    const fixed: Record<number, EnemyTypeId> = { 5: 'BOSS', 10: 'KING', 15: 'GLITCH', 20: 'BOSS', 50: 'GIGA_GLITCH' };
    if (fixed[wave]) return fixed[wave];
    const rotation: EnemyTypeId[] = wave > 50 ? ['BOSS', 'KING', 'GLITCH', 'GIGA_GLITCH'] : ['BOSS', 'KING', 'GLITCH'];
    return rotation[(wave / 5) % rotation.length];
  }

  /** Mixtape mutator: a random perk for a random rabbit, and a random elite, every wave. */
  private applyMixtape() {
    const keys = (['red', 'blue'] as BroKey[]).filter((k) => this.bros[k].hp > 0);
    const k = keys[Math.floor(this.rng.rewards() * keys.length)];
    const perk = PERKS_DATA.find((p) => k && !this.bros[k].perks.includes(p.id as PerkId));
    if (k && perk) { this.bros[k].perks.push(perk.id as PerkId); this.text(this.homes[k] + 16, GROUND_Y - 150, perk.name.toUpperCase(), '#facc15', 0.8); }
    const targets = this.enemies.filter((e) => !e.isBoss && !e.affix && e.type !== 'MIMIC');
    const t = targets[Math.floor(this.rng.waves() * targets.length)];
    if (t) {
      const affixes = Object.keys(AFFIXES) as AffixId[];
      t.affix = affixes[Math.floor(this.rng.waves() * affixes.length)];
      t.shield = t.affix === 'SHIELDED';
    }
  }

  /** Swap Hop and Skip's spots on the court (Glitch bosses). Buttons stay the same. */
  private swapHomes() {
    this.homes = { red: this.homes.blue, blue: this.homes.red };
    this.body.red.targetX = this.homes.red;
    this.body.blue.targetX = this.homes.blue;
    this.text(600, GROUND_Y - 170, 'SWAPPED!', '#5eead4', 1.4);
  }

  private initWave() {
    const tier = Math.floor(this.wave / 5);
    const hpMult = 1 + tier * 0.4;
    const spawns = composeWave(this.wave, this.rng.waves, this.bossFor(this.wave));
    this.homes = { ...HOME_X };
    this.body.red.targetX = this.homes.red;
    this.body.blue.targetX = this.homes.blue;
    const spacing = spawns.length > 3 ? 115 : 150;
    this.enemies = spawns.map((spawn, i) => {
      const d = ENEMY_TYPES[spawn.type];
      const x = d.isBoss ? 200 : 70 + i * spacing;
      const hp = Math.round(d.hp * hpMult * (spawn.affix ? 1.3 : 1));
      return {
        id: Date.now() + i, type: spawn.type, name: d.name, hp, maxHp: hp, dmg: d.dmg, color: d.color, ropeRate: d.ropeRate, tightness: d.tightness,
        patterns: d.patterns, scale: d.scale, float: d.float, isBoss: !!d.isBoss, hurt: 0, phase: 1,
        affix: spawn.affix, shield: spawn.affix === 'SHIELDED', turns: 0, staggered: false,
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
    this.waveHurt = false;
    this.waveDodgeMark = this.runStats.dodges;
    if (this.mutators.includes('MIXTAPE')) this.applyMixtape();
    if (this.progress.unlocks.includes('nudge_sync') && !this.tutorial) this.sync = Math.max(this.sync, 15);
    for (const en of this.enemies) this.emit({ type: 'enemy.seen', enemy: en.type });
    for (const en of this.enemies) {
      if (en.affix) this.text(en.x + 20, GROUND_Y + en.y - 120, AFFIXES[en.affix].name.toUpperCase(), AFFIXES[en.affix].color, 0.9);
    }
    this.turn = this.livingTurn(this.turn);
    this.setPhase('MENU');
  }

  private resetTempo() {
    this.ropeRate = 1; this.tightness = 0; this.windup = 0; this.actionSuccess = false; this.missLocked = false; this.missTimer = 0; this.tripRecover = 0;
    this.onBeatBonus = false;
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
      this.ropeRate = this.tutorial ? TUTORIAL_ROPE_RATE : move.ropeRate ?? enemy.ropeRate;
      this.tightness = this.tutorial ? 0 : enemy.tightness;
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
    this.jump(body, vy);
    body.targetX = (this.enemies[this.targetIdx]?.x ?? 200) + xOffset;
    this.launchTimer = 0;
    this.setPhase('LAUNCH');
  }

  private damageBro(key: BroKey, amount: number) {
    if (this.tutorial) return;
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
    // Attackers rotate so every enemy gets turns, not just the first in line.
    const n = attackersPerTurn(this.wave, living.length);
    const offset = this.enemyTurnCount++ % living.length;
    this.enemyQueue = [...living.slice(offset), ...living.slice(0, offset)].slice(0, n);
    this.setPhase('ENEMY_TURN');
    this.nextEnemyAttack();
  }

  private nextEnemyAttack(): void {
    const id = this.enemyQueue.shift();
    if (id === undefined) return this.endEnemyTurn();
    this.currentEnemyId = id;
    const enemy = this.enemies.find((e) => e.id === id)!;
    enemy.turns++;
    if (enemy.staggered) {
      // Hopscotch: it loses this attack.
      enemy.staggered = false;
      this.text(enemy.x + 20, GROUND_Y + enemy.y - 110, 'STAGGERED', '#93c5fd', 1);
      return this.nextEnemyAttack();
    }
    if (enemy.type === 'MIMIC') {
      // Treasure never fights back; it runs after three turns.
      if (enemy.turns >= 3) {
        this.text(enemy.x + 20, GROUND_Y + enemy.y - 110, 'FLED!', enemy.color, 1.2);
        this.enemies = this.enemies.filter((e) => e !== enemy);
        this.targetIdx = 0;
        if (!this.enemies.length) { this.hazards = []; this.setPhase('RETURN'); return; }
      }
      return this.nextEnemyAttack();
    }
    const pattern = this.tutorial ? 'WAVE' : pickPattern(this.patternsFor(enemy), this.rng.waves);
    const crowBuff = enemy.type !== 'CROW' && this.enemies.some((e) => e.type === 'CROW' && e.hp > 0);
    // Attacks start on a whole beat with one beat of breathing room (none if Hasty).
    const start = Math.ceil(this.beat) + (enemy.affix === 'HASTY' || this.mutators.includes('RUSH_HOUR') ? 0 : 1);
    // Remixed and late bosses echo their attacks a bar later.
    const echo = enemy.affix === 'ECHO' || this.mutators.includes('ECHO_CHAMBER') || (enemy.isBoss && enemy.phase >= 2 && (this.wave >= 20 || enemy.type === 'GIGA_GLITCH'));
    this.hazards = buildPattern(pattern, start, { mirror: enemy.affix === 'MIRRORED', echo, extra: crowBuff });
    const silence = SILENCE[pattern];
    this.silence = silence ? [start + silence[0], start + silence[1]] : null;
    this.text(enemy.x + 20, GROUND_Y + enemy.y - 110, PATTERN_CALL[pattern], enemy.color, 1.1);
  }

  /** Bosses change their move set as they lose HP. Each boss has its own phases (docs/DESIGN.md §7). */
  private patternsFor(enemy: Enemy): PatternId[] {
    if (!enemy.isBoss) return enemy.patterns;
    const ratio = enemy.hp / enemy.maxHp;
    const phase = ratio < 0.3 ? 3 : ratio < 0.6 ? 2 : 1;
    if (phase > enemy.phase) {
      enemy.phase = phase;
      // Phase changes land like a drop: muffle the music for a bar, flash, shake.
      const call: Record<string, string[]> = {
        BOSS: ['ENRAGED!', 'PANIC!'], KING: ['DOUBLE TIME!', 'LAST CALL!'], GLITCH: ['GLITCHING!', 'SWAP!'], GIGA_GLITCH: ['GLITCHING!', 'FULL GLITCH!']
      };
      this.text(enemy.x + 60, GROUND_Y + enemy.y - 200, call[enemy.type]?.[phase - 2] ?? 'ENRAGED!', enemy.color, 1.6);
      this.flash = 0.5; this.flashColor = enemy.color;
      this.camera.shake = 30;
      music.duck(true);
      setTimeout(() => { if (this.gameState === 'BATTLE') music.duck(false); }, (4 * 60_000) / this.clock.bpm);
      if (enemy.type === 'KING' && phase === 2) enemy.ropeRate = 2;          // the rope doubles too
      if ((enemy.type === 'GLITCH' || enemy.type === 'GIGA_GLITCH') && phase === 3) this.swapHomes();
    }
    const remix = this.wave >= 20;
    switch (enemy.type) {
      case 'KING':
        return phase === 1 ? ['BOUNCE', 'CHARGE', 'STOMP'] : ['DOUBLE_TIME', 'BOUNCE', 'STOMP'];
      case 'GLITCH':
        return phase === 1 ? ['SPLIT', 'PECK_PAIR'] : ['GLITCH_FEINT', 'SPLIT', 'PECK_PAIR'];
      case 'GIGA_GLITCH':
        return phase === 1 ? ['CROSSFIRE', 'STOMP', 'DELAYED'] : phase === 2 ? ['GLITCH_FEINT', 'STOMP', 'DOUBLE_TIME'] : ['PANIC', 'GLITCH_FEINT', 'CROSSFIRE'];
      default:
        if (phase === 3) return ['PANIC', 'CROSSFIRE'];
        if (phase === 2) return remix ? ['CROSSFIRE', 'DELAYED', 'STOMP'] : ['CROSSFIRE', 'DOUBLE_WAVE', 'CHARGE'];
        return remix ? ['DELAYED', 'CROSSFIRE', 'CHARGE'] : enemy.patterns;
    }
  }

  private endEnemyTurn() {
    this.hazards = [];
    this.silence = null;
    this.currentEnemyId = null;
    if (this.bros.red.hp <= 0 && this.bros.blue.hp <= 0) return this.gameOver();
    this.turn = this.livingTurn(other(this.turn));
    this.resetTempo();
    this.setPhase('MENU');
  }

  private gameOver() {
    this.progress.legacy += this.wave * 5;
    this.progress.bestWave = Math.max(this.progress.bestWave, this.wave);
    this.persistProgress();
    music.duck(true);
    this.lastRun = {
      mode: this.mode, seedKey: this.seedKey, wave: this.wave, stats: { ...this.runStats },
      score: Math.round(scoreRun(this.runStats) * mutatorScore(this.mutators)), performance: performanceOf(this.runStats),
      mutators: [...this.mutators]
    };
    this.emit({ type: 'run.end', summary: this.lastRun });
    this.gameState = 'GAMEOVER';
    this.touch();
  }

  /** All wave-clear rewards resolve here, once, outside any state updater. */
  private waveClear() {
    if (this.tutorial) return this.finishTutorial();
    this.runStats.wavesCleared++;
    this.emit({ type: 'wave.clear', wave: this.wave, flawless: !this.waveHurt && this.runStats.dodges > this.waveDodgeMark });
    const hasRpBoost = this.bros.red.perks.includes('rp_boost') || this.bros.blue.perks.includes('rp_boost');
    this.rp += Math.round(waveRp(this.wave) * (hasRpBoost ? 1.25 : 1) * (this.mutators.includes('SPOTLIGHT') ? 2 : 1));
    if (offersMutator(this.wave) || (this.wave === 5 && this.progress.unlocks.includes('mutators_early'))) {
      const pool = MUTATOR_IDS.filter((m) => !this.mutators.includes(m));
      const shuffled = pool.map((m) => [this.rng.rewards(), m] as const).sort((x, y) => x[0] - y[0]).map(([, m]) => m);
      this.mutatorChoices = shuffled.slice(0, 3);
      if (!this.mutatorChoices.length) this.mutatorChoices = null;
    }
    this.progress.legacy += this.wave * 10;
    this.progress.bestWave = Math.max(this.progress.bestWave, this.wave);
    this.persistProgress();
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
    const shuffle = <T,>(arr: T[]) => arr.map((v) => [this.rng.rewards(), v] as const).sort((a, z) => a[0] - z[0]).map(([, v]) => v);
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
    this.flash *= 0.85;
    this.particles = this.particles.filter((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.96;
      return (p.life -= 0.035) > 0;
    });
    if (this.freeze > 0) { this.freeze--; return; }

    this.beat = this.heardBeat(audio.now());
    // Boombox Crab's drop: the music cuts out while its hits land.
    const silent = !!this.silence && this.phase === 'ENEMY_TURN' && this.beat >= this.silence[0] && this.beat < this.silence[1];
    if (silent !== this.silent) { this.silent = silent; music.silence(silent); }
    this.ropeAngle = this.ropeAngleAt(this.beat);
    this.scheduleBeat();

    const bodies: Body[] = [this.body.red, this.body.blue, ...this.enemies];
    for (const o of bodies) {
      o.y += o.vy;
      const floor = o.float ?? 0;
      if (o.y < floor) o.vy += GRAVITY;
      else {
        // Landing: squash proportional to impact speed, plus a puff of dust.
        if (o.vy > 4 && o.float === undefined) { o.squash = Math.min(1, o.vy / 14); this.burst(o.x + 16, GROUND_Y, '#64748b', 4, 2); }
        o.y = floor; o.vy = 0; o.jumping = false;
      }
      if (o.squash) o.squash *= 0.8;
      if (o.hurtT) o.hurtT--;
      o.x += (o.targetX - o.x) * 0.2;
    }
    for (const en of this.enemies) if (en.hurt > 0) en.hurt--;
    this.floatingTexts = this.floatingTexts.filter((t) => (t.y += t.vy, (t.life -= 0.02) > 0));

    if (this.missTimer > 0 && --this.missTimer === 0) this.startEnemyTurn();
    if (this.tripRecover > 0 && --this.tripRecover === 0) { this.missLocked = false; this.touch(); }

    switch (this.phase) {
      case 'LAUNCH': return this.stepLaunch();
      case 'IMPACT': return this.stepImpact();
      case 'RETURN': return this.stepReturn();
      case 'ENEMY_TURN': return this.stepEnemyTurn();
    }
  }

  /**
   * Schedule a click on the audio timeline for the next rope peak while charging a skill, and a
   * soft pulse on every beat when no music is playing. Scheduled on the beat clock directly, so it
   * reaches the speakers alongside the music.
   */
  private scheduleBeat() {
    if (!audio.running) return;
    const windup = this.phase === 'WINDUP';
    if (!windup && (this.clock.live || this.phase === 'ENEMY_TURN')) return;
    const rate = windup ? this.ropeRate : 1;
    const raw = this.clock.beatAt(audio.now());
    const nextBeat = (Math.floor(raw * rate) + 1) / rate;
    if (nextBeat === this.scheduledBeat) return;
    const at = this.clock.timeOfBeat(nextBeat);
    if (at - audio.now() < STEP * 2) {
      audio.play(windup ? 'tick' : 'pulse', at);
      this.scheduledBeat = nextBeat;
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
    const hit = resolveHit({ move, attacker: this.activeAttacker, stats, perks: bro.perks, comboCount: this.comboCount, targetAerial: aerial, roll: this.rng.combat(), heat: this.activeAttacker === 'RED' ? this.heat : 0, trades: this.windup });

    // Run modifiers on the raw hit, before enemy defenses.
    if (this.mutators.includes('GLASS_WIRE')) hit.dmg *= 2;
    if (this.mutators.includes('HEAVY_ROPE') && move !== 'BASIC' && move !== 'ULT') hit.dmg = Math.round(hit.dmg * 1.4);
    if (this.onBeatBonus) { hit.dmg = Math.round(hit.dmg * 1.1); this.onBeatBonus = false; }
    const def = applyDefenses(hit.dmg, move, hit.crit, target.affix, target.shield);
    hit.dmg = def.dmg;
    if (def.shieldBroken) { target.shield = false; this.text(target.x + 20, GROUND_Y + target.y - 150, 'SHIELD BREAK!', '#67e8f9', 1.2); }
    if (def.blocked) this.text(target.x + 20, GROUND_Y + target.y - 150, 'BLOCKED', '#67e8f9', 1);
    target.hp = Math.max(0, target.hp - hit.dmg);
    target.hurt = 6;
    if (move === 'TECH5') target.staggered = true;
    this.runStats.damageDealt += hit.dmg;
    if (move === 'ULT') this.runStats.ultsLanded++;
    this.emit({ type: 'hit', move, crit: hit.crit, damage: hit.dmg });
    this.sync = Math.min(100, this.sync + hit.syncGain);
    if (hit.healOnCrit) bro.hp = Math.min(stats.maxHp, bro.hp + hit.healOnCrit);
    const ty = GROUND_Y + target.y;
    if (hit.clip) this.text(target.x, ty - 80, 'CLIP!', '#3b82f6', 1.8);
    if (hit.crit) this.text(target.x - 20, ty - 100, 'CRIT!', '#facc15', 1.4);
    this.text(target.x + 20, ty - 40, `-${hit.dmg}`, hit.crit ? '#facc15' : '#fff', 1.6);
    const cx = target.x + 20 * target.scale, cy = ty - 35 * target.scale;
    this.burst(cx, cy, hit.crit ? '#facc15' : '#ffffff', hit.crit ? 26 : 14, hit.crit ? 9 : 6);
    if (hit.crit) { this.flash = 0.35; this.flashColor = '#facc15'; }
    if (move === 'ULT') { this.flash = 0.8; this.flashColor = '#ffffff'; }
    if (move === 'TECH6') {
      // Tandem finisher: both rabbits arrive together.
      this.flash = 0.7; this.flashColor = '#f0abfc';
      this.camera.shake = 36; this.camera.zoom = 1.15;
      const partner = this.body[keyOf(other(this.activeAttacker))];
      this.jump(partner, -15); partner.targetX = target.x + 60;
      this.text(target.x + 20, ty - 170, `TANDEM ×${(1 + 0.25 * this.windup).toFixed(2)}`, '#f0abfc', 1.5);
    }
    if (target.hp === 0) {
      this.runStats.enemiesDefeated++;
      this.addSwag('ko');
      if (target.isBoss) this.runStats.bossesDefeated++;
      this.emit({ type: 'enemy.ko', enemy: target.type, boss: target.isBoss });
      audio.play('ko');
      this.burst(cx, cy, target.color, 40, 11);
      this.text(target.x + 20, ty - 130, 'K.O.', target.color, 1.6);
      if (target.type === 'MIMIC') {
        // Jackpot: RP and a free item.
        const item: ItemId = this.rng.rewards() < 0.5 ? 'coffee' : 'soda';
        this.rp += 300;
        this.inventory[item] += 1;
        this.text(target.x + 20, ty - 170, `+300 RP ${ITEM_DATA[item].icon}`, '#22d3ee', 1.3);
      }
    }
    audio.play(hit.crit ? 'crit' : 'hit');
    audio.buzz(hit.crit || move === 'ULT' ? 35 : 18);

    this.impactTotal = impactWindow(stats, this.comboCount, hit.windowBonus, MIN_IMPACT_FRAMES) * (this.tutorial ? TUTORIAL_IMPACT_SCALE : 1);
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
    if (this.expectedTap && !this.actionSuccess && target?.hp > 0) this.runStats.tagsMissed++;
    this.expectedTap = null;
    if (this.actionSuccess && target?.hp > 0 && (target.type === 'BOUNCER' || target.type === 'KING') && this.comboCount >= 2) {
      // Greed check: the Bouncer counters a fourth hit in a row.
      const next = other(this.activeAttacker!);
      this.damageBro(keyOf(next), Math.round(target.dmg * 0.8));
      this.body[keyOf(next)].hurtT = 24;
      this.camera.shake = 28;
      this.flash = 0.35; this.flashColor = '#a78bfa';
      audio.play('hurt');
      this.text(target.x + 30, GROUND_Y + target.y - 150, 'COUNTER!', '#a78bfa', 1.5);
      this.setPhase('RETURN');
      return;
    }
    if (this.actionSuccess && target?.hp > 0) {
      this.comboCount++;
      this.runStats.maxCombo = Math.max(this.runStats.maxCombo, this.comboCount + 1);
      const prev = this.body[keyOf(this.activeAttacker!)];
      prev.vy = -12;
      prev.targetX = this.homes[keyOf(this.activeAttacker!)];
      const next = other(this.activeAttacker!);
      const body = this.body[keyOf(next)];
      this.jump(body, -16); body.targetX = target.x + 25;
      this.activeAttacker = next;
      this.launchTimer = 0;
      this.actionSuccess = false;
      this.setPhase('LAUNCH');
    } else {
      this.setPhase('RETURN');
    }
  }

  private stepReturn() {
    this.body.red.targetX = this.homes.red;
    this.body.blue.targetX = this.homes.blue;
    const home = Math.abs(this.body.red.x - this.homes.red) < 5 && Math.abs(this.body.blue.x - this.homes.blue) < 5;
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
      h.x = hazardX(h, this.beat);
      if (h.flipAt !== undefined && this.beat >= h.flipAt && h.fake) { h.fake = false; this.flash = Math.max(this.flash, 0.15); }
      if (!hazardDone(h, this.beat)) live = true;
      if (h.fake) continue;
      if (h.kind === 'shock' && Math.abs(this.beat - h.arrive) < 0.05 && !h.cleared.length && !h.hit.length) {
        this.camera.shake = Math.max(this.camera.shake, 18);
        this.burst(HOME_X.red + 60, GROUND_Y, '#94a3b8', 20, 7);
      }
      (['red', 'blue'] as BroKey[]).forEach((k) => {
        if (this.bros[k].hp <= 0 || h.hit.includes(k)) return;
        const b = this.body[k];
        let struck: boolean;
        if (h.kind === 'shock') {
          // Shockwave: anyone off the ground during its window is hit; staying down is a dodge.
          const passed = this.beat > h.arrive + SHOCK_WINDOW;
          if (passed) {
            if (!h.cleared.includes(k)) { h.cleared.push(k); this.runStats.dodges++; this.addSwag('dodge'); }
            return;
          }
          struck = Math.abs(this.beat - h.arrive) <= SHOCK_WINDOW && b.y < -8;
        } else {
          const passed = h.dir === 1 ? h.x > b.x + 32 : h.x + h.w < b.x;
          if (passed) {
            // The hit has passed this bro untouched: a dodge.
            if (!h.cleared.includes(k)) { h.cleared.push(k); this.runStats.dodges++; this.addSwag('dodge'); }
            return;
          }
          const top = GROUND_Y + b.y - 68, bottom = GROUND_Y + b.y;
          struck = b.x + 32 > h.x && b.x < h.x + h.w && bottom > h.y && top < h.y + h.h;
        }
        if (struck) {
          if (k === 'red') this.heat = 0;
          h.hit.push(k);
          this.runStats.hitsTaken++;
          this.addSwag('hit');
          this.waveHurt = true;
          this.emit({ type: 'bro.hurt' });
          this.damageBro(k, (enemy?.dmg ?? 15) * (this.mutators.includes('SPOTLIGHT') ? 2 : 1));
          if (enemy?.affix === 'SYNC_THIEF' || enemy?.type === 'GIGA_GLITCH') { this.sync = Math.max(0, this.sync - 15); this.text(b.x, GROUND_Y - 110, '-15 SYNC', '#c084fc', 0.9); }
          this.camera.shake = 25;
          this.flash = 0.3; this.flashColor = '#ef4444';
          b.squash = 0.8;
          b.hurtT = 24;
          this.burst(b.x + 16, GROUND_Y + b.y - 34, '#ef4444', 12, 6);
          audio.play('hurt');
          audio.buzz(80);
          this.text(b.x, GROUND_Y - 80, 'OUCH!', '#f87171', 1.2);
        }
      });
    }
    if (!live) this.nextEnemyAttack();
  }
}

export const isAlive = (b: Bro) => b.hp > 0;
export { idOf, keyOf };
