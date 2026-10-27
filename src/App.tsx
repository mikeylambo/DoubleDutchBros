import { useEffect, useState } from 'react';
import type { Engine } from './game/engine';
import { bootPlatform, type Platform } from './platform';
import { attachInput } from './platform/input';
import { Controller, Hud, PadButton, Playfield, SyncBar } from './ui/Battle';
import { GameOver, LevelUp, Pause, Shop, Title, TutorialDone, WaveClear } from './ui/Overlays';
import { EngineContext, useEngine } from './ui/useEngine';
import { PlatformContext } from './ui/usePlatform';
import { Toasts } from './ui/Toasts';

/** Phones held sideways: short screen, thumbs on the sides. */
const useHandheldLandscape = () => {
  const query = '(orientation: landscape) and (max-height: 540px)';
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return match;
};

const Game = () => {
  const { snap } = useEngine();
  const handheld = useHandheldLandscape();
  if (snap.gameState === 'TITLE') return <Title />;
  return (
    <div className="fixed inset-0 bg-[#020205] text-white font-sans flex flex-col h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden">
      <Hud compact={handheld} />
      {handheld ? (
        <div className="relative flex-1 min-h-0 flex items-center pl-[max(env(safe-area-inset-left),12px)] pr-[max(env(safe-area-inset-right),12px)] gap-3">
          <SyncBar />
          <PadButton id="BLUE" size="w-24 h-24 text-4xl" />
          <div className="relative flex-1 h-full min-w-0 flex flex-col"><Playfield /></div>
          <PadButton id="RED" size="w-24 h-24 text-4xl" />
        </div>
      ) : (
        <>
          <Playfield />
          <Controller />
        </>
      )}
      {snap.gameState === 'PAUSE' && <Pause />}
      {snap.gameState === 'SHOP' && <Shop />}
      {snap.gameState === 'WIN' && !snap.levelUp && <WaveClear />}
      {snap.gameState === 'GAMEOVER' && <GameOver />}
      {snap.gameState === 'TUTORIAL_DONE' && <TutorialDone />}
      <LevelUp />
    </div>
  );
};

const App = () => {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let detach = () => {};
    let cancelled = false;
    bootPlatform()
      .then((p) => {
        if (cancelled) return;
        // Dev-only handle for debugging and automated play tests.
        if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = p.engine;
        detach = attachInput(p.engine);
        setPlatform(p);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; detach(); };
  }, []);
  if (error) return <div className="fixed inset-0 flex items-center justify-center text-white/60 p-8 text-center">Couldn't start: {error}</div>;
  if (!platform) return <div className="fixed inset-0 bg-[#020205]" />;
  return (
    <PlatformContext.Provider value={platform}>
      <EngineContext.Provider value={platform.engine}>
        <div className="text-white font-sans"><Game /><Toasts /></div>
      </EngineContext.Provider>
    </PlatformContext.Provider>
  );
};

export default App;
