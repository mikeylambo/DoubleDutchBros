// Static game data. Pure data only: no logic lives here, so balance passes are one-file edits.

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 450;
export const GROUND_Y = 380;
export const GRAVITY = 0.55;
export const BASE_JUMP = -11;
export const MIN_IMPACT_FRAMES = 12;
export const SIM_HZ = 60;
export const HOME_X = { red: 610, blue: 710 } as const;

export type BroKey = 'red' | 'blue';
export type BroId = 'RED' | 'BLUE';
export type MoveId = 'BASIC' | 'TECH1' | 'TECH2' | 'TECH3' | 'TECH4' | 'TECH5' | 'TECH6' | 'ULT';
export type StatKey = 'power' | 'rhythm' | 'vitality' | 'technique' | 'teamwork';
export type GearSlot = 'rope' | 'shoes' | 'hat' | 'accessory';
export type ItemId = 'coffee' | 'soda';
export type PerkId = 'rp_boost' | 'crit_heal' | 'trip_shield' | 'sync_plus';
export type PatternId = 'WAVE' | 'DOUBLE_WAVE' | 'DELAYED' | 'DIVE' | 'FEINT_DIVE' | 'AIR_SLASH' | 'CHARGE' | 'BURST' | 'STOMP'
  | 'CROSSFIRE' | 'PANIC' | 'DOUBLE_TIME' | 'GLITCH_FEINT' | 'FLUTTER' | 'SPIRAL' | 'PECK_PAIR' | 'SPLIT' | 'NIBBLE' | 'DROP' | 'BASS' | 'PECK' | 'BOUNCE' | 'NONE';
export type EnemyTypeId = 'SLIME' | 'BAT' | 'SHELL' | 'MOTH' | 'PIGEON' | 'RAT' | 'CRAB' | 'CROW' | 'MIMIC' | 'BOUNCER' | 'BOSS' | 'KING' | 'GLITCH' | 'GIGA_GLITCH';

export interface MoveDef {
  name: string;
  cost: number;
  /** Multiplier on the attacker's base power. Applied exactly once. */
  dmg: number;
  syncGain: number;
  rhythm: boolean;
  /** Perfect jumps required before launch (rhythm moves only). */
  limit?: (b: BroId) => number;
  antiAir?: number;
  /** Which bro may use it; undefined = both. */
  owner?: BroId;
  /** Rope speed override while charging (0.5 = half time). */
  ropeRate?: number;
  /** Legacy unlock id required to use it; undefined = always available. */
  unlock?: string;
  icon: string;
  desc: string;
}

export const MOVE_REGISTRY: Record<MoveId, MoveDef> = {
  BASIC: { name: 'Attack', cost: 0, dmg: 0.65, syncGain: 12, rhythm: false, icon: '👊', desc: 'Reliable instant strike. Builds Sync.' },
  TECH1: { name: 'Rhythm Vault', cost: 20, dmg: 1.8, syncGain: 5, rhythm: true, limit: (b) => (b === 'RED' ? 4 : 3), icon: '🔥', desc: 'Rhythmic combo. Red: burst. Blue: Sync + wide window.' },
  TECH2: { name: 'Sky Clip', cost: 20, dmg: 1.0, syncGain: 5, rhythm: true, limit: () => 2, antiAir: 3.5, owner: 'BLUE', icon: '🦅', desc: 'Anti-Air: 3.5x DMG to flyers. Fast setup.' },
  TECH3: { name: 'Power Slam', cost: 30, dmg: 3.2, syncGain: 2, rhythm: true, limit: () => 5, owner: 'RED', icon: '⚡', desc: 'Heavy: massive ground DMG. Long setup.' },
  TECH4: { name: 'Haymaker', cost: 25, dmg: 2.6, syncGain: 3, rhythm: true, limit: () => 3, ropeRate: 0.5, owner: 'RED', unlock: 'move_haymaker', icon: '🥊', desc: 'Half-time rope, 3 jumps. Smashes shields.' },
  TECH5: { name: 'Hopscotch', cost: 25, dmg: 1.4, syncGain: 8, rhythm: true, limit: () => 4, owner: 'BLUE', unlock: 'move_hopscotch', icon: '🪁', desc: '4 jumps. Staggers the target: it loses its next attack.' },
  TECH6: { name: 'Tandem Master', cost: 60, dmg: 2, syncGain: 0, rhythm: true, limit: () => 6, unlock: 'move_tandem', icon: '🌀', desc: 'Trade the rope: alternate A and B on each peak. Every clean trade raises the multiplier.' },
  ULT: { name: 'Crossfire Dutch', cost: 100, dmg: 6, syncGain: 0, rhythm: false, icon: '🌟', desc: 'Ultimate: tandem cinematic finisher.' }
};

