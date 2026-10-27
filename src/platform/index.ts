import {
  BrowserStorage, DeterministicRngRegistry, LeaderboardManager, PWAController, RankingSystem, ResultsManager, SLUWebShell,
  SaveManager, SettingsStore, StatsManager, installBrowserLifecycle, installMobileViewportPolicy, scheduledSeed,
  type LeaderboardEntry, type LeaderboardProvider, type ProductionState, type RankResult, type StorageAdapter
} from '@slu/web-shell';
import { ACHIEVEMENTS, BESTIARY } from '../data/meta';
import { Engine, type GameEvent, type RngStreams } from '../game/engine';
import { music } from '../game/music';
import { clearLegacyMeta, defaultSettings, freshProgress, readLegacyMeta, type GameSettings, type Progress } from '../game/save';
import type { RunSummary } from '../game/types';

// The bridge between the game and SLU Web Shell. The engine stays storage- and platform-free;
// everything durable or browser-specific is wired here.

const GAME_ID = 'double-dutch-bros';
const VERSION = '0.2.0';
const PLAYER_ID = 'local';

/** Everything that survives between sessions, in one versioned, checksummed save. */
interface SaveData {
  progress: Progress;
  production: ProductionState | null;
  leaderboards: Record<string, LeaderboardEntry[]>;
}
const SAVE_VERSION = 1;

/** Leaderboard kept in the save file, so local high scores persist. An online provider can replace it later. */
class SavedLeaderboard implements LeaderboardProvider {
  constructor(readonly boards: Record<string, LeaderboardEntry[]>, private readonly onChange: () => void) {}
  async submit(board: string, entry: LeaderboardEntry) {
    const list = [...(this.boards[board] ?? []), entry].sort((a, b) => b.score - a.score).slice(0, 20);
    this.boards[board] = list;
    this.onChange();
  }
  async top(board: string, limit = 10) { return (this.boards[board] ?? []).slice(0, limit); }
}

export interface RunResult { summary: RunSummary; rank: RankResult; board: string; top: LeaderboardEntry[]; isBest: boolean }

export interface Platform {
  shell: SLUWebShell<GameSettings>;
  engine: Engine;
  pwa: PWAController;
  stats: StatsManager;
  /** Start today's seeded run: same waves for everyone today. */
  startDaily(): void;
  dailyKey(): string;
  /** Results of the run that just ended (rank, leaderboard), once computed. */
  lastResult: RunResult | null;
  onResult(fn: (r: RunResult) => void): () => void;
  leaderboardTop(board: string): Promise<LeaderboardEntry[]>;
  exportPlaytest(): void;
}

/** Storage that never throws: private mode or blocked storage falls back to memory. */
const safeStorage = (): StorageAdapter => {
  try {
    localStorage.setItem('__ddb_probe', '1');
    localStorage.removeItem('__ddb_probe');
    return new BrowserStorage(GAME_ID);
  } catch {
    const mem = new Map<string, unknown>();
    return {
      get: async <T,>(k: string) => (mem.get(k) as T) ?? null,
      set: async <T,>(k: string, v: T) => { mem.set(k, v); },
      remove: async (k: string) => { mem.delete(k); }
    };
  }
};

/** Bind three named random streams to a seed, so daily runs are identical for everyone. */
const seededStreams = (seed: number | string): RngStreams => {
  const reg = new DeterministicRngRegistry(['waves', 'combat', 'rewards'] as const);
  reg.init(seed);
  return { waves: () => reg.stream('waves').next(), combat: () => reg.stream('combat').next(), rewards: () => reg.stream('rewards').next() };
};

let booting: Promise<Platform> | null = null;

/** Boot once per page, however many times React mounts the app. */
export const bootPlatform = (): Promise<Platform> => (booting ??= boot());

