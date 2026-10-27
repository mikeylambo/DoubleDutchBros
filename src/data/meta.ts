import type { AchievementDefinition, CodexEntry } from '@slu/web-shell';

// Achievements and the bestiary. Kept short and useful: a bestiary entry says how to beat the enemy.

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first_clear', label: 'Warm Up', description: 'Clear your first wave.' },
  { id: 'wave_10', label: 'Double Digits', description: 'Reach wave 10.' },
  { id: 'wave_25', label: 'Block Legend', description: 'Reach wave 25.' },
  { id: 'first_boss', label: 'Slime Time', description: 'Defeat a boss.' },
  { id: 'combo_4', label: 'In Sync', description: 'Land a 4-hit tag combo.' },
  { id: 'perfect_10', label: 'Metronome', description: '10 perfect jumps in a row.' },
  { id: 'flawless', label: 'Untouched', description: 'Clear a wave without taking a hit.' },
  { id: 'ult', label: 'Crossfire', description: 'Land Crossfire Dutch.' },
  { id: 'daily', label: 'Daily Grind', description: 'Finish a daily run.' },
  { id: 'rank_s', label: 'Swagger', description: 'Finish a run with an S rank or better.' }
];

export const BESTIARY: CodexEntry[] = [
  { id: 'SLIME', category: 'enemy', title: 'Slime', body: 'Sends low waves along the court. Jump on the beat. Watch for a second wave.' },
  { id: 'BAT', category: 'enemy', title: 'Turbo Bat', body: 'Dives the high lane. Stay grounded, and do not flinch at the dashed feint.' },
  { id: 'SHELL', category: 'enemy', title: 'Stone Shell', body: 'Slow, heavy rope. Clear its wall with a full jump right on the beat.' },
  { id: 'BOSS', category: 'enemy', title: 'Giga Slime', body: 'Mixes every pattern. Anti-air does nothing here; save Sync for heavy hits.' }
];
