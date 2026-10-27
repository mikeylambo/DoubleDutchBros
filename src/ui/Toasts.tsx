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
        <div key={n.id} className="toast-in flex items-center gap-3 px-5 py-3 rounded-2xl bg-black/85 border border-yellow-400/50 shadow-[0_0_30px_rgba(250,204,21,0.25)]">
          <span className="text-xl">{n.kind === 'achievement' ? '🏆' : '📖'}</span>
          <div>
            <div className="text-sm font-black uppercase tracking-tight text-yellow-300">{n.title}</div>
            {n.body && <div className="text-[11px] text-white/60">{n.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};
