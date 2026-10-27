import type { EnemyTypeId } from '../data/config';

// What each wave contains: which enemies, which elite modifiers, when new enemies are introduced.
// Follows docs/DESIGN.md §8: new reads arrive one at a time, then get combined.

export type AffixId = 'SHIELDED' | 'ARMORED' | 'HASTY' | 'MIRRORED' | 'ECHO' | 'SYNC_THIEF';

export const AFFIXES: Record<AffixId, { name: string; color: string; desc: string }> = {
  SHIELDED: { name: 'Shielded', color: '#67e8f9', desc: 'Only skills, crits or the Ult break the shield.' },
  ARMORED: { name: 'Armored', color: '#cbd5e1', desc: 'Basic hits deal half damage.' },
  HASTY: { name: 'Hasty', color: '#fde047', desc: 'Attacks start a beat sooner.' },
  MIRRORED: { name: 'Mirrored', color: '#f0abfc', desc: 'Attacks come from the other side.' },
  ECHO: { name: 'Echo', color: '#93c5fd', desc: 'Every attack repeats a bar later.' },
  SYNC_THIEF: { name: 'Sync-Thief', color: '#c084fc', desc: 'Its hits steal 15 Sync.' }
};
const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

export interface Spawn { type: EnemyTypeId; affix?: AffixId }

/** The wave each regular enemy first appears in. Its debut wave always includes it. */
export const DEBUT: Partial<Record<EnemyTypeId, number>> = {
  SLIME: 1, BAT: 3, SHELL: 4, MOTH: 6, PIGEON: 7, CRAB: 9, RAT: 11, CROW: 12
};

export const isBossWave = (wave: number) => wave % 5 === 0;
/** Bouncer mini-boss waves: 8, 13, 18, ... */
export const isBouncerWave = (wave: number) => wave >= 8 && wave % 5 === 3;
/** Elite waves: every 4th from 8, when not a boss or Bouncer wave. */
export const isEliteWave = (wave: number) => wave >= 8 && wave % 4 === 0 && !isBossWave(wave) && !isBouncerWave(wave);

/** How many enemies attack per enemy turn. */
export const attackersPerTurn = (wave: number, living: number) =>
  Math.min(living, wave <= 10 ? 1 : wave <= 35 ? 2 : living);

export const composeWave = (wave: number, rng: () => number, boss: EnemyTypeId): Spawn[] => {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  if (isBossWave(wave)) return [{ type: boss }];

  const pool = (Object.entries(DEBUT) as [EnemyTypeId, number][]).filter(([, w]) => w <= wave).map(([t]) => t);
  const debut = (Object.entries(DEBUT) as [EnemyTypeId, number][]).find(([, w]) => w === wave)?.[0];
  const count = Math.min(wave < 15 ? 3 : 4, 1 + Math.floor(wave / 3));
  const spawns: Spawn[] = [];

  if (isBouncerWave(wave)) spawns.push({ type: 'BOUNCER' });
  if (debut) spawns.push({ type: debut });
  // Support enemies (Rope-Biter, Hype Crow) never double up; draw from what's still allowed.
  while (spawns.length < count) {
    const allowed = pool.filter((t) => !((t === 'CROW' || t === 'RAT') && spawns.some((s) => s.type === t)));
    spawns.push({ type: pick(allowed) });
  }
  // Rare treasure: a Vending Mimic joins (from wave 4).
  if (wave >= 4 && rng() < 0.1 && spawns.length < 4) spawns.push({ type: 'MIMIC' });

  if (isEliteWave(wave)) {
    const candidates = spawns.filter((s) => s.type !== 'MIMIC' && s.type !== 'BOUNCER');
    const elites = wave >= 36 ? 2 : 1;
    for (let i = 0; i < elites && candidates.length; i++) {
      const target = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
      target.affix = pick(AFFIX_IDS);
    }
  }
  return spawns;
};
