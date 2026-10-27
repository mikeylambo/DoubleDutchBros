// Durable player data shapes. The engine only holds these; the platform layer
// (src/platform) owns where and how they are stored.

/** Progress that survives between runs. */
export interface Progress { legacy: number; bestWave: number; runs: number; tutorialDone: boolean }

/** Player preferences, including accessibility. */
export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  /** Rhythm calibration in ms (+ = player hears late, e.g. Bluetooth). */
  latencyMs: number;
  reducedMotion: boolean;
  /** 0..1 multiplier for camera shake. */
  screenShake: number;
  /** 0..1 multiplier for screen flashes. */
  flashes: number;
  vibration: boolean;
}

export const freshProgress = (): Progress => ({ legacy: 0, bestWave: 0, runs: 0, tutorialDone: false });

export const defaultSettings = (): GameSettings => ({
  musicVolume: 0.8, sfxVolume: 0.8, latencyMs: 0, reducedMotion: false, screenShake: 1, flashes: 1, vibration: true
});

const LEGACY_KEY = 'ddb.meta.v1';

/** Reads the pre-shell save (one localStorage blob) so existing players keep their progress. */
export const readLegacyMeta = (): { progress: Progress; settings: Partial<GameSettings> } | null => {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Progress & GameSettings>;
    return {
      progress: { ...freshProgress(), legacy: m.legacy ?? 0, bestWave: m.bestWave ?? 0, runs: m.runs ?? 0, tutorialDone: !!m.tutorialDone },
      settings: { musicVolume: m.musicVolume, sfxVolume: m.sfxVolume, latencyMs: m.latencyMs }
    };
  } catch {
    return null;
  }
};

export const clearLegacyMeta = () => { try { localStorage.removeItem(LEGACY_KEY); } catch { /* unavailable */ } };
