import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@slu/web-shell';
import { GEAR_DATA, GEAR_SLOTS, ITEM_DATA, PERKS_DATA, type BroKey, type GearSlot, type ItemId } from '../data/config';
import { calculateDerived } from '../game/stats';
import { MUTATORS } from '../game/runmods';
import { LEGACY_BRANCHES, LEGACY_TREE, ROPE_STYLES } from '../data/legacy';
import { TitleBackdrop, TitleRabbits } from './TitleRabbits';
import { useEngine } from './useEngine';
import { usePlatform, useRunResult } from './usePlatform';
import type { GameSettings } from '../game/save';

const Screen = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div data-layer="overlay" className={`fixed inset-0 z-[100] flex flex-col items-center p-6 md:p-10 overflow-y-auto ${className}`}>{children}</div>
);
const BigButton = ({ onPress, children, className = 'bg-gradient-to-b from-white to-slate-200 text-[#0b0720] shadow-[0_10px_40px_rgba(255,255,255,0.18),inset_0_-3px_0_rgba(0,0,0,0.12)]' }: { onPress: () => void; children: React.ReactNode; className?: string }) => (
  <button data-nav onPointerDown={(e) => { e.preventDefault(); onPress(); }} className={`font-display font-black italic py-4 md:py-5 px-16 md:px-24 rounded-full text-xl md:text-2xl active:scale-95 transition-transform uppercase tracking-wide ${className}`}>{children}</button>
);

