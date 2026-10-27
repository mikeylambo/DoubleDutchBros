import { useEffect, useState } from 'react';
import { Engine, type MenuAction } from './game/engine';
import { audio } from './game/audio';
import { ActionBar, Controller, Hud, Playfield } from './ui/Battle';
import { GameOver, LevelUp, Pause, Shop, Title, WaveClear } from './ui/Overlays';
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

const Game = () => {
  const { snap } = useEngine();
  if (snap.gameState === 'TITLE') return <Title />;
  return (
    <div className="fixed inset-0 bg-[#020205] text-white font-sans flex flex-col h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden">
      <Hud />
      <div className="flex-1 flex flex-col bg-[#010103] min-h-0">
        <div className="min-h-0 flex-shrink"><Playfield /></div>
        <div className="flex-1 flex items-center justify-center p-4 min-h-[100px]"><ActionBar /></div>
      </div>
      <Controller />
      {snap.gameState === 'PAUSE' && <Pause />}
      {snap.gameState === 'SHOP' && <Shop />}
      {snap.gameState === 'WIN' && !snap.levelUp && <WaveClear />}
      {snap.gameState === 'GAMEOVER' && <GameOver />}
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