export interface EnemyDef {
  name: string;
  hp: number;
  dmg: number;
  color: string;
  /** Rope sweeps per beat while charging a skill on this enemy (0.5 = every other beat). */
  ropeRate: number;
  /** Narrows the perfect window (0 = normal). Fast enemies demand cleaner timing. */
  tightness: number;
  patterns: PatternId[];
  xp: number;
  scale: number;
  float: number;
  isBoss?: boolean;
}

export const ENEMY_TYPES: Record<EnemyTypeId, EnemyDef> = {
  SLIME: { name: 'SLIME', hp: 60, dmg: 18, color: '#4ade80', ropeRate: 1, tightness: 0, patterns: ['WAVE', 'DOUBLE_WAVE', 'DELAYED'], xp: 50, scale: 1, float: 0 },
  BAT: { name: 'TURBO BAT', hp: 55, dmg: 14, color: '#f87171', ropeRate: 1, tightness: 0.06, patterns: ['DIVE', 'FEINT_DIVE', 'AIR_SLASH'], xp: 60, scale: 0.9, float: -130 },
  SHELL: { name: 'STONE SHELL', hp: 180, dmg: 30, color: '#94a3b8', ropeRate: 0.5, tightness: 0, patterns: ['CHARGE', 'BURST', 'STOMP'], xp: 120, scale: 1.3, float: 0 },
  MOTH: { name: 'NEON MOTH', hp: 70, dmg: 16, color: '#e879f9', ropeRate: 1, tightness: 0.03, patterns: ['FLUTTER', 'SPIRAL'], xp: 70, scale: 0.9, float: -100 },
  PIGEON: { name: 'PIGEON PAIR', hp: 110, dmg: 15, color: '#a5b4fc', ropeRate: 1, tightness: 0, patterns: ['PECK_PAIR', 'SPLIT'], xp: 90, scale: 1, float: 0 },
  RAT: { name: 'ROPE-BITER', hp: 80, dmg: 14, color: '#d6d3d1', ropeRate: 1, tightness: 0, patterns: ['NIBBLE', 'WAVE'], xp: 80, scale: 0.9, float: 0 },
  CRAB: { name: 'BOOMBOX CRAB', hp: 140, dmg: 22, color: '#fb7185', ropeRate: 1, tightness: 0, patterns: ['DROP', 'BASS'], xp: 110, scale: 1.1, float: 0 },
  CROW: { name: 'HYPE CROW', hp: 75, dmg: 12, color: '#fbbf24', ropeRate: 1, tightness: 0.04, patterns: ['PECK'], xp: 90, scale: 0.9, float: -120 },
  MIMIC: { name: 'VENDING MIMIC', hp: 120, dmg: 0, color: '#22d3ee', ropeRate: 1, tightness: 0, patterns: ['NONE'], xp: 150, scale: 1.2, float: 0 },
  BOUNCER: { name: 'BOUNCER', hp: 420, dmg: 34, color: '#a78bfa', ropeRate: 0.5, tightness: 0, patterns: ['BOUNCE', 'CHARGE'], xp: 400, scale: 1.5, float: 0 },
  BOSS: { name: 'GIGA SLIME', hp: 1200, dmg: 40, color: '#facc15', ropeRate: 1, tightness: 0.03, patterns: ['WAVE', 'DIVE', 'CHARGE'], xp: 2000, scale: 3.2, isBoss: true, float: 0 },
  KING: { name: 'BOUNCER KING', hp: 1050, dmg: 44, color: '#c4b5fd', ropeRate: 0.5, tightness: 0.03, patterns: ['BOUNCE', 'CHARGE', 'STOMP'], xp: 3000, scale: 2.2, isBoss: true, float: 0 },
  GLITCH: { name: 'GLITCH PIGEON', hp: 1000, dmg: 44, color: '#5eead4', ropeRate: 1, tightness: 0.03, patterns: ['SPLIT', 'PECK_PAIR'], xp: 3500, scale: 2.4, isBoss: true, float: -40 },
  GIGA_GLITCH: { name: 'GIGA GLITCH', hp: 1500, dmg: 55, color: '#f472b6', ropeRate: 1, tightness: 0.06, patterns: ['CROSSFIRE', 'STOMP', 'DELAYED'], xp: 8000, scale: 3.4, isBoss: true, float: 0 }
};

export const ITEM_DATA: Record<ItemId, { name: string; icon: string; cost: number; desc: string }> = {
  coffee: { name: 'Dutch Coffee', icon: '☕', cost: 150, desc: 'Heal: restores 80 HP to the selected Bro.' },
  soda: { name: 'Energy Soda', icon: '🥤', cost: 200, desc: 'Boost: instantly grants +35% team Sync.' }
};

