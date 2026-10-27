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
  { id: 'MOTH', category: 'enemy', title: 'Neon Moth', body: 'Everything lands off-beat. Its wings flare on the "e": jump then.' },
  { id: 'PIGEON', category: 'enemy', title: 'Pigeon Pair', body: 'Hits from both sides at once. Hop and Skip often need different answers.' },
  { id: 'RAT', category: 'enemy', title: 'Rope-Biter', body: 'While it lives, every skill needs one more jump. Take it out first.' },
  { id: 'CRAB', category: 'enemy', title: 'Boombox Crab', body: 'Drops the music, then attacks in the silence. Keep counting; the court line still pulses.' },
  { id: 'CROW', category: 'enemy', title: 'Hype Crow', body: 'Hypes the crew: every other enemy attacks one extra time while it lives.' },
  { id: 'MIMIC', category: 'enemy', title: 'Vending Mimic', body: 'Never fights. Runs after three turns. Break it for RP and a free item.' },
  { id: 'BOUNCER', category: 'enemy', title: 'Bouncer', body: 'Counters a fourth hit in a row. Know when to stop the combo.' },
  { id: 'BOSS', category: 'enemy', title: 'Giga Slime', body: 'Mixes every pattern. Anti-air does nothing here; save Sync for heavy hits.' },
  { id: 'KING', category: 'enemy', title: 'Bouncer King', body: 'Counters long combos. Below 60% the beat doubles: rope and attacks twice as fast.' },
  { id: 'GLITCH', category: 'enemy', title: 'Glitch Pigeon', body: 'Dashed warnings turn real on the last beat. Below 30% it swaps Hop and Skip.' },
  { id: 'GIGA_GLITCH', category: 'enemy', title: 'Giga Glitch', body: 'Everything at once, and its hits steal Sync. Stay calm, keep counting.' }
];
