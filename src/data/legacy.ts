// The Dutch Legacy tree (docs/DESIGN.md §9). Legacy Points from every run buy unlocks here.
// Unlocks over raw power: new moves, new gear, new ways to start, style, and a few capped nudges.

export type LegacyBranch = 'Moves' | 'Gear' | 'Encounters' | 'Style' | 'Nudges';

export interface LegacyNode {
  id: string;
  branch: LegacyBranch;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  requires?: string[];
}

export const LEGACY_TREE: LegacyNode[] = [
  { id: 'move_haymaker', branch: 'Moves', name: 'Haymaker', icon: '🥊', cost: 300, desc: "Hop's half-time haymaker. Smashes shields." },
  { id: 'move_hopscotch', branch: 'Moves', name: 'Hopscotch', icon: '🪁', cost: 300, desc: "Skip's skill that makes the target lose its next attack." },
  { id: 'move_tandem', branch: 'Moves', name: 'Tandem Master', icon: '🌀', cost: 1500, requires: ['move_haymaker', 'move_hopscotch'], desc: 'Hop and Skip trade the rope: alternate A and B on each peak for a growing multiplier.' },

  { id: 'gear_tier3', branch: 'Gear', name: 'Tier 3 Gear', icon: '💎', cost: 800, desc: 'Diamond Core Rope and Titanium Core Rope appear in the shop.' },

  { id: 'start_w10', branch: 'Encounters', name: 'Start at Wave 11', icon: '⏩', cost: 600, desc: 'Begin a run just past the second boss, with RP and levels to match.' },
  { id: 'start_w20', branch: 'Encounters', name: 'Start at Wave 21', icon: '⏭️', cost: 1500, requires: ['start_w10'], desc: 'Begin a run just past the fourth boss.' },
  { id: 'mutators_early', branch: 'Encounters', name: 'Early Ascension', icon: '🔮', cost: 1000, desc: 'Mutator choices start after the wave 5 boss.' },

  { id: 'style_gold', branch: 'Style', name: 'Gold Ropes', icon: '🟡', cost: 200, desc: 'Gold ropes for both rabbits.' },
  { id: 'style_rainbow', branch: 'Style', name: 'Rainbow Ropes', icon: '🌈', cost: 400, desc: 'Ropes that cycle colors on the beat.' },

  { id: 'nudge_rp', branch: 'Nudges', name: 'Pocket Money', icon: '💵', cost: 250, desc: '+200 RP at the start of every run.' },
  { id: 'nudge_coffee', branch: 'Nudges', name: 'Thermos', icon: '☕', cost: 250, desc: 'Start every run with one extra coffee.' },
  { id: 'nudge_sync', branch: 'Nudges', name: 'Warm Up', icon: '⚡', cost: 400, desc: 'Every wave starts with at least 15 Sync.' }
];

export const LEGACY_BRANCHES: LegacyBranch[] = ['Moves', 'Gear', 'Encounters', 'Style', 'Nudges'];

/** Rope cosmetics: unlock id → equip id stored in progress. */
export const ROPE_STYLES = ['style_gold', 'style_rainbow'] as const;
