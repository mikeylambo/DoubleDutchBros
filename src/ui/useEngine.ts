import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Engine } from '../game/engine';

export const EngineContext = createContext<Engine | null>(null);

export const useEngine = () => {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('EngineContext missing');
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  return { engine, snap };
};