const SmallButton = ({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => (
  <button data-nav onPointerDown={(e) => { e.preventDefault(); onPress(); }} className="glass px-5 py-2.5 rounded-full text-[10px] font-semibold text-white/85 uppercase tracking-[0.25em] active:scale-95 transition-transform">{children}</button>
);

export const Title = () => {
  const { engine, snap } = useEngine();
  const platform = usePlatform();
  const [screen, setScreen] = useState<'title' | 'bestiary' | 'legacy'>('title');
  if (screen === 'bestiary') return <Bestiary onClose={() => setScreen('title')} />;
  if (screen === 'legacy') return <Legacy onClose={() => setScreen('title')} />;
  const has = (id: string) => snap.unlocks.includes(id);
  return (
    <Screen className="justify-center text-center isolate">
      <TitleBackdrop />
      <div className="font-display font-black italic uppercase leading-[0.85] text-5xl sm:text-7xl md:text-8xl">
        <div>
          <span className="bg-gradient-to-b from-rose-300 to-red-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(239,68,68,0.45)]">Double</span>{' '}
          <span className="bg-gradient-to-b from-sky-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(59,130,246,0.45)]">Dutch</span>
        </div>
        <div className="mt-1 bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent text-[1.35em] drop-shadow-[0_4px_30px_rgba(255,255,255,0.15)]">Bros</div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-[0.5em] text-pink-200/80">
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-pink-300/60" />Starring Hop &amp; Skip<span className="h-px w-8 bg-gradient-to-l from-transparent to-pink-300/60" />
      </div>
      <TitleRabbits />
      {snap.bestWave > 0 && <div className="mt-2 text-[10px] font-semibold text-white/50 uppercase tracking-[0.3em] tabular-nums">Best Wave {snap.bestWave} · {snap.legacy} Legacy</div>}
      <div className="mt-8 flex flex-col items-center gap-4">
        {snap.tutorialDone
          ? <BigButton onPress={() => engine.startRun()}>Start Run</BigButton>
          : <BigButton onPress={() => engine.startTutorial()}>Start</BigButton>}
        <div className="flex flex-wrap justify-center gap-3">
          {snap.tutorialDone && <SmallButton onPress={() => platform.startDaily()}>Daily Run</SmallButton>}
          {has('start_w10') && <SmallButton onPress={() => engine.startRun({ startWave: 11 })}>Start W11</SmallButton>}
          {has('start_w20') && <SmallButton onPress={() => engine.startRun({ startWave: 21 })}>Start W21</SmallButton>}
          {snap.tutorialDone && <SmallButton onPress={() => setScreen('legacy')}>Legacy · {snap.legacy}</SmallButton>}
          <SmallButton onPress={() => setScreen('bestiary')}>Bestiary</SmallButton>
          <SmallButton onPress={() => (snap.tutorialDone ? engine.startTutorial() : engine.startRun())}>{snap.tutorialDone ? 'Tutorial' : 'Skip tutorial'}</SmallButton>
          {platform.pwa.canInstall && <SmallButton onPress={() => void platform.pwa.promptInstall()}>Install</SmallButton>}
        </div>
      </div>
      <div className="mt-8 text-[10px] tracking-wider text-white/35 max-w-sm leading-relaxed">
        J / → = A (Hop) · F / ← = B (Skip) · Esc = pause · Gamepad supported
      </div>
    </Screen>
  );
};

/** Spend Legacy Points: unlocks over raw power (docs/DESIGN.md §9). */
export const Legacy = ({ onClose }: { onClose: () => void }) => {
  const { engine, snap } = useEngine();
  const owned = (id: string) => snap.unlocks.includes(id);
  return (
    <Screen className="bg-[#05030f]">
      <div className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter">Legacy</div>
      <div className="text-sm font-black text-yellow-300 mt-2 mb-8 tracking-widest">{snap.legacy} LP</div>
      <div className="w-full max-w-4xl space-y-6 mb-10">
        {LEGACY_BRANCHES.map((branch) => (
          <div key={branch}>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-2 ml-1">{branch}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {LEGACY_TREE.filter((n) => n.branch === branch).map((n) => {
                const have = owned(n.id);
                const locked = n.requires?.some((r) => !owned(r));
                const afford = snap.legacy >= n.cost;
                const style = ROPE_STYLES.includes(n.id as typeof ROPE_STYLES[number]);
                const equipped = style && snap.ropeStyle === n.id;
                return (
                  <button data-nav key={n.id}
                    onPointerDown={(e) => { e.preventDefault(); if (!have) engine.buyLegacy(n.id); else if (style) engine.setRopeStyle(equipped ? null : n.id); }}
                    className={`p-4 rounded-2xl border text-left flex gap-3 items-start active:scale-95 ${have ? 'bg-white/10 border-emerald-400/50' : locked || !afford ? 'bg-black/40 border-white/5 opacity-50' : 'bg-white/5 border-yellow-300/40'}`}>
                    <div className="text-3xl">{n.icon}</div>
                    <div className="flex-1">
                      <div className="font-black uppercase text-sm">{n.name}</div>
                      <div className="text-[11px] text-white/60 mt-0.5">{n.desc}</div>
                      <div className="text-[11px] font-black mt-1">
                        {have ? <span className="text-emerald-300">{style ? (equipped ? 'Equipped' : 'Tap to equip') : 'Unlocked'}</span>
                          : locked ? <span className="text-white/40">Needs {n.requires!.map((r) => LEGACY_TREE.find((x) => x.id === r)?.name).join(' + ')}</span>
                          : <span className="text-yellow-300">{n.cost} LP</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <BigButton onPress={onClose}>Back</BigButton>
    </Screen>
  );
};

/** Enemies met so far, with how to beat them. Unmet ones stay silhouettes. */
export const Bestiary = ({ onClose }: { onClose: () => void }) => {
  const { shell } = usePlatform();
  const codex = shell.production.codex;
  return (
    <Screen className="bg-[#05030f]">
      <div className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter mb-8">Bestiary</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl mb-10">
        {codex.list('enemy').map((entry) => {
          const known = codex.isUnlocked(entry.id);
          return (
            <div key={entry.id} className="p-5 rounded-2xl bg-white/5 border border-white/10">
              <div className={`text-xl font-black uppercase ${known ? '' : 'text-white/25'}`}>{known ? entry.title : '???'}</div>
              <div className="text-sm text-white/60 mt-1">{known ? entry.body : ''}</div>
            </div>
          );
        })}
      </div>
      <BigButton onPress={onClose}>Back</BigButton>
    </Screen>
  );
};

const Slider = ({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) => (
  <label className="block">
    <div className="flex justify-between text-sm font-black uppercase mb-2"><span>{label}</span><span className="text-cyan-400">{format(value)}</span></div>
    <input data-nav type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-cyan-400" />
  </label>
);

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <button data-nav onPointerDown={(e) => { e.preventDefault(); onChange(!value); }} className="w-full flex justify-between items-center text-sm font-black uppercase py-1">
    <span>{label}</span>
    <span className={`w-12 h-7 rounded-full p-1 transition-colors ${value ? 'bg-cyan-500' : 'bg-white/15'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Audio, rhythm calibration and accessibility. */
const SettingsPanel = () => {
  const { engine } = useEngine();
  const s = engine.settings;
  const set = (patch: Partial<GameSettings>) => engine.updateSettings(patch);
  return (
    <div className="w-full max-w-md bg-white/5 p-6 rounded-2xl border border-white/10 space-y-5">
      <Slider label="Music" value={s.musicVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ musicVolume: v })} />
      <Slider label="Sound FX" value={s.sfxVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ sfxVolume: v })} />
      <div>
        <Slider label="Input Latency" value={s.latencyMs} min={-150} max={150} step={5} format={(v) => `${v > 0 ? '+' : ''}${v} ms`} onChange={(v) => set({ latencyMs: v })} />
        <div className="text-[10px] text-white/40 mt-2">Raise if PERFECTs feel late, lower if early. Bluetooth audio usually needs +.</div>
      </div>
      <Slider label="Screen Shake" value={s.screenShake} min={0} max={1} step={0.1} format={pct} onChange={(v) => set({ screenShake: v })} />
      <Slider label="Flashes" value={s.flashes} min={0} max={1} step={0.1} format={pct} onChange={(v) => set({ flashes: v })} />
      <Toggle label="Reduced Motion" value={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
      <Toggle label="Vibration" value={s.vibration} onChange={(v) => set({ vibration: v })} />
    </div>
  );
};

export const Pause = () => {
  const { engine, snap } = useEngine();
  const [detail, setDetail] = useState<{ name: string; desc: string; icon: string } | null>(null);
  const platform = usePlatform();
  return (
    <Screen className="bg-black/95">
      <div className="text-5xl md:text-7xl font-black italic mb-10 uppercase tracking-tighter text-center">Paused</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl mb-10">
        {(['red', 'blue'] as BroKey[]).map((k) => {
          const b = snap.bros[k];
          const d = calculateDerived(b);
          return (
            <div key={k} className="bg-white/5 p-8 rounded-[2rem] border border-white/10">
              <div className="text-2xl font-black mb-6 uppercase" style={{ color: b.color }}>{b.name}</div>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {GEAR_SLOTS.map((slot) => {
                  const item = GEAR_DATA[slot].find((i) => i.id === b.gear[slot]);
                  return (
                    <button data-nav key={slot} onPointerDown={() => setDetail({ name: item?.name ?? 'Standard', desc: item?.desc ?? 'Basic reliable equipment.', icon: item?.icon ?? '📦' })} className="p-3 bg-white/5 border border-white/10 rounded-xl text-left active:scale-95">
                      <div className="text-[8px] font-black text-white/40 uppercase">{slot}</div>
                      <div className="text-xs font-bold truncate">{item?.name ?? 'Standard'}</div>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2 mb-6 border-t border-white/5 pt-4">
                <div className="text-[10px] font-black text-white/40 uppercase">Passive Perks</div>
                {b.perks.length === 0 && <div className="text-[11px] text-white/30">None yet — every 5th level.</div>}
                {b.perks.map((pid) => <div key={pid} className="text-[11px] font-bold text-yellow-400">⚡ {PERKS_DATA.find((p) => p.id === pid)?.name}</div>)}
              </div>
              <div className="space-y-3 border-t border-white/5 pt-4 text-xl font-bold">
                <div className="flex justify-between"><span>Max HP</span><span className="text-green-400">{d.maxHp}</span></div>
                <div className="flex justify-between"><span>Base DMG</span><span className="text-red-400">{Math.round(d.pwr)}</span></div>
                <div className="flex justify-between"><span>Crit %</span><span className="text-purple-400">{Math.round(d.crit * 100)}%</span></div>
                <div className="flex justify-between"><span>Teamwork</span><span className="text-yellow-400">x{d.teamwork.toFixed(1)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <SettingsPanel />
      <div className="mt-4 mb-10"><SmallButton onPress={() => platform.exportPlaytest()}>Export playtest</SmallButton></div>
      {detail && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-[110]" onPointerDown={() => setDetail(null)}>
          <div className="bg-[#0a0a1a] border border-white/20 p-8 rounded-[2.5rem] max-w-lg w-full text-center" onPointerDown={(e) => e.stopPropagation()}>
            <div className="text-6xl mb-4">{detail.icon}</div>
            <div className="text-3xl font-black mb-2">{detail.name}</div>
            <div className="text-sm text-white/60 mb-8">{detail.desc}</div>
            <button data-nav onPointerDown={() => setDetail(null)} className="w-full py-4 bg-white text-black font-black uppercase rounded-2xl active:scale-95">Close</button>
          </div>
        </div>
      )}
      <BigButton onPress={() => engine.resume()}>Resume</BigButton>
    </Screen>
  );
};

export const Shop = () => {
  const { engine, snap } = useEngine();
  const [tab, setTab] = useState<'supplies' | BroKey>('supplies');
  return (
    <div data-layer="overlay" className="fixed inset-0 bg-[#050508] z-[100] flex flex-col">
      <div className="shrink-0 pt-8 pb-4 flex flex-col items-center">
        <div className="text-3xl font-black italic mb-2 uppercase tracking-tighter">Shop</div>
        <div className="text-xs font-bold text-yellow-400 mb-4 tracking-widest uppercase">{snap.rp} RP</div>
        {snap.rigAlert && (
          <div className="mb-5 mx-4 max-w-xl px-4 py-2 rounded-xl border border-amber-400/50 bg-amber-400/10 text-amber-200 text-xs font-bold text-center">⚠ {snap.rigAlert}</div>
        )}
        <div className="flex gap-2 md:gap-4 w-full max-w-4xl px-4">
          {(['supplies', 'red', 'blue'] as const).map((t) => (
            <button data-nav key={t} onPointerDown={(e) => { e.preventDefault(); setTab(t); }} className={`flex-1 py-3 md:py-4 rounded-2xl font-black text-sm md:text-xl uppercase ${tab === t ? 'bg-white text-black' : 'bg-white/10 text-white/40'}`}>
              {t === 'supplies' ? 'Items' : `${snap.bros[t].name}'s Rig`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="w-full max-w-4xl mx-auto py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {tab === 'supplies' && (Object.keys(ITEM_DATA) as ItemId[]).map((id) => {
            const item = ITEM_DATA[id];
            return (
              <button data-nav key={id} onPointerDown={() => engine.buyItem(id)} className={`p-6 bg-white/5 border border-white/10 rounded-[2rem] flex justify-between items-center active:scale-95 ${snap.rp < item.cost ? 'opacity-50' : ''}`}>
                <div className="text-left pr-2">
                  <div className="font-black italic uppercase">{item.icon} {item.name} <span className="text-white/40">×{snap.inventory[id]}</span></div>
                  <div className="text-[10px] font-bold text-white/40 uppercase mt-1">{item.desc}</div>
                </div>
                <div className="text-yellow-400 font-black text-2xl">{item.cost}</div>
              </button>
            );
          })}
          {tab !== 'supplies' && (Object.entries(GEAR_DATA) as [GearSlot, typeof GEAR_DATA.rope][]).map(([slot, list]) => (
            <div key={slot} className="space-y-2">
              <div className="text-[10px] font-black text-white/40 uppercase ml-2">{slot}</div>
              {list.filter((item) => !item.unlock || snap.unlocks.includes(item.unlock)).map((item) => {
                const owned = snap.bros[tab].owned[slot].includes(item.id);
                const equipped = snap.bros[tab].gear[slot] === item.id;
                return (
                  <button data-nav key={item.id} onPointerDown={() => engine.buyOrEquip(tab, slot, item.id)} className={`w-full p-4 rounded-[1.5rem] border flex justify-between items-center ${equipped ? 'bg-white text-black border-white' : owned ? 'bg-white/10 border-white/40' : 'bg-black/40 text-white/60 border-white/5 active:scale-95'}`}>
                    <div className="text-left pr-4">
                      <div className="text-xs font-black uppercase">{item.icon} {item.name}</div>
                      <div className="text-[10px] font-bold opacity-60 mt-1">{item.desc}</div>
                    </div>
                    {owned ? <div className="text-[10px] font-black uppercase">{equipped ? 'Equipped' : 'Owned'}</div> : <div className="text-yellow-400 font-black text-lg">{item.cost}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 bg-black/60 p-6 flex justify-center border-t border-white/10">
        <BigButton onPress={() => engine.nextWave()} className="bg-cyan-500 text-white shadow-[0_0_60px_rgba(6,182,212,0.6)]">Next Wave</BigButton>
      </div>
    </div>
  );
};

/** After a boss: pick one Ascension mutator. Each one raises the score multiplier. */
export const MutatorPick = () => {
  const { engine, snap } = useEngine();
  if (!snap.mutatorChoices) return null;
  return (
    <Screen className="bg-[#0b0418] justify-center z-[125]">
      <div className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-center mb-2">Ascend</div>
      <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-8">Score ×{snap.mutators.reduce((m, id) => m * MUTATORS[id].score, 1).toFixed(2)}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl">
        {snap.mutatorChoices.map((id) => {
          const m = MUTATORS[id];
          return (
            <button data-nav key={id} onPointerDown={(e) => { e.preventDefault(); engine.chooseMutator(id); }} className="p-6 rounded-[2rem] bg-black/40 border-2 border-fuchsia-400/30 flex flex-col items-center text-center active:scale-95 hover:bg-white/5">
              <div className="text-5xl mb-2">{m.icon}</div>
              <div className="text-2xl font-black uppercase">{m.name}</div>
              <div className="mt-3 text-sm font-bold text-emerald-300">+ {m.blessing}</div>
              <div className="mt-1 text-sm font-bold text-rose-300">− {m.curse}</div>
              <div className="mt-3 text-xs font-black text-fuchsia-300">Score ×{m.score}</div>
            </button>
          );
        })}
      </div>
    </Screen>
  );
};

export const WaveClear = () => {
  const { engine } = useEngine();
  return (
    <Screen className="bg-black/95 justify-center">
      <div className="text-5xl md:text-8xl font-black italic text-yellow-400 mb-8 drop-shadow-[0_0_40px_#facc15] text-center uppercase tracking-tighter">Wave Clear</div>
      <BigButton onPress={() => engine.enterShop()}>Enter Shop</BigButton>
    </Screen>
  );
};

export const TutorialDone = () => {
  const { engine } = useEngine();
  return (
    <Screen className="bg-black/95 justify-center text-center">
      <div className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none">You've got<br />the rhythm.</div>
      <div className="mt-6 max-w-sm text-sm text-white/60 leading-relaxed">
        From here on, trips and hits cost HP. Clear waves to earn RP, gear up in the shop, and see how far Hop &amp; Skip can go.
      </div>
      <div className="mt-10"><BigButton onPress={() => engine.startRun()}>Start Run</BigButton></div>
    </Screen>
  );
};

const RANK_COLOR: Record<string, string> = { SS: '#f0abfc', S: '#facc15', A: '#4ade80', B: '#60a5fa', C: '#cbd5e1', D: '#94a3b8' };

/** End of run: rank, score, the numbers that made it, and the local leaderboard for this mode. */
export const GameOver = () => {
  const { engine, snap } = useEngine();
  const platform = usePlatform();
  const result = useRunResult();
  const [top, setTop] = useState<LeaderboardEntry[]>([]);
  useEffect(() => { if (result) setTop(result.top); }, [result]);
  const run = engine.lastRun;
  const rank = result?.rank.rank.label;
  const daily = run?.mode === 'daily';
  const stat = (label: string, v: number | string) => (
    <div className="flex justify-between text-sm"><span className="text-white/50 uppercase font-bold">{label}</span><span className="font-black">{v}</span></div>
  );
  return (
    <Screen className="bg-[#12030a]/95 justify-center text-center">
      <div className="text-xs font-black tracking-[0.5em] uppercase text-white/50">{daily ? 'Daily' : 'Run'} over · Wave {snap.wave}</div>
      {rank && (
        <div className="rank-in text-[120px] md:text-[160px] font-black italic leading-none my-2" style={{ color: RANK_COLOR[rank] ?? '#fff', textShadow: `0 0 50px ${RANK_COLOR[rank] ?? '#fff'}` }}>{rank}</div>
      )}
      {run && <div className="text-3xl font-black tabular-nums">{run.score.toLocaleString()}{result?.isBest && <span className="ml-3 text-sm text-yellow-300 align-middle">BEST</span>}</div>}
      {run && (
        <div className="mt-6 w-full max-w-xs space-y-1.5">
          {stat('Waves cleared', run.stats.wavesCleared)}
          {stat('Perfect jumps', `${run.stats.perfects} / ${run.stats.perfects + run.stats.trips}`)}
          {stat('Tags landed', `${run.stats.tagsLanded} / ${run.stats.tagsLanded + run.stats.tagsMissed}`)}
          {stat('Dodges', `${run.stats.dodges} / ${run.stats.dodges + run.stats.hitsTaken}`)}
          {stat('Best combo', run.stats.maxCombo)}
          {stat('Style', run.stats.stylePoints.toLocaleString())}
          {run.mutators.length > 0 && stat('Mutators', run.mutators.map((m) => MUTATORS[m].icon).join(' '))}
        </div>
      )}
      {top.length > 0 && (
        <div className="mt-6 w-full max-w-xs">
          <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-2">{daily ? "Today's best" : 'Best runs'}</div>
          {top.map((t, i) => (
            <div key={t.submittedAt + i} className={`flex justify-between text-sm py-0.5 ${t.score === run?.score ? 'text-yellow-300' : 'text-white/70'}`}>
              <span>{i + 1}. W{String(t.metadata?.wave ?? '?')} · {String(t.metadata?.rank ?? '')}</span><span className="tabular-nums font-black">{t.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8 flex flex-col items-center gap-3">
        <BigButton onPress={() => (daily ? platform.startDaily() : engine.startRun())}>Retry</BigButton>
        <SmallButton onPress={() => engine.toTitle()}>Title</SmallButton>
      </div>
    </Screen>
  );
};

export const LevelUp = () => {
  const { engine, snap } = useEngine();
  if (!snap.levelUp || snap.mutatorChoices) return null;
  const b = snap.bros[snap.levelUp.bro];
  const milestone = (b.lvl + 1) % 5 === 0 && snap.levelUp.choices[0]?.kind === 'perk';
  return (
    <Screen className="bg-[#0a0a1a] justify-center z-[120]">
      <div className="text-[10px] font-black tracking-[0.5em] mb-4 uppercase animate-pulse" style={{ color: b.color }}>{b.name} → L{b.lvl + 1}</div>
      <div className="text-5xl md:text-[80px] font-black italic mb-2 uppercase tracking-tighter text-center leading-none" style={{ color: b.color }}>{milestone ? 'Milestone!' : 'Level Up!'}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-5xl mt-8">
        {snap.levelUp.choices.map((c) => (
          <button data-nav key={c.key} onPointerDown={(e) => { e.preventDefault(); engine.chooseLevel(c); }} className="bg-black/40 border-2 border-white/10 p-6 rounded-[2rem] flex flex-col items-center active:scale-95 hover:bg-white/5">
            <div className="text-5xl mb-2">{c.icon}</div>
            <div className={`text-2xl md:text-4xl font-black mb-1 ${c.kind === 'stat' ? c.color : 'text-yellow-400'}`}>{c.name}{c.kind === 'stat' ? '++' : ''}</div>
            <div className="text-white/50 font-bold uppercase tracking-widest text-[10px] md:text-xs text-center">{c.desc}</div>
          </button>
        ))}
      </div>
    </Screen>
  );
};
