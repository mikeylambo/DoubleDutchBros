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
import { waveMemo } from './runMemo';
import { audio } from '../game/audio';

/**
 * `scrim`: in-run screens frost over the live game. `city`: out-of-run screens sit over the skyline.
 */
const Screen = ({ children, className = '', tone = 'scrim' }: { children: React.ReactNode; className?: string; tone?: 'scrim' | 'city' }) => (
  <div data-layer="overlay" className={`fixed inset-0 z-[100] flex flex-col items-center p-6 md:p-10 overflow-y-auto isolate ${tone === 'scrim' ? 'scrim' : ''} ${className}`}>
    {tone === 'city' && <TitleBackdrop />}
    {children}
  </div>
);

/** Eyebrow + display title: the one heading style every screen uses. */
const Heading = ({ eyebrow, children, color, className = 'mb-8' }: { eyebrow?: React.ReactNode; children: React.ReactNode; color?: string; className?: string }) => (
  <div className={`text-center ${className}`}>
    {eyebrow && <div className="text-[10px] font-semibold tracking-[0.5em] uppercase text-white/50 mb-3">{eyebrow}</div>}
    <div className="font-display font-black italic uppercase leading-[0.9] text-4xl md:text-6xl" style={color ? { color, textShadow: `0 0 40px ${color}66` } : undefined}>{children}</div>
  </div>
);

