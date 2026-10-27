import { useState } from 'react';
import { GEAR_DATA, GEAR_SLOTS, ITEM_DATA, PERKS_DATA, type BroKey, type GearSlot, type ItemId } from '../data/config';
import { calculateDerived } from '../game/stats';
import { TitleRabbits } from './TitleRabbits';
import { useEngine } from './useEngine';

const Screen = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`fixed inset-0 z-[100] flex flex-col items-center p-6 md:p-10 overflow-y-auto ${className}`}>{children}</div>
);
const BigButton = ({ onPress, children, className = 'bg-white text-black' }: { onPress: () => void; children: React.ReactNode; className?: string }) => (
  <button onPointerDown={(e) => { e.preventDefault(); onPress(); }} className={`font-black py-5 px-16 md:px-28 rounded-full text-2xl md:text-3xl active:scale-95 uppercase tracking-tighter shadow-2xl ${className}`}>{children}</button>
);

export const Title = () => {
  const { engine, snap } = useEngine();
  return (
    <Screen className="bg-[#020205] justify-center text-center">
      <div className="text-[10px] font-black tracking-[0.6em] text-cyan-400 mb-4 uppercase">Rhythm • Tag-Team • Brawler</div>
      <div className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-none">
        <span className="text-red-500 drop-shadow-[0_0_30px_#ef4444]">Double</span>{' '}
        <span className="text-blue-500 drop-shadow-[0_0_30px_#3b82f6]">Dutch</span>
        <div className="text-white">Bros</div>
      </div>
      <div className="mt-2 text-sm font-black italic uppercase tracking-widest text-pink-400 drop-shadow-[0_0_12px_#f472b6]">starring Hop &amp; Skip</div>
      <TitleRabbits />
      <div className="mt-2 text-xs font-bold text-white/50 uppercase tracking-widest">Best Wave {snap.bestWave} • {snap.legacy} Legacy</div>
      <div className="mt-10"><BigButton onPress={() => engine.startRun()}>Start Run</BigButton></div>
      <div className="mt-8 text-[11px] text-white/40 max-w-sm leading-relaxed">
        Skills charge by jumping on the rope's beat. After each hit, tap the partner's glowing button to tag in and extend the combo.
        Keys: J / → = A (Hop), F / ← = B (Skip), Esc = pause.
      </div>
    </Screen>
  );
};

