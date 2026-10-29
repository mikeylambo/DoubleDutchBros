import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import { useEngine } from './useEngine';

// Screen-to-screen wipe and touch feedback, shared by every screen.

/** A slanted red/blue wipe that sweeps across whenever the game changes screen (title, battle, shop...). */
export const ScreenWipe = () => {
  const { engine, snap } = useEngine();
  const prev = useRef(snap.gameState);
  const [n, setN] = useState(0);
  useEffect(() => {
    const from = prev.current, to = snap.gameState;
    prev.current = to;
    // Pausing is an overlay over the fight, not a new screen: no wipe in or out of it.
    if (from === to || from === 'PAUSE' || to === 'PAUSE') return;
    if (engine.settings.reducedMotion) return;
    setN((k) => k + 1);
  }, [snap.gameState, engine]);
  if (!n) return null;
  return (
    <div key={n} aria-hidden className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      <div className="screen-wipe absolute -inset-y-10 -left-[20%] w-[140%] flex">
        <div className="flex-1 bg-gradient-to-r from-[#ef4444] to-[#fb7185]" />
        <div className="w-6 bg-white" />
        <div className="flex-1 bg-gradient-to-r from-[#3b82f6] to-[#7dd3fc]" />
      </div>
    </div>
  );
};

/** Every button press gets a click and, on phones, a short buzz. Battle actions already sound in the engine. */
export const TouchFeedback = () => {
  const { snap } = useEngine();
  const inBattle = useRef(false);
  inBattle.current = snap.gameState === 'BATTLE';
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (!b || (b as HTMLButtonElement).disabled) return;
      audio.buzz(8);
      if (!inBattle.current) audio.play('ui');
    };
    document.addEventListener('pointerdown', on, { capture: true });
    return () => document.removeEventListener('pointerdown', on, { capture: true });
  }, []);
  return null;
};