export const PERKS_DATA: { id: PerkId; name: string; icon: string; desc: string }[] = [
  { id: 'rp_boost', name: 'Hype Train', icon: '💰', desc: 'Passive: +25% RP reward per wave cleared.' },
  { id: 'crit_heal', name: 'Adrenaline', icon: '💉', desc: 'Combat: landing a Crit restores 8 HP.' },
  { id: 'trip_shield', name: 'Knee Pads', icon: '🛡️', desc: 'Defense: -50% self-damage on Trip.' },
  { id: 'sync_plus', name: 'Perfect Flow', icon: '🔥', desc: 'Rhythm: Basic attacks grant +5 bonus Sync.' }
];

export const STAT_DEFS: { key: StatKey; name: string; icon: string; color: string; desc: string }[] = [
  { key: 'power', name: 'POWER', icon: '💥', color: 'text-red-500', desc: 'Base hit damage.' },
  { key: 'rhythm', name: 'RHYTHM', icon: '🎵', color: 'text-blue-400', desc: 'Impact timing window.' },
  { key: 'vitality', name: 'VITALITY', icon: '❤️', color: 'text-green-400', desc: 'Max HP capacity.' },
  { key: 'technique', name: 'TECHNIQUE', icon: '✨', color: 'text-purple-400', desc: 'Crit strike chance.' },
  { key: 'teamwork', name: 'TEAMWORK', icon: '🤝', color: 'text-yellow-400', desc: 'Partner synergy DMG.' }
];

export interface GearDef {
  id: string;
  name: string;
  cost: number;
  icon: string;
  mods: Partial<Record<StatKey, number>>;
  weight?: number;
  jumpBoost?: number;
  syncMod?: number;
  /** Legacy unlock needed before it appears in the shop. */
  unlock?: string;
  /** Overrides how many perfect jumps a move needs while equipped. */
  moveLimit?: Partial<Record<MoveId, number>>;
  desc: string;
}

export const GEAR_DATA: Record<GearSlot, GearDef[]> = {
  rope: [
    { id: 'r1', name: 'Nylon Cord', cost: 300, icon: '🪢', mods: { power: 5, rhythm: 2 }, desc: 'Balanced starter gear.' },
    { id: 'r2', name: 'Heavy Chain', cost: 900, icon: '⛓️', mods: { power: 25, rhythm: -4 }, weight: 2.2, desc: 'Massive Power, heavier jumps.' },
    { id: 'r3', name: 'Pulse Wire', cost: 1600, icon: '⚡', mods: { technique: 12, teamwork: 10 }, syncMod: 1.5, desc: 'High Sync & Crit synergy.' },
    { id: 'r4', name: 'Diamond Core Rope', cost: 2200, icon: '💎', mods: { power: 20, technique: 10, rhythm: 4 }, unlock: 'gear_tier3', desc: 'Tier 3: power, precision and timing.' },
    { id: 'r5', name: 'Titanium Core Rope', cost: 2600, icon: '🔩', mods: { power: 14 }, moveLimit: { TECH3: 3 }, unlock: 'gear_tier3', desc: 'Tier 3: Power Slam needs only 3 jumps.' }
  ],
  shoes: [
    { id: 's1', name: 'Street Kicks', cost: 400, icon: '👟', mods: { rhythm: 6, technique: 2 }, desc: 'Better timing windows.' },
    { id: 's2', name: 'Air Dutch 1s', cost: 1500, icon: '💨', mods: { rhythm: 15, vitality: 5 }, jumpBoost: 1.5, desc: 'Elite air-time for dodging.' }
  ],
  hat: [
    { id: 'h1', name: 'Beanie', cost: 250, icon: '🧢', mods: { vitality: 8 }, desc: '+96 Max HP capacity.' },
    { id: 'h2', name: 'Snapback', cost: 1100, icon: '🎓', mods: { teamwork: 15 }, desc: 'Massive Partner DMG.' }
  ],
  accessory: [
    { id: 'a1', name: 'Wristband', cost: 500, icon: '💍', mods: { technique: 10 }, desc: 'Precision: +35% Crit Rate.' },
    { id: 'a2', name: 'Sweatband', cost: 600, icon: '🎽', mods: { vitality: 6, technique: 4 }, desc: 'Toughness and a little precision.' },
    { id: 'a3', name: 'Metronome Watch', cost: 900, icon: '⌚', mods: { rhythm: 12 }, desc: 'Wider perfect and tag windows.' },
    { id: 'a4', name: 'Gold Chain', cost: 1300, icon: '📿', mods: { teamwork: 12, power: 6 }, desc: 'Combo damage and a bit of punch.' }
  ]
};

export const GEAR_SLOTS: GearSlot[] = ['rope', 'shoes', 'hat', 'accessory'];

/** XP granted to each living bro per wave. Scales with wave so leveling doesn't stall. */
export const waveXp = (wave: number) => 60 + wave * 25;
/** XP needed for the next level. Gentler than the old 1.8x so progression continues past L5. */
export const nextMaxXp = (maxXp: number) => Math.floor(maxXp * 1.35);
export const waveRp = (wave: number) => 200 + wave * 50;