export const Pause = () => {
  const { engine, snap } = useEngine();
  const [detail, setDetail] = useState<{ name: string; desc: string; icon: string } | null>(null);
  const latency = engine.meta.latencyMs;
  return (
    <Screen className="bg-black/95">
      <div className="text-5xl md:text-7xl font-black italic mb-10 uppercase tracking-tighter text-center">Build Inspector</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl mb-10">
        {(['red', 'blue'] as BroKey[]).map((k) => {
          const b = snap.bros[k];
          const d = calculateDerived(b);
          return (
            <div key={k} className="bg-white/5 p-8 rounded-[2rem] border border-white/10">
              <div className="text-2xl font-black mb-6 uppercase" style={{ color: b.color }}>{b.name} Rig Status</div>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {GEAR_SLOTS.map((slot) => {
                  const item = GEAR_DATA[slot].find((i) => i.id === b.gear[slot]);
                  return (
                    <button key={slot} onPointerDown={() => setDetail({ name: item?.name ?? 'Standard', desc: item?.desc ?? 'Basic reliable equipment.', icon: item?.icon ?? '📦' })} className="p-3 bg-white/5 border border-white/10 rounded-xl text-left active:scale-95">
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
      <div className="w-full max-w-md mb-10 bg-white/5 p-6 rounded-2xl border border-white/10">
        <div className="flex justify-between text-sm font-black uppercase mb-2"><span>Input Latency</span><span className="text-cyan-400">{latency > 0 ? '+' : ''}{latency} ms</span></div>
        <input type="range" min={-150} max={150} step={5} value={latency} onChange={(e) => engine.setLatency(Number(e.target.value))} className="w-full accent-cyan-400" />
        <div className="text-[10px] text-white/40 mt-2">Raise this if your PERFECTs feel late, lower it if they feel early (Bluetooth audio usually needs +).</div>
      </div>
      {detail && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-[110]" onPointerDown={() => setDetail(null)}>
          <div className="bg-[#0a0a1a] border border-white/20 p-8 rounded-[2.5rem] max-w-lg w-full text-center" onPointerDown={(e) => e.stopPropagation()}>
            <div className="text-6xl mb-4">{detail.icon}</div>
            <div className="text-3xl font-black mb-2">{detail.name}</div>
            <div className="text-sm text-white/60 mb-8">{detail.desc}</div>
            <button onPointerDown={() => setDetail(null)} className="w-full py-4 bg-white text-black font-black uppercase rounded-2xl active:scale-95">Close</button>
          </div>
        </div>
      )}
      <BigButton onPress={() => engine.resume()}>Resume Flow</BigButton>
    </Screen>
  );
};

export const Shop = () => {
  const { engine, snap } = useEngine();
  const [tab, setTab] = useState<'supplies' | BroKey>('supplies');
  return (
    <div className="fixed inset-0 bg-[#050508] z-[100] flex flex-col">
      <div className="shrink-0 pt-8 pb-4 flex flex-col items-center">
        <div className="text-3xl font-black italic mb-2 uppercase tracking-tighter">The Rig Dashboard</div>
        <div className="text-xs font-bold text-yellow-400 mb-6 tracking-widest uppercase">[{snap.rp} RP Available]</div>
        <div className="flex gap-2 md:gap-4 w-full max-w-4xl px-4">
          {(['supplies', 'red', 'blue'] as const).map((t) => (
            <button key={t} onPointerDown={(e) => { e.preventDefault(); setTab(t); }} className={`flex-1 py-3 md:py-4 rounded-2xl font-black text-sm md:text-xl uppercase ${tab === t ? 'bg-white text-black' : 'bg-white/10 text-white/40'}`}>
              {t === 'supplies' ? 'Items' : `${t} Rig`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="w-full max-w-4xl mx-auto py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {tab === 'supplies' && (Object.keys(ITEM_DATA) as ItemId[]).map((id) => {
            const item = ITEM_DATA[id];
            return (
              <button key={id} onPointerDown={() => engine.buyItem(id)} className={`p-6 bg-white/5 border border-white/10 rounded-[2rem] flex justify-between items-center active:scale-95 ${snap.rp < item.cost ? 'opacity-50' : ''}`}>
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
              {list.map((item) => {
                const owned = snap.bros[tab].owned[slot].includes(item.id);
                const equipped = snap.bros[tab].gear[slot] === item.id;
                return (
                  <button key={item.id} onPointerDown={() => engine.buyOrEquip(tab, slot, item.id)} className={`w-full p-4 rounded-[1.5rem] border flex justify-between items-center ${equipped ? 'bg-white text-black border-white' : owned ? 'bg-white/10 border-white/40' : 'bg-black/40 text-white/60 border-white/5 active:scale-95'}`}>
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

export const WaveClear = () => {
  const { engine } = useEngine();
  return (
    <Screen className="bg-black/95 justify-center">
      <div className="text-5xl md:text-8xl font-black italic text-yellow-400 mb-8 drop-shadow-[0_0_40px_#facc15] text-center uppercase tracking-tighter">Wave Clear</div>
      <BigButton onPress={() => engine.enterShop()}>Enter Shop</BigButton>
    </Screen>
  );
};

export const GameOver = () => {
  const { engine, snap } = useEngine();
  return (
    <Screen className="bg-red-950/95 justify-center text-center">
      <div className="text-7xl md:text-[120px] font-black italic tracking-tighter leading-none">CRASHED</div>
      <div className="mt-6 text-sm font-bold uppercase tracking-widest text-white/60">Reached Wave {snap.wave} • Best {snap.bestWave} • {snap.legacy} Legacy</div>
      <div className="mt-12"><BigButton onPress={() => engine.startRun()}>Retry</BigButton></div>
    </Screen>
  );
};

export const LevelUp = () => {
  const { engine, snap } = useEngine();
  if (!snap.levelUp) return null;
  const b = snap.bros[snap.levelUp.bro];
  const milestone = (b.lvl + 1) % 5 === 0 && snap.levelUp.choices[0]?.kind === 'perk';
  return (
    <Screen className="bg-[#0a0a1a] justify-center z-[120]">
      <div className="text-[10px] font-black tracking-[0.5em] mb-4 uppercase animate-pulse" style={{ color: b.color }}>{b.name} → L{b.lvl + 1}</div>
      <div className="text-5xl md:text-[80px] font-black italic mb-2 uppercase tracking-tighter text-center leading-none" style={{ color: b.color }}>{milestone ? 'Milestone!' : 'Level Up!'}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-5xl mt-8">
        {snap.levelUp.choices.map((c) => (
          <button key={c.key} onPointerDown={(e) => { e.preventDefault(); engine.chooseLevel(c); }} className="bg-black/40 border-2 border-white/10 p-6 rounded-[2rem] flex flex-col items-center active:scale-95 hover:bg-white/5">
            <div className="text-5xl mb-2">{c.icon}</div>
            <div className={`text-2xl md:text-4xl font-black mb-1 ${c.kind === 'stat' ? c.color : 'text-yellow-400'}`}>{c.name}{c.kind === 'stat' ? '++' : ''}</div>
            <div className="text-white/50 font-bold uppercase tracking-widest text-[10px] md:text-xs text-center">{c.desc}</div>
          </button>
        ))}
      </div>
    </Screen>
  );
};
