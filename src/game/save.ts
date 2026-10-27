// Meta progression that survives between runs. Every access is guarded: storage can be
// unavailable (private mode, blocked site data) and the game must still run.

export interface MetaSave { version: 1; legacy: number; bestWave: number; runs: number; latencyMs: number }

const KEY = 'ddb.meta.v1';
const fresh = (): MetaSave => ({ version: 1, legacy: 0, bestWave: 0, runs: 0, latencyMs: 0 });

export const loadMeta = (): MetaSave => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<MetaSave>;
    return { ...fresh(), ...parsed, version: 1 };
  } catch {
    return fresh();
  }
};

export const saveMeta = (meta: MetaSave) => {
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* storage unavailable: keep playing */ }
};
