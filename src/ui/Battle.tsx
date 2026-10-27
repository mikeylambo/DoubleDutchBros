import { useEffect, useRef } from 'react';
import { ITEM_DATA, MOVE_REGISTRY, type BroId, type ItemId, type MoveId } from '../data/config';
import { audio } from '../game/audio';
import { MUTATORS } from '../game/runmods';
import { draw } from '../game/renderer';
import { computeView, screenToWorldX, type View } from '../game/view';
import { calculateDerived } from '../game/stats';
import { useEngine } from './useEngine';

const SWAG_COLOR: Record<string, string> = { D: '#94a3b8', C: '#cbd5e1', B: '#60a5fa', A: '#4ade80', S: '#facc15', SS: '#f0abfc' };

/** Live style rank: clean play raises it and multiplies style points. */
const SwagMeter = ({ compact }: { compact: boolean }) => {
  const { snap } = useEngine();
  const color = SWAG_COLOR[snap.swagTier] ?? '#fff';
  return (
    <div className="flex items-center gap-2" aria-label={`Style ${snap.swagTier}`}>
      <div className={`font-black italic leading-none ${compact ? 'text-xl' : 'text-3xl'}`} style={{ color, textShadow: `0 0 16px ${color}` }}>{snap.swagTier}</div>
      <div className={`${compact ? 'w-10' : 'w-14'} h-1.5 rounded-full bg-white/10 overflow-hidden`}>
        <div className="h-full transition-all duration-300" style={{ width: `${snap.swag}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

export const Hud = ({ compact = false }: { compact?: boolean }) => {
  const { engine, snap } = useEngine();
  return (
    <div className={`shrink-0 flex justify-between items-center z-10 border-b border-white/5 bg-black/80 backdrop-blur-md ${compact ? 'h-11 px-4 pl-[max(env(safe-area-inset-left),16px)] pr-[max(env(safe-area-inset-right),16px)]' : 'h-[10vh] min-h-[60px] p-4'}`}>
      <div className="flex gap-4 md:gap-12 w-full max-w-2xl">
        {(['red', 'blue'] as const).map((k) => {
          const b = snap.bros[k];
          const max = calculateDerived(b).maxHp;
          return (
            <div key={k} className={`flex flex-col w-1/2 ${b.hp <= 0 ? 'opacity-30 grayscale' : ''}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-black italic uppercase tracking-widest" style={{ color: b.color }}>{b.name} L{b.lvl}</span>
                <span className="text-[9px] font-bold opacity-90">{b.hp}/{max} HP</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full border border-white/5 overflow-hidden">
                <div className="h-full transition-all duration-700" style={{ backgroundColor: b.color, width: `${(b.hp / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <SwagMeter compact={compact} />
        <div className="text-right hidden sm:block leading-none whitespace-nowrap">
          <div className="text-[10px] font-black text-cyan-400 uppercase italic">Wave {snap.wave}</div>
          <div className={`font-black italic mt-1 ${compact ? 'text-sm' : 'text-xl'}`}>{snap.rp} RP</div>
          {snap.mutators.length > 0 && <div className="text-xs mt-1 tracking-tight" title="Active mutators">{snap.mutators.map((m) => MUTATORS[m].icon).join('')}</div>}
        </div>
        <button aria-label="Pause" onPointerDown={(e) => { e.preventDefault(); engine.pause(); }} className={`ml-4 ${compact ? 'w-8 h-8' : 'w-10 h-10 md:w-12 md:h-12'} bg-white/10 rounded-xl flex items-center justify-center active:scale-95 border border-white/20`}>⏸</button>
      </div>
    </div>
  );
};

const PHASE_HINT: Partial<Record<string, string>> = {
  TARGET: 'SELECT TARGET',
  ITEMS_TARGETING: 'CHOOSE A BRO',
  WINDUP: 'JUMP ON THE BEAT'
};

export const Playfield = () => {
  const { engine, snap } = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(computeView(1, 1));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // Match the canvas bitmap to its on-screen size at full pixel density.
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      viewRef.current = computeView(width, height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let raf = 0;
    const loop = () => {
      engine.frame();
      draw(ctx, engine, viewRef.current, canvas.width / Math.max(1, viewRef.current.w));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [engine]);

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    engine.tapCanvas(screenToWorldX(e.clientX - rect.left, viewRef.current));
  };

  const hint = snap.tutorialHint ? null : PHASE_HINT[snap.phase];
  return (
    <div className="relative flex-1 min-h-0 w-full touch-none overflow-hidden">
      <div className="absolute inset-0" onPointerDown={onTap}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      </div>
      {snap.combo >= 2 && (
        <div className="absolute top-4 left-6 z-20 pointer-events-none">
          <div className="text-5xl font-black italic drop-shadow-[0_0_20px_white] leading-none">{snap.combo}</div>
          <div className="text-[10px] font-black text-cyan-400 tracking-widest uppercase mt-1">Combo</div>
        </div>
      )}
      {snap.tutorialHint && (
        <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-30 px-4">
          <div className="max-w-xl px-5 py-3 rounded-2xl bg-black/80 border border-cyan-400/60 shadow-[0_0_30px_rgba(34,211,238,0.35)] text-center">
            <div className="text-[9px] font-black tracking-[0.5em] text-cyan-400 uppercase mb-1">Tutorial</div>
            <div className="text-sm md:text-lg font-black leading-snug">{snap.tutorialHint}</div>
          </div>
        </div>
      )}
      {hint && (
        <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-30">
          <div className="px-4 py-1 rounded-full bg-black/60 text-sm md:text-xl font-black italic uppercase tracking-tight animate-pulse">{hint}</div>
        </div>
      )}
      {/* Menu floats on the court, below the action. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 md:p-5 pointer-events-none [&>*]:pointer-events-auto">
        <ActionBar />
      </div>
    </div>
  );
};

const SyncCost = ({ cost }: { cost: number }) => <div className="text-[8px] text-white/40 uppercase mt-1">{cost} Sync</div>;

export const ActionBar = () => {
  const { engine, snap } = useEngine();
  const { phase, sync, turn } = snap;
  const back = <button data-nav onPointerDown={() => engine.action('BACK')} className="px-6 bg-red-600/20 text-red-500 rounded-2xl font-black uppercase text-xs active:scale-95">Back</button>;

  if (phase === 'MENU') {
    const btn = 'flex-1 px-2 py-4 [@media(max-height:540px)]:py-2.5 font-black italic text-xs md:text-lg rounded-full active:scale-90 transition-all uppercase leading-none';
    return (
      <div className="flex flex-col items-center w-full max-w-2xl">
        <div className="text-[10px] font-black text-cyan-400 mb-3 tracking-[0.8em] uppercase [@media(max-height:700px)]:hidden">[{snap.bros[turn === 'RED' ? 'red' : 'blue'].name} ready]</div>
        <div className="bg-black/90 p-2 md:p-3 rounded-[2rem] border border-white/10 flex gap-2 md:gap-4 w-full">
          <button data-nav onPointerDown={(e) => engine.action('BASIC', audio.fromEventTime(e.timeStamp))} className={`${btn} bg-white text-black`}>Attack</button>
          <button data-nav onPointerDown={(e) => engine.action('TECH', audio.fromEventTime(e.timeStamp))} className={`${btn} bg-purple-600 ${sync < 20 ? 'opacity-40 grayscale' : ''}`}>Skill</button>
          <button data-nav onPointerDown={() => engine.action('ITEMS')} className={`${btn} bg-slate-800`}>Items</button>
          <button data-nav onPointerDown={(e) => engine.action('ULT', audio.fromEventTime(e.timeStamp))} className={`${btn} ${sync >= 100 ? 'bg-yellow-400 text-black shadow-[0_0_30px_gold]' : 'bg-white/5 text-white/20'}`}>Ult</button>
        </div>
      </div>
    );
  }
  if (phase === 'TECH_SELECT') {
    const techs = (['TECH1', 'TECH2', 'TECH3', 'TECH4', 'TECH5', 'TECH6'] as MoveId[]).filter((id) => (!MOVE_REGISTRY[id].owner || MOVE_REGISTRY[id].owner === turn) && engine.hasMove(id));
    return (
      <div className="bg-black/90 p-3 rounded-[2rem] border border-white/10 grid grid-cols-2 sm:flex gap-2 w-full max-w-2xl">
        {techs.map((id) => {
          const m = MOVE_REGISTRY[id];
          return (
            <button data-nav key={id} onPointerDown={(e) => engine.action(id as 'TECH1', audio.fromEventTime(e.timeStamp))} className={`flex-1 p-4 bg-white/5 rounded-2xl flex flex-col items-center active:scale-95 text-center leading-none ${sync < m.cost ? 'opacity-40' : ''}`}>
              <span className="text-xl">{m.icon}</span>
              <div className="text-[10px] font-black uppercase text-yellow-400">{m.name}</div>
              <SyncCost cost={m.cost} />
            </button>
          );
        })}
        {back}
      </div>
    );
  }
  if (phase === 'ITEMS') {
    return (
      <div className="bg-black/90 p-3 rounded-[2rem] border border-white/10 flex gap-2 w-full max-w-2xl">
        {(Object.keys(ITEM_DATA) as ItemId[]).map((id) => (
          <button data-nav key={id} onPointerDown={() => engine.selectItem(id)} className={`flex-1 p-3 bg-white/5 rounded-2xl flex flex-col items-center active:scale-95 text-center leading-none ${snap.inventory[id] <= 0 ? 'opacity-40' : ''}`}>
            <span className="text-xl">{ITEM_DATA[id].icon}</span>
            <span className="text-[9px] font-black mt-1 uppercase">{ITEM_DATA[id].name} ({snap.inventory[id]})</span>
          </button>
        ))}
        {back}
      </div>
    );
  }
  if (phase === 'TARGET' || phase === 'ITEMS_TARGETING') return <div className="flex gap-2">{back}</div>;
  return null;
};

const PAD_STYLE: Record<BroId, string> = {
  BLUE: 'bg-blue-600 border-blue-400 shadow-[0_0_30px_blue]',
  RED: 'bg-gradient-to-br from-red-600 to-red-800 border-red-400 shadow-[0_0_40px_rgba(239,68,68,0.6)]'
};

/** One face button. A = Hop (red), B = Skip (blue). Glows for the acting bro; flashes "!" for a tag. */
export const PadButton = ({ id, size = 'w-28 h-28 md:w-36 md:h-36 text-5xl md:text-6xl' }: { id: BroId; size?: string }) => {
  const { engine, snap } = useEngine();
  const { expectedTap, turn, phase } = snap;
  const lit = phase === 'ITEMS_TARGETING' || (turn === id && ['MENU', 'TECH_SELECT', 'ITEMS', 'TARGET', 'WINDUP'].includes(phase));
  const cls = expectedTap === id
    ? 'bg-yellow-400 border-white shadow-[0_0_80px_#facc15] scale-110 neon-text text-black'
    : lit ? PAD_STYLE[id] : 'bg-white/5 border-white/10 opacity-90';
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); engine.input(id, audio.fromEventTime(e.timeStamp)); }}
      className={`${size} shrink-0 rounded-full flex items-center justify-center transition-all duration-75 active:scale-90 border-4 font-black touch-none ${cls}`}
    >
      {expectedTap === id ? '!' : id === 'RED' ? 'A' : 'B'}
    </button>
  );
};

export const SyncBar = () => {
  const { snap } = useEngine();
  return (
    <div className="absolute top-0 left-0 w-full h-1.5 bg-black/60 z-20">
      <div className="h-full bg-cyan-400 shadow-[0_0_15px_cyan] transition-all duration-300" style={{ width: `${snap.sync}%` }} />
    </div>
  );
};

/** Portrait / desktop: buttons in a band under the arena. */
export const Controller = () => (
  <div className="shrink-0 h-[22vh] min-h-[140px] max-h-[220px] w-full bg-gradient-to-t from-black/80 to-black/40 border-t border-cyan-500/30 flex items-center justify-center gap-16 md:gap-40 relative z-10 touch-none">
    <SyncBar />
    <PadButton id="BLUE" />
    <PadButton id="RED" />
  </div>
);
