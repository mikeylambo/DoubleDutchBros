import { useEffect, useRef, useState } from 'react';
import { ITEM_DATA, MOVE_REGISTRY, type BroId, type ItemId, type MoveId } from '../data/config';
import { audio } from '../game/audio';
import { MUTATORS } from '../game/runmods';
import { draw } from '../game/renderer';
import { computeView, screenToWorldX, type View } from '../game/view';
import { calculateDerived } from '../game/stats';
import { useEngine } from './useEngine';
import { timeForWave, zoneForWave } from '../game/sprites';

const SWAG_COLOR: Record<string, string> = { D: '#94a3b8', C: '#cbd5e1', B: '#60a5fa', A: '#4ade80', S: '#facc15', SS: '#f0abfc' };

/** Base and highlight for each bro's meters. */
const TONE: Record<'red' | 'blue', [string, string]> = { red: ['#ef4444', '#fb7185'], blue: ['#3b82f6', '#7dd3fc'] };

/** Screen bands the overlaid HUD and pads cover. CSS and the canvas view both use these. */
export const hudBand = (h: number) => Math.min(96, Math.max(60, h * 0.1));
export const padBand = (h: number) => Math.min(220, Math.max(140, h * 0.22));

/** A meter with a trailing "damage ghost": the white tail lingers, then catches up. */
const Meter = ({ value, tone, thin = false }: { value: number; tone: [string, string]; thin?: boolean }) => {
  const pct = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <div className={`relative w-full ${thin ? 'h-1' : 'h-1.5'} rounded-full bg-white/[0.07] overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-white/50 transition-[width] duration-700 delay-300 ease-out" style={{ width: pct }} />
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out beat-glow"
        style={{ width: pct, background: `linear-gradient(90deg, ${tone[0]}, ${tone[1]})`, boxShadow: `0 0 10px ${tone[0]}` }} />
    </div>
  );
};

/** Live style rank: clean play raises it and multiplies style points. */
const SwagMeter = ({ compact }: { compact: boolean }) => {
  const { snap } = useEngine();
  const color = SWAG_COLOR[snap.swagTier] ?? '#fff';
  return (
    <div className="flex items-center gap-2.5" aria-label={`Style ${snap.swagTier}`}>
      <div className="hidden sm:flex flex-col items-end gap-1">
        <span className="text-[8px] font-semibold tracking-[0.35em] text-white/40 uppercase">Style</span>
        <div className={compact ? 'w-10' : 'w-16'}><Meter value={snap.swag / 100} tone={[color, '#ffffff']} thin /></div>
      </div>
      {/* Keyed by tier: every rank change slams the badge in again with a shine across it. */}
      <div className="beat-bump origin-center">
        <div key={snap.swagTier} className={`rank-in relative font-display font-black italic leading-none ${compact ? 'text-3xl' : 'text-5xl md:text-6xl'}`}
          style={{ color, textShadow: `0 0 22px ${color}aa, 0 3px 0 rgba(0,0,0,0.5)` }}>
          {snap.swagTier}
          <span aria-hidden className="rank-shine absolute inset-0 text-transparent">{snap.swagTier}</span>
        </div>
      </div>
    </div>
  );
};

const PauseIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
);

export const Hud = ({ compact = false }: { compact?: boolean }) => {
  const { engine, snap } = useEngine();
  return (
    <div className={`shrink-0 flex justify-between items-center gap-4 z-10 bg-gradient-to-b from-[#05030f]/90 via-[#05030f]/50 to-transparent ${compact ? 'h-11 px-4 pl-[max(env(safe-area-inset-left),16px)] pr-[max(env(safe-area-inset-right),16px)]' : 'h-[clamp(60px,10vh,96px)] px-4 md:px-8'}`}>
      <div className="flex gap-4 md:gap-8 w-full max-w-2xl">
        {(['red', 'blue'] as const).map((k) => {
          const b = snap.bros[k];
          const max = calculateDerived(b).maxHp;
          return (
            <div key={k} className={`flex flex-col w-1/2 transition-opacity ${b.hp <= 0 ? 'opacity-30 grayscale' : ''}`}>
              <div className="flex justify-between items-baseline mb-1.5 gap-2">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="font-display font-black italic uppercase text-sm md:text-base leading-none tracking-wide" style={{ color: TONE[k][1] }}>{b.name}</span>
                  <span className="text-[9px] font-semibold text-white/45 tracking-widest whitespace-nowrap">LV {b.lvl}</span>
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-white/70 whitespace-nowrap">{b.hp}<span className="hidden md:inline text-white/30"> / {max}</span></span>
              </div>
              <Meter value={b.hp / max} tone={TONE[k]} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 md:gap-6">
        <SwagMeter compact={compact} />
        <div className="text-right hidden sm:block leading-none whitespace-nowrap">
          <div className="text-[9px] font-semibold tracking-[0.3em] text-cyan-300/80 uppercase">Wave {snap.wave}</div>
          <div className={`font-display font-black italic mt-1 tabular-nums ${compact ? 'text-sm' : 'text-xl'}`}>{snap.rp}<span className="text-[10px] text-white/40 not-italic font-semibold ml-1">RP</span></div>
          {snap.mutators.length > 0 && <div className="text-xs mt-1 tracking-tight" title="Active mutators">{snap.mutators.map((m) => MUTATORS[m].icon).join('')}</div>}
        </div>
        <button aria-label="Pause" onPointerDown={(e) => { e.preventDefault(); engine.pause(); }} className={`glass ${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full flex items-center justify-center text-white/80 active:scale-95 transition-transform`}><PauseIcon /></button>
      </div>
    </div>
  );
};

const PHASE_HINT: Partial<Record<string, string>> = {
  TARGET: 'SELECT TARGET',
  ITEMS_TARGETING: 'CHOOSE A BRO',
  WINDUP: 'JUMP ON THE BEAT'
};

/** `overlay`: the HUD and pads float over this canvas, so the scene paints under them. */
export const Playfield = ({ overlay = false }: { overlay?: boolean }) => {
  const { engine, snap } = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(computeView(1, 1));
  const [bands, setBands] = useState({ top: 0, bottom: 0 });

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
      const vh = window.innerHeight;
      const next = overlay ? { top: hudBand(vh), bottom: padBand(vh) } : { top: 0, bottom: 0 };
      viewRef.current = computeView(width, height, next.top, next.bottom);
      setBands((b) => (b.top === next.top && b.bottom === next.bottom ? b : next));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let raf = 0;
    const root = document.documentElement;
    const loop = () => {
      engine.frame();
      // The HUD breathes with the music: --beat is 1 on each heard beat and eases to 0 before the next.
      const b = engine.beat;
      root.style.setProperty('--beat', engine.settings.reducedMotion ? '0' : Math.pow(1 - (b - Math.floor(b)), 3).toFixed(3));
      draw(ctx, engine, viewRef.current, canvas.width / Math.max(1, viewRef.current.w));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [engine, overlay]);

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    engine.tapCanvas(screenToWorldX(e.clientX - rect.left, viewRef.current));
  };

  const hint = snap.tutorialHint ? null : PHASE_HINT[snap.phase];
  return (
    <div className={`${overlay ? 'absolute inset-0' : 'relative flex-1 min-h-0'} w-full touch-none overflow-hidden`}>
      <div className="absolute inset-0" onPointerDown={onTap}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      </div>
      {snap.combo >= 2 && (
        <div className="absolute left-6 z-20 pointer-events-none" style={{ top: bands.top + 16 }}>
          <div className="font-display text-6xl font-black italic leading-none tabular-nums drop-shadow-[0_0_24px_rgba(255,255,255,0.45)]">{snap.combo}</div>
          <div className="text-[9px] font-semibold text-cyan-300 tracking-[0.5em] uppercase mt-1.5">Combo</div>
        </div>
      )}
      {snap.tutorialHint && (
        <div className="absolute inset-x-0 flex justify-center pointer-events-none z-30 px-4" style={{ top: bands.top + 12 }}>
          <div className="glass max-w-xl px-6 py-3.5 rounded-2xl text-center border-cyan-300/30">
            <div className="text-[9px] font-semibold tracking-[0.5em] text-cyan-300 uppercase mb-1">Tutorial</div>
            <div className="text-sm md:text-lg font-semibold leading-snug">{snap.tutorialHint}</div>
          </div>
        </div>
      )}
      {hint && (
        <div className="absolute inset-x-0 flex justify-center pointer-events-none z-30" style={{ top: bands.top + 12 }}>
          <div className="glass px-5 py-1.5 rounded-full font-display text-sm md:text-lg font-black italic uppercase tracking-wide animate-pulse">{hint}</div>
        </div>
      )}
      <WaveIntro top={bands.top} />
      {/* Menu floats on the court, below the action. */}
      <div className="absolute inset-x-0 z-20 flex justify-center p-3 md:p-5 pointer-events-none [&>*]:pointer-events-auto" style={{ bottom: bands.bottom }}>
        <ActionBar />
      </div>
    </div>
  );
};

/** Cold open for each wave: a slanted band with the wave number, zone and time of day. */
const WaveIntro = ({ top }: { top: number }) => {
  const { snap } = useEngine();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (snap.gameState !== 'BATTLE') return;
    setShown(snap.wave);
    const t = setTimeout(() => setShown(null), 2000);
    return () => clearTimeout(t);
  }, [snap.wave, snap.gameState === 'BATTLE']); // eslint-disable-line react-hooks/exhaustive-deps
  if (shown === null) return null;
  const zone = zoneForWave(shown), tod = timeForWave(shown);
  const where = zone === 'subway' ? 'Subway' : `${zone[0].toUpperCase()}${zone.slice(1)} · ${tod[0].toUpperCase()}${tod.slice(1)}`;
  return (
    <div key={shown} className="absolute inset-x-0 z-30 pointer-events-none overflow-hidden" style={{ top: `max(${top + 150}px, 30%)` }}>
      <div className="wave-band mx-auto w-[min(720px,92%)] py-3 md:py-4 bg-[#05030f]/85 border-y-2 border-cyan-300/70 shadow-[0_0_40px_rgba(34,211,238,0.35)] text-center">
        <div className="wave-text font-display font-black italic uppercase text-3xl md:text-5xl leading-none skew-x-12">Wave {shown}</div>
        <div className="wave-text text-[10px] md:text-xs font-semibold tracking-[0.5em] uppercase text-cyan-200/90 mt-2 skew-x-12">{where}</div>
      </div>
    </div>
  );
};

// Menu icons: simple filled glyphs that read at 14px.
const Svg = ({ children }: { children: React.ReactNode }) => <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 shrink-0" fill="currentColor" aria-hidden>{children}</svg>;
const IconStrike = () => <Svg><path d="M3 14l9-11 1 7h8l-9 11-1-7z" /></Svg>;
const IconBolt = () => <Svg><path d="M12 2l2.6 6.4L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.4-.6z" opacity=".35" /><path d="M13 3L6 13h5l-1 8 7-10h-5z" /></Svg>;
const IconBag = () => <Svg><path d="M8 7V6a4 4 0 018 0v1h3l1 14H4L5 7zm2 0h4V6a2 2 0 00-4 0z" /></Svg>;
const IconStar = () => <Svg><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z" /></Svg>;
const Label = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <span className="relative flex items-center justify-center gap-1.5 md:gap-2">{icon}{children}</span>
);

const SyncCost = ({ cost }: { cost: number }) => <div className="text-[8px] font-semibold tracking-widest text-white/40 uppercase mt-1.5">{cost} Sync</div>;

const DOCK = 'glass rounded-[28px] p-2 md:p-2.5';
const CARD = 'flex-1 p-3 md:p-4 rounded-[20px] bg-white/[0.04] border border-white/[0.06] flex flex-col items-center active:scale-95 transition-transform text-center leading-none';

export const ActionBar = () => {
  const { engine, snap } = useEngine();
  const { phase, sync, turn } = snap;
  const back = <button data-nav onPointerDown={() => engine.action('BACK')} className="glass px-6 py-3 rounded-[20px] text-rose-300 font-display font-black italic uppercase text-xs tracking-wide active:scale-95">Back</button>;

  if (phase === 'MENU') {
    const k = turn === 'RED' ? 'red' : 'blue';
    const btn = 'relative flex-1 px-2 h-14 [@media(max-height:540px)]:h-11 md:h-16 font-display font-black italic text-xs sm:text-sm md:text-xl rounded-[20px] active:scale-95 transition-all uppercase leading-none sm:tracking-wide overflow-hidden';
    const ready = sync >= 100;
    return (
      <div className="flex flex-col items-center w-full max-w-2xl">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[0.45em] uppercase text-white/70 [@media(max-height:700px)]:hidden">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE[k][1], boxShadow: `0 0 8px ${TONE[k][0]}` }} />
          {snap.bros[k].name}'s turn
        </div>
        {/* Keyed by turn: the dock slides in from the acting bro's side (Hop stands left of Skip). */}
        <div key={turn} className={`${DOCK} flex gap-2 w-full ${turn === 'RED' ? 'menu-from-left' : 'menu-from-right'}`} style={{ borderColor: `${TONE[k][0]}55` }}>
          <button data-nav onPointerDown={(e) => engine.action('BASIC', audio.fromEventTime(e.timeStamp))}
            className={`${btn} text-[#0b0720] bg-gradient-to-b from-white to-slate-200 shadow-[0_6px_24px_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.12)]`}><Label icon={<IconStrike />}>Attack</Label></button>
          <button data-nav onPointerDown={(e) => engine.action('TECH', audio.fromEventTime(e.timeStamp))}
            className={`${btn} bg-gradient-to-b from-violet-500 to-fuchsia-700 shadow-[0_6px_24px_rgba(168,85,247,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] ${sync < 20 ? 'opacity-35 saturate-50' : ''}`}>
            <Label icon={<IconBolt />}>Skill</Label>
            {/* One pip per 20 Sync: how many skill casts are banked. */}
            <span className="absolute bottom-1.5 inset-x-0 flex justify-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${sync >= (i + 1) * 20 ? 'bg-white shadow-[0_0_6px_white]' : 'bg-white/20'}`} />)}
            </span>
          </button>
          <button data-nav onPointerDown={() => engine.action('ITEMS')}
            className={`${btn} bg-white/[0.06] border border-white/10 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`}><Label icon={<IconBag />}>Items</Label></button>
          <button data-nav onPointerDown={(e) => engine.action('ULT', audio.fromEventTime(e.timeStamp))}
            className={`${btn} ${ready ? 'beat-bump text-[#2a1600] bg-gradient-to-b from-amber-200 via-yellow-400 to-amber-600 shadow-[0_0_32px_rgba(250,204,21,0.55),inset_0_1px_0_rgba(255,255,255,0.6)] shimmer' : 'bg-white/[0.03] border border-white/5 text-white/25'}`}><Label icon={<IconStar />}>Ult</Label></button>
        </div>
      </div>
    );
  }
  if (phase === 'TECH_SELECT') {
    const techs = (['TECH1', 'TECH2', 'TECH3', 'TECH4', 'TECH5', 'TECH6'] as MoveId[]).filter((id) => (!MOVE_REGISTRY[id].owner || MOVE_REGISTRY[id].owner === turn) && engine.hasMove(id));
    return (
      <div className={`${DOCK} grid grid-cols-2 sm:flex gap-2 w-full max-w-2xl`}>
        {techs.map((id) => {
          const m = MOVE_REGISTRY[id];
          return (
            <button data-nav key={id} onPointerDown={(e) => engine.action(id as 'TECH1', audio.fromEventTime(e.timeStamp))} className={`${CARD} ${sync < m.cost ? 'opacity-35' : ''}`}>
              <span className="text-xl mb-1.5">{m.icon}</span>
              <div className="font-display text-[11px] font-black italic uppercase tracking-wide text-amber-200">{m.name}</div>
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
      <div className={`${DOCK} flex gap-2 w-full max-w-2xl`}>
        {(Object.keys(ITEM_DATA) as ItemId[]).map((id) => (
          <button data-nav key={id} onPointerDown={() => engine.selectItem(id)} className={`${CARD} ${snap.inventory[id] <= 0 ? 'opacity-35' : ''}`}>
            <span className="text-xl">{ITEM_DATA[id].icon}</span>
            <span className="text-[9px] font-semibold tracking-wider mt-1.5 uppercase">{ITEM_DATA[id].name} <span className="text-white/40 tabular-nums">×{snap.inventory[id]}</span></span>
          </button>
        ))}
        {back}
      </div>
    );
  }
  if (phase === 'TARGET' || phase === 'ITEMS_TARGETING') return <div className="flex gap-2">{back}</div>;
  return null;
};

/** Each pad is a lit disc: a highlight up top-left, the bro's color, a deep rim. */
const PAD_LIT: Record<BroId, React.CSSProperties> = {
  RED: { background: 'radial-gradient(circle at 35% 28%, #fda4af 0%, #ef4444 38%, #7f1d1d 100%)', borderColor: 'rgba(253, 164, 175, 0.7)', boxShadow: '0 0 48px rgba(239, 68, 68, 0.55), inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -6px 18px rgba(0,0,0,0.35)' },
  BLUE: { background: 'radial-gradient(circle at 35% 28%, #bae6fd 0%, #3b82f6 38%, #1e3a8a 100%)', borderColor: 'rgba(186, 230, 253, 0.7)', boxShadow: '0 0 48px rgba(59, 130, 246, 0.55), inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -6px 18px rgba(0,0,0,0.35)' }
};
const PAD_CUE: React.CSSProperties = { background: 'radial-gradient(circle at 35% 28%, #fffbeb 0%, #facc15 40%, #a16207 100%)', borderColor: '#fff', boxShadow: '0 0 80px rgba(250, 204, 21, 0.75), inset 0 2px 0 rgba(255,255,255,0.6)' };
const PAD_IDLE: React.CSSProperties = { background: 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 60%)', borderColor: 'rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.4)' };

/** One face button. A = Hop (red), B = Skip (blue). Glows for the acting bro; flashes "!" for a tag. */
export const PadButton = ({ id, size = 'w-28 h-28 md:w-32 md:h-32 text-5xl md:text-6xl' }: { id: BroId; size?: string }) => {
  const { engine, snap } = useEngine();
  const { expectedTap, turn, phase } = snap;
  const lit = phase === 'ITEMS_TARGETING' || (turn === id && ['MENU', 'TECH_SELECT', 'ITEMS', 'TARGET', 'WINDUP'].includes(phase));
  const cue = expectedTap === id;
  const style = cue ? PAD_CUE : lit ? PAD_LIT[id] : PAD_IDLE;
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); engine.input(id, audio.fromEventTime(e.timeStamp)); }}
      style={style}
      className={`${size} shrink-0 rounded-full flex items-center justify-center transition-all duration-75 active:scale-90 border-2 backdrop-blur-md touch-none font-display font-black italic ${cue ? 'scale-110 text-[#2a1600]' : lit ? 'text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]' : 'text-white/40'}`}
    >
      {cue ? '!' : id === 'RED' ? 'A' : 'B'}
    </button>
  );
};

