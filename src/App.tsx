import { useEffect, useState } from 'react';
import { Engine, type MenuAction } from './game/engine';
import { audio } from './game/audio';
import { Controller, Hud, PadButton, Playfield, SyncBar } from './ui/Battle';
import { GameOver, LevelUp, Pause, Shop, Title, TutorialDone, WaveClear } from './ui/Overlays';
import { EngineContext, useEngine } from './ui/useEngine';

const MENU_KEYS: Record<string, MenuAction> = { Digit1: 'BASIC', Digit2: 'TECH', Digit3: 'ITEMS', Digit4: 'ULT', Backspace: 'BACK' };

const useKeyboard = (engine: Engine) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const at = audio.fromEventTime(e.timeStamp);
      if (e.code === 'KeyF' || e.code === 'ArrowLeft') engine.input('BLUE', at);
      else if (e.code === 'KeyJ' || e.code === 'ArrowRight') engine.input('RED', at);
      else if (e.code === 'Escape') engine.gameState === 'PAUSE' ? engine.resume() : engine.pause();
      else if (MENU_KEYS[e.code]) engine.action(MENU_KEYS[e.code]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);
};

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
  const [engine] = useState(() => new Engine());
  // Dev-only handle for debugging and automated play tests.
  if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = engine;
  useKeyboard(engine);
  return (
    <EngineContext.Provider value={engine}>
      <div className="text-white font-sans"><Game /></div>
    </EngineContext.Provider>
  );
};

export default App;
