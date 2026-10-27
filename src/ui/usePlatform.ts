import { createContext, useContext, useEffect, useState } from 'react';
import type { Platform, RunResult } from '../platform';

export const PlatformContext = createContext<Platform | null>(null);

export const usePlatform = () => {
  const p = useContext(PlatformContext);
  if (!p) throw new Error('PlatformContext missing');
  return p;
};

/** Latest run result (rank + leaderboard), updated when a run ends. */
export const useRunResult = () => {
  const p = usePlatform();
  const [result, setResult] = useState<RunResult | null>(p.lastResult);
  useEffect(() => p.onResult(setResult), [p]);
  return result;
};