/** Gold RP price tag. */
const Price = ({ cost, afford = true }: { cost: number; afford?: boolean }) => (
  <span className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums border ${afford ? 'text-amber-200 border-amber-300/30 bg-amber-300/10' : 'text-white/35 border-white/10 bg-white/[0.03]'}`}>{cost} <span className="opacity-60">RP</span></span>
);

/** Glass choice card for picks (level-ups, mutators): lifts on hover, accent rim on top. */
const ChoiceCard = ({ onPress, accent, children }: { onPress: () => void; accent: string; children: React.ReactNode }) => (
  <button data-nav onPointerDown={(e) => { e.preventDefault(); onPress(); }}
    className="glass relative overflow-hidden p-6 md:p-7 rounded-3xl flex flex-col items-center text-center active:scale-95 transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.08]">
    <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
    <span className="absolute -top-16 left-1/2 -translate-x-1/2 w-40 h-32 rounded-full blur-3xl opacity-30" style={{ background: accent }} />
    {children}
  </button>
);
const BigButton = ({ onPress, children, className = 'bg-gradient-to-b from-white to-slate-200 text-[#0b0720] shadow-[0_10px_40px_rgba(255,255,255,0.18),inset_0_-3px_0_rgba(0,0,0,0.12)]' }: { onPress: () => void; children: React.ReactNode; className?: string }) => (
  <button data-nav onPointerDown={(e) => { e.preventDefault(); onPress(); }} className={`-skew-x-12 font-display font-black italic py-4 md:py-5 px-16 md:px-24 rounded-2xl text-xl md:text-2xl active:scale-95 transition-transform uppercase tracking-wide ${className}`}><span className="inline-block skew-x-12">{children}</span></button>
);

/** Playtest builds (dev, or VITE_PLAYTEST=1) get shortcuts to every zone and time of day. */
const PLAYTEST = import.meta.env.DEV || import.meta.env.VITE_PLAYTEST === '1';
const PLAYTEST_WAVES: [string, number][] = [
  ['Alley day', 1], ['Alley dusk', 4], ['Alley night', 7], ['Rooftop day', 11], ['Rooftop dusk', 14], ['Rooftop night', 17], ['Subway', 21]
];

const SmallButton = ({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => (
  <button data-nav onPointerDown={(e) => { e.preventDefault(); onPress(); }} className="glass -skew-x-12 px-5 py-3 rounded-xl font-display font-black italic text-[11px] md:text-xs text-white/90 uppercase tracking-[0.12em] active:scale-95 transition-transform hover:bg-white/[0.08] border-l-2 !border-l-white/30"><span className="inline-block skew-x-12">{children}</span></button>
);

export const Title = () => {
  const { engine, snap } = useEngine();
  const platform = usePlatform();
  const [screen, setScreen] = useState<'title' | 'bestiary' | 'legacy'>('title');
  if (screen === 'bestiary') return <Bestiary onClose={() => setScreen('title')} />;
  if (screen === 'legacy') return <Legacy onClose={() => setScreen('title')} />;
  const has = (id: string) => snap.unlocks.includes(id);
  return (
    <Screen tone="city" className="justify-center text-center">
      {/* Logo: Double swings in from the left, Dutch from the right, Bros slams down; then it floats. */}
      <div className="logo-float font-display font-black italic uppercase leading-[0.85] text-5xl sm:text-7xl md:text-8xl">
        <div>
          <span className="logo-from-left inline-block bg-gradient-to-b from-rose-300 to-red-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(239,68,68,0.45)]">Double</span>{' '}
          <span className="logo-from-right inline-block bg-gradient-to-b from-sky-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(59,130,246,0.45)]">Dutch</span>
        </div>
        <div className="logo-slam mt-1 bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent text-[1.35em] drop-shadow-[0_4px_30px_rgba(255,255,255,0.15)]">Bros</div>
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
        {PLAYTEST && (
          <div className="mt-2 flex flex-wrap justify-center gap-2 max-w-md">
            <div className="w-full text-[9px] font-semibold tracking-[0.4em] uppercase text-white/35">Playtest · jump to</div>
            {PLAYTEST_WAVES.map(([label, wave]) => <SmallButton key={wave} onPress={() => engine.startRun({ startWave: wave })}>{label}</SmallButton>)}
          </div>
        )}
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
    <Screen tone="city">
      <Heading eyebrow="Between runs" className="mb-3">Legacy</Heading>
      <div className="mb-10 px-4 py-1.5 rounded-full text-xs font-semibold tabular-nums text-amber-200 border border-amber-300/30 bg-amber-300/10">{snap.legacy} LP available</div>
      <div className="w-full max-w-4xl space-y-6 mb-10">
        {LEGACY_BRANCHES.map((branch) => (
          <div key={branch}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/45 mb-3 ml-1">{branch}</div>
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
                    className={`glass p-4 rounded-2xl text-left flex gap-3 items-start active:scale-95 transition-all ${have ? '!border-emerald-300/40' : locked || !afford ? 'opacity-45' : '!border-amber-300/35 hover:bg-white/[0.08]'}`}>
                    <div className="text-3xl">{n.icon}</div>
                    <div className="flex-1">
                      <div className="font-display font-black italic uppercase text-sm tracking-wide">{n.name}</div>
                      <div className="text-[11px] text-white/60 mt-0.5">{n.desc}</div>
                      <div className="text-[11px] font-semibold mt-2">
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
    <Screen tone="city">
      <Heading eyebrow="Field notes">Bestiary</Heading>
      {codex.list('enemy').length === 0 && (
        <div className="glass max-w-sm px-6 py-5 rounded-2xl text-center text-sm text-white/60 leading-relaxed mb-10">
          No entries yet. Every enemy you face in a run gets a page here, with how to beat it.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl mb-10">
        {codex.list('enemy').map((entry) => {
          const known = codex.isUnlocked(entry.id);
          return (
            <div key={entry.id} className={`glass p-5 rounded-2xl ${known ? '' : 'opacity-50'}`}>
              <div className={`font-display text-lg font-black italic uppercase tracking-wide ${known ? '' : 'text-white/30'}`}>{known ? entry.title : '???'}</div>
              <div className="text-sm text-white/60 mt-1.5 leading-relaxed">{known ? entry.body : 'Not met yet.'}</div>
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
    <div className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.2em] mb-2.5"><span className="text-white/75">{label}</span><span className="text-cyan-300 tabular-nums">{format(value)}</span></div>
    <input data-nav type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="range w-full"
      style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} />
  </label>
);

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <button data-nav onPointerDown={(e) => { e.preventDefault(); onChange(!value); }} className="w-full flex justify-between items-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 py-1">
    <span>{label}</span>
    <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${value ? 'bg-gradient-to-r from-cyan-400 to-violet-400 shadow-[0_0_14px_rgba(34,211,238,0.5)]' : 'bg-white/10'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
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
    <div className="glass w-full max-w-md p-6 rounded-3xl space-y-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/45">Settings</div>
      <Slider label="Music" value={s.musicVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ musicVolume: v })} />
      <Slider label="Sound FX" value={s.sfxVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ sfxVolume: v })} />
      <div>
        <Slider label="Input Latency" value={s.latencyMs} min={-150} max={150} step={5} format={(v) => `${v > 0 ? '+' : ''}${v} ms`} onChange={(v) => set({ latencyMs: v })} />
        <div className="text-[10px] text-white/40 mt-2 leading-relaxed">Raise if PERFECTs feel late, lower if early. Bluetooth audio usually needs +.</div>
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
    <Screen>
      <Heading eyebrow={`Wave ${snap.wave}`} className="mb-10">Paused</Heading>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl mb-10">
        {(['red', 'blue'] as BroKey[]).map((k) => {
          const b = snap.bros[k];
          const d = calculateDerived(b);
          return (
            <div key={k} className="glass relative overflow-hidden p-6 md:p-8 rounded-3xl">
              <span className="absolute -top-20 -left-10 w-56 h-40 rounded-full blur-3xl opacity-25" style={{ background: b.color }} />
              <div className="relative flex items-baseline justify-between mb-6">
                <div className="font-display text-3xl font-black italic uppercase" style={{ color: b.color }}>{b.name}</div>
                <div className="text-[10px] font-semibold tracking-[0.3em] text-white/45">LV {b.lvl}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {GEAR_SLOTS.map((slot) => {
                  const item = GEAR_DATA[slot].find((i) => i.id === b.gear[slot]);
                  return (
                    <button data-nav key={slot} onPointerDown={() => setDetail({ name: item?.name ?? 'Standard', desc: item?.desc ?? 'Basic reliable equipment.', icon: item?.icon ?? '📦' })} className="p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-left active:scale-95 hover:bg-white/[0.08] transition-colors">
                      <div className="text-[8px] font-semibold tracking-[0.25em] text-white/40 uppercase">{slot}</div>
                      <div className="text-xs font-semibold truncate mt-0.5">{item?.icon} {item?.name ?? 'Standard'}</div>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2 mb-6 border-t border-white/5 pt-4">
                <div className="text-[10px] font-semibold tracking-[0.3em] text-white/40 uppercase">Passive Perks</div>
                {b.perks.length === 0 && <div className="text-[11px] text-white/30">None yet — every 5th level.</div>}
                {b.perks.map((pid) => <div key={pid} className="text-[11px] font-semibold text-amber-200">⚡ {PERKS_DATA.find((p) => p.id === pid)?.name}</div>)}
              </div>
              <div className="grid grid-cols-4 gap-2 border-t border-white/5 pt-4 text-center">
                {([['HP', d.maxHp, 'text-emerald-300'], ['DMG', Math.round(d.pwr), 'text-rose-300'], ['Crit', `${Math.round(d.crit * 100)}%`, 'text-violet-300'], ['Team', `×${d.teamwork.toFixed(1)}`, 'text-amber-200']] as const).map(([l, v, c]) => (
                  <div key={l}><div className={`font-display text-xl md:text-2xl font-black italic tabular-nums ${c}`}>{v}</div><div className="text-[9px] font-semibold tracking-[0.25em] text-white/40 uppercase mt-1">{l}</div></div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <SettingsPanel />
      <div className="mt-4 mb-10"><SmallButton onPress={() => platform.exportPlaytest()}>Export playtest</SmallButton></div>
      {detail && (
        <div className="fixed inset-0 scrim flex items-center justify-center p-6 z-[110]" onPointerDown={() => setDetail(null)}>
          <div className="glass p-8 rounded-3xl max-w-md w-full text-center" onPointerDown={(e) => e.stopPropagation()}>
            <div className="text-6xl mb-4">{detail.icon}</div>
            <div className="font-display text-2xl font-black italic uppercase mb-2">{detail.name}</div>
            <div className="text-sm text-white/60 mb-8 leading-relaxed">{detail.desc}</div>
            <button data-nav onPointerDown={() => setDetail(null)} className="w-full py-3.5 bg-gradient-to-b from-white to-slate-200 text-[#0b0720] font-display font-black italic uppercase rounded-full active:scale-95">Close</button>
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
    <div data-layer="overlay" className="fixed inset-0 scrim z-[100] flex flex-col">
      <div className="shrink-0 pt-[max(env(safe-area-inset-top),28px)] pb-4 flex flex-col items-center">
        <Heading eyebrow={`Before wave ${snap.wave + 1}`} className="mb-3">Shop</Heading>
        <div className="mb-5 px-4 py-1.5 rounded-full text-xs font-semibold tabular-nums text-amber-200 border border-amber-300/30 bg-amber-300/10">{snap.rp} RP</div>
        {snap.rigAlert && (
          <div className="mb-5 mx-4 max-w-xl px-4 py-2 rounded-xl border border-amber-400/40 bg-amber-400/10 text-amber-200 text-xs font-semibold text-center">⚠ {snap.rigAlert}</div>
        )}
        <div className="glass flex p-1 rounded-full w-[calc(100%-2rem)] max-w-xl">
          {(['supplies', 'red', 'blue'] as const).map((t) => (
            <button data-nav key={t} onPointerDown={(e) => { e.preventDefault(); setTab(t); }} className={`flex-1 py-2.5 rounded-full font-display font-black italic text-xs md:text-sm uppercase tracking-wide transition-all ${tab === t ? 'bg-gradient-to-b from-white to-slate-200 text-[#0b0720] shadow-lg' : 'text-white/45 hover:text-white/80'}`}>
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
              <button data-nav key={id} onPointerDown={() => engine.buyItem(id)} className={`glass p-5 rounded-2xl flex gap-4 items-center active:scale-95 transition-all hover:bg-white/[0.08] ${snap.rp < item.cost ? 'opacity-50' : ''}`}>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-white/[0.06] flex items-center justify-center text-2xl">{item.icon}</div>
                <div className="flex-1 text-left">
                  <div className="font-display font-black italic uppercase tracking-wide">{item.name} <span className="text-white/35 text-xs not-italic font-semibold tabular-nums">×{snap.inventory[id]}</span></div>
                  <div className="text-[11px] text-white/50 mt-1 leading-snug">{item.desc}</div>
                </div>
                <Price cost={item.cost} afford={snap.rp >= item.cost} />
              </button>
            );
          })}
          {tab !== 'supplies' && (Object.entries(GEAR_DATA) as [GearSlot, typeof GEAR_DATA.rope][]).map(([slot, list]) => (
            <div key={slot} className="space-y-2">
              <div className="text-[10px] font-semibold tracking-[0.35em] text-white/45 uppercase ml-2 mb-1">{slot}</div>
              {list.filter((item) => !item.unlock || snap.unlocks.includes(item.unlock)).map((item) => {
                const owned = snap.bros[tab].owned[slot].includes(item.id);
                const equipped = snap.bros[tab].gear[slot] === item.id;
                return (
                  <button data-nav key={item.id} onPointerDown={() => engine.buyOrEquip(tab, slot, item.id)} className={`glass w-full p-4 rounded-2xl flex gap-3 items-center active:scale-95 transition-all ${equipped ? '!border-cyan-300/50 !bg-cyan-300/[0.08]' : owned ? 'hover:bg-white/[0.08]' : 'hover:bg-white/[0.08] text-white/75'}`}>
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-white/[0.06] flex items-center justify-center text-xl">{item.icon}</div>
                    <div className="flex-1 text-left">
                      <div className="text-xs font-display font-black italic uppercase tracking-wide">{item.name}</div>
                      <div className="text-[10px] text-white/50 mt-1 leading-snug">{item.desc}</div>
                    </div>
                    {owned ? <div className={`text-[9px] font-semibold tracking-[0.25em] uppercase ${equipped ? 'text-cyan-300' : 'text-white/45'}`}>{equipped ? 'Equipped' : 'Owned'}</div> : <Price cost={item.cost} afford={snap.rp >= item.cost} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 p-5 pb-[max(env(safe-area-inset-bottom),20px)] flex justify-center bg-gradient-to-t from-[#05030f] to-transparent">
        <BigButton onPress={() => engine.nextWave()} className="text-[#04121a] bg-gradient-to-b from-cyan-200 to-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.45),inset_0_1px_0_rgba(255,255,255,0.6)]">Next Wave</BigButton>
      </div>
    </div>
  );
};

/** After a boss: pick one Ascension mutator. Each one raises the score multiplier. */
export const MutatorPick = () => {
  const { engine, snap } = useEngine();
  if (!snap.mutatorChoices) return null;
  return (
    <Screen className="justify-center z-[125]">
      <Heading eyebrow={`Score ×${snap.mutators.reduce((m, id) => m * MUTATORS[id].score, 1).toFixed(2)}`} color="#f0abfc">Ascend</Heading>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl">
        {snap.mutatorChoices.map((id) => {
          const m = MUTATORS[id];
          return (
            <ChoiceCard key={id} accent="#e879f9" onPress={() => engine.chooseMutator(id)}>
              <div className="relative text-5xl mb-3">{m.icon}</div>
              <div className="relative font-display text-2xl font-black italic uppercase">{m.name}</div>
              <div className="relative mt-4 text-sm text-emerald-200">+ {m.blessing}</div>
              <div className="relative mt-1 text-sm text-rose-200">− {m.curse}</div>
              <div className="relative mt-5 px-3 py-1 rounded-full text-[10px] font-semibold tracking-[0.25em] text-fuchsia-200 border border-fuchsia-300/30 bg-fuchsia-300/10">SCORE ×{m.score}</div>
            </ChoiceCard>
          );
        })}
      </div>
    </Screen>
  );
};

/** Counts up to `to` over `ms`, ticking as it goes. Starts after `delay`. */
const useCountUp = (to: number, ms = 900, delay = 0) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0, last = 0;
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / ms));
      const next = Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (next !== last && now - t0 > 0 && Math.floor(t * 14) !== Math.floor(((last / Math.max(1, to)) * 14))) audio.play('tick');
      last = next; setV(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, delay]);
  return v;
};

/** A bro's victory clip, played straight from its sprite strip. */
const VictoryPose = ({ who, delay }: { who: 'hop' | 'skip'; delay: number }) => (
  <div className="victory-pose w-36 h-36 md:w-52 md:h-52" style={{ backgroundImage: `url(/assets/sprites/${who}/victory.png)`, animationDelay: `0ms, ${delay}ms` }} />
);

export const WaveClear = () => {
  const { engine, snap } = useEngine();
  const earned = useCountUp(Math.max(0, snap.rp - waveMemo.rp), 900, 700);
  const color = RANK_COLOR[snap.swagTier] ?? '#fff';
  return (
    <Screen className="justify-center">
      <div className="victory-push flex items-end justify-center -mb-4">
        <VictoryPose who="hop" delay={0} />
        <VictoryPose who="skip" delay={120} />
      </div>
      <div className="rank-in font-display font-black italic uppercase text-center leading-[0.9] text-6xl md:text-8xl mb-6 bg-gradient-to-b from-amber-100 via-yellow-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(250,204,21,0.35)]">Wave<br />Clear</div>
      <div className="flex gap-3 mb-10">
        <div className="reward-in glass px-6 py-3 rounded-2xl text-center" style={{ animationDelay: '600ms' }}>
          <div className="text-[9px] font-semibold tracking-[0.4em] uppercase text-white/50">Earned</div>
          <div className="font-display font-black italic text-3xl tabular-nums text-amber-200">+{earned}<span className="text-sm text-white/40 not-italic ml-1">RP</span></div>
        </div>
        <div className="reward-in glass px-6 py-3 rounded-2xl text-center" style={{ animationDelay: '900ms' }}>
          <div className="text-[9px] font-semibold tracking-[0.4em] uppercase text-white/50">Style</div>
          <div className="font-display font-black italic text-3xl" style={{ color, textShadow: `0 0 18px ${color}88` }}>{snap.swagTier}</div>
        </div>
      </div>
      <BigButton onPress={() => engine.enterShop()}>Enter Shop</BigButton>
    </Screen>
  );
};

export const TutorialDone = () => {
  const { engine } = useEngine();
  return (
    <Screen className="justify-center text-center">
      <Heading eyebrow="Tutorial complete" className="">You've got<br />the rhythm.</Heading>
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
    <div className="flex justify-between items-baseline text-sm py-1.5 border-b border-white/[0.06] last:border-0"><span className="text-[10px] text-white/50 uppercase font-semibold tracking-[0.2em]">{label}</span><span className="font-semibold tabular-nums">{v}</span></div>
  );
  return (
    <Screen className="justify-center text-center">
      <div className="text-[10px] font-semibold tracking-[0.5em] uppercase text-white/50">{daily ? 'Daily' : 'Run'} over · Wave {snap.wave}</div>
      {rank && (
        <div className="rank-in font-display text-[120px] md:text-[160px] font-black italic leading-none my-2" style={{ color: RANK_COLOR[rank] ?? '#fff', textShadow: `0 0 60px ${RANK_COLOR[rank] ?? '#fff'}88` }}>{rank}</div>
      )}
      {run && <div className="font-display text-3xl font-black italic tabular-nums">{run.score.toLocaleString()}{result?.isBest && <span className="ml-3 px-2.5 py-1 rounded-full text-[10px] not-italic font-semibold tracking-[0.25em] text-amber-200 border border-amber-300/30 bg-amber-300/10 align-middle">NEW BEST</span>}</div>}
      {run && (
        <div className="glass mt-6 w-full max-w-xs px-5 py-3 rounded-2xl text-left">
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
        <div className="glass mt-4 w-full max-w-xs px-5 py-4 rounded-2xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/40 mb-2">{daily ? "Today's best" : 'Best runs'}</div>
          {top.map((t, i) => (
            <div key={t.submittedAt + i} className={`flex justify-between text-sm py-0.5 ${t.score === run?.score ? 'text-yellow-300' : 'text-white/70'}`}>
              <span>{i + 1}. W{String(t.metadata?.wave ?? '?')} · {String(t.metadata?.rank ?? '')}</span><span className="tabular-nums font-semibold">{t.score.toLocaleString()}</span>
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
    <Screen className="justify-center z-[120]">
      <Heading eyebrow={`${b.name} · LV ${b.lvl} → ${b.lvl + 1}`} color={b.color} className="">{milestone ? 'Milestone' : 'Level Up'}</Heading>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-5xl mt-8">
        {snap.levelUp.choices.map((c) => (
          <ChoiceCard key={c.key} accent={b.color} onPress={() => engine.chooseLevel(c)}>
            <div className="relative text-5xl mb-3">{c.icon}</div>
            <div className={`relative font-display text-2xl md:text-3xl font-black italic uppercase mb-2 ${c.kind === 'stat' ? c.color : 'text-amber-200'}`}>{c.name}{c.kind === 'stat' ? ' +' : ''}</div>
            <div className="relative text-white/55 text-xs leading-relaxed">{c.desc}</div>
          </ChoiceCard>
        ))}
      </div>
    </Screen>
  );
};
