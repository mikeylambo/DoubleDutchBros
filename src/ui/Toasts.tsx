import { useEffect, useState } from 'react';
import type { Notification } from '@slu/web-shell';
import { usePlatform } from './usePlatform';

/** Achievement and bestiary unlocks, from the shell's notification center. */
export const Toasts = () => {
  const { shell } = usePlatform();
  const [items, setItems] = useState<Notification[]>([]);
  useEffect(() => {
    const center = shell.production.notifications;
    const show = center.events.on('notification:show', (n) => {
      setItems((list) => [...list.filter((i) => i.id !== n.id), n]);
      setTimeout(() => center.dismiss(n.id), n.durationMs ?? 2500);
    });
    const hide = center.events.on('notification:dismiss', ({ id }) => setItems((list) => list.filter((i) => i.id !== id)));
    return () => { show(); hide(); };
  }, [shell]);
  return (
    <div className="fixed top-[max(env(safe-area-inset-top),12px)] inset-x-0 z-[200] flex flex-col items-center gap-2 pointer-events-none px-4">
      {items.map((n) => (
        <div key={n.id} className="toast-in glass flex items-center gap-3 pl-3 pr-5 py-2.5 rounded-2xl !border-amber-300/30">
          <span className="w-9 h-9 rounded-xl bg-amber-300/10 flex items-center justify-center text-lg">{n.kind === 'achievement' ? '🏆' : '📖'}</span>
          <div>
            <div className="font-display text-sm font-black italic uppercase tracking-wide text-amber-200">{n.title}</div>
            {n.body && <div className="text-[11px] text-white/60">{n.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};
