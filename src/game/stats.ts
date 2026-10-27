import { BASE_JUMP, GEAR_DATA, type GearSlot, type StatKey } from '../data/config';
import type { Bro } from './types';

export interface Derived { maxHp: number; pwr: number; rhythm: number; teamwork: number; crit: number; jump: number }

export const totalStats = (bro: Bro): Record<StatKey, number> => {
  const total = { ...bro.base };
  (Object.keys(bro.bonus) as StatKey[]).forEach((s) => (total[s] += bro.bonus[s]));
  (Object.entries(bro.gear) as [GearSlot, string | null][]).forEach(([slot, id]) => {
    const item = GEAR_DATA[slot].find((g) => g.id === id);
    if (item) (Object.entries(item.mods) as [StatKey, number][]).forEach(([s, v]) => (total[s] += v));
  });
  return total;
};

export const calculateDerived = (bro: Bro): Derived => {
  const total = totalStats(bro);
  let weight = 0, jumpBoost = 0, syncMult = 1;
  (Object.entries(bro.gear) as [GearSlot, string | null][]).forEach(([slot, id]) => {
    const item = GEAR_DATA[slot].find((g) => g.id === id);
    if (!item) return;
    weight += item.weight ?? 0;
    jumpBoost += item.jumpBoost ?? 0;
    syncMult *= item.syncMod ?? 1;
  });
  return {
    maxHp: Math.round(180 + total.vitality * 12),
    pwr: 15 + total.power * 2.5,
    rhythm: 20 + total.rhythm * 8,
    teamwork: (1 + total.teamwork * 0.15) * syncMult,
    crit: Math.min(0.75, total.technique * 0.035),
    jump: BASE_JUMP - total.rhythm * 0.1 + total.vitality * 0.02 + weight - jumpBoost
  };
};

export const makeBro = (key: 'red' | 'blue'): Bro => {
  const red = key === 'red';
  const bro: Bro = {
    key, name: red ? 'Hop' : 'Skip', color: red ? '#ef4444' : '#3b82f6',
    lvl: 1, xp: 0, maxXp: 120, hp: 0,
    base: red
      ? { vitality: 8, power: 10, rhythm: 5, technique: 5, teamwork: 8 }
      : { vitality: 6, power: 6, rhythm: 10, technique: 10, teamwork: 6 },
    bonus: { vitality: 0, power: 0, rhythm: 0, technique: 0, teamwork: 0 },
    gear: { shoes: null, rope: null, hat: null, accessory: null },
    owned: { shoes: [], rope: [], hat: [], accessory: [] },
    perks: []
  };
  bro.hp = calculateDerived(bro).maxHp;
  return bro;
};