const boot = async (): Promise<Platform> => {
  const storage = safeStorage();
  const settings = new SettingsStore<GameSettings>(storage, 'settings', defaultSettings());
  await settings.load();
  const save = new SaveManager<SaveData>(storage, 'save', SAVE_VERSION);
  const recovered = await save.loadWithRecovery().catch(() => ({ data: null }));
  let data: SaveData = recovered.data ?? { progress: freshProgress(), production: null, leaderboards: {} };

  // One-time migration from the pre-shell save.
  const legacy = recovered.data ? null : readLegacyMeta();
  if (legacy) {
    data = { ...data, progress: legacy.progress };
    const patch = Object.fromEntries(Object.entries(legacy.settings).filter(([, v]) => v !== undefined));
    await settings.patch(patch as Partial<GameSettings>);
  }

  const shell = new SLUWebShell<GameSettings>({
    build: { gameId: GAME_ID, gameName: 'Double Dutch Bros', version: VERSION },
    renderer: { id: 'canvas2d' },
    settings
  });
  const prod = shell.production;
  prod.achievements.register(ACHIEVEMENTS);
  prod.codex.register(BESTIARY);
  prod.hydrateState(data.production);

  const stats = new StatsManager(storage, 'stats');
  await stats.load();

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    // Coalesce bursts of changes (e.g. wave clear) into one write.
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      data.production = prod.snapshotState();
      void save.save(data).then(() => { if (legacy) clearLegacyMeta(); }).catch((err) => shell.studio.diagnostics.capture(err, { scope: 'save' }));
    }, 250);
  };

  const leaderboard = new SavedLeaderboard(data.leaderboards, persist);
  const boards = new LeaderboardManager(leaderboard);
  const ranking = RankingSystem.letterGrades();
  const results = new ResultsManager(ranking);
  const resultListeners = new Set<(r: RunResult) => void>();

  const unlock = (id: string) => { void prod.achievements.unlock(id).catch(() => false); };
  prod.achievements.events.on('achievement:unlocked', (a) => {
    prod.notifications.show({ id: `ach:${a.id}`, kind: 'achievement', title: a.label, body: a.description, durationMs: 3200 });
    persist();
  });
  prod.codex.events.on('codex:unlocked', (entry) => {
    prod.notifications.show({ id: `codex:${entry.id}`, kind: 'unlock', title: entry.title, durationMs: 2200 });
    persist();
  });

  const onEvent = (e: GameEvent) => {
    const { type, ...data } = e;
    shell.studio.telemetry.record(`game.${type}`, JSON.parse(JSON.stringify(data)));
    switch (e.type) {
      case 'run.start': void stats.increment('runs'); break;
      case 'enemy.seen': prod.codex.unlock(e.enemy); break;
      case 'enemy.ko':
        void stats.increment('enemiesDefeated');
        if (e.boss) { void stats.increment('bossesDefeated'); unlock('first_boss'); }
        break;
      case 'jump.perfect': void stats.increment('perfects'); if (e.streak >= 10) unlock('perfect_10'); break;
      case 'tag.sync': if (e.combo >= 4) unlock('combo_4'); break;
      case 'hit': if (e.move === 'ULT') unlock('ult'); break;
      case 'wave.clear':
        void stats.increment('wavesCleared');
        unlock('first_clear');
        if (e.wave >= 10) unlock('wave_10');
        if (e.wave >= 25) unlock('wave_25');
        if (e.flawless) unlock('flawless');
        break;
      case 'run.end': void finishRun(e.summary); break;
    }
  };

  const finishRun = async (summary: RunSummary) => {
    const rank = results.build({ ...summary.stats }, { score: summary.performance }).rank!;
    if (rank.rank.minimum >= 90) unlock('rank_s');
    if (summary.mode === 'daily') unlock('daily');
    const board = summary.seedKey ?? 'endless';
    const prev = await boards.top(board, 1);
    await boards.submit(board, { playerId: PLAYER_ID, displayName: 'You', score: summary.score, metadata: { wave: summary.wave, rank: rank.rank.label } });
    const top = await boards.top(board, 5);
    const result: RunResult = { summary, rank, board, top, isBest: !prev[0] || summary.score > prev[0].score };
    platform.lastResult = result;
    resultListeners.forEach((fn) => fn(result));
  };

  const engine = new Engine(Math.random, music, {
    progress: data.progress,
    settings: settings.snapshot(),
    saveProgress: (p) => { data.progress = p; persist(); },
    saveSettings: (s) => { void settings.patch(s); },
    onEvent
  });

  // Browser lifecycle: background the app → pause, so a phone call never costs a run.
  installBrowserLifecycle({ onBackground: () => engine.pause() });
  installMobileViewportPolicy({ rootSelector: '#root', background: '#020205', includeSafeAreaPadding: false });

  const pwa = new PWAController();
  pwa.attach();
  if (import.meta.env.PROD) void pwa.register('/sw.js');

  const dailyKey = () => scheduledSeed(GAME_ID, 'daily').key;

  const platform: Platform = {
    shell, engine, pwa, stats,
    lastResult: null,
    dailyKey,
    startDaily: () => {
      const seed = scheduledSeed(GAME_ID, 'daily');
      engine.startRun({ mode: 'daily', seedKey: seed.key, rng: seededStreams(seed.seed) });
    },
    onResult: (fn) => { resultListeners.add(fn); return () => resultListeners.delete(fn); },
    leaderboardTop: (board) => boards.top(board, 5),
    exportPlaytest: () => {
      const json = shell.exportPlaytestBundle({
        game: { wave: engine.wave, phase: engine.phase, mode: engine.mode, seedKey: engine.seedKey, run: engine.runStats, lastRun: engine.lastRun, settings: engine.settings },
        environment: { userAgent: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`, musicLive: music.live }
      });
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `ddb-playtest-${Date.now()}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  if (import.meta.env.DEV) Object.assign(window, { __shell: shell, __platform: platform });
  await shell.boot();
  return platform;
};