/** `bar`: a hairline across the top (handheld). Otherwise a labeled meter centered over the pads. */
export const SyncBar = ({ bar = false }: { bar?: boolean }) => {
  const { snap } = useEngine();
  const full = snap.sync >= 100;
  const fill = (
    <div className="h-full rounded-full transition-[width] duration-300 ease-out"
      style={{ width: `${snap.sync}%`, background: full ? 'linear-gradient(90deg,#fde68a,#facc15)' : 'linear-gradient(90deg,#22d3ee,#a78bfa)', boxShadow: full ? '0 0 14px #facc15' : '0 0 12px rgba(34,211,238,0.7)' }} />
  );
  if (bar) return <div className="absolute top-0 left-0 w-full h-1 bg-black/50 z-20">{fill}</div>;
  return (
    <div className="w-24 md:w-40 shrink-0 flex flex-col items-center gap-2">
      <div className="flex w-full justify-between items-baseline">
        <span className="text-[9px] font-semibold tracking-[0.4em] text-cyan-200/70 uppercase">Sync</span>
        <span className={`text-[10px] font-semibold tabular-nums ${full ? 'text-yellow-300' : 'text-white/50'}`}>{Math.round(snap.sync)}%</span>
      </div>
      <div className="w-full h-1 rounded-full bg-white/[0.08] overflow-hidden">{fill}</div>
    </div>
  );
};

/** Portrait / desktop: pads float over the bottom of the court. */
export const Controller = () => (
  <div className="absolute inset-x-0 bottom-0 h-[clamp(140px,22vh,220px)] pb-[env(safe-area-inset-bottom)] w-full bg-gradient-to-t from-[#03020a]/90 via-[#03020a]/50 to-transparent flex items-center justify-center gap-5 md:gap-12 z-10 touch-none">
    <PadButton id="BLUE" />
    <SyncBar />
    <PadButton id="RED" />
  </div>
);
