import type { BroKey, EnemyTypeId, GearSlot, ItemId, MoveId, PatternId, PerkId, StatKey, BroId } from '../data/config';

export type Phase =
  | 'MENU' | 'TECH_SELECT' | 'ITEMS' | 'ITEMS_TARGETING' | 'TARGET'
  | 'WINDUP' | 'LAUNCH' | 'IMPACT' | 'RETURN' | 'ENEMY_TURN';

export type GameState = 'TITLE' | 'BATTLE' | 'PAUSE' | 'WIN' | 'SHOP' | 'GAMEOVER' | 'TUTORIAL_DONE';

export interface Bro {
  key: BroKey;
  /** Display name: Hop or Skip. */
  name: string;
  color: string;
  lvl: number;
  xp: number;
  maxXp: number;
  hp: number;
  base: Record<StatKey, number>;
  bonus: Record<StatKey, number>;
  gear: Record<GearSlot, string | null>;
  owned: Record<GearSlot, string[]>;
  perks: PerkId[];
}

export interface Body {
  x: number; y: number; vy: number; jumping: boolean; targetX: number; float?: number; squash?: number;
  /** Upward speed at the last takeoff, so animation can map airtime to frames. */
  launchVy?: number;
  /** Frames of hurt reaction remaining. */
  hurtT?: number;
}

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }

export interface Enemy extends Body {
  id: number;
  type: EnemyTypeId;
  name: string;
  hp: number;
  maxHp: number;
  dmg: number;
  color: string;
  ropeRate: number;
  tightness: number;
  patterns: PatternId[];
  scale: number;
  float: number;
  isBoss: boolean;
  /** Frames of white hit-flash remaining. */
  hurt: number;
}

/**
 * A single hitbox travelling across the arena during an enemy attack. Its position is a pure
 * function of the beat, so attacks stay locked to the music even if frames drop.
 */
export interface Hazard {
  x: number;
  y: number;
  w: number;
  h: number;
  /** World units per beat. */
  speed: number;
  /** Beat at which the hazard's center crosses Hop's home position. */
  arrive: number;
  /** Beat when the lane warning starts. */
  warn: number;
  /** Fakes render dashed and deal no damage. */
  fake: boolean;
  /** Bros already hit by this hazard. */
  hit: BroKey[];
}

export interface FloatingText { x: number; y: number; text: string; color: string; life: number; vy: number; scale: number }

export type LevelChoice =
  | { kind: 'stat'; key: StatKey; name: string; icon: string; color: string; desc: string }
  | { kind: 'perk'; key: PerkId; name: string; icon: string; desc: string };

export interface Snapshot {
  gameState: GameState;
  phase: Phase;
  wave: number;
  rp: number;
  legacy: number;
  bestWave: number;
  sync: number;
  turn: BroId;
  combo: number;
  expectedTap: BroId | null;
  activeItem: ItemId | null;
  inventory: Record<ItemId, number>;
  bros: Record<BroKey, Bro>;
  enemies: { id: number; name: string; hp: number; maxHp: number }[];
  levelUp: { bro: BroKey; choices: LevelChoice[] } | null;
  moveType: MoveId;
  tutorialHint: string | null;
  tutorialDone: boolean;
}
